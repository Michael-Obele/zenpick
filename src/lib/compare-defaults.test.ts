import { describe, it, expect } from 'vitest';
import {
	benchmarkSourceNote,
	benchmarkToPercent,
	catalogQualityAnchor,
	catalogValueAnchor,
	compositeBenchmark,
	defaultComparePair
} from './compare-defaults';
import { makeBenchmarks, makeGoModel, makeQuota } from '$lib/test/fixtures';

describe('benchmarkToPercent', () => {
	it('scales the 0-1 SciCode fraction to percent', () => {
		expect(benchmarkToPercent(0.519, 'sweBenchVerified')).toBeCloseTo(51.9);
	});

	it('leaves an already-percent SciCode value alone', () => {
		expect(benchmarkToPercent(51.9, 'sweBenchVerified')).toBeCloseTo(51.9);
	});

	it('leaves other keys untouched', () => {
		expect(benchmarkToPercent(47, 'coding')).toBe(47);
	});

	it('is null for null/undefined', () => {
		expect(benchmarkToPercent(null, 'coding')).toBeNull();
		expect(benchmarkToPercent(undefined, 'coding')).toBeNull();
	});
});

describe('benchmarkSourceNote', () => {
	it('is null when there is no meta or no fallback field', () => {
		expect(benchmarkSourceNote(undefined)).toBeNull();
		expect(benchmarkSourceNote({ source: 'modelgrep' })).toBeNull();
		expect(benchmarkSourceNote({ source: 'llm-stats' })).toBeNull();
	});

	it('labels known fallback fields with human names', () => {
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'livecodebench' })).toBe(
			'LiveCodeBench'
		);
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'scicode' })).toBe('SciCode');
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'gpqa' })).toBe('GPQA');
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'math' })).toBe('AA Math');
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'aime' })).toBe('AIME');
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'hle' })).toBe('HLE');
	});

	it('falls back to the raw field name for an unknown field', () => {
		expect(benchmarkSourceNote({ source: 'modelgrep', field: 'newbench' })).toBe('newbench');
	});
});

describe('compositeBenchmark', () => {
	it('averages the available core fields on the 0-100 scale', () => {
		const model = makeGoModel({
			benchmarks: makeBenchmarks({ coding: 80, sweBenchVerified: 0.5 })
		});
		// coding 80, SciCode 0.5 → 50, mean = 65
		expect(compositeBenchmark(model)).toBeCloseTo(65);
	});

	it('ignores null fields', () => {
		const model = makeGoModel({ benchmarks: makeBenchmarks({ reasoning: 60 }) });
		expect(compositeBenchmark(model)).toBeCloseTo(60);
	});

	it('is null when no core field has a value', () => {
		expect(compositeBenchmark(makeGoModel())).toBeNull();
	});
});

describe('catalogQualityAnchor', () => {
	it('picks the highest composite score', () => {
		const strong = makeGoModel({ id: 'strong', benchmarks: makeBenchmarks({ coding: 90 }) });
		const weak = makeGoModel({ id: 'weak', benchmarks: makeBenchmarks({ coding: 40 }) });
		expect(catalogQualityAnchor([weak, strong])?.id).toBe('strong');
	});

	it('excludes models whose only evidence is an llm-stats estimate', () => {
		const llmOnly = makeGoModel({
			id: 'llm-only',
			benchmarks: makeBenchmarks({
				coding: 99,
				_meta: {
					coding: { source: 'llm-stats' },
					reasoning: { source: 'llm-stats' },
					math: { source: 'llm-stats' },
					sweBenchVerified: { source: 'llm-stats' }
				}
			})
		});
		const solid = makeGoModel({ id: 'solid', benchmarks: makeBenchmarks({ coding: 30 }) });
		expect(catalogQualityAnchor([llmOnly, solid])?.id).toBe('solid');
	});

	it('returns null when nothing qualifies', () => {
		expect(catalogQualityAnchor([makeGoModel()])).toBeNull();
	});
});

describe('catalogValueAnchor', () => {
	it('picks the model with the most 5h capacity', () => {
		const roomy = makeGoModel({ id: 'roomy', quota: makeQuota({ unlimited: true }) });
		const tight = makeGoModel({ id: 'tight', quota: makeQuota({ requestsPer5h: 10 }) });
		expect(catalogValueAnchor([tight, roomy])?.id).toBe('roomy');
	});
});

describe('defaultComparePair', () => {
	it('dedupes when the quality and value anchors coincide', () => {
		const only = makeGoModel({
			id: 'only',
			quota: makeQuota({ unlimited: true }),
			benchmarks: makeBenchmarks({ coding: 90 })
		});
		expect(defaultComparePair([only])).toHaveLength(1);
	});

	it('returns the quality anchor first then the value anchor', () => {
		const quality = makeGoModel({ id: 'quality', benchmarks: makeBenchmarks({ coding: 95 }) });
		const value = makeGoModel({
			id: 'value',
			benchmarks: makeBenchmarks({ coding: 10 }),
			quota: makeQuota({ unlimited: true })
		});
		const pair = defaultComparePair([value, quality]);
		expect(pair.map((m) => m.id)).toEqual(['quality', 'value']);
	});
});
