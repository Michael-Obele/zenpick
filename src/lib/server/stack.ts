import { cacheGet, cacheSet, DEGRADED_STACK_TTL, MODELS_TTL } from '$lib/cache';
import type { StackPlan } from '$lib/stack/plans';
import { COPILOT_PLAN, GO_PLAN_META, ZED_PLAN } from '$lib/stack/plans';
import { buildStackPlans } from '$lib/stack/build';
import { fetchModelgrepModels } from '$lib/server/modelgrep';
import { fetchLlmStatsBenchmarkIndex } from '$lib/server/llm-stats-public';
import { loadModels, fnv1a } from '$lib/server/models';

const STACK_PLANS_CACHE_KEY = `stack-plans:${fnv1a(
	[
		[buildStackPlans, loadStackPlans, fetchLlmStatsBenchmarkIndex]
			.map((fn) => fn.toString())
			.join('\n'),
		JSON.stringify([ZED_PLAN, COPILOT_PLAN, GO_PLAN_META])
	].join('\n')
)}`;

/** The in-flight rebuild, so concurrent cold requests share one rebuild. */
let stackPlansInflight: Promise<StackPlan[]> | null = null;

/**
 * Modelgrep is fetched again because the catalog loader doesn't expose its result;
 * this content-addressed cache keeps that independent fetch to at most once per
 * TTL, and concurrent cold requests share one rebuild.
 */
export async function loadStackPlans(): Promise<StackPlan[]> {
	const cached = cacheGet<StackPlan[]>(STACK_PLANS_CACHE_KEY);
	if (cached && !cached.stale) return cached.data;

	if (!stackPlansInflight) {
		stackPlansInflight = (async () => {
			const [goModels, modelgrepResult, llmStatsIndex] = await Promise.all([
				loadModels(),
				fetchModelgrepModels(),
				fetchLlmStatsBenchmarkIndex()
			]);
			const plans = buildStackPlans(goModels, modelgrepResult.all, llmStatsIndex);
			// A plan build that got no modelgrep data OR no llm-stats index has
			// null benchmark cells pinned for the whole TTL otherwise. The short
			// TTL lets the next request self-heal.
			const degraded = modelgrepResult.all.length === 0 || llmStatsIndex.byId.size === 0;
			cacheSet(STACK_PLANS_CACHE_KEY, plans, degraded ? DEGRADED_STACK_TTL : MODELS_TTL);
			return plans;
		})().finally(() => {
			stackPlansInflight = null;
		});
	}
	return stackPlansInflight;
}
