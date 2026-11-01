// `server/stack.ts` imports `$lib/server/models`, whose import graph needs the
// SvelteKit virtual modules (`$app` / `$env`) that vitest deliberately does not
// shim. Replacing those two collaborators keeps the real cache and single-flight
// logic running, without pulling in the loaders themselves.
const mocks = vi.hoisted(() => ({
	loadModels: vi.fn(),
	fetchModelgrepModels: vi.fn()
}));

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { cacheKeysMatching } from '$lib/cache';
import { loadStackPlans } from '$lib/server/stack';

vi.mock('$lib/server/models', () => ({
	loadModels: mocks.loadModels,
	fnv1a: () => 'test'
}));

vi.mock('$lib/server/modelgrep', () => ({
	fetchModelgrepModels: mocks.fetchModelgrepModels
}));

describe('loadStackPlans', () => {
	beforeEach(() => {
		// Drop every cached entry so each test starts cold; the stack-plans key is
		// content-addressed and cannot be named here.
		cacheKeysMatching('stack-plans', () => false);
		mocks.loadModels.mockReset();
		mocks.fetchModelgrepModels.mockReset();
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
