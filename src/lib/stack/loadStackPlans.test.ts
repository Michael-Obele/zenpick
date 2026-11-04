// `server/stack.ts` imports `$lib/server/models`, whose import graph needs the
// SvelteKit virtual modules (`$app` / `$env`) that vitest deliberately does not
// shim. Replacing those two collaborators keeps the real cache and single-flight
// logic running, without pulling in the loaders themselves.
const mocks = vi.hoisted(() => ({
	loadModels: vi.fn(),
	fetchModelgrepModels: vi.fn(),
	fetchLlmStatsBenchmarkIndex: vi.fn()
}));

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { cacheKeysMatching } from '$lib/cache';
import { loadStackPlans } from '$lib/server/stack';

vi.mock('$lib/server/models', () => ({
	loadModels: mocks.loadModels,
	fnv1a: () => 'test'
}));

vi.mock('$lib/server/modelgrep', () => ({
	fetchModelgrepModels: mocks.fetchModelgrepModels,
	// The static plans only fall back to fuzzy matching when their exact
	// modelgrep id is absent; the loader test supplies no modelgrep rows.
	fuzzyMatchModelgrep: () => null
}));

vi.mock('$lib/server/llm-stats-public', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/llm-stats-public')>();
	return {
		...actual,
		fetchLlmStatsBenchmarkIndex: mocks.fetchLlmStatsBenchmarkIndex
	};
});

describe('loadStackPlans', () => {
	beforeEach(() => {
		// Drop every cached entry so each test starts cold; the stack-plans key is
		// content-addressed and cannot be named here.
		cacheKeysMatching('stack-plans', () => false);
		mocks.loadModels.mockReset();
		mocks.fetchModelgrepModels.mockReset();
		mocks.fetchLlmStatsBenchmarkIndex.mockReset();
		mocks.fetchLlmStatsBenchmarkIndex.mockResolvedValue({
			byId: new Map(),
			byName: new Map()
		});
	});

	it('shares one rebuild between concurrent cold requests', async () => {
		let releaseModels!: () => void;
		const modelsGate = new Promise<void>((resolve) => (releaseModels = resolve));
		mocks.loadModels.mockImplementation(async () => {
			await modelsGate;
			return [];
		});
		mocks.fetchModelgrepModels.mockResolvedValue({ byId: new Map(), all: [] });

		const first = loadStackPlans();
		const second = loadStackPlans();
		releaseModels();
		const [a, b] = await Promise.all([first, second]);

		expect(mocks.loadModels).toHaveBeenCalledTimes(1);
		expect(mocks.fetchModelgrepModels).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});
});
