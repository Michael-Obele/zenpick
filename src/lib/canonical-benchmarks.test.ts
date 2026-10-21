import { describe, it, expect } from 'vite-plus/test';
import {
	MIN_COVERAGE,
	benchmarkKey,
	buildBenchmarkIndex,
	isPercentageScore,
	type CanonicalModel
} from './canonical-benchmarks';

/** The canonical layer keyed by canonical id, as the fetcher returns it. */
function layer(entries: Record<string, CanonicalModel>): Map<string, CanonicalModel> {
	return new Map(Object.entries(entries));
}

describe('benchmarkKey', () => {
	it('keys a name|metric pair with the metric', () => {
		expect(benchmarkKey('Terminal-Bench', 'pass@1')).toBe('Terminal-Bench|pass@1');
	});

	it('uses "-" for a null metric so the key is always name|metric', () => {
		expect(benchmarkKey('MMLU', null)).toBe('MMLU|-');
	});

	it('keeps name and metric separated — the same name with another metric is another key', () => {
		expect(benchmarkKey('Terminal-Bench', 'pass@1')).not.toBe(
			benchmarkKey('Terminal-Bench', 'avg@3')
		);
	});
});

describe('isPercentageScore', () => {
	it('is false for an Elo score', () => {
		expect(isPercentageScore(1615)).toBe(false);
	});

	it('is true for a 0-100 score', () => {
		expect(isPercentageScore(78)).toBe(true);
	});

	it('treats both scale endpoints as percentages', () => {
		expect(isPercentageScore(0)).toBe(true);
		expect(isPercentageScore(100)).toBe(true);
	});

	it('is false below zero', () => {
		expect(isPercentageScore(-1)).toBe(false);
	});
});

describe('buildBenchmarkIndex', () => {
	it('maps a model to rows and fills the row coverage', () => {
		const canonical = layer({
			'a/one': {
				id: 'a/one',
				benchmarks: [{ name: 'Terminal-Bench', score: 62.5, metric: 'pass@1' }]
			}
		});

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'a/one' }]);

		expect(index.byModel.get('m1')).toEqual([
			{
				name: 'Terminal-Bench',
				metric: 'pass@1',
				score: 62.5,
				isPercentage: true,
				coverage: 1
			}
		]);
	});

	it('normalizes a missing metric to null', () => {
		const canonical = layer({
			'a/one': { id: 'a/one', benchmarks: [{ name: 'MMLU', score: 87 }] }
		});

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'a/one' }]);

		expect(index.byModel.get('m1')?.[0].metric).toBeNull();
		expect(index.coverage.get('MMLU|-')).toBe(1);
	});

	it('does not let one model inflate coverage by reporting two metrics of a benchmark', () => {
		// glm-5.3 reports Terminal-Bench twice (pass@1 88.2, avg@3 28.3). Each pair
		// is counted ONCE for this model — the per-model Set collapses the keys.
		const canonical = layer({
			'zhipu/glm': {
				id: 'zhipu/glm',
				benchmarks: [
					{ name: 'Terminal-Bench', score: 88.2, metric: 'pass@1' },
					{ name: 'Terminal-Bench', score: 28.3, metric: 'avg@3' }
				]
			}
		});

		const index = buildBenchmarkIndex(canonical, [{ id: 'glm-5.3', canonicalId: 'zhipu/glm' }]);

		expect(index.coverage.get('Terminal-Bench|pass@1')).toBe(1);
		expect(index.coverage.get('Terminal-Bench|avg@3')).toBe(1);
		expect(index.coverage.get('Terminal-Bench|score')).toBeUndefined();
	});

	it('ignores a duplicate pair within one model', () => {
		const canonical = layer({
			'a/one': {
				id: 'a/one',
				benchmarks: [
					{ name: 'Terminal-Bench', score: 88.2, metric: 'pass@1' },
					{ name: 'Terminal-Bench', score: 88.2, metric: 'pass@1' }
				]
			}
		});

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'a/one' }]);

		expect(index.coverage.get('Terminal-Bench|pass@1')).toBe(1);
	});

	it('counts DISTINCT models reporting the same pair', () => {
		const canonical = layer({
			'a/one': {
				id: 'a/one',
				benchmarks: [{ name: 'Terminal-Bench', score: 70, metric: 'pass@1' }]
			},
			'a/two': {
				id: 'a/two',
				benchmarks: [{ name: 'Terminal-Bench', score: 60, metric: 'pass@1' }]
			}
		});

		const index = buildBenchmarkIndex(canonical, [
			{ id: 'm1', canonicalId: 'a/one' },
			{ id: 'm2', canonicalId: 'a/two' }
		]);

		expect(index.coverage.get('Terminal-Bench|pass@1')).toBe(2);
		expect(index.comparable.has('Terminal-Bench|pass@1')).toBe(false);
	});

	it('only admits a pair reported by MIN_COVERAGE models to the comparable set', () => {
		const benchmarks = (score: number): NonNullable<CanonicalModel['benchmarks']> => [
			{ name: 'Terminal-Bench', score, metric: 'pass@1' },
			{ name: 'Single', score }
		];
		const canonical = layer({
			'a/one': { id: 'a/one', benchmarks: benchmarks(70) },
			'a/two': { id: 'a/two', benchmarks: benchmarks(60) },
			'a/three': { id: 'a/three', benchmarks: benchmarks(50) }
		});
		const goModels = [
			{ id: 'm1', canonicalId: 'a/one' },
			{ id: 'm2', canonicalId: 'a/two' },
			{ id: 'm3', canonicalId: 'a/three' }
		];

		const index = buildBenchmarkIndex(canonical, goModels);

		expect(index.coverage.get('Terminal-Bench|pass@1')).toBe(3);
		expect(index.comparable.has('Terminal-Bench|pass@1')).toBe(true);
		expect(index.comparable.has('Single|-')).toBe(true);

		// DERIVED from the constant, not a restatement of it: exactly MIN_COVERAGE
		// models admit the pair, and one model fewer does not.
		const atThreshold = buildBenchmarkIndex(canonical, goModels.slice(0, MIN_COVERAGE));
		expect(atThreshold.coverage.get('Terminal-Bench|pass@1')).toBe(MIN_COVERAGE);
		expect(atThreshold.comparable.has('Terminal-Bench|pass@1')).toBe(true);

		const belowThreshold = buildBenchmarkIndex(canonical, goModels.slice(0, MIN_COVERAGE - 1));
		expect(belowThreshold.coverage.get('Terminal-Bench|pass@1')).toBe(MIN_COVERAGE - 1);
		expect(belowThreshold.comparable.has('Terminal-Bench|pass@1')).toBe(false);
	});

	it('leaves a pair reported by fewer than MIN_COVERAGE models out of comparable', () => {
		const canonical = layer({
			'a/one': { id: 'a/one', benchmarks: [{ name: 'DeepSWE', score: 41, metric: 'pass@1' }] }
		});

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'a/one' }]);

		expect(index.coverage.get('DeepSWE|pass@1')).toBe(1);
		expect(index.comparable.size).toBe(0);
	});

	it('gives a model with no canonicalId no rows and no coverage', () => {
		const canonical = layer({
			'a/one': {
				id: 'a/one',
				benchmarks: [{ name: 'Terminal-Bench', score: 70, metric: 'pass@1' }]
			}
		});

		const index = buildBenchmarkIndex(canonical, [
			{ id: 'm1', canonicalId: null },
			{ id: 'm2', canonicalId: 'a/one' }
		]);

		expect(index.byModel.has('m1')).toBe(false);
		expect(index.coverage.get('Terminal-Bench|pass@1')).toBe(1);
	});

	it('skips a canonical id absent from the layer without throwing', () => {
		const canonical = layer({});

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'missing/model' }]);

		expect(index.byModel.has('m1')).toBe(false);
		expect(index.coverage.size).toBe(0);
		expect(index.comparable.size).toBe(0);
	});

	it('skips a canonical model with no benchmarks', () => {
		const canonical = layer({ 'a/one': { id: 'a/one' } });

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'a/one' }]);

		expect(index.byModel.has('m1')).toBe(false);
		expect(index.coverage.size).toBe(0);
	});

	it('marks an Elo score as non-percentage', () => {
		const canonical = layer({
			'a/one': {
				id: 'a/one',
				benchmarks: [{ name: 'GDPval-AA', score: 1615, metric: 'elo' }]
			}
		});

		const index = buildBenchmarkIndex(canonical, [{ id: 'm1', canonicalId: 'a/one' }]);

		expect(index.byModel.get('m1')?.[0].isPercentage).toBe(false);
	});

	it('counts a duplicate Go model id once — first occurrence wins', () => {
		const canonical = layer({
			'a/one': {
				id: 'a/one',
				benchmarks: [{ name: 'Terminal-Bench', score: 70, metric: 'pass@1' }]
			},
			'a/two': {
				id: 'a/two',
				benchmarks: [{ name: 'Terminal-Bench', score: 60, metric: 'pass@1' }]
			}
		});

		// The same id listed twice must not inflate coverage — it is ONE model.
		const index = buildBenchmarkIndex(canonical, [
			{ id: 'm1', canonicalId: 'a/one' },
			{ id: 'm1', canonicalId: 'a/two' }
		]);

		expect(index.coverage.get('Terminal-Bench|pass@1')).toBe(1);
		expect(index.byModel.size).toBe(1);
		expect(index.byModel.get('m1')?.[0].score).toBe(70);
	});
});
