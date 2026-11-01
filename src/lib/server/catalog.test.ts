// `server/catalog.ts` delegates to the two cached loaders; the merge itself is
// pure. These tests cover the wiring and the staleness bug it used to have.
const mocks = vi.hoisted(() => ({
	loadModels: vi.fn(),
	loadStackPlans: vi.fn()
}));

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { loadCatalogRows } from '$lib/server/catalog';
import { makeGoModel, makePricing } from '$lib/test/fixtures';
import type { StackModel, StackPlan } from '$lib/stack/plans';

function stackModel(id: string, name: string, inputPricePerM: number): StackModel {
	return {
		id,
		name,
		provider: 'Anthropic',
		pricing: {
			inputPricePerM,
			outputPricePerM: inputPricePerM * 5,
			cachedReadPerM: null
		},
		contextWindow: 1_000_000,
		intelligence: 60,
		coding: 58
	};
}

function staticPlan(models: StackModel[]): StackPlan {
	return {
		id: 'zed',
		name: 'Zed Pro',
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models
	};
}

vi.mock('$lib/server/models', () => ({
	loadModels: mocks.loadModels
}));

vi.mock('$lib/server/stack', () => ({
	loadStackPlans: mocks.loadStackPlans
}));

describe('loadCatalogRows', () => {
	beforeEach(() => {
		mocks.loadModels.mockReset();
		mocks.loadStackPlans.mockReset();
	});

	it('re-reads the model cache so updated hints reach the catalog', async () => {
		const base = makeGoModel({
			id: 'hy3',
			name: 'Hy3',
			migrationHints: [{ model: 'Old Candidate', reason: 'old' }]
		});
		mocks.loadModels.mockResolvedValue([base]);
		mocks.loadStackPlans.mockResolvedValue([]);

		const first = await loadCatalogRows();
		expect(first[0].go?.migrationHints).toEqual([{ model: 'Old Candidate', reason: 'old' }]);

		mocks.loadModels.mockResolvedValue([
			{ ...base, migrationHints: [{ model: 'New Candidate', reason: 'new' }] }
		]);
		const second = await loadCatalogRows();

		expect(second[0].go?.migrationHints).toEqual([{ model: 'New Candidate', reason: 'new' }]);
		expect(mocks.loadModels).toHaveBeenCalledTimes(2);
	});

	it('merges a Go row and a static-plan row into one row per model', async () => {
		mocks.loadModels.mockResolvedValue([
			makeGoModel({
				id: 'shared',
				name: 'Shared',
				pricing: makePricing({ inputPricePerM: 2 })
			})
		]);
		mocks.loadStackPlans.mockResolvedValue([
			staticPlan([stackModel('shared', 'Shared', 2.2), stackModel('zed-only', 'Zed Only', 3)])
		]);

		const rows = await loadCatalogRows();

		expect(rows.map((row) => row.id).sort()).toEqual(['shared', 'zed-only']);
		const shared = rows.find((row) => row.id === 'shared');
		expect(shared?.plans.map((entry) => entry.plan)).toEqual(['go', 'zed']);
		expect(shared?.plans.map((entry) => entry.pricing.inputPricePerM)).toEqual([2, 2.2]);
	});

	it('calls both loaders on every request instead of caching a second copy', async () => {
		mocks.loadModels.mockResolvedValue([]);
		mocks.loadStackPlans.mockResolvedValue([]);

		await loadCatalogRows();
		await loadCatalogRows();

		expect(mocks.loadModels).toHaveBeenCalledTimes(2);
		expect(mocks.loadStackPlans).toHaveBeenCalledTimes(2);
	});
});
