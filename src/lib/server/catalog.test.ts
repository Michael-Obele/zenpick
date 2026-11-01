// `server/catalog.ts` reaches the real cache and single-flight logic, but its
// two collaborators pull in the SvelteKit virtual modules vitest does not shim.
const mocks = vi.hoisted(() => ({
	loadModels: vi.fn(),
	loadStackPlans: vi.fn()
}));

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { cacheKeysMatching, DEGRADED_STACK_TTL, MODELS_TTL } from '$lib/cache';
import { loadCatalogRows } from '$lib/server/catalog';
import type { StackModel, StackPlan } from '$lib/stack/plans';

/** One Zed model, scored when modelgrep answered and scoreless when it did not. */
function staticPlan(scored: boolean): StackPlan {
	const model: StackModel = {
		id: 'claude-sonnet-5.5',
		name: 'Claude Sonnet 5.5',
		provider: 'Anthropic',
		pricing: { inputPricePerM: 2.2, outputPricePerM: 11, cachedReadPerM: 0.22 },
		contextWindow: 1_000_000,
		intelligence: scored ? 61 : null,
		coding: scored ? 59 : null
	};

	return {
		id: 'zed',
		name: 'Zed Pro',
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models: [model]
	};
}

vi.mock('$lib/server/models', () => ({
	loadModels: mocks.loadModels,
	fnv1a: () => 'test'
}));

vi.mock('$lib/server/stack', () => ({
	loadStackPlans: mocks.loadStackPlans
}));

describe('loadCatalogRows', () => {
	beforeEach(() => {
		// Drop every cached entry so each test starts cold; the plan-catalog key
		// is content-addressed and cannot be named here.
		cacheKeysMatching('plan-catalog', () => false);
		mocks.loadModels.mockReset();
		mocks.loadStackPlans.mockReset();
	});

	it('shares one rebuild between concurrent cold requests', async () => {
		let releaseModels!: () => void;
		const modelsGate = new Promise<void>((resolve) => (releaseModels = resolve));
		mocks.loadModels.mockImplementation(async () => {
			await modelsGate;
			return [];
		});
		mocks.loadStackPlans.mockResolvedValue([]);

		const first = loadCatalogRows();
		const second = loadCatalogRows();
		releaseModels();
		const [a, b] = await Promise.all([first, second]);

		expect(mocks.loadModels).toHaveBeenCalledTimes(1);
		expect(mocks.loadStackPlans).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it('caches the merged rows for the model TTL', async () => {
		mocks.loadModels.mockResolvedValue([]);
		mocks.loadStackPlans.mockResolvedValue([]);

		await loadCatalogRows();

		const [entry] = cacheKeysMatching('plan-catalog');
		expect(entry?.ttl).toBe(MODELS_TTL);

		await loadCatalogRows();
		expect(mocks.loadModels).toHaveBeenCalledTimes(1);
		expect(mocks.loadStackPlans).toHaveBeenCalledTimes(1);
	});

	it('caches a modelgrep-less build for the short degraded TTL', async () => {
		// Every static model is scoreless, which is what a modelgrep outage looks
		// like. Pinning that for `MODELS_TTL` would hold null scores for 6 hours.
		mocks.loadModels.mockResolvedValue([]);
		mocks.loadStackPlans.mockResolvedValue([staticPlan(false)]);

		await loadCatalogRows();

		const [entry] = cacheKeysMatching('plan-catalog');
		expect(entry?.ttl).toBe(DEGRADED_STACK_TTL);
		expect(entry?.ttl).toBeLessThan(MODELS_TTL);
	});

	it('caches a scored build for the model TTL', async () => {
		mocks.loadModels.mockResolvedValue([]);
		mocks.loadStackPlans.mockResolvedValue([staticPlan(true)]);

		await loadCatalogRows();

		const [entry] = cacheKeysMatching('plan-catalog');
		expect(entry?.ttl).toBe(MODELS_TTL);
	});
});
