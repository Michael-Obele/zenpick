// The loaders' import graph needs SvelteKit virtual modules. Those collaborators
// are mocked; the module under test is not, so `models.ts` runs its real cache
// and TTL logic. `vi.hoisted` must sit ABOVE the imports: `vi.mock` factories are
// hoisted above every top-level binding, so the mock fns have to be created there.
const mocks = vi.hoisted(() => ({
	fetchGoModels: vi.fn(),
	fetchModelsDevCatalog: vi.fn(),
	fetchGoLifecycle: vi.fn(),
	fetchCanonicalBenchmarks: vi.fn(),
	/**
	 * The `GoDocsData` the mocked `fetchGoDocsData` resolves to. Mutated in
	 * place by the `loadCatalogAudit` suite; typed lower down, where imported
	 * types are visible (`vi.hoisted` runs above the imports).
	 */
	goDocs: {
		pricing: {},
		usageLimits: { go: {}, plus: {} },
		officialModelIds: new Set<string>(),
		audit: null as unknown
	}
}));

import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';
import { cacheKeysMatching } from '$lib/cache';
import { makeGoModel } from '$lib/test/fixtures';
import type { CatalogAudit } from '$lib/types/models';
import type { GoDocsData } from '$lib/server/go-docs';
import { emptyModelsDevCatalog, type ModelsDevCatalog } from './models-dev';

/** The mocked docs payload, typed where the imported types are in scope. */
const goDocs = mocks.goDocs as GoDocsData;

/** A fresh `CatalogAudit` — `loadCatalogAudit` reads it, so tests mutate it. */
function emptyAudit(): CatalogAudit {
	return {
		apiCount: 0,
		docsRows: 0,
		matchedRows: 0,
		unmatchedDocsRows: [],
		pricedButUnlisted: [],
		listedButUnpriced: [],
		apiNotListed: [],
		officialModelIds: [],
		modelsDevOnly: [],
		modelsDevMissing: []
	};
}

const { fetchGoModels, fetchModelsDevCatalog, fetchGoLifecycle, fetchCanonicalBenchmarks } = mocks;

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/static/private', () => ({ LLM_STATS_API_KEY: 'test-key' }));
vi.mock('$lib/server/opencode-go', () => ({
	fetchGoModels: mocks.fetchGoModels,
	goEndpointType: () => 'openai-compatible',
	goEndpointUrl: () => '',
	goIdToName: (id: string) => id
}));
vi.mock('$lib/server/models-dev', async (importOriginal) => ({
	...(await importOriginal<typeof import('./models-dev')>()),
	fetchModelsDevCatalog: mocks.fetchModelsDevCatalog
}));
vi.mock('$lib/server/go-lifecycle', async (importOriginal) => ({
	...(await importOriginal<typeof import('./go-lifecycle')>()),
	fetchGoLifecycle: mocks.fetchGoLifecycle
}));
vi.mock('$lib/server/canonical-benchmarks', async (importOriginal) => ({
	...(await importOriginal<typeof import('./canonical-benchmarks')>()),
	fetchCanonicalBenchmarks: mocks.fetchCanonicalBenchmarks
}));
vi.mock('$lib/server/modelgrep', () => ({
	fetchModelgrepModels: async () => ({ byId: new Map(), all: [] }),
	fuzzyMatchModelgrep: () => null
}));
vi.mock('$lib/server/inference', () => ({
	// `loadModels` -> `refreshCache` calls this; a stub keeps that path offline
	// without dragging the mocks for every module `inference.ts` imports.
	inferModel: (id: string) => makeGoModel({ id }),
	inferMigrationHints: () => []
}));
vi.mock('$lib/server/go-docs', async (importOriginal) => {
	mocks.goDocs.audit = emptyAudit();
	const real = await importOriginal<typeof import('./go-docs')>();
	return {
		...real,
		// Must match `GoDocsData` exactly: `refreshCache` reads `usageLimits.plus`,
		// and `loadCatalogAudit` reads `audit` — omitting a key would hand a future
		// test an `undefined` where the type promises an object.
		fetchGoDocsData: async (): Promise<GoDocsData> => goDocs
	};
});
vi.mock('$lib/server/llm-stats', async (importOriginal) => ({
	...(await importOriginal<typeof import('./llm-stats')>()),
	fetchLlmStatsModels: async () => []
}));

const { loadModelLifecycle, loadCatalogAudit, revalidateLifecycle } = await import('./models');

/** The 24h TTL a HEALTHY build writes. */
const LIFECYCLE_TTL = 24 * 60 * 60 * 1000;
/** The 15m TTL a build against an empty models.dev catalog writes. */
const DEGRADED_MODELS_TTL = 15 * 60 * 1000;
const MINUTE = 60 * 1000;

/**
 * Drop every cache entry except `keep` — the per-test reset, since the
 * content-addressed loader keys cannot be named.
 */
function resetCache(keep: (key: string) => boolean): void {
	// Only the side effect matters here, not the (empty) fragment match.
	cacheKeysMatching('', keep);
}

/** The TTL written for the one cache entry whose key contains `fragment`. */
function ttlFor(fragment: string): number {
	const entries = cacheKeysMatching(fragment);
	expect(entries).toHaveLength(1);
	return entries[0].ttl;
}

const MD_ENTRY = { id: 'hy3' };

function healthyCatalog(): ModelsDevCatalog {
	return { byId: new Map([['hy3', MD_ENTRY]]), zenById: new Map([['grok-4.6', MD_ENTRY]]) };
}

/** A catalog that resolved ONLY through the Zen fallback — not degraded. */
function zenOnlyCatalog(): ModelsDevCatalog {
	return { byId: new Map(), zenById: new Map([['grok-4.6', MD_ENTRY]]) };
}

beforeEach(() => {
	vi.clearAllMocks();
	// Leave the models.dev catalog entry alone: every test sets the fetch mock
	// explicitly, so a leftover catalog would only mask a bad default.
	resetCache((key) => key === 'models-dev-catalog');
	fetchGoModels.mockResolvedValue([makeGoModel({ id: 'hy3' })]);
	fetchGoLifecycle.mockResolvedValue(new Map());
	fetchCanonicalBenchmarks.mockResolvedValue(new Map());
	fetchModelsDevCatalog.mockResolvedValue(healthyCatalog());
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('lifecycle cache TTL', () => {
	it('caches a healthy build for the 24h TTL', async () => {
		await loadModelLifecycle();

		expect(ttlFor('model-lifecycle')).toBe(LIFECYCLE_TTL);
	});

	it('caches a build against an EMPTY models.dev catalog for the short TTL', async () => {
		// An empty catalog empties `goProviderIds`, so every probe classifies as
		// "not in the Go provider". Pinning that for 24h would hold a
		// misclassified ledger with no self-heal path.
		fetchModelsDevCatalog.mockResolvedValue(emptyModelsDevCatalog());

		await loadModelLifecycle();

		expect(ttlFor('model-lifecycle')).toBe(DEGRADED_MODELS_TTL);
	});

	it('does NOT treat a Zen-only catalog as degraded', async () => {
		// models.dev contributed: `resolveModelsDevEntry` still resolves through
		// the Zen fallback, so the build is sound and keeps the full TTL.
		fetchModelsDevCatalog.mockResolvedValue(zenOnlyCatalog());

		await loadModelLifecycle();

		expect(ttlFor('model-lifecycle')).toBe(LIFECYCLE_TTL);
	});

	it('re-builds once the degraded entry ages past the short TTL', async () => {
		// The self-heal rests on `cacheGet` ageing each entry by its OWN TTL, not
		// a global. Move the clock: 16 minutes is past the 15m degraded TTL and
		// well inside the 24h one, so ONLY a degraded entry can be rebuildable.
		vi.useFakeTimers({ toFake: ['Date'] });
		fetchModelsDevCatalog.mockResolvedValue(emptyModelsDevCatalog());

		await loadModelLifecycle();
		expect(fetchGoLifecycle).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 16 * MINUTE);
		await loadModelLifecycle();
		expect(fetchGoLifecycle).toHaveBeenCalledTimes(2);
	});

	it('does NOT re-build a healthy entry at 16 minutes (positive control)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });

		await loadModelLifecycle();
		vi.setSystemTime(Date.now() + 16 * MINUTE);
		await loadModelLifecycle();

		expect(fetchGoLifecycle).toHaveBeenCalledTimes(1);
	});
});

/**
 * A catalog whose `opencode-go` block is PRESENT (so `fetchModelsDevCatalogUncached`
 * accepts the payload — it only throws when the block is absent) but publishes
 * no roster. Nothing was contributed, so there is no drift information to
 * report and the fetch is indistinguishable from an outage for this purpose.
 */
function emptyGoBlockCatalog(): ModelsDevCatalog {
	return emptyModelsDevCatalog();
}

describe('canonical benchmark cache TTL', () => {
	it('caches a healthy build for the 24h TTL', async () => {
		await loadModelLifecycle();

		expect(ttlFor('model-lifecycle')).toBe(LIFECYCLE_TTL);
	});

	it('caches a build against an empty catalog for the short TTL', async () => {
		// With no catalog entry, `resolveCanonicalIds` yields null for every
		// model, so the index comes out empty — not worth 24h.
		fetchModelsDevCatalog.mockResolvedValue(emptyModelsDevCatalog());

		await loadModelLifecycle();

		expect(ttlFor('model-lifecycle')).toBe(DEGRADED_MODELS_TTL);
	});

	it('does NOT treat a Zen-only catalog as degraded', async () => {
		fetchModelsDevCatalog.mockResolvedValue(zenOnlyCatalog());

		await loadModelLifecycle();

		expect(ttlFor('model-lifecycle')).toBe(LIFECYCLE_TTL);
	});

	it('re-builds once the degraded entry ages past the short TTL', async () => {
		// Same self-heal contract as the ledger: `cacheSet` stores the TTL
		// PER ENTRY, so `cacheGet` ages a degraded entry at 15m, not 24h.
		vi.useFakeTimers({ toFake: ['Date'] });
		fetchModelsDevCatalog.mockResolvedValue(emptyModelsDevCatalog());

		await loadModelLifecycle();
		expect(fetchCanonicalBenchmarks).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 16 * MINUTE);
		await loadModelLifecycle();
		expect(fetchCanonicalBenchmarks).toHaveBeenCalledTimes(2);
	});
});

describe('loadCatalogAudit — models.dev drift', () => {
	/** A docs audit with one unmatched row, so the non-drift fields are observable. */
	function seedAudit(): void {
		const audit = emptyAudit();
		audit.unmatchedDocsRows = [{ name: 'Claude Haiku 5.5', table: 'pricing' }];
		audit.pricedButUnlisted = ['claude-haiku-5-5'];
		audit.officialModelIds = ['hy3'];
		goDocs.audit = audit;
	}

	beforeEach(seedAudit);

	it('applies the drift rows when models.dev published a Go roster', async () => {
		fetchModelsDevCatalog.mockResolvedValue({
			byId: new Map([
				['hy3', MD_ENTRY],
				['models-dev-only', MD_ENTRY]
			]),
			zenById: new Map()
		});

		const audit = await loadCatalogAudit();

		expect(audit.modelsDevMissing).toEqual([]);
		expect(audit.modelsDevOnly).toEqual(['models-dev-only']);
	});

	it('does NOT fabricate a full "missing" list for a PRESENT-but-EMPTY opencode-go block', async () => {
		// The bug: an empty block reaches here as a successful fetch, so an
		// empty id set made EVERY official model "not published by models.dev"
		// — the exact large false amber signal the read-time split exists to
		// prevent. No drift information, so the rows stay empty.
		fetchModelsDevCatalog.mockResolvedValue(emptyGoBlockCatalog());

		const audit = await loadCatalogAudit();

		expect(audit.modelsDevMissing).toEqual([]);
		expect(audit.modelsDevOnly).toEqual([]);
	});

	it('keeps the non-drift audit fields untouched when models.dev contributed nothing', async () => {
		// Returning `docs.audit` unchanged must still carry the docs↔API
		// findings — the degrade drops drift rows only.
		fetchModelsDevCatalog.mockResolvedValue(emptyGoBlockCatalog());

		const audit = await loadCatalogAudit();

		expect(audit.unmatchedDocsRows).toEqual([{ name: 'Claude Haiku 5.5', table: 'pricing' }]);
		expect(audit.pricedButUnlisted).toEqual(['claude-haiku-5-5']);
		expect(audit.officialModelIds).toEqual(['hy3']);
	});
});

describe('revalidateLifecycle', () => {
	it('keeps the previously cached report when the rebuild FAILS', async () => {
		// Seed a good report.
		const first = await loadModelLifecycle();
		expect(first.builtAt).not.toBeNull();

		// Now make the sweep fail. The revalidation must NOT clear the cache
		// first: a clear-then-build leaves `loadCached` no value to fall back
		// on, so a failed sweep would answer an empty report AND destroy the
		// last known-good ledger.
		fetchGoLifecycle.mockRejectedValue(new Error('atom sweep exploded'));

		const after = await revalidateLifecycle();

		expect(after).toEqual(first);
		expect(after.builtAt).not.toBeNull();
		// The cache still holds the old report.
		expect(ttlFor('model-lifecycle')).toBe(LIFECYCLE_TTL);
		expect(await loadModelLifecycle()).toEqual(first);
	});

	it('replaces the cached report when the rebuild SUCCEEDS', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const first = await loadModelLifecycle();

		vi.setSystemTime(Date.now() + MINUTE);
		fetchGoLifecycle.mockResolvedValue(
			new Map([
				[
					'hy3',
					{
						id: 'hy3',
						status: 'alive' as const,
						firstSeen: null,
						killedOn: null,
						lastTouched: null
					}
				]
			])
		);

		const after = await revalidateLifecycle();

		expect(after.builtAt).toBeGreaterThan(first.builtAt ?? 0);
		expect(after.rows.map((r) => r.id)).toEqual(['hy3']);
		expect(await loadModelLifecycle()).toEqual(after);
	});

	it('returns the empty fallback (builtAt null) only when there was nothing cached', async () => {
		// The endpoint derives `ok` from `builtAt != null`, so this is the ONE
		// case that must read as a failure.
		fetchGoLifecycle.mockRejectedValue(new Error('atom sweep exploded'));

		const report = await revalidateLifecycle();

		expect(report.builtAt).toBeNull();
	});
});
