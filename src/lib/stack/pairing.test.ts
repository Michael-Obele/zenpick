import { describe, expect, it } from 'vite-plus/test';
import { makeBenchmarks } from '$lib/test/fixtures';
import type { StackModel, StackPlan } from './plans';
import { evaluatePair, stackQuality, suggestPair } from './pairing';

const WORKLOAD = { tokens: 50_000, cachedPct: 50, subShare: 70 };

const plan: StackPlan = {
	id: 'zed',
	name: 'Zed Pro',
	monthlyPriceUsd: 10,
	includedUsd: 5,
	allowance: '',
	caveat: '',
	sources: [],
	verifiedOn: null,
	models: []
};

function model(partial: Partial<StackModel>): StackModel {
	return {
		id: 'model',
		name: 'Model',
		provider: 'Lab',
		pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 },
		contextWindow: 200_000,
		intelligence: 50,
		benchmarks: makeBenchmarks({
			coding: 50,
			reasoning: 50,
			math: 50,
			sweBenchVerified: 0.5
		}),
		...partial
	};
}

const strong = model({
	id: 'strong',
	name: 'Strong',
	pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 },
	benchmarks: makeBenchmarks({
		coding: 60,
		reasoning: 60,
		math: 60,
		sweBenchVerified: 0.6
	})
});

const cheap = model({
	id: 'cheap',
	name: 'Cheap',
	pricing: { inputPricePerM: 0.1, outputPricePerM: 0.5, cachedReadPerM: 0.01 },
	benchmarks: makeBenchmarks({
		coding: 30,
		reasoning: 30,
		math: 30,
		sweBenchVerified: 0.3
	})
});

/**
 * Go-tier models shaped like the live GLM-5.3-Flash / DeepSeek V4.1 Flash
 * pair: the sub costs more per token, but the docs burn window says it fits
 * far more requests in. `burn.score` is an efficiency index (higher better);
 * the cost basis is the reciprocal of `requestsPer12`.
 */
const burnMain = model({
	id: 'burn-main',
	name: 'Burn Main',
	pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 },
	benchmarks: makeBenchmarks({
		coding: 60,
		reasoning: 60,
		math: 60,
		sweBenchVerified: 0.6
	}),
	burn: { score: 67, requestsPer12: 6320, band: 'good' }
});
const burnSub = model({
	id: 'burn-sub',
	name: 'Burn Sub',
	pricing: { inputPricePerM: 2.5, outputPricePerM: 10.5, cachedReadPerM: 0.25 },
	benchmarks: makeBenchmarks({
		coding: 30,
		reasoning: 30,
		math: 30,
		sweBenchVerified: 0.3
	}),
	burn: { score: 99, requestsPer12: 43330, band: 'excellent' }
});

describe('stackQuality', () => {
	it('averages the shared benchmark fields', () => {
		expect(stackQuality(strong)).toBe(60);
	});

	it('falls back to intelligence when no benchmark fields exist', () => {
		expect(stackQuality(model({ benchmarks: undefined, intelligence: 42 }))).toBe(42);
	});

	it('returns null when neither source has a score', () => {
		expect(stackQuality(model({ benchmarks: undefined, intelligence: null }))).toBeNull();
	});
});

describe('suggestPair', () => {
	it('picks the stronger model as main and the cheaper model as sub', () => {
		const verdict = suggestPair([strong, cheap], plan, WORKLOAD);

		expect(verdict?.main.id).toBe('strong');
		expect(verdict?.sub.id).toBe('cheap');
		expect(verdict?.economics.savingsPct).toBeGreaterThan(0);
		expect(verdict?.retention).toBe(50);
		expect(verdict?.strengths.join(' ')).toContain('costs');
		expect(verdict?.strengths.join(' ')).toContain('requests/month');
	});

	it('does not invert the roles when the cheaper model is also stronger', () => {
		const strongerAndCheaper = model({
			id: 'efficient',
			name: 'Efficient',
			pricing: {
				inputPricePerM: 0.1,
				outputPricePerM: 0.5,
				cachedReadPerM: 0.01
			},
			benchmarks: makeBenchmarks({
				coding: 65,
				reasoning: 65,
				math: 65,
				sweBenchVerified: 0.65
			})
		});
		const weakExpensive = model({
			id: 'weak-expensive',
			name: 'Weak Expensive',
			pricing: { inputPricePerM: 5, outputPricePerM: 25, cachedReadPerM: 0.5 },
			benchmarks: makeBenchmarks({
				coding: 25,
				reasoning: 25,
				math: 25,
				sweBenchVerified: 0.25
			})
		});

		const verdict = suggestPair([strongerAndCheaper, weakExpensive], plan, WORKLOAD);

		expect(verdict?.main.id).toBe('efficient');
		expect(verdict?.sub.id).toBe('weak-expensive');
		expect(verdict?.warnings.join(' ')).toContain('No cheaper sub-agent');
		expect(verdict?.warnings.join(' ')).toContain('cheapest model here');
	});

	it('returns null for fewer than two models', () => {
		expect(suggestPair([strong], plan, WORKLOAD)).toBeNull();
	});

	it('sends the burn-cheaper model to the sub role even when it lists higher', () => {
		const verdict = suggestPair([burnMain, burnSub], plan, {
			...WORKLOAD,
			subShare: 65
		});

		expect(verdict?.main.id).toBe('burn-main');
		expect(verdict?.sub.id).toBe('burn-sub');
		expect(verdict?.costBasis.usingBurn).toBe(true);
	});
});

describe('evaluatePair', () => {
	it('returns null for the same model in both roles', () => {
		expect(evaluatePair(plan, strong, strong, WORKLOAD)).toBeNull();
	});

	it('flags a sub that scores higher than the main', () => {
		const verdict = evaluatePair(plan, cheap, strong, WORKLOAD);

		expect(verdict?.warnings.join(' ')).toContain('swap the roles');
	});

	it('flags a much smaller sub context window', () => {
		const narrowSub = model({
			id: 'narrow',
			name: 'Narrow',
			contextWindow: 100_000
		});
		const wideMain = model({
			id: 'wide',
			name: 'Wide',
			contextWindow: 1_000_000
		});

		const verdict = evaluatePair(plan, wideMain, narrowSub, WORKLOAD);

		expect(verdict?.warnings.join(' ')).toContain('Sub context is');
	});

	it('surfaces plan-specific notes as warnings', () => {
		const noted = model({
			id: 'noted',
			name: 'Noted',
			note: 'Price doubles above 200K input.'
		});
		const verdict = evaluatePair(plan, strong, noted, WORKLOAD);

		expect(verdict?.warnings.join(' ')).toContain('Sub plan note: Price doubles above 200K input.');
	});

	it('judges cost by burn, not list price, when both models carry Go burn details', () => {
		// The sub's list price is HIGHER than the main's, but the Go docs window
		// says it fits far more requests in — the verdict must follow burn. The
		// cost basis is the window share per request: 1/requestsPer12.
		const verdict = evaluatePair(plan, burnMain, burnSub, {
			...WORKLOAD,
			subShare: 65
		});

		expect(verdict?.costBasis.usingBurn).toBe(true);
		expect(verdict?.costBasis.mainCost).toBeCloseTo(1 / 6320, 10);
		expect(verdict?.costBasis.subCost).toBeCloseTo(1 / 43330, 10);
		// Blended share: 0.35 + 0.65·(6320/43330) = 44.5% of all-main → 56% saved.
		expect(verdict?.costBasis.savingsPct).toBe(56);
		// The same pair is more expensive on pure price — both readings must
		// stay visible rather than collapse into one dollar figure.
		expect(verdict?.economics.savingsPct).toBeLessThan(0);
		expect(verdict?.warnings.join(' ')).not.toContain('saves nothing');
		expect(verdict?.strengths.join(' ')).toContain(
			'fits 6.9× more requests into the same $12 window'
		);
	});

	it('keeps warning the user when the sub burns the Go allowance faster', () => {
		const verdict = evaluatePair(plan, burnSub, burnMain, {
			...WORKLOAD,
			subShare: 65
		});

		expect(verdict?.costBasis.usingBurn).toBe(true);
		expect(verdict?.costBasis.savingsPct).toBeLessThan(0);
		expect(verdict?.warnings.join(' ')).toContain(
			'does not burn the Go allowance slower than Burn Sub'
		);
	});

	it('falls back to price when only one model carries burn details', () => {
		const noneBurn = { ...cheap, burn: null };
		const verdict = evaluatePair(plan, burnMain, noneBurn, WORKLOAD);

		expect(verdict?.costBasis.usingBurn).toBe(false);
		expect(verdict?.strengths.join(' ')).toContain('costs');
	});
});
