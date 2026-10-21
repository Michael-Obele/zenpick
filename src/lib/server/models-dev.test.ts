import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { cacheClear, cacheKeysMatching } from '$lib/cache';
import type { FrontierCandidate, LlmStatsModel, ModelsDevStatus } from '$lib/types/models';
import { makeBenchmarks } from '$lib/test/fixtures';
import { inferModel } from './inference';
import {
	emptyModelsDevCatalog,
	extractCanonicalId,
	extractKnowledgeCutoff,
	extractMaxOutputTokens,
	extractModelsDevStatus,
	extractReasoningEfforts,
	fetchModelsDevCatalog,
	isModelsDevDegraded,
	KNOWN_STATUSES,
	resolveModelsDevEntry,
	MODELS_DEV_CACHE_KEY,
	type ModelsDevCatalog,
	type ModelsDevEntry
} from './models-dev';

function makeEntry(partial: Partial<ModelsDevEntry> = {}): ModelsDevEntry {
	return { id: 'test-model', ...partial };
}

function makeCatalog(partial: Partial<ModelsDevCatalog> = {}): ModelsDevCatalog {
	return { byId: new Map(), zenById: new Map(), ...partial };
}

/**
 * One closed-source frontier candidate whose blended scores sit ON TOP of the
 * model below, so `inferMigrationHints` produces a "replaces" hint for every
 * category as soon as its `openWeight` gate passes.
 */
function makeFrontierCandidate(): FrontierCandidate {
	return {
		id: 'claude-opus-5',
		name: 'Claude Opus 5',
		organization: { id: 'anthropic', name: 'Anthropic' },
		releaseDate: null,
		benchmarks: makeBenchmarks({ coding: 60, reasoning: 60, math: 60 })
	};
}

/**
 * A closed-source llm-stats model that ties the frontier candidate above.
 *
 * The tie is reached WITHOUT a blend on the tested path: `blendBenchmarks` only
 * substitutes an llm-stats score where the modelgrep side is missing, and this
 * model has no modelgrep entry at all — so `code`/`reasoning`/`math` values
 * ≤ 1 pass through scaled ×100 unchanged, arriving at 60/60/60 with zero gap
 * against the candidate above. (An explicit `gpqa`-style null would leave the
 * llm-stats value untouched; nothing in this fixture depends on that branch.)
 */
function makeComparableLsModel(id: string): LlmStatsModel {
	return {
		...makeClosedLsModel(id),
		top_scores: { code: 0.6, reasoning: 0.6, math: 0.6 }
	};
}

/** Minimal closed-source llm-stats counterpart — the heuristic's usual input. */
function makeClosedLsModel(id: string): LlmStatsModel {
	return {
		id,
		name: id,
		description: '',
		organization: null,
		family: null,
		open_weight: false,
		model_type: 'chat',
		modalities: ['text'],
		context_window: 128_000,
		param_count: null,
		training_tokens: null,
		knowledge_cutoff: null,
		release_date: null,
		top_scores: {},
		source: 'test',
		url: ''
	};
}

describe('emptyModelsDevCatalog', () => {
	it('returns empty maps for both provider blocks', () => {
		const catalog = emptyModelsDevCatalog();
		expect(catalog.byId.size).toBe(0);
		expect(catalog.zenById.size).toBe(0);
	});

	it('returns a fresh instance each call (no shared mutable maps)', () => {
		const first = emptyModelsDevCatalog();
		first.byId.set('leaked', makeEntry());
		expect(emptyModelsDevCatalog().byId.size).toBe(0);
	});
});

describe('fetchModelsDevCatalog', () => {
	const originalFetch = globalThis.fetch;

	/** Minimal Response stand-in — the fetcher only reads ok, status and json(). */
	function stubFetch(body: unknown, ok = true, status = 200): void {
		const fake = { ok, status, json: async () => body };
		globalThis.fetch = (async () => fake) as unknown as typeof fetch;
	}

	/** The fetcher caches, so each test starts from a cold cache. */
	beforeEach(() => {
		cacheClear(MODELS_DEV_CACHE_KEY);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('parses both provider blocks and keys each by exact model id', async () => {
		// Real api.json shape: provider ids are top-level keys, NO `providers`
		// wrapper, and each model is keyed by its own id inside `models`.
		stubFetch({
			'opencode-go': { models: { hy3: { id: 'hy3' } } },
			opencode: { models: { 'grok-4.6': { id: 'grok-4.6' } } }
		});

		const catalog = await fetchModelsDevCatalog();

		expect(catalog.byId.get('hy3')).toBeDefined();
		expect(catalog.zenById.get('grok-4.6')).toBeDefined();
		// The two blocks stay separate — a Zen-only model must not leak into byId.
		expect(catalog.byId.has('grok-4.6')).toBe(false);
	});

	it('throws with the status when the response is not ok', async () => {
		stubFetch({}, false, 500);

		await expect(fetchModelsDevCatalog()).rejects.toThrow(/500/);
	});

	it('throws when the opencode-go provider block is absent (contract violation)', async () => {
		// api.json keys providers at the TOP LEVEL, so a payload without
		// `opencode-go` is not a valid response at all. Treating it as an empty
		// catalog would cache the emptiness for the full TTL as "last good".
		stubFetch({ opencode: { models: {} } });

		await expect(fetchModelsDevCatalog()).rejects.toThrow(/missing 'opencode-go' provider block/);
	});

	it('tolerates a present opencode-go block with no models key', async () => {
		// A published provider whose roster is not there yet is a different thing
		// from the provider being absent: it yields empty maps and does NOT throw.
		stubFetch({ 'opencode-go': {}, opencode: {} });

		const catalog = await fetchModelsDevCatalog();

		expect(catalog.byId.size).toBe(0);
		expect(catalog.zenById.size).toBe(0);
	});

	it('throws an explicit contract error for a non-object opencode-go block', async () => {
		// The provider id is a top-level KEY, so anything but an object means we
		// are not talking to the documented shape at all.
		stubFetch({ 'opencode-go': null, opencode: { models: {} } });

		await expect(fetchModelsDevCatalog()).rejects.toThrow(
			/models.dev api.json: missing 'opencode-go' provider block/
		);
	});

	it('is NOT degraded after a Zen-only payload (a successful fetch that still contributed)', async () => {
		// Regression guard for the flagged conflation: a well-formed payload whose
		// Go block is present but empty, plus Zen entries, is a SUCCESS.
		stubFetch({ 'opencode-go': {}, opencode: { models: { 'grok-4.6': { id: 'grok-4.6' } } } });

		const catalog = await fetchModelsDevCatalog();

		expect(isModelsDevDegraded(catalog)).toBe(false);
		// ...and it IS written as the last good catalog, because it is good.
		expect(cacheKeysMatching(MODELS_DEV_CACHE_KEY)).toHaveLength(1);
	});

	it('does not cache a contract violation as the last good catalog', async () => {
		// The contract violation must leave the cache untouched, so a later
		// outage cannot resurrect a catalog that never existed.
		stubFetch({ opencode: { models: { 'grok-4.6': { id: 'grok-4.6' } } } });
		await expect(fetchModelsDevCatalog()).rejects.toThrow(/opencode-go/);

		// With nothing cached the next failure still throws (no phantom fallback,
		// and no Zen-only catalog smuggled in as "last good").
		stubFetch({}, false, 500);
		await expect(fetchModelsDevCatalog()).rejects.toThrow(/500/);
	});

	it('serves the last good catalog when a later fetch fails', async () => {
		stubFetch({ 'opencode-go': { models: { hy3: { id: 'hy3' } } } });
		await fetchModelsDevCatalog();

		// The next fetch throws, but the cached catalog must survive: losing it
		// silently reverts the open-weight correction for the whole TTL.
		stubFetch({}, false, 503);

		const catalog = await fetchModelsDevCatalog();

		expect(catalog.byId.get('hy3')).toBeDefined();
	});

	it('still throws when a fetch fails and nothing was ever cached', async () => {
		// No cached fallback means `refreshCache` must be able to degrade itself.
		stubFetch({}, false, 502);

		await expect(fetchModelsDevCatalog()).rejects.toThrow(/502/);
	});
});

describe('isModelsDevDegraded', () => {
	it('is not degraded when the Go block has entries', () => {
		const catalog = makeCatalog({ byId: new Map([['hy3', makeEntry()]]) });
		expect(isModelsDevDegraded(catalog)).toBe(false);
	});

	it('is NOT degraded when only the Zen block has entries', () => {
		// The reviewer-flagged case: `resolveModelsDevEntry` still resolves these
		// through the fallback, so models.dev DID contribute. Testing `byId` alone
		// would shorten the TTL for a perfectly good catalog.
		const catalog = makeCatalog({ zenById: new Map([['grok-4.6', makeEntry()]]) });
		expect(isModelsDevDegraded(catalog)).toBe(false);
	});

	it('is degraded when neither block has entries', () => {
		expect(isModelsDevDegraded(emptyModelsDevCatalog())).toBe(true);
	});
});

describe('resolveModelsDevEntry', () => {
	it('prefers the opencode-go block over the Zen block', () => {
		const go = makeEntry({ id: 'glm-5.2', name: 'GLM 5.2 (Go)' });
		const zen = makeEntry({ id: 'glm-5.2', name: 'GLM 5.2 (Zen)' });
		const catalog = makeCatalog({
			byId: new Map([['glm-5.2', go]]),
			zenById: new Map([['glm-5.2', zen]])
		});

		expect(resolveModelsDevEntry(catalog, 'glm-5.2')).toBe(go);
	});

	it('falls back to the Zen block for a Go model models.dev has not published under opencode-go', () => {
		const zen = makeEntry({ id: 'glm-5.1', name: 'GLM 5.1' });
		const catalog = makeCatalog({ zenById: new Map([['glm-5.1', zen]]) });

		expect(resolveModelsDevEntry(catalog, 'glm-5.1')).toBe(zen);
	});

	it('returns null for an unknown model id', () => {
		const catalog = makeCatalog({
			byId: new Map([['glm-5.2', makeEntry()]]),
			zenById: new Map([['glm-5.1', makeEntry()]])
		});

		expect(resolveModelsDevEntry(catalog, 'nonexistent-model')).toBeNull();
	});

	it('returns null against an empty catalog', () => {
		expect(resolveModelsDevEntry(emptyModelsDevCatalog(), 'glm-5.2')).toBeNull();
	});

	it('backfills canonical_model_id from the Zen block when the Go entry lacks one', () => {
		// `minimax-m3` and `deepseek-v4-pro` live in BOTH blocks; only the Zen
		// entry carries the canonical id. Preferring the Go entry must not LOSE
		// the join key, or the model drops out of the benchmark index that
		// joins on exactly that field.
		const go = makeEntry({ id: 'minimax-m3', name: 'MiniMax M3 (Go)' });
		const zen = makeEntry({ id: 'minimax-m3', canonical_model_id: 'minimax/MiniMax-M3' });

		const resolved = resolveModelsDevEntry(
			makeCatalog({
				byId: new Map([['minimax-m3', go]]),
				zenById: new Map([['minimax-m3', zen]])
			}),
			'minimax-m3'
		);

		expect(resolved?.canonical_model_id).toBe('minimax/MiniMax-M3');
		// The Go entry stays the record for everything else.
		expect(resolved?.name).toBe('MiniMax M3 (Go)');
	});

	it('keeps the Go entry canonical_model_id when it has one', () => {
		const go = makeEntry({ id: 'minimax-m3', canonical_model_id: 'minimax/m3-go' });
		const zen = makeEntry({ id: 'minimax-m3', canonical_model_id: 'minimax/MiniMax-M3' });

		const resolved = resolveModelsDevEntry(
			makeCatalog({
				byId: new Map([['minimax-m3', go]]),
				zenById: new Map([['minimax-m3', zen]])
			}),
			'minimax-m3'
		);

		expect(resolved).toBe(go);
	});

	it('leaves a Go-only entry untouched when it has no canonical id', () => {
		const go = makeEntry({ id: 'hy3' });

		const resolved = resolveModelsDevEntry(
			makeCatalog({ byId: new Map([['hy3', go]]), zenById: new Map() }),
			'hy3'
		);

		expect(resolved).toBe(go);
		expect(resolved?.canonical_model_id).toBeUndefined();
	});
});

describe('extractReasoningEfforts', () => {
	it('reads the values of the effort reasoning option', () => {
		const entry = makeEntry({
			reasoning_options: [
				{ type: 'budget_tokens', values: [] },
				{ type: 'effort', values: ['minimal', 'low', 'high'] }
			]
		});

		expect(extractReasoningEfforts(entry)).toEqual(['minimal', 'low', 'high']);
	});

	it('returns a copy, not the entry’s own array', () => {
		const values = ['low', 'high'];
		const entry = makeEntry({ reasoning_options: [{ type: 'effort', values }] });
		const result = extractReasoningEfforts(entry);

		expect(result).toEqual(values);
		expect(result).not.toBe(values);
	});

	it('returns null when no effort option is published', () => {
		expect(extractReasoningEfforts(makeEntry())).toBeNull();
		expect(
			extractReasoningEfforts(
				makeEntry({ reasoning_options: [{ type: 'budget_tokens', values: ['1024'] }] })
			)
		).toBeNull();
	});

	it('returns null when the effort option has an empty values list', () => {
		expect(
			extractReasoningEfforts(makeEntry({ reasoning_options: [{ type: 'effort', values: [] }] }))
		).toBeNull();
	});

	it('returns null for a null entry', () => {
		expect(extractReasoningEfforts(null)).toBeNull();
	});
});

describe('extractMaxOutputTokens', () => {
	it('reads limit.output', () => {
		expect(extractMaxOutputTokens(makeEntry({ limit: { context: 200_000, output: 32_000 } }))).toBe(
			32_000
		);
	});

	it('returns null for a zero or negative cap', () => {
		expect(extractMaxOutputTokens(makeEntry({ limit: { output: 0 } }))).toBeNull();
		expect(extractMaxOutputTokens(makeEntry({ limit: { output: -1 } }))).toBeNull();
	});

	it('returns null when limit or limit.output is missing', () => {
		expect(extractMaxOutputTokens(makeEntry())).toBeNull();
		expect(extractMaxOutputTokens(makeEntry({ limit: { context: 200_000 } }))).toBeNull();
	});

	it('returns null for a null entry', () => {
		expect(extractMaxOutputTokens(null)).toBeNull();
	});
});

describe('extractKnowledgeCutoff', () => {
	it('reads the knowledge field', () => {
		expect(extractKnowledgeCutoff(makeEntry({ knowledge: '2025-03-01' }))).toBe('2025-03-01');
	});

	it('returns null when absent', () => {
		expect(extractKnowledgeCutoff(makeEntry())).toBeNull();
		expect(extractKnowledgeCutoff(null)).toBeNull();
	});
});

describe('extractCanonicalId', () => {
	it('reads canonical_model_id', () => {
		expect(extractCanonicalId(makeEntry({ canonical_model_id: 'anthropic/claude-opus-5' }))).toBe(
			'anthropic/claude-opus-5'
		);
	});

	it('returns null when absent', () => {
		expect(extractCanonicalId(makeEntry())).toBeNull();
		expect(extractCanonicalId(null)).toBeNull();
	});
});

describe('extractModelsDevStatus', () => {
	it('maps an explicit deprecated status to "deprecated"', () => {
		// minimax-m2.7 is deprecated on models.dev yet still served by the Go API —
		// deprecated is a leading indicator, not proof of removal.
		expect(extractModelsDevStatus(makeEntry({ status: 'deprecated' }))).toBe('deprecated');
	});

	it('maps a missing status to "active"', () => {
		expect(extractModelsDevStatus(makeEntry())).toBe('active');
	});

	it('maps an explicit active status to "active"', () => {
		expect(extractModelsDevStatus(makeEntry({ status: 'active' }))).toBe('active');
	});

	it('returns null for an unrecognised status instead of manufacturing "active"', () => {
		// models.dev publishes other statuses (and may add more). Reporting them
		// as 'active' would silently erase the distinction on every GoModel.
		for (const status of ['alpha', 'beta', 'preview', 'something-new']) {
			expect(extractModelsDevStatus(makeEntry({ status }))).toBeNull();
		}
	});

	it('returns null for a null entry', () => {
		expect(extractModelsDevStatus(null)).toBeNull();
	});

	it('derives KNOWN_STATUSES from the exported union, so the two cannot drift', () => {
		// The union in `$lib/types/models` is the ONE definition; this list is
		// a projection of it. A status added to one and not the other would
		// silently mislabel the consumer-facing `llms.txt` / badge surfaces.
		const fromUnion: ModelsDevStatus[] = ['active', 'deprecated'];
		expect([...KNOWN_STATUSES].sort()).toEqual([...fromUnion].sort());
	});
});

// ─── inferModel integration ──────────────────────────────────────────────
//
// These assert the wiring in inference.ts: models.dev's `open_weights` is
// authoritative when present, the existing heuristic decides when it is
// silent, and `name` becomes the display-name source.

describe('inferModel — models.dev open-weight override', () => {
	it('trusts models.dev over the qwen family allowlist when it says closed', () => {
		// qwen3.8-max is the real-world case: the family allowlist says open,
		// models.dev says closed. The user-visible consequence is that a closed
		// Qwen model offers NO "replaces" hint — so assert that, not just the flag.
		const frontierCandidates = [makeFrontierCandidate()];
		const model = inferModel(
			'qwen3.8-max',
			null,
			undefined,
			makeComparableLsModel('qwen3.8-max'),
			frontierCandidates,
			undefined,
			makeEntry({ id: 'qwen3.8-max', open_weights: false })
		);

		expect(model.benchmarks.coding).toBe(60);
		expect(model.openWeight).toBe(false);
		expect(model.migrationHints).toEqual([]);
	});

	it('positive control: the same model with openWeight true DOES get a hint', () => {
		// Proves the harness above can actually produce a hint — otherwise the
		// empty array would be vacuous. models.dev is silent here, so the qwen
		// family allowlist decides and the model counts as open.
		const model = inferModel(
			'qwen3.8-max',
			null,
			undefined,
			makeComparableLsModel('qwen3.8-max'),
			[makeFrontierCandidate()],
			undefined,
			makeEntry({ id: 'qwen3.8-max' })
		);

		expect(model.openWeight).toBe(true);
		expect(model.migrationHints).toEqual([
			{ model: 'Claude Opus 5', reason: 'Comparable on coding & reasoning & math' }
		]);
	});

	it('trusts models.dev over the heuristics when it says open', () => {
		// The heuristic path must reach a FALSE verdict here, or the assertion
		// would pass on the `!lsModel → true` early return with the override
		// deleted. A closed-source llm-stats counterpart + a non-qwen id gets
		// there: no open evidence, then isOpenWeightFamily('glm-5.2') → false.
		const heuristicsOnly = inferModel('glm-5.2', null, undefined, makeClosedLsModel('glm-5.2'));
		const withOverride = inferModel(
			'glm-5.2',
			null,
			undefined,
			makeClosedLsModel('glm-5.2'),
			[],
			undefined,
			makeEntry({ id: 'glm-5.2', open_weights: true })
		);

		expect(heuristicsOnly.openWeight).toBe(false);
		expect(withOverride.openWeight).toBe(true);
	});

	it('falls back to the heuristic when models.dev is silent', () => {
		// No open_weights field → the qwen family allowlist decides for qwen…
		const qwen = inferModel(
			'qwen3.9-preview',
			null,
			undefined,
			makeClosedLsModel('qwen3.9-preview'),
			[],
			undefined,
			makeEntry()
		);
		// …while with no open evidence at all, a non-qwen model stays closed.
		const nonQwen = inferModel(
			'grok-4.7',
			null,
			undefined,
			makeClosedLsModel('grok-4.7'),
			[],
			undefined,
			makeEntry()
		);

		expect(qwen.openWeight).toBe(true);
		expect(nonQwen.openWeight).toBe(false);
	});

	it('falls back to the heuristic when there is no models.dev entry at all', () => {
		// Existing call sites omit the parameter — behaviour must not change.
		// A null lsModel counts as open (Go only serves open alternatives then).
		expect(inferModel('qwen3.9-preview', null).openWeight).toBe(true);
		expect(inferModel('grok-4.7', null, undefined, makeClosedLsModel('grok-4.7')).openWeight).toBe(
			false
		);
	});
});

describe('inferModel — models.dev enrichment fields', () => {
	it('uses models.dev name as displayName and as the model name', () => {
		const model = inferModel(
			'gpt-5.6-luna',
			null,
			undefined,
			null,
			[],
			undefined,
			makeEntry({ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' })
		);

		expect(model.displayName).toBe('GPT-5.6 Luna');
		// models.dev wins over goIdToName(), which would render "Gpt 5.6 luna".
		expect(model.name).toBe('GPT-5.6 Luna');
	});

	it('maps the remaining enrichment fields from the entry', () => {
		const model = inferModel(
			'glm-5.2',
			null,
			undefined,
			null,
			[],
			undefined,
			makeEntry({
				id: 'glm-5.2',
				limit: { context: 200_000, output: 32_000 },
				reasoning_options: [{ type: 'effort', values: ['minimal', 'low', 'high'] }],
				knowledge: '2025-03-01',
				canonical_model_id: 'zhipu/glm-5.2',
				status: 'deprecated'
			})
		);

		expect(model.maxOutputTokens).toBe(32_000);
		expect(model.reasoningEfforts).toEqual(['minimal', 'low', 'high']);
		expect(model.knowledgeCutoff).toBe('2025-03-01');
		expect(model.canonicalId).toBe('zhipu/glm-5.2');
		expect(model.modelsDevStatus).toBe('deprecated');
	});

	it('does not report an unrecognised models.dev status as "active"', () => {
		const model = inferModel(
			'glm-5.2',
			null,
			undefined,
			null,
			[],
			undefined,
			makeEntry({ id: 'glm-5.2', status: 'alpha' })
		);

		expect(model.modelsDevStatus).toBeNull();
	});

	it('leaves every enrichment field null without a models.dev entry', () => {
		const model = inferModel('glm-5.2', null);

		expect(model.displayName).toBeNull();
		expect(model.maxOutputTokens).toBeNull();
		expect(model.reasoningEfforts).toBeNull();
		expect(model.knowledgeCutoff).toBeNull();
		expect(model.canonicalId).toBeNull();
		expect(model.modelsDevStatus).toBeNull();
	});

	it('never merges models.dev cost into ModelPricing', () => {
		const model = inferModel(
			'deepseek-v4.1-flash',
			null,
			{
				'deepseek-v4.1-flash': {
					inputPricePerM: 0.15,
					outputPricePerM: 0.6,
					cachedReadPerM: null,
					source: 'go-docs'
				}
			},
			null,
			[],
			undefined,
			makeEntry({ id: 'deepseek-v4.1-flash', cost: { input: 0.3, output: 1.2 } })
		);

		// Promo prices come from the Go docs page; models.dev carries base prices.
		expect(model.pricing.inputPricePerM).toBe(0.15);
		expect(model.pricing.outputPricePerM).toBe(0.6);
	});
});
