import { query } from '$app/server';
import { dev } from '$app/environment';
import { cacheGet, cacheSet, MODELS_TTL } from '$lib/cache';
import { fetchGoModels } from '$lib/server/opencode-go';
import { fetchModelgrepModels, fuzzyMatchModelgrep } from '$lib/server/modelgrep';
import { fetchGoDocsData } from '$lib/server/go-docs';
import {
	fetchLlmStatsModels,
	filterFrontierModels,
	matchLlmStatsModel
} from '$lib/server/llm-stats';
import { inferModel } from '$lib/server/inference';
import type { GoModel, ModelPricing, LlmStatsModel } from '$lib/types/models';
import { LLM_STATS_API_KEY } from '$env/static/private';

/**
 * Fetch all enriched Go models.
 * Uses stale-while-revalidate: returns cached data instantly,
 * refreshes in background if stale.
 */
export const getModels = query(async () => {
	const cached = cacheGet<GoModel[]>(CACHE_KEY);

	if (cached && cached.stale) {
		refreshCache().catch(console.error);
		return cached.data;
	}

	if (cached && !cached.stale) {
		return cached.data;
	}

	return await refreshCache();
});

async function refreshCache(): Promise<GoModel[]> {
	const [goModels, mgResult, docsData, lsModels] = await Promise.all([
		fetchGoModels(),
		fetchModelgrepModels().catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[refreshCache] modelgrep failed:', msg);
			return { byId: new Map(), all: [] };
		}),
		fetchGoDocsData().catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[refreshCache] go-docs failed:', msg);
			return { pricing: {}, usageLimits: {} };
		}),
		fetchLlmStatsModels(LLM_STATS_API_KEY).catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[refreshCache] llm-stats failed:', msg);
			return [] as LlmStatsModel[];
		})
	]);

	const docsPricing = docsData.pricing;
	const docsUsageLimits = docsData.usageLimits;

	const frontierLs = filterFrontierModels(lsModels);

	console.log(
		`[refreshCache] goModels=${goModels.length} modelgrepModels=${mgResult.byId.size} docsModels=${Object.keys(docsPricing).length} llmStats=${lsModels.length} frontier=${frontierLs.length}`
	);

	// Pre-match each Go model to its llm-stats counterpart against the FULL
	// catalog — company-agnostic, so a Go model from any lab (e.g. hy3 under
	// tencent, grok-4.5 under xai) resolves as long as llm-stats tracks it.
	const lsMatchCache = new Map<string, LlmStatsModel | null>();
	for (const gm of goModels) {
		if (!lsMatchCache.has(gm.id)) {
			lsMatchCache.set(gm.id, matchLlmStatsModel(gm.id, lsModels));
		}
	}

	const filtered = goModels.filter((gm) => gm.id !== 'hy3-preview');
	const enriched = filtered.map((gm) => {
		// Fuzzy-match against modelgrep data (no hardcoded ID mapping)
		const mgModel = fuzzyMatchModelgrep(gm.id, mgResult.all);

		// Get pre-matched llm-stats model
		const lsModel = lsMatchCache.get(gm.id) ?? null;

		return inferModel(gm.id, mgModel, docsPricing, lsModel, frontierLs, docsUsageLimits);
	});

	cacheSet(CACHE_KEY, enriched, MODELS_TTL);
	return enriched;
}

/**
 * The cache key is DERIVED from the enrichment pipeline's source code — not a
 * hand-bumped version number. Edit ANY function below and the hash changes,
 * the in-memory cache misses, and the data rebuilds. No more v25 → v26
 * rituals, no restarts just to clear the cache.
 *
 * Why this is needed: in dev, SvelteKit's server-side HMR re-imports changed
 * modules but leaves module-level state (the `cache.ts` Map) alive, so old
 * entries survive edits. Content-addressing the key makes invalidation
 * automatic — the key stops matching when the computation that produced the
 * data changes.
 */
function fnv1a(input: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

const CACHE_KEY = `go-models-enriched:${fnv1a(
	[
		fetchGoModels,
		fetchModelgrepModels,
		fuzzyMatchModelgrep,
		fetchGoDocsData,
		fetchLlmStatsModels,
		filterFrontierModels,
		matchLlmStatsModel,
		inferModel,
		refreshCache
	]
		.map((fn) => fn.toString())
		.join('\n')
)}`;

if (dev) {
	console.log(`[models] enriched cache key: ${CACHE_KEY}`);
}
