/**
 * Inference engine orchestrator.
 * Glues together pricing, quota, burn, scoring, and tags
 * modules to produce an enriched GoModel from modelgrep and llm-stats data.
 */

import { burnRateFromPrice, type BurnRate } from '$lib/burn';
import type {
	GoModel,
	ModelgrepModelData,
	MigrationHint,
	ModelPricing,
	ModelSpeed,
	LlmStatsModel,
	UsageLimits,
	FrontierCandidate,
	ModelBenchmarks
} from '$lib/types/models';
import { goEndpointType, goEndpointUrl, goIdToName } from './opencode-go';
import { inferPricing } from './pricing';
import { estimateQuota, DEFAULT_QUOTA_INPUTS } from './quota';
import { inferBurnDetails } from './burn';
import { computeScenarioScores } from './scoring';
import { computeTags } from './tags';
import { blendBenchmarks } from './blend';
import { MIGRATION_BAND } from '$lib/migration';

/** Enrich a Go model ID with modelgrep data, llm-stats data, and optional docs pricing. */
export function inferModel(
	goId: string,
	mgModel: ModelgrepModelData | null,
	docsPricing?: Record<string, ModelPricing>,
	lsModel?: LlmStatsModel | null,
	frontierCandidates: FrontierCandidate[] = [],
	usageLimits?: Record<string, UsageLimits> | null
): GoModel {
	const name = lsModel && lsModel.id === goId ? lsModel.name : goIdToName(goId);
	// openWeight is data-driven: llm-stats marks closed models (e.g. grok-4.5,
	// gpt-5.6-luna) as open_weight: false, and the Go API now serves them.
	// Some providers are open-weight FAMILIES whose API-served variants are
	// still open alternatives — Qwen (Alibaba) publishes its weights publicly,
	// so its Go API models count as open for comparison purposes.
	const openWeight = lsModel ? lsModel.open_weight || isOpenWeightFamily(goId) : true;
	const pricing = inferPricing(goId, mgModel, docsPricing);
	// OpenCode's published usage-limit request counts are the ground truth for
	// how fast a model burns through the Go quota — prefer them over a
	// price-based estimate (which assumes generic token patterns and is
	// systematically off, e.g. Kimi K3 is ~12× slower-burning than it really is).
	const usage = usageLimits?.[goId] ?? null;
	const burnDetails = inferBurnDetails(pricing, usage);
	const burnRate = burnRateFromPrice(
		(pricing.inputPricePerM ?? 0) + (pricing.outputPricePerM ?? 0)
	) as BurnRate;

	const quota = usage
		? {
				requestsPer5h: usage.requestsPer5h,
				requestsPerWeek: usage.requestsPerWeek,
				requestsPerMonth: usage.requestsPerMonth
			}
		: estimateQuota(
				pricing,
				DEFAULT_QUOTA_INPUTS.inputTokens,
				DEFAULT_QUOTA_INPUTS.outputTokens,
				DEFAULT_QUOTA_INPUTS.cachedInputTokens
			);

	const { benchmarks, meta } = blendBenchmarks(mgModel, lsModel ?? null);
	benchmarks._meta = meta;

	const speed = extractModelgrepSpeed(mgModel);
	const tags = computeTags(benchmarks, burnDetails, speed, mgModel, lsModel);
	const migrationHints = inferMigrationHints(
		lsModel ?? null,
		openWeight,
		benchmarks,
		frontierCandidates
	);
	const contextWindow =
		mgModel?.context_length ?? lsModel?.context_window ?? inferContextWindow(goId);
	const scenarioScores = computeScenarioScores({
		goId,
		pricing,
		benchmarks,
		burnDetails,
		speed,
		mgModel,
		contextWindow
	});

	return {
		id: goId,
		name,
		provider: mgModel?.maker ?? lsModel?.organization?.name ?? inferProvider(goId),
		description: mgModel?.description ?? lsModel?.description ?? '',
		openWeight,
		contextWindow,
		releaseDate: lsModel?.release_date ?? null,
		pricing,
		quota: {
			requestsPer5h: quota?.requestsPer5h ?? 0,
			requestsPerWeek: quota?.requestsPerWeek ?? 0,
			requestsPerMonth: quota?.requestsPerMonth ?? 0
		},
		burnRate,
		burnDetails,
		tags,
		benchmarks,
		speed,
		capabilities: mgModel
			? {
					vision: mgModel.capabilities?.vision ?? false,
					reasoning: mgModel.capabilities?.reasoning ?? false
				}
			: null,
		migrationHints,
		scenarioScores,
		endpoint: goEndpointType(goId),
		endpointUrl: goEndpointUrl(goId),
		modelgrepId: mgModel?.id ?? null,
		llmStatsId: lsModel?.id ?? null,
		fetchedAt: Date.now()
	};
}

// ─── Extract modelgrep data ─────────────────────────────────────────────

function extractModelgrepSpeed(mgModel: ModelgrepModelData | null): ModelSpeed | null {
	if (!mgModel?.performance) return null;
	return {
		tokensPerSecond: mgModel.performance.throughput_tps ?? 0,
		timeToFirstToken: mgModel.performance.latency_ms ?? null
	};
}

// ─── Migration Hints ─────────────────────────────────────────────────────

/**
 * Data-driven "replaces" hints.
 *
 * For each capability category we compare the Go model's BLENDED benchmark
 * score (modelgrep-primary, outlier-guarded — see blend.ts) against every
 * closed-source frontier candidate's blended score, finding the nearest
 * neighbor. A model is only claimed as a "replacement" when the gap is
 * within MIGRATION_BAND — so we never assert a match that isn't backed by
 * the live data. Hints are grouped by the frontier model they replace and
 * the categories they match on.
 *
 * Why blended scores and not raw llm-stats top_scores: the raw values are
 * quantized to tens (60, 70, 80) and sometimes on a broken scale (365.2,
 * 2.5, 17.0), which produced false "gap 0" claims like a budget flash model
 * claiming it replaces Claude Opus 5 on reasoning. The blend smooths and
 * guards those artifacts on BOTH sides, so the comparison is apples-to-apples.
 *
 * Closed-source Go models (e.g. grok-4.5, gpt-5.6-luna) are themselves
 * "replaced" targets, not open alternatives — they get no hints.
 */
/**
 * Compute "replaces" hints for one Go model.
 * Exported so the content-addressed models cache key (models.remote.ts)
 * covers it — editing the reason text must invalidate cached models.
 */
export function inferMigrationHints(
	lsModel: LlmStatsModel | null,
	openWeight: boolean,
	goBenchmarks: ModelBenchmarks,
	frontierCandidates: FrontierCandidate[]
): MigrationHint[] {
	// Only open-weight Go models can be "open alternatives" to closed models.
	if (!lsModel || !openWeight || frontierCandidates.length === 0) return [];

	const cats: { key: 'coding' | 'reasoning' | 'math'; label: string }[] = [
		{ key: 'coding', label: 'coding' },
		{ key: 'reasoning', label: 'reasoning' },
		{ key: 'math', label: 'math' }
	];

	// Group by the frontier model we'd replace, combining the categories it matches on.
	const byModel = new Map<string, { name: string; cats: string[]; worstGap: number }>();

	for (const { key, label } of cats) {
		const ours = goBenchmarks[key];
		if (ours == null) continue;

		let best: { name: string; gap: number } | null = null;
		for (const fm of frontierCandidates) {
			// Skip the Go model itself — a closed model served by the Go API
			// (e.g. grok-4.5) is also a frontier candidate, and comparing it to
			// itself would claim "replaces grok-4.5".
			if (fm.id === lsModel.id) continue;
			const theirs = fm.benchmarks[key];
			if (theirs == null) continue;
			const gap = Math.abs(ours - theirs);
			if (best == null || gap < best.gap) best = { name: fm.name, gap };
		}

		if (best && best.gap <= MIGRATION_BAND) {
			const entry = byModel.get(best.name) ?? { name: best.name, cats: [], worstGap: 0 };
			entry.cats.push(label);
			entry.worstGap = Math.max(entry.worstGap, best.gap);
			byModel.set(best.name, entry);
		}
	}

	return [...byModel.values()].map((e) => ({
		model: e.name,
		reason: `Comparable on ${e.cats.join(' & ')}`
	}));
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const PROVIDER_BY_PREFIX: Record<string, string> = {
	deepseek: 'DeepSeek',
	qwen: 'Alibaba / Qwen Team',
	glm: 'Zhipu AI',
	kimi: 'Moonshot AI',
	minimax: 'MiniMax',
	mimo: 'Xiaomi',
	grok: 'xAI',
	gpt: 'OpenAI',
	hy3: 'Hy3'
};

function inferProvider(goId: string): string {
	const prefix = Object.keys(PROVIDER_BY_PREFIX).find((p) => goId.startsWith(p));
	return prefix ? PROVIDER_BY_PREFIX[prefix] : 'Unknown';
}

/**
 * Providers whose models are OPEN-WEIGHT FAMILIES — they publish their
 * weights publicly even when the API-served variant is flagged closed by
 * llm-stats. These still count as "open alternatives" for the Replaces
 * comparison. Provider-level on purpose: no per-model-ID hardcoding, so
 * new family members (qwen3.9, qwen4…) resolve automatically.
 */
const OPEN_WEIGHT_FAMILIES = ['qwen'];

function isOpenWeightFamily(goId: string): boolean {
	return OPEN_WEIGHT_FAMILIES.some((prefix) => goId.startsWith(prefix));
}

function inferContextWindow(goId: string): number {
	// No hardcoded model IDs — use a sensible default.
	// modelgrep data (context_length) takes priority in inferModel().
	return 128_000;
}
