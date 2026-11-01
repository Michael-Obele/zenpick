import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { buildCatalogRows, PLAN_LABEL, type CatalogRow } from '$lib/catalog';
import {
	catalogCompareEntries,
	compareEntryLabel,
	compareHref,
	compareIdentity,
	compareKey,
	filterEntriesByPlan,
	isCompareSelected,
	parseCompareKey,
	resolveCompareEntries,
	selectedKeyForRow
} from '$lib/compare-selection';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

function makeStackModel(partial: Partial<StackModel> = {}): StackModel {
	return {
		id: 'model',
		name: 'Model',
		provider: 'Test',
		pricing: { inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: null },
		contextWindow: null,
		intelligence: null,
		...partial
	};
}

function makePlan(id: PlanId, models: StackModel[]): StackPlan {
	return {
		id,
		name: PLAN_LABEL[id],
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models
	} satisfies StackPlan;
}

/**
 * gpt-6-luna: Go only.
 * claude-sonnet-5.5: Go, Zed (`claude-sonnet-5-5`) and Copilot.
 * zed-only: Zed only.
 * multi-plan: Zed + Copilot, no Go.
 * copilot-only: Copilot only.
 */
const rows = buildCatalogRows(
	[
		makeGoModel({
			id: 'gpt-6-luna',
			name: 'GPT-6 Luna',
			provider: 'OpenAI',
			pricing: makePricing({ inputPricePerM: 1, outputPricePerM: 3 }),
			benchmarks: makeBenchmarks({ reasoning: 50, coding: 48 })
		}),
		makeGoModel({
			id: 'claude-sonnet-5.5',
			name: 'Claude Sonnet 5.5',
			provider: 'Anthropic',
			pricing: makePricing({ inputPricePerM: 3, outputPricePerM: 15 }),
			benchmarks: makeBenchmarks({ reasoning: 60, coding: 55 })
		})
	],
	[
		makePlan('zed', [
			makeStackModel({
				id: 'claude-sonnet-5-5',
				name: 'Claude Sonnet 5.5',
				provider: 'Anthropic'
			}),
			makeStackModel({ id: 'zed-only', name: 'Zed Only', provider: 'Zed' }),
			makeStackModel({
				id: 'multi-plan',
				name: 'Multi Plan',
				provider: 'Test'
			})
		]),
		makePlan('copilot', [
			makeStackModel({
				id: 'claude-sonnet-5.5',
				name: 'Claude Sonnet 5.5',
				provider: 'Anthropic'
			}),
			makeStackModel({
				id: 'copilot-only',
				name: 'Copilot Only',
				provider: 'GitHub'
			}),
			makeStackModel({
				id: 'multi-plan',
				name: 'Multi Plan',
				provider: 'Test'
			})
		])
	]
);

const gptRow = rows.find((row) => row.id === 'gpt-6-luna')!;
const sonnetRow = rows.find((row) => row.id === 'claude-sonnet-5.5')!;
const zedOnlyRow = rows.find((row) => row.id === 'zed-only')!;
const multiRow = rows.find((row) => row.id === 'multi-plan')!;
const planlessRow: CatalogRow = {
	key: 'planless',
	id: 'planless',
	name: 'Planless',
	provider: 'Test',
	contextWindow: null,
	intelligence: null,
	coding: null,
	description: null,
	modelgrepId: null,
	plans: [],
	go: null
};

describe('compareKey / parseCompareKey', () => {
	it('round-trips a plan and an id', () => {
		const key = compareKey('zed', 'claude-sonnet-5.5');

		expect(key).toBe('zed:claude-sonnet-5.5');
		expect(parseCompareKey(key)).toEqual({
			plan: 'zed',
			id: 'claude-sonnet-5.5'
		});
	});

	it('treats a bare id as a legacy Go key', () => {
		expect(parseCompareKey('gpt-6-luna')).toEqual({
			plan: 'go',
			id: 'gpt-6-luna'
		});
	});

	it('trims the key and splits on the first colon only', () => {
		expect(parseCompareKey('  copilot:gpt-6-luna  ')).toEqual({
			plan: 'copilot',
			id: 'gpt-6-luna'
		});
		expect(parseCompareKey('zed:a:b')).toEqual({ plan: 'zed', id: 'a:b' });
	});

	it('rejects an empty key, an empty id and an unknown plan', () => {
		expect(parseCompareKey('')).toBeNull();
		expect(parseCompareKey('   ')).toBeNull();
		expect(parseCompareKey('zed:')).toBeNull();
		expect(parseCompareKey('openrouter:gpt-6-luna')).toBeNull();
	});
});

describe('resolveCompareEntries', () => {
	it('preserves the input order', () => {
		const entries = resolveCompareEntries(rows, ['zed:zed-only', 'go:gpt-6-luna']);

		expect(entries.map((entry) => entry.row.name)).toEqual(['Zed Only', 'GPT-6 Luna']);
		expect(entries.map((entry) => entry.plan.plan)).toEqual(['zed', 'go']);
	});

	it('maps a legacy bare id to its Go entry and keeps the input key', () => {
		const [entry] = resolveCompareEntries(rows, ['gpt-6-luna']);

		expect(entry.key).toBe('gpt-6-luna');
		expect(entry.row).toBe(gptRow);
		expect(entry.plan.plan).toBe('go');
		expect(entry.plan.id).toBe('gpt-6-luna');
	});

	it('dedupes ids that differ only by punctuation', () => {
		const entries = resolveCompareEntries(rows, ['zed:claude-sonnet-5-5', 'zed:claude-sonnet-5.5']);

		expect(entries).toHaveLength(1);
		expect(entries[0].key).toBe('zed:claude-sonnet-5-5');
		expect(entries[0].row).toBe(sonnetRow);
		expect(entries[0].plan.id).toBe('claude-sonnet-5-5');
	});

	it('dedupes a bare legacy id against its canonical Go key', () => {
		const entries = resolveCompareEntries(rows, ['gpt-6-luna', 'go:gpt-6-luna']);

		expect(entries).toHaveLength(1);
		expect(entries[0].key).toBe('gpt-6-luna');
	});

	it('skips unknown keys, unknown plans and plans the row is not on', () => {
		const entries = resolveCompareEntries(rows, [
			'',
			'not-a-model',
			'go:not-a-model',
			'copilot:zed-only',
			'openrouter:gpt-6-luna',
			'go:gpt-6-luna'
		]);

		expect(entries.map((entry) => entry.key)).toEqual(['go:gpt-6-luna']);
	});
});

describe('selectedKeyForRow', () => {
	it('prefers the active plan filter', () => {
		expect(selectedKeyForRow(sonnetRow, 'zed')).toBe('zed:claude-sonnet-5-5');
		expect(selectedKeyForRow(sonnetRow, 'copilot')).toBe('copilot:claude-sonnet-5.5');
		expect(selectedKeyForRow(multiRow, 'copilot')).toBe('copilot:multi-plan');
	});

	it('falls back to the Go entry, then to the first plan entry', () => {
		expect(selectedKeyForRow(sonnetRow, 'go')).toBe('go:claude-sonnet-5.5');
		// No plan selected: the Go entry wins even though Zed comes second.
		expect(selectedKeyForRow(sonnetRow, '')).toBe('go:claude-sonnet-5.5');
		// A plan the row is not on falls back the same way.
		expect(selectedKeyForRow(multiRow, 'go')).toBe('zed:multi-plan');
		expect(selectedKeyForRow(zedOnlyRow, '')).toBe('zed:zed-only');
	});

	it('returns null only when the row has no plans', () => {
		expect(selectedKeyForRow(planlessRow, '')).toBeNull();
		expect(selectedKeyForRow(planlessRow, 'go')).toBeNull();
	});
});

describe('compareHref', () => {
	it('returns a bare /compare for an empty list', () => {
		expect(compareHref([])).toBe('/compare');
	});

	it('keeps the colon readable and encodes only the id', () => {
		expect(compareHref(['zed:claude-sonnet-5.5', 'go:gpt-6-luna'])).toBe(
			'/compare?models=zed:claude-sonnet-5.5,go:gpt-6-luna'
		);
	});

	it('encodes a bare legacy id and keeps its comma separators', () => {
		expect(compareHref(['gpt-6-luna', 'zed:claude-sonnet-5.5'])).toBe(
			'/compare?models=go:gpt-6-luna,zed:claude-sonnet-5.5'
		);
	});
});

describe('catalogCompareEntries', () => {
	it('returns one entry per plan per row', () => {
		const entries = catalogCompareEntries(rows);

		expect(entries).toHaveLength(8);
		expect(entries.filter((entry) => entry.row === sonnetRow).map((entry) => entry.key)).toEqual([
			'go:claude-sonnet-5.5',
			'zed:claude-sonnet-5-5',
			'copilot:claude-sonnet-5.5'
		]);
		expect(
			entries.filter((entry) => entry.row === multiRow).map((entry) => entry.plan.plan)
		).toEqual(['zed', 'copilot']);
	});

	it('labels an entry with both the model name and the plan', () => {
		const entries = catalogCompareEntries(rows);
		const copilotSonnet = entries.find(
			(entry) => entry.row === sonnetRow && entry.plan.plan === 'copilot'
		)!;

		expect(compareEntryLabel(copilotSonnet)).toBe('Claude Sonnet 5.5 · Copilot');
	});

	it('filters the picker pool by plan, keeping every plan for an empty filter', () => {
		const entries = catalogCompareEntries(rows);

		expect(filterEntriesByPlan(entries, '')).toEqual(entries);
		expect(new Set(filterEntriesByPlan(entries, 'zed').map((entry) => entry.plan.plan))).toEqual(
			new Set(['zed'])
		);
		expect(filterEntriesByPlan(entries, 'zed').map((entry) => entry.row)).toContain(zedOnlyRow);
		expect(filterEntriesByPlan(entries, 'zed')).toHaveLength(3);
	});
});

describe('compare store addMany', () => {
	beforeEach(() => {
		compare.selection = [];
		compare.dismissedDefaults = false;
	});

	it('adds keys in order', () => {
		compare.addMany(['zed:b', 'go:a', 'copilot:c']);

		expect(compare.selection).toEqual(['zed:b', 'go:a', 'copilot:c']);
	});

	it('skips duplicates and empty keys', () => {
		compare.selection = ['go:a'];
		compare.addMany(['go:a', '', 'zed:b', 'zed:b']);

		expect(compare.selection).toEqual(['go:a', 'zed:b']);
	});

	it('stops at MAX_COMPARE', () => {
		const keys = Array.from({ length: MAX_COMPARE + 3 }, (_, index) => `go:model-${index}`);
		compare.addMany(keys);

		expect(compare.selection).toHaveLength(MAX_COMPARE);
		expect(compare.selection).toEqual(keys.slice(0, MAX_COMPARE));
	});

	it('adds nothing when the selection is already full', () => {
		compare.selection = Array.from({ length: MAX_COMPARE }, (_, index) => `go:full-${index}`);
		compare.addMany(['zed:extra']);

		expect(compare.selection).toHaveLength(MAX_COMPARE);
		expect(compare.selection).not.toContain('zed:extra');
	});

	it('ignores whitespace-only keys', () => {
		compare.addMany(['   ', '\t', 'go:a']);

		expect(compare.selection).toEqual(['go:a']);
	});

	it('stores the canonical plan:id spelling for a legacy bare id', () => {
		compare.addMany(['gpt-6-luna']);

		expect(compare.selection).toEqual(['go:gpt-6-luna']);
	});

	it('dedupes by model identity across spellings and plans', () => {
		compare.addMany([
			'gpt-6-luna',
			'go:gpt-6-luna',
			'zed:claude-sonnet-5-5',
			'zed:claude-sonnet-5.5'
		]);

		expect(compare.selection).toEqual(['go:gpt-6-luna', 'zed:claude-sonnet-5-5']);
	});

	it('add, toggle and remove match a bare id against its canonical key', () => {
		compare.add('gpt-6-luna');
		compare.add('go:gpt-6-luna');
		expect(compare.selection).toEqual(['go:gpt-6-luna']);

		compare.toggle('gpt-6-luna');
		expect(compare.selection).toEqual([]);

		compare.add('go:gpt-6-luna');
		compare.remove('gpt-6-luna');
		expect(compare.selection).toEqual([]);

		compare.add('gpt-6-luna');
		compare.remove('go:gpt-6-luna');
		expect(compare.selection).toEqual([]);
	});

	it('move and moveToward resolve a bare id to the stored key', () => {
		compare.selection = ['go:first', 'go:second'];

		expect(compare.move('second', -1)).toBe(0);
		expect(compare.selection).toEqual(['go:second', 'go:first']);

		expect(compare.moveToward('first', 'go:second')).toBe(0);
		expect(compare.selection).toEqual(['go:first', 'go:second']);
	});
});

describe('compare store has', () => {
	beforeEach(() => {
		compare.selection = [];
		compare.dismissedDefaults = false;
	});

	it('matches a bare id against its canonical Go key', () => {
		compare.selection = ['go:gpt-6-luna'];

		expect(compare.has('gpt-6-luna')).toBe(true);
		expect(compare.has('go:gpt-6-luna')).toBe(true);
		expect(compare.has('go:gpt-6-sol')).toBe(false);
	});

	it('matches alternate spellings of the same id within a plan', () => {
		compare.selection = ['zed:claude-sonnet-5-5'];

		expect(compare.has('zed:claude-sonnet-5.5')).toBe(true);
		expect(compare.has('zed:claude-sonnet-5-5')).toBe(true);
	});

	it('does not match the same id on a different plan', () => {
		compare.selection = ['zed:claude-sonnet-5-5'];

		expect(compare.has('copilot:claude-sonnet-5.5')).toBe(false);
		expect(compare.has('go:claude-sonnet-5.5')).toBe(false);
	});

	it('returns false for an empty selection or an unparseable key', () => {
		expect(compare.has('gpt-6-luna')).toBe(false);

		compare.selection = ['go:gpt-6-luna'];
		expect(compare.has('')).toBe(false);
		expect(compare.has('   ')).toBe(false);
		expect(compare.has('openrouter:gpt-6-luna')).toBe(false);
	});
});

describe('compareIdentity / isCompareSelected', () => {
	it('folds a legacy bare id and alternate spellings into one identity', () => {
		expect(compareIdentity('gpt-6-luna')).toBe('go:gpt6luna');
		expect(compareIdentity('go:gpt-6-luna')).toBe('go:gpt6luna');
		expect(compareIdentity('zed:claude-sonnet-5-5')).toBe(compareIdentity('zed:claude-sonnet-5.5'));
	});

	it('returns null for an unparseable key', () => {
		expect(compareIdentity('')).toBeNull();
		expect(compareIdentity('openrouter:gpt-6-luna')).toBeNull();
	});

	it('matches a bare legacy id and an alternate spelling in the selection', () => {
		const selection = ['go:gpt-6-luna', 'zed:claude-sonnet-5-5'];

		expect(isCompareSelected(selection, 'gpt-6-luna')).toBe(true);
		expect(isCompareSelected(selection, 'go:gpt-6-luna')).toBe(true);
		expect(isCompareSelected(selection, 'zed:claude-sonnet-5.5')).toBe(true);
	});

	it('does not match the same id on another plan', () => {
		expect(isCompareSelected(['zed:claude-sonnet-5-5'], 'copilot:claude-sonnet-5.5')).toBe(false);
		expect(isCompareSelected(['go:gpt-6-luna'], 'copilot:gpt-6-luna')).toBe(false);
	});
});

describe('compare store set', () => {
	beforeEach(() => {
		compare.selection = [];
		compare.dismissedDefaults = false;
	});

	it('canonicalises a legacy bare id', () => {
		compare.set(['gpt-6-luna']);

		expect(compare.selection).toEqual(['go:gpt-6-luna']);
	});

	it('dedupes by identity across spellings', () => {
		compare.set(['gpt-6-luna', 'go:gpt-6-luna', 'zed:claude-sonnet-5-5', 'zed:claude-sonnet-5.5']);

		expect(compare.selection).toEqual(['go:gpt-6-luna', 'zed:claude-sonnet-5-5']);
	});

	it('drops unparseable keys', () => {
		compare.set(['', '   ', 'openrouter:gpt-6-luna', 'go:a']);

		expect(compare.selection).toEqual(['go:a']);
	});

	it('caps at MAX_COMPARE', () => {
		const keys = Array.from({ length: MAX_COMPARE + 3 }, (_, index) => `go:model-${index}`);
		compare.set(keys);

		expect(compare.selection).toEqual(keys.slice(0, MAX_COMPARE));
	});

	it('removes keys that are not present in the new list', () => {
		compare.selection = ['go:a', 'go:b'];
		compare.set(['go:b']);

		expect(compare.selection).toEqual(['go:b']);
	});

	it('clears the selection for an empty list', () => {
		compare.selection = ['go:a'];
		compare.set([]);

		expect(compare.selection).toEqual([]);
	});
});
