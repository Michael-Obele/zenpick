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

import { cacheGet, cacheSet, MODELS_TTL, GO_DOCS_PRICING_TTL } from '$lib/cache';
import { dev } from '$app/environment';
import { fetchGoModels } from '$lib/server/opencode-go';
import { fetchModelgrepModels, fuzzyMatchModelgrep } from '$lib/server/modelgrep';
import { fetchGoDocsData, emptyGoDocsData, withModelsDevDrift } from '$lib/server/go-docs';
import {
	fetchLlmStatsModels,
	filterFrontierModels,
	matchLlmStatsModel,
	FRONTIER_MAX_AGE_DAYS
} from '$lib/server/llm-stats';
import { inferModel, inferMigrationHints } from '$lib/server/inference';
import {
	fetchModelsDevCatalog,
	emptyModelsDevCatalog,
	isModelsDevDegraded,
	resolveModelsDevEntry,
	type ModelsDevCatalog
} from '$lib/server/models-dev';
import { inferBurnDetails, deriveBurnScale } from '$lib/server/burn';
import { blendBenchmarks } from '$lib/server/blend';
import {
	fetchGoLifecycle,
	type GoLifecycle,
	type GoLifecycleStatus
} from '$lib/server/go-lifecycle';
import {
	benchmarkKey,
	buildBenchmarkIndex,
	type CanonicalBenchmarkIndex,
	type CanonicalModel
} from '$lib/canonical-benchmarks';
import { fetchCanonicalBenchmarks } from '$lib/server/canonical-benchmarks';
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
 *
 * The models.dev drift rows are applied HERE, at read time, rather than baked
 * into the cached docs payload: `fetchGoDocsData()` caches its audit for 24h
 * while models.dev's Go roster changes daily, so a drift computed at cache
 * time would be served stale to every later caller.
 */
export async function loadCatalogAudit(): Promise<CatalogAudit> {
	const [docs, md] = await Promise.all([
		fetchGoDocsData(),
		// NOT degraded to an empty catalog: an empty drift set would report every
		// docs model as "not published by models.dev for Go", i.e. a large false
		// amber signal. A models.dev outage must surface as an error, not as
		// fabricated drift — the page load degrades it to the model-free audit.
		//
		// The catch here is the LAST line of defence. `fetchModelsDevCatalog`
		// already serves the last known-good catalog on a fetch failure and
		// only throws when there is nothing cached at all — a cold start
		// during an outage. Letting that throw escape would take down the
		// WHOLE `/debug` page and `/debug/export` for every section, because
		// an advisory source must never be able to do that. Degrade to the
		// docs-only audit (no drift information) instead.
		fetchModelsDevCatalog().catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[models] models.dev unavailable, drift report degraded:', msg);
			return emptyModelsDevCatalog();
		})
	]);

	// A catalog that contributed NOTHING (both blocks empty) carries no drift
	// INFORMATION — not "every model is missing". The fetcher only throws when
	// the `opencode-go` block is absent, so a block that is PRESENT but carries
	// an empty `models` map reaches here as a "successful" fetch. Applying the
	// drift with an empty id set would then report every docs model as missing,
	// which is exactly the false amber signal the comment above rules out.
	//
	// Returning `docs.audit` untouched is the correct "no drift information"
	// result: `modelsDevOnly` / `modelsDevMissing` start as `[]`.
	if (isModelsDevDegraded(md)) return docs.audit;

	return withModelsDevDrift(docs.audit, new Set(md.byId.keys()));
}

/** One lifecycle ledger row, for the `/debug` view. */
export interface ModelLifecycleRow extends GoLifecycle {
	/** How many canonical benchmarks this model reports (0 when it has none). */
	benchmarkCount: number;
}

/**
 * One canonical benchmark row, carrying the model it belongs to. Flattened to
 * one row per (model, benchmark) so a single stream serves both the ledger
 * table and the benchmark table below it.
 *
 * `score` is the RAW value — Elo ratings and Codeforces ratings are not on the
 * 0-100 scale `comparable` implies, so the consumer must render `metric`.
 */
export interface CanonicalBenchmarkRow {
	/** Go model id. */
	id: string;
	/** models.dev's canonical model id — the join key this row was resolved by. */
	canonicalId: string;
	/** Benchmark name, e.g. "Terminal-Bench". */
	name: string;
	/** Metric qualifier, e.g. "pass@1". Null when the source omits it. */
	metric: string | null;
	score: number;
	/**
	 * True when `score` is a percentage (0-100) rather than a rating (Elo,
	 * Codeforces). Carried through from the adapter so a machine consumer can
	 * tell `Codeforces 3471` from `78%` — the row's `score` is the raw value and
	 * the scale is not implied by `metric`.
	 */
	isPercentage: boolean;
	/** Reported by at least MIN_COVERAGE models — i.e. not single-model noise. */
	comparable: boolean;
	/** How many live Go models report this exact name|metric pair. */
	coverage: number;
}

/**
 * The model lifecycle ledger — when each model was live on OpenCode Go,
 * reconstructed from models.dev's per-file git history.
 *
 * ADVISORY: it NEVER adds a retired model to the customer-facing catalog. It
 * exists so a disappearance (a `killed` row) can be told apart from a docs↔API
 * mismatch on `/debug`.
 *
 * `rows` holds ONLY the models an Atom probe answered for. A model whose probe
 * FAILED is absent — its state is unknown, NOT `never` (which is a real
 * `status` meaning "the provider file never existed").
 */
export interface ModelLifecycleReport {
	/** Every classified row, attention-first. */
	rows: ModelLifecycleRow[];
	/** The same universe, `model → canonicalId`, for the benchmark table. */
	canonicalByModel: [string, string | null][];
	/** Flattened canonical benchmarks over the live Go universe. */
	benchmarks: CanonicalBenchmarkRow[];
	/**
	 * When this ledger was BUILT (Unix ms) — the Atom sweep's own age.
	 *
	 * The ledger lives 24h (`LIFECYCLE_TTL`) while the catalog behind it is
	 * rebuilt every 6h, so after a catalog refresh the two can disagree (a
	 * fresh universe beside a 24h-old sweep). `/debug` renders this so the
	 * ledger's age is legible instead of looking like live data. `null` on the
	 * empty fallback: there is no build to date.
	 */
	builtAt: number | null;
}

const EMPTY_LIFECYCLE: ModelLifecycleReport = {
	rows: [],
	canonicalByModel: [],
	benchmarks: [],
	builtAt: null
};

/**
 * Whether each Go model is still alive, deprecated, killed or drifting — plus
 * the canonical benchmark index over the same universe.
 *
 * The universe is the LIVE Go models, each resolved through
 * `resolveModelsDevEntry` (`opencode-go` first, then the Zen fallback) — not
 * the `opencode-go` block alone, which would drop every model models.dev has
 * not published there yet.
 *
 * The ledger and the benchmark index each get their OWN cache key and TTL
 * (24h), deliberately separate from the model cache:
 *
 *  - the ledger fans out to ~140 Atom feeds, so a slow sweep must never delay
 *    a catalog refresh;
 *  - the benchmark index comes from an independent upstream file
 *    (`models.json`) with its own failure mode.
 *
 * A failure degrades to an EMPTY REPORT with a logged error, matching the
 * advisory contract — an enrichment never breaks the catalog.
 */
export async function loadModelLifecycle(): Promise<ModelLifecycleReport> {
	return loadCached(LIFECYCLE_CACHE_KEY, buildModelLifecycle, EMPTY_LIFECYCLE);
}

/**
 * Force a lifecycle rebuild, ignoring the 24h TTL — the operator escape hatch
 * for the one gap the default refresh leaves.
 *
 * `revalidateModels()` deliberately does NOT rebuild the lifecycle: a ~140-feed
 * Atom sweep must never block a catalog rebuild. But that leaves the ledger
 * with NO invalidation path at all, so after a refresh it mixes a fresh Go
 * universe with an old sweep. This rebuilds the ledger and the canonical
 * benchmark index together (the benchmark builder reads `loadModels()` too), so
 * both agree with the catalog afterwards.
 *
 * ORDER MATTERS: the rebuild happens FIRST and the caches are only written once
 * it succeeded. Clearing before building would delete the previous report, and
 * `loadCached` would then have no `cached` value to fall back on — a failed
 * sweep would answer `{ ok: true, models: 0 }` and destroy the last known-good
 * ledger in the process. On failure this returns the previously cached report
 * (even stale) and leaves the caches untouched, so a failed revalidation is
 * observable through `builtAt === null` AND costs nothing.
 *
 * Exposed through `POST /api/revalidate?scope=lifecycle`.
 */
export async function revalidateLifecycle(): Promise<ModelLifecycleReport> {
	const previous = cacheGet<ModelLifecycleReport>(LIFECYCLE_CACHE_KEY);

	try {
		const { data, ttl } = await buildModelLifecycle();
		cacheSet(LIFECYCLE_CACHE_KEY, data, ttl);
		// The standalone benchmark cache is gone (its only caller now reads
		// `lifecycle.benchmarks`), so there is nothing else to invalidate here.
		return data;
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[models] ${LIFECYCLE_CACHE_KEY} revalidation failed:`, msg);
		return previous?.data ?? EMPTY_LIFECYCLE;
	}
}

/**
 * A built value plus the TTL it must be cached with.
 *
 * The builders own the TTL because only they know whether models.dev
 * contributed: a build against an empty catalog is DEGRADED and must expire
 * fast so the next read retries, instead of pinning the misclassification for
 * a day. `loadCached` stays a dumb wrapper — it never guesses.
 */
interface CachedBuild<T> {
	data: T;
	ttl: number;
}

/**
 * The TTL for a build that consumed `mdCatalog`.
 *
 * The degraded signal is `isModelsDevDegraded` — BOTH blocks, not `byId` alone
 * — so a Zen-only catalog (which still resolves models through the fallback)
 * keeps the full TTL.
 */
function catalogTtl(mdCatalog: ModelsDevCatalog): number {
	return isModelsDevDegraded(mdCatalog) ? DEGRADED_MODELS_TTL : LIFECYCLE_TTL;
}

/**
 * Read a `LIFECYCLE_TTL` entry, building and caching it on a miss.
 *
 * The TTL is per-entry and comes from the BUILD (`CachedBuild`) — a degraded
 * build writes a short TTL, so the next read after it expires re-builds while
 * a healthy one keeps its 24h. `cacheGet` reports `stale` by age, so this is
 * the whole self-heal path; no extra invalidation is needed.
 *
 * The build runs OUTSIDE `cacheSet`, and the entry is written only after it
 * resolves, so a partial sweep never replaces a complete one. On failure the
 * previously cached value (even if stale) wins over the empty fallback —
 * provenance beats freshness for an advisory ledger.
 */
async function loadCached<T>(
	key: string,
	build: () => Promise<CachedBuild<T>>,
	empty: T
): Promise<T> {
	const cached = cacheGet<T>(key);
	if (cached && !cached.stale) return cached.data;

	try {
		const { data, ttl } = await build();
		cacheSet(key, data, ttl);
		return data;
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[models] ${key} failed:`, msg);
		return cached?.data ?? empty;
	}
}

/**
 * Build the ledger, reporting a degraded TTL when models.dev contributed
 * nothing.
 *
 * An empty catalog empties `goProviderIds`, so every candidate is probed as
 * "not in the Go provider" and the ledger prefers `api-unknown` over
 * `api-closed` — a misclassification that must not be cached for 24h.
 */
async function buildModelLifecycle(): Promise<CachedBuild<ModelLifecycleReport>> {
	const [mdCatalog, liveGo] = await Promise.all([fetchModelsDevCatalog(), fetchGoModels()]);

	// The Go block and the Zen fallback can carry the same id; the Set keeps it
	// to one probe per model.
	const candidates = [
		...new Set([...mdCatalog.byId.keys(), ...mdCatalog.zenById.keys(), ...liveGo.map((m) => m.id)])
	];

	const entries = await fetchGoLifecycle(candidates, {
		goProviderIds: new Set(mdCatalog.byId.keys()),
		liveGoIds: new Set(liveGo.map((m) => m.id)),
		deprecatedIds: new Set(
			[...mdCatalog.byId, ...mdCatalog.zenById]
				.filter(([, entry]) => entry.status === 'deprecated')
				.map(([id]) => id)
		)
	});

	// The canonical layer is best-effort: losing it must not throw away the
	// ledger just populated from ~140 Atom feeds.
	const [canonical, goModels] = await Promise.all([
		fetchCanonicalBenchmarks().catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[models] canonical benchmarks failed:', msg);
			return new Map<string, CanonicalModel>();
		}),
		loadModels().catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[models] model catalog failed:', msg);
			return [] as GoModel[];
		})
	]);

	const canonicalByModel = resolveCanonicalIds(mdCatalog, goModels);
	const index = buildBenchmarkIndex(canonical, toIndexInput(canonicalByModel));

	return {
		ttl: catalogTtl(mdCatalog),
		data: {
			rows: [...entries.values()]
				.map((l) => ({ ...l, benchmarkCount: index.byModel.get(l.id)?.length ?? 0 }))
				.sort(
					(a, b) =>
						STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
						a.id.localeCompare(b.id)
				),
			canonicalByModel: [...canonicalByModel],
			benchmarks: flattenBenchmarks(index, canonicalByModel),
			builtAt: Date.now()
		}
	};
}

/** Attention first, then the boring cases. */
const STATUS_ORDER: GoLifecycleStatus[] = ['drift', 'killed', 'deprecated', 'alive', 'never'];

/**
 * `model id → canonical id` for the live Go catalog.
 *
 * Resolved through `resolveModelsDevEntry` rather than the `opencode-go` block
 * directly, so a model models.dev has only published under `opencode` (Zen)
 * still contributes benchmarks.
 */
function resolveCanonicalIds(
	mdCatalog: ModelsDevCatalog,
	goModels: GoModel[]
): Map<string, string | null> {
	return new Map(
		goModels.map((m) => [m.id, resolveModelsDevEntry(mdCatalog, m.id)?.canonical_model_id ?? null])
	);
}

function toIndexInput(
	canonicalByModel: Map<string, string | null>
): { id: string; canonicalId: string | null }[] {
	return [...canonicalByModel].map(([id, canonicalId]) => ({ id, canonicalId }));
}

function flattenBenchmarks(
	index: CanonicalBenchmarkIndex,
	canonicalByModel: Map<string, string | null>
): CanonicalBenchmarkRow[] {
	const rows: CanonicalBenchmarkRow[] = [];
	for (const [id, benchmarks] of index.byModel) {
		const canonicalId = canonicalByModel.get(id);
		// The index only holds ids that RESOLVED to a canonical id, so this is
		// defensive rather than reachable — but a row with no join key is worse
		// than no row at all.
		if (!canonicalId) continue;
		for (const b of benchmarks) {
			rows.push({
				id,
				canonicalId,
				name: b.name,
				metric: b.metric,
				score: b.score,
				isPercentage: b.isPercentage,
				comparable: index.comparable.has(benchmarkKey(b.name, b.metric)),
				coverage: b.coverage
			});
		}
	}
	return rows.sort(
		(a, b) =>
			a.name.localeCompare(b.name) ||
			(a.metric ?? '').localeCompare(b.metric ?? '') ||
			a.id.localeCompare(b.id)
	);
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
	const [goModels, mgResult, docsData, lsModels, mdCatalog] = await Promise.all([
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
		}),
		// models.dev is ADVISORY: it enriches fields and corrects open-weight
		// verdicts, but never changes which models are shown. A failure here
		// must not break the catalog, so it degrades to an empty catalog and
		// every model falls back to the existing heuristics. (`fetchModelsDevCatalog`
		// already serves the last known-good catalog on a fetch failure — this
		// catch only fires when there is nothing cached yet.)
		fetchModelsDevCatalog().catch((e: unknown) => {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[refreshCache] models.dev failed:', msg);
			return emptyModelsDevCatalog();
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

	// Count what enrichment ACTUALLY used, not just the `opencode-go` block: a
	// live Go model models.dev has not published under that provider is resolved
	// from the Zen block instead, so the two counts together describe the real
	// contribution (they can overlap, so the sum is an upper bound).
	// `modelsDevDegraded` means models.dev contributed NOTHING — both blocks
	// empty — and the catalog gets the short TTL below.
	const degraded = isModelsDevDegraded(mdCatalog);
	console.log(
		`[refreshCache] goModels=${goModels.length} official=${officialModels.length} modelgrepModels=${mgResult.byId.size} docsModels=${Object.keys(docsPricing).length} llmStats=${lsModels.length} frontier=${frontierLs.length} modelsDevGo=${mdCatalog.byId.size} modelsDevZen=${mdCatalog.zenById.size} modelsDevDegraded=${degraded}`
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

		return inferModel(
			gm.id,
			mgModel,
			docsPricing,
			lsModel,
			frontierCandidates,
			{
				go: { usage: docsUsage.go[gm.id] ?? null, scale: goScale },
				plus: hasPlus ? { usage: docsUsage.plus[gm.id] ?? null, scale: plusScale } : null
			},
			resolveModelsDevEntry(mdCatalog, gm.id)
		);
	});

	// A degraded catalog must not be pinned for the full 6h — a short TTL makes
	// the next request re-attempt the fetch, so the enrichment (and the
	// open-weight correction) self-heals quickly. A Zen-only catalog is NOT
	// degraded: its entries resolve through the fallback.
	cacheSet(CACHE_KEY, enriched, degraded ? DEGRADED_MODELS_TTL : MODELS_TTL);
	return enriched;
}

/**
 * TTL for a model-derived entry that got NO models.dev contribution. Short so
 * a cold-start models.dev failure self-heals on the next request instead of
 * pinning un-enriched data (and, for the ledger, a misclassified one) for the
 * full TTL. Used by the model catalog and the lifecycle/benchmark caches.
 */
const DEGRADED_MODELS_TTL = 15 * 60 * 1000;

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

/**
 * How long the lifecycle ledger and the canonical benchmark index live.
 *
 * 24h, and deliberately NOT `MODELS_TTL`: the git history behind the ledger
 * changes far more slowly than the Go catalog, and the ledger fans out to ~140
 * Atom feeds — a slow sweep must never be allowed to delay a catalog refresh.
 */
const LIFECYCLE_TTL = GO_DOCS_PRICING_TTL;

/**
 * Content-addressed keys, like `CACHE_KEY` above: edit a builder and the key
 * stops matching, so module-level state that survives a dev HMR cycle (the
 * `cache.ts` Map) can never serve a ledger built by the old code.
 *
 * `resolveCanonicalIds` is a HASH INPUT, not just a helper: it decides which
 * canonical id every Go model joins on, so editing it must invalidate the
 * ledger exactly like editing `buildModelLifecycle` does. Leaving it out served
 * a stale ledger after a real change to the join.
 */
const LIFECYCLE_CACHE_KEY = `model-lifecycle:${fnv1a(
	[
		fetchGoLifecycle,
		fetchGoModels,
		fetchModelsDevCatalog,
		fetchCanonicalBenchmarks,
		resolveModelsDevEntry,
		resolveCanonicalIds,
		buildModelLifecycle,
		buildBenchmarkIndex,
		flattenBenchmarks
	]
		.map((fn) => fn.toString())
		.join('\n')
)}`;

const EMPTY_SNAPSHOT: FrontierSnapshot = { frontier: [], cutoff: Date.now() };

if (dev) {
	console.log(`[models] enriched cache key: ${CACHE_KEY}`);
	console.log(`[models] frontier cache key: ${FRONTIER_CACHE_KEY}`);
	console.log(`[models] lifecycle cache key: ${LIFECYCLE_CACHE_KEY}`);
}
