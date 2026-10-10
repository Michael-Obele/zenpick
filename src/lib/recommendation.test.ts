import { describe, it, expect } from 'vitest';
import {
	capacityPer5h,
	recommendModel,
	REFERENCE_CACHED_PCT,
	REFERENCE_TOKENS
} from './recommendation';
import {
	makeBenchmarks,
	makeBurnDetails,
	makeGoModel,
	makePricing,
	makeQuota,
	makeScenarioScores
} from '$lib/test/fixtures';

describe('capacityPer5h', () => {
	it('is Infinity for an unlimited model (free preview)', () => {
		const model = makeGoModel({ quota: makeQuota({ unlimited: true }) });
		expect(capacityPer5h(model, REFERENCE_TOKENS, REFERENCE_CACHED_PCT)).toBe(Infinity);
	});

	it('reads the Go Plus quota when the plus plan is selected', () => {
		const model = makeGoModel({
			quota: makeQuota({ requestsPer5h: 0 }),
			plus: {
				quota: makeQuota({ unlimited: true }),
				burnDetails: makeBurnDetails(),
				burnRate: 'free'
			}
		});
		expect(capacityPer5h(model, REFERENCE_TOKENS, REFERENCE_CACHED_PCT, 'plus')).toBe(Infinity);
	});

	it('collapses to the published count at the reference workload', () => {
		const model = makeGoModel({
			pricing: makePricing({ inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: 0.1 }),
			quota: makeQuota({ requestsPer5h: 900 })
		});
		expect(capacityPer5h(model, REFERENCE_TOKENS, REFERENCE_CACHED_PCT)).toBeCloseTo(900, 5);
	});

	it('scales the published count down at a heavier workload', () => {
		const model = makeGoModel({
			pricing: makePricing({ inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: 0.1 }),
			quota: makeQuota({ requestsPer5h: 900 })
		});
		// 10× tokens → ~1/10 the requests, so 900 → ~90.
		expect(capacityPer5h(model, 500_000, REFERENCE_CACHED_PCT)).toBeCloseTo(90, 0);
	});

	it('falls back to a price-based estimate when no published count exists', () => {
		const model = makeGoModel({
			pricing: makePricing({ inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: 0.1 }),
			quota: makeQuota({ requestsPer5h: 0 })
		});
		expect(capacityPer5h(model, REFERENCE_TOKENS, REFERENCE_CACHED_PCT)).toBeGreaterThan(0);
	});
});

describe('recommendModel', () => {
	it('returns null for an empty model list', () => {
		expect(
			recommendModel([], { tokens: REFERENCE_TOKENS, cachedPct: REFERENCE_CACHED_PCT })
		).toBeNull();
	});

	it('returns null for a non-array input', () => {
		// Guards against a bad call site passing undefined.
		expect(recommendModel(undefined as unknown as [], { tokens: 1, cachedPct: 0 })).toBeNull();
	});

	it('prefers a free/unlimited model over a comparable paid one', () => {
		const shared = {
			scenarioScores: makeScenarioScores({ coding: 50, agentic: 50, brainstorming: 50 }),
			benchmarks: makeBenchmarks({ coding: 50, reasoning: 50, math: 50 })
		};
		const free = makeGoModel({
			id: 'free-model',
			name: 'Free Model',
			quota: makeQuota({ unlimited: true }),
			pricing: makePricing({ inputPricePerM: 0, outputPricePerM: 0 }),
			...shared
		});
		const paid = makeGoModel({
			id: 'paid-model',
			name: 'Paid Model',
			quota: makeQuota({ requestsPer5h: 100 }),
			...shared
		});

		const report = recommendModel([paid, free], {
			tokens: REFERENCE_TOKENS,
			cachedPct: REFERENCE_CACHED_PCT
		});
		expect(report?.winner.model.id).toBe('free-model');
		expect(report?.top[0].model.id).toBe('free-model');
	});

	it('honours the scenario option when picking a fit', () => {
		const coder = makeGoModel({
			id: 'coder',
			scenarioScores: makeScenarioScores({ coding: 95, agentic: 20, brainstorming: 20 }),
			benchmarks: makeBenchmarks({ coding: 80 })
		});
		const writer = makeGoModel({
			id: 'writer',
			scenarioScores: makeScenarioScores({ coding: 20, agentic: 20, brainstorming: 95 }),
			benchmarks: makeBenchmarks({ coding: 80 })
		});

		const report = recommendModel([coder, writer], {
			tokens: REFERENCE_TOKENS,
			cachedPct: REFERENCE_CACHED_PCT,
			scenario: 'coding'
		});
		expect(report?.winner.model.id).toBe('coder');
	});
});
