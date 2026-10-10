/**
 * Server-only model data pipeline.
 *
 * Owns the fetch → enrich → cache flow for the OpenCode Go catalog and the
 * frontier comparison snapshot. This lives in a `server/` module (and NOT in
 * `models.remote.ts`) for one concrete reason: remote modules may only export
 * remote functions, and the `/api/revalidate` endpoint needs a plain async
 * function it can `await` to force a rebuild.
 *
 * The remote file (`$lib/remote/models.remote.ts`) is now a thin transport
 * wrapper around `loadModels` / `loadFrontierSnapshot`.
 */

import { cacheGet, cacheSet, MODELS_TTL } from '$lib/cache';
import { dev } from '$app/environment';
import { fetchGoModels } from '$lib/server/opencode-go';
import { fetchModelgrepModels, fuzzyMatchModelgrep } from '$lib/server/modelgrep';
import { fetchGoDocsData, emptyGoDocsData } from '$lib/server/go-docs';
import {
	fetchLlmStatsModels,
	filterFrontierModels,
	matchLlmStatsModel,
	FRONTIER_MAX_AGE_DAYS
} from '$lib/server/llm-stats';
import { inferModel, inferMigrationHints } from '$lib/server/inference';
import { inferBurnDetails, deriveBurnScale } from '$lib/server/burn';
import { blendBenchmarks } from '$lib/server/blend';
import type {
	GoModel,
	LlmStatsModel,
	FrontierCandidate,
	FrontierSnapshot,
	CatalogAudit
} from '$lib/types/models';
import { LLM_STATS_API_KEY } from '$env/static/private';

/**
 * Fetch all enriched Go models.
 * Uses stale-while-revalidate: returns cached data instantly,
 * refreshes in background if stale.
 */
export async function loadModels(): Promise<GoModel[]> {
	const cached = cacheGet<GoModel[]>(CACHE_KEY);

	if (cached && cached.stale) {
		refreshCache().catch(console.error);
		return cached.data;
	}

	if (cached && !cached.stale) {
		return cached.data;
	}

	return await refreshCache();
}

/**
 * Fetch the frontier comparison snapshot (closed-source candidates + the
 * recency cutoff the hint algorithm applies). Built by the SAME refreshCache
 * that enriches the Go models, so it is always consistent with the
 * "replaces" hints on the models — never a second, divergent fetch.
 */
export async function loadFrontierSnapshot(): Promise<FrontierSnapshot> {
	const cached = cacheGet<FrontierSnapshot>(FRONTIER_CACHE_KEY);

	if (cached && cached.stale) {
		refreshCache().catch(console.error);
		return cached.data;
	}

	if (cached && !cached.stale) {
		return cached.data;
	}

	// Nothing cached yet — build everything (this also populates the models).
	await loadModels();
	return cacheGet<FrontierSnapshot>(FRONTIER_CACHE_KEY)?.data ?? EMPTY_SNAPSHOT;
}

/**
 * The docs↔API reconciliation report, so a silent catalog drop (the Claude
 * Haiku 5.5 failure) can be inspected in the UI, not just in logs.
 */
export async function loadCatalogAudit(): Promise<CatalogAudit> {
	return (await fetchGoDocsData()).audit;
}

/**
 * Force a full rebuild of both caches, bypassing the stale-while-revalidate
 * window. Exposed for the protected `/api/revalidate` endpoint so an operator
 * (or a cron/webhook) can pull a fresh upstream model list without waiting out
 * the 6h TTL or redeploying.
 *
 * `refreshCache` writes both keys only after every source resolves, so a failed
 * rebuild leaves the previously cached values untouched rather than serving a
 * half-populated catalog.
 */
export async function revalidateModels(): Promise<GoModel[]> {
	return refreshCache();
}

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
			return emptyGoDocsData();
		}),
		fetchLlmStatsModels(LLM_STATS_API_KEY).catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[refreshCache] llm-stats failed:', msg);
			return [] as LlmStatsModel[];
		})
	]);

	const docsPricing = docsData.pricing;
	const docsUsage = docsData.usageLimits;

	const frontierLs = filterFrontierModels(lsModels);

	// Frontier candidates carry BLENDED benchmarks (modelgrep-primary, with
	// llm-stats fallback) so "replaces" hints compare both sides on the same
	// granular scale — raw llm-stats top_scores are quantized to tens and
	// sometimes on a broken scale, which produced false matches.
	//
	// modelgrep blending is restricted to EXACT name matches (similarity 1):
	// a containment match (0.85) like "gpt-5.5-instant" → "gpt-5.5" would
	// silently mix two different models' benchmark data into the comparison.
	const frontierCandidates: FrontierCandidate[] = frontierLs.map((fm) => {
		const mg = fuzzyMatchModelgrep(fm.id, mgResult.all, 1);
		const { benchmarks } = blendBenchmarks(mg, fm);
		return {
			id: fm.id,
			name: fm.name,
			organization: fm.organization,
			releaseDate: fm.release_date,
			benchmarks
		};
	});

	const frontierSnapshot: FrontierSnapshot = {
		frontier: frontierCandidates,
		cutoff: Date.now() - FRONTIER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
	};
	cacheSet(FRONTIER_CACHE_KEY, frontierSnapshot, MODELS_TTL);

	// Docs page is the source of truth — the API leaks deprecated models that
	// the docs no longer endorse. Fall back to the full API list only when the
	// docs fetch fails entirely (empty set).
	const docsOfficialIds = docsData.officialModelIds;
	const officialModels =
		docsOfficialIds.size > 0 ? goModels.filter((gm) => docsOfficialIds.has(gm.id)) : goModels;

	console.log(
		`[refreshCache] goModels=${goModels.length} official=${officialModels.length} modelgrepModels=${mgResult.byId.size} docsModels=${Object.keys(docsPricing).length} llmStats=${lsModels.length} frontier=${frontierLs.length}`
	);

	// Pre-match each Go model to its llm-stats counterpart against the FULL
	// catalog — company-agnostic, so a Go model from any lab (e.g. hy3 under
	// tencent, grok-4.5 under xai) resolves as long as llm-stats tracks it.
	const lsMatchCache = new Map<string, LlmStatsModel | null>();
	for (const gm of officialModels) {
		if (!lsMatchCache.has(gm.id)) {
			lsMatchCache.set(gm.id, matchLlmStatsModel(gm.id, lsModels));
		}
	}

	const filtered = officialModels.filter((gm) => gm.id !== 'hy3-preview');

	// Burn-score anchors per plan, derived from that plan's published request
	// counts, so the 0–100 scale spans the CURRENT catalog spread instead of a
	// hardcoded range that saturates as counts grow. Free models are excluded
	// (0/unlimited) and keep their 'free' band. `plus` is null when the docs
	// publishes no Go Plus usage table.
	const hasPlus = Object.keys(docsUsage.plus).length > 0;
	const goScale = deriveBurnScale(Object.values(docsUsage.go).map((u) => u.requestsPer5h));
	const plusScale = deriveBurnScale(Object.values(docsUsage.plus).map((u) => u.requestsPer5h));

	const enriched = filtered.map((gm) => {
		// Fuzzy-match against modelgrep data (no hardcoded ID mapping)
		const mgModel = fuzzyMatchModelgrep(gm.id, mgResult.all);

		// Get pre-matched llm-stats model
		const lsModel = lsMatchCache.get(gm.id) ?? null;

		return inferModel(gm.id, mgModel, docsPricing, lsModel, frontierCandidates, {
			go: { usage: docsUsage.go[gm.id] ?? null, scale: goScale },
			plus: hasPlus ? { usage: docsUsage.plus[gm.id] ?? null, scale: plusScale } : null
		});
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
		blendBenchmarks,
		inferModel,
		inferBurnDetails,
		deriveBurnScale,
		refreshCache,
		inferMigrationHints
	]
		.map((fn) => fn.toString())
		.join('\n')
)}`;

/**
 * Frontier snapshot key — content-addressed against the same builder
 * functions so it rebuilds in lockstep with the models cache.
 */
const FRONTIER_CACHE_KEY = `frontier-snapshot:${fnv1a(
	[fetchLlmStatsModels, filterFrontierModels, fuzzyMatchModelgrep, blendBenchmarks]
		.map((fn) => fn.toString())
		.join('\n')
)}`;

const EMPTY_SNAPSHOT: FrontierSnapshot = { frontier: [], cutoff: Date.now() };

if (dev) {
	console.log(`[models] enriched cache key: ${CACHE_KEY}`);
	console.log(`[models] frontier cache key: ${FRONTIER_CACHE_KEY}`);
}
