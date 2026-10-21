import { describe, it, expect, afterEach } from 'vite-plus/test';
import { fetchCanonicalBenchmarks } from './canonical-benchmarks';

describe('fetchCanonicalBenchmarks', () => {
	const originalFetch = globalThis.fetch;

	/** Minimal Response stand-in — the fetcher only reads ok, status and json(). */
	function stubFetch(body: unknown, ok = true, status = 200): void {
		const fake = { ok, status, json: async () => body };
		globalThis.fetch = (async () => fake) as unknown as typeof fetch;
	}

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('parses the flat bundle into a Map keyed by canonical id', async () => {
		// Real models.json shape: canonical ids are top-level keys, NO wrapper.
		stubFetch({
			'tencent/hy3': {
				id: 'tencent/hy3',
				benchmarks: [{ name: 'SWE-Bench Verified', score: 78, metric: 'resolved' }]
			}
		});

		const map = await fetchCanonicalBenchmarks();

		expect(map).toBeInstanceOf(Map);
		const model = map.get('tencent/hy3');
		expect(model).toBeDefined();
		expect(model?.benchmarks).toEqual([
			{ name: 'SWE-Bench Verified', score: 78, metric: 'resolved' }
		]);
	});

	it('throws with the status when the response is not ok', async () => {
		stubFetch({}, false, 500);

		await expect(fetchCanonicalBenchmarks()).rejects.toThrow(/500/);
	});

	it('reads TOP-LEVEL keys — a { models: … } wrapper is not unwrapped', async () => {
		stubFetch({
			models: {
				'tencent/hy3': {
					id: 'tencent/hy3',
					benchmarks: [{ name: 'SWE-Bench Verified', score: 78, metric: 'resolved' }]
				}
			}
		});

		const map = await fetchCanonicalBenchmarks();

		// Pins the shape assumption: a wrapped payload keys the map by `models`,
		// so every canonical id lookup misses.
		expect(map.has('tencent/hy3')).toBe(false);
		expect(map.has('models')).toBe(true);
	});

	it('throws on an empty canonical bundle rather than yielding an empty index', async () => {
		stubFetch({});

		await expect(fetchCanonicalBenchmarks()).rejects.toThrow(/empty canonical bundle/);
	});

	it('throws the SAME legible error for a JSON null body', async () => {
		// `Object.entries(null)` throws a bare TypeError, which would replace
		// the guard's message with a stack trace for this one input.
		stubFetch(null);

		await expect(fetchCanonicalBenchmarks()).rejects.toThrow(/empty canonical bundle/);
	});
});
