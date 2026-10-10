import { describe, it, expect } from 'vitest';
import {
	DEFAULT_BURN_SCALE,
	computeBurnScore,
	deriveBurnScale,
	inferBurnDetails,
	scoreToBand
} from './burn';
import { makePricing, makeQuota } from '$lib/test/fixtures';

describe('deriveBurnScale', () => {
	it('falls back to the default scale for fewer than two samples', () => {
		expect(deriveBurnScale([])).toEqual(DEFAULT_BURN_SCALE);
		expect(deriveBurnScale([1_000])).toEqual(DEFAULT_BURN_SCALE);
	});

	it('ignores non-finite and non-positive counts', () => {
		expect(deriveBurnScale([0, -5, NaN, Infinity, 100, 1_000])).toEqual({ lo: 100, hi: 1_000 });
	});

	it('falls back when the span is too narrow (hi <= 2 * lo)', () => {
		expect(deriveBurnScale([100, 150])).toEqual(DEFAULT_BURN_SCALE);
		expect(deriveBurnScale([100, 200])).toEqual(DEFAULT_BURN_SCALE);
	});

	it('derives min/max once the span is wide enough', () => {
		expect(deriveBurnScale([100, 1_000, 5_000])).toEqual({ lo: 100, hi: 5_000 });
		expect(deriveBurnScale([5_000, 100])).toEqual({ lo: 100, hi: 5_000 });
	});

	it('the default scale is lo < hi', () => {
		expect(DEFAULT_BURN_SCALE.lo).toBeLessThan(DEFAULT_BURN_SCALE.hi);
	});
});

describe('computeBurnScore', () => {
	const scale = { lo: 100, hi: 10_000 };

	it('is 0 for a non-positive request count', () => {
		expect(computeBurnScore(0, scale)).toBe(0);
		expect(computeBurnScore(-10, scale)).toBe(0);
	});

	it('maps the lo anchor to 0 and the hi anchor to 100', () => {
		expect(computeBurnScore(100, scale)).toBe(0);
		expect(computeBurnScore(10_000, scale)).toBe(100);
	});

	it('clamps below lo and above hi', () => {
		expect(computeBurnScore(50, scale)).toBe(0);
		expect(computeBurnScore(10_000_000, scale)).toBe(100);
	});

	it('is logarithmic — the geometric midpoint scores 50', () => {
		// sqrt(100 * 10_000) = 1_000
		expect(computeBurnScore(1_000, scale)).toBe(50);
	});

	it('uses the default scale when none is given', () => {
		expect(computeBurnScore(DEFAULT_BURN_SCALE.hi)).toBe(100);
		expect(computeBurnScore(DEFAULT_BURN_SCALE.lo)).toBe(0);
	});
});

describe('scoreToBand', () => {
	it.each([
		[100, 'excellent'],
		[80, 'excellent'],
		[79, 'good'],
		[60, 'good'],
		[59, 'moderate'],
		[40, 'moderate'],
		[39, 'high'],
		[20, 'high'],
		[19, 'extreme'],
		[0, 'extreme']
	])('maps %i → %s', (score, band) => {
		expect(scoreToBand(score)).toBe(band);
	});
});

describe('inferBurnDetails', () => {
	it('treats free pricing as zero-burn "free"', () => {
		const details = inferBurnDetails(makePricing({ inputPricePerM: 0, outputPricePerM: 0 }));
		expect(details).toEqual({ score: 100, requestsPer12: null, band: 'free' });
	});

	it('treats "Unlimited" usage limits as zero-burn "free"', () => {
		const details = inferBurnDetails(makePricing(), makeQuota({ unlimited: true }));
		expect(details).toEqual({ score: 100, requestsPer12: null, band: 'free' });
	});

	it('prefers published usage limits and scores them on the given scale', () => {
		const scale = { lo: 100, hi: 10_000 };
		const details = inferBurnDetails(makePricing(), makeQuota({ requestsPer5h: 1_000 }), scale);
		expect(details.score).toBe(50);
		expect(details.requestsPer12).toBe(1_000);
		expect(details.band).toBe('moderate');
	});

	it('falls back to a price-based estimate when no usage limits exist', () => {
		const details = inferBurnDetails(
			makePricing({ inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: 0.1 })
		);
		// 12 / 0.00155 ≈ 7742 requests/5h, scored against the default scale.
		expect(details.requestsPer12).toBe(7_742);
		expect(details.band).toBe('good');
	});

	it('returns an unknown (null band) result when pricing is unusable', () => {
		const details = inferBurnDetails(
			makePricing({ inputPricePerM: null, outputPricePerM: null, cachedReadPerM: null })
		);
		expect(details).toEqual({ score: 0, requestsPer12: null, band: null });
	});
});
