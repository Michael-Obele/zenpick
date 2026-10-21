/**
 * models.dev — OpenCode's own published model catalog.
 *
 * models.dev is FIRST-PARTY OpenCode data: the `providers/opencode-go/models/`
 * TOMLs are authored by the OpenCode core team, so this is a primary source for
 * the Go plan rather than a third-party mirror.
 *
 * The join is EXACT — `opencode-go` entries are keyed by the byte-identical Go
 * model id, so no fuzzy matching is needed (unlike modelgrep/llm-stats).
 *
 * ADVISORY ONLY: this never decides which models ZenPick shows. It supplies
 * fields the other sources lack and flags disagreement.
 */

import { cacheGet, cacheSet, MODELS_TTL } from '$lib/cache';
import type { ModelsDevStatus } from '$lib/types/models';

/**
 * The status vocabulary models.dev actually publishes, DERIVED from the one
 * exported union so the two can never drift.
 *
 * This gate is consumer-facing: it decides the `llms.txt` Status column and
 * whether `DeprecatedBadge` renders. A status accepted here but missing from
 * `ModelsDevStatus` (or vice versa) would silently mislabel models, so the
 * union has exactly ONE definition — in `$lib/types/models`.
 */
export const KNOWN_STATUSES: readonly ModelsDevStatus[] = ['active', 'deprecated'];

/** One models.dev model entry, as published. */
export interface ModelsDevEntry {
	id: string;
	name?: string;
	description?: string;
	family?: string;
	attachment?: boolean;
	reasoning?: boolean;
	tool_call?: boolean;
	structured_output?: boolean;
	reasoning_options?: { type: string; values: string[] }[];
	release_date?: string;
	last_updated?: string;
	modalities?: { input: string[]; output: string[] };
	open_weights?: boolean;
	status?: string;
	knowledge?: string;
	limit?: { context?: number; input?: number; output?: number };
	/**
	 * NEVER merged into `ModelPricing`: models.dev carries base prices, while the
	 * Go docs page carries promo prices and is authoritative for billing.
	 */
	cost?: { input?: number; output?: number; cache_read?: number };
	canonical_model_id?: string;
}

/** The provider blocks we care about, indexed by exact model id. */
export interface ModelsDevCatalog {
	/** The `opencode-go` provider block — models.dev's Go-plan catalog. */
	byId: Map<string, ModelsDevEntry>;
	/**
	 * The `opencode` (Zen) provider block. Used as a FALLBACK for live Go
	 * models models.dev has not yet published under `opencode-go`
	 * (glm-5.1, grok-4.6, kimi-k2.6, minimax-m2.5, qwen3.6-plus).
	 */
	zenById: Map<string, ModelsDevEntry>;
}

const API_URL = 'https://models.dev/api.json';

/** Own cache entry — separate from the enriched model cache in `models.ts`. */
export const MODELS_DEV_CACHE_KEY = 'models-dev-catalog';

/**
 * Whether a catalog contributed NOTHING — i.e. models.dev is unavailable.
 *
 * BOTH blocks count. A catalog that resolved only through the Zen fallback DID
 * contribute: `resolveModelsDevEntry` still resolves those ids, so the
 * enrichment, the canonical join and the lifecycle ledger all work. Testing
 * `byId` alone would call that fetch degraded (and shorten its TTL) for a
 * perfectly good catalog.
 *
 * This is the ONE signal callers share. It is a separate function because
 * `models.ts` derives three TTLs from it and each needs to stay in step.
 */
export function isModelsDevDegraded(catalog: ModelsDevCatalog): boolean {
	return catalog.byId.size === 0 && catalog.zenById.size === 0;
}

/**
 * Empty catalog — the shape a CALLER uses when the fetch fails. The fetcher
 * itself THROWS on failure and never returns this; do not treat it as evidence
 * that `fetchModelsDevCatalog` degrades gracefully.
 */
export function emptyModelsDevCatalog(): ModelsDevCatalog {
	return { byId: new Map(), zenById: new Map() };
}

/**
 * Network fetch, uncached. Kept separate so `fetchModelsDevCatalog` can wrap it
 * in the last-good-catalog fallback without losing the throw-on-failure
 * contract for callers with nothing cached.
 *
 * `api.json` keys providers at the TOP LEVEL (there is no `providers`
 * wrapper), so the `opencode-go` id is the signal that we are talking to the
 * right API at all. A payload WITHOUT that block is a CONTRACT VIOLATION, not
 * an empty catalog: it must throw so the last-good fallback applies, rather
 * than be cached as a legitimate "models.dev has no Go models".
 *
 * Tolerated on purpose: a block that IS present but carries no `models` key
 * yields an empty map (the shape of a provider whose roster is not published
 * yet) — a different situation from the block being absent entirely.
 */
async function fetchModelsDevCatalogUncached(): Promise<ModelsDevCatalog> {
	const res = await fetch(API_URL, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) throw new Error(`models.dev api.json: ${res.status}`);

	const data = (await res.json()) as Record<string, { models?: Record<string, ModelsDevEntry> }>;

	const goProvider = data['opencode-go'];
	if (typeof goProvider !== 'object' || goProvider === null) {
		throw new Error("models.dev api.json: missing 'opencode-go' provider block");
	}

	const goBlock = goProvider.models ?? {};
	const zenBlock = data['opencode']?.models ?? {};

	return {
		byId: new Map(Object.entries(goBlock)),
		zenById: new Map(Object.entries(zenBlock))
	};
}

/**
 * Fetch models.dev and index the provider blocks we use.
 *
 * The whole api.json is downloaded (5.7 MB raw / ~591 KB gzipped) and only the
 * two provider blocks we need are retained. There is no per-provider JSON
 * endpoint: `?provider=` does not filter, and `/api/<id>.json` 302s to the HTML
 * page.
 *
 * A fetch failure must not lose the last known-good catalog: the enrichment
 * (and especially the open-weight correction) is more valuable stale than
 * absent. The cached value is used regardless of `stale` — the whole point is
 * to keep serving a catalog that is older than the TTL. Only when there is no
 * cached value at all does the failure propagate, so `refreshCache`'s existing
 * degradation still applies.
 */
export async function fetchModelsDevCatalog(): Promise<ModelsDevCatalog> {
	const cached = cacheGet<ModelsDevCatalog>(MODELS_DEV_CACHE_KEY);
	try {
		const fresh = await fetchModelsDevCatalogUncached();
		// Only a successful, contract-valid fetch reaches here, so this write
		// can never pin an empty catalog as the "last good" one.
		cacheSet(MODELS_DEV_CACHE_KEY, fresh, MODELS_TTL);
		return fresh;
	} catch (e) {
		if (cached) {
			console.error('[models-dev] fetch failed, serving cached catalog:', e);
			return cached.data;
		}
		throw e;
	}
}

/**
 * Resolve the models.dev entry for a Go model id.
 *
 * The `opencode-go` block wins; the Zen block is the fallback for models
 * models.dev has not published under the Go provider yet. For an id present in
 * BOTH blocks, the Go entry is preferred.
 *
 * One asymmetry matters: some ids (`minimax-m3`, `deepseek-v4-pro`) live in
 * both blocks, and their GO entry carries no `canonical_model_id` while the ZEN
 * entry does. The Go entry is still the better record for name/limit/status, so
 * it stays the resolution — but the canonical id is BACKFILLED from the other
 * block rather than lost, or the model drops out of the benchmark index that
 * joins on exactly that field.
 */
export function resolveModelsDevEntry(
	catalog: ModelsDevCatalog,
	goId: string
): ModelsDevEntry | null {
	const go = catalog.byId.get(goId);
	const zen = catalog.zenById.get(goId);
	const preferred = go ?? zen;
	if (!preferred) return null;
	// Only backfill a REAL value: spreading `undefined` would add an own
	// property the source entry never had, changing the object's identity for
	// consumers that compare entries (`toBe` in tests, and future callers).
	if (preferred.canonical_model_id || !go || !zen || !zen.canonical_model_id) return preferred;
	return { ...preferred, canonical_model_id: zen.canonical_model_id };
}

/** Reasoning-effort levels, or null when the model publishes none. */
export function extractReasoningEfforts(entry: ModelsDevEntry | null): string[] | null {
	const option = entry?.reasoning_options?.find((o) => o.type === 'effort');
	if (!option || !option.values.length) return null;
	return [...option.values];
}

/**
 * Output-token cap, or null.
 *
 * ZenPick has no output-cap field of its own — the quota calculator assumes
 * `outputTokens = inputTokens * 0.15`, which is wrong for every model whose
 * real cap is below that.
 */
export function extractMaxOutputTokens(entry: ModelsDevEntry | null): number | null {
	const output = entry?.limit?.output;
	return typeof output === 'number' && output > 0 ? output : null;
}

/** Training-cutoff date, or null. */
export function extractKnowledgeCutoff(entry: ModelsDevEntry | null): string | null {
	return entry?.knowledge ?? null;
}

/** models.dev's canonical model id, or null. */
export function extractCanonicalId(entry: ModelsDevEntry | null): string | null {
	return entry?.canonical_model_id ?? null;
}

function isKnownStatus(status: string): status is ModelsDevStatus {
	return (KNOWN_STATUSES as readonly string[]).includes(status);
}

/**
 * models.dev's publication status, normalised.
 *
 * `deprecated` is a LEADING INDICATOR of removal, not proof of it —
 * `minimax-m2.7` is deprecated yet still served by the Go API.
 *
 * A status models.dev does not publish today (`'alpha'`, `'preview'`, …) or a
 * new one it introduces later returns `null`, NOT `'active'`: manufacturing
 * `'active'` from an unrecognised string would silently erase the distinction
 * on every consumer-visible `GoModel.modelsDevStatus`.
 */
export function extractModelsDevStatus(entry: ModelsDevEntry | null): ModelsDevStatus | null {
	// models.dev omits `status` for the default (active) case.
	if (!entry) return null;
	if (entry.status === undefined) return 'active';
	return isKnownStatus(entry.status) ? entry.status : null;
}
