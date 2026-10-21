import { describe, expect, it } from 'vite-plus/test';
import {
	median,
	pickBestValue,
	pricePerformanceStats,
	type PricePerfPoint
} from './price-performance';

function point(overrides: Partial<PricePerfPoint> & { name: string }): PricePerfPoint {
	return {
		provider: 'test-provider',
		totalPrice: 1,
		codingScore: 50,
		burnScore: 50,
		band: 'moderate',
		...overrides
	};
}

describe('median', () => {
	it('returns the middle value of an odd-length list', () => {
		expect(median([3, 1, 2])).toBe(2);
	});

	it('averages the two middle values of an even-length list', () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});

	it('does not depend on the input order', () => {
		expect(median([4, 3, 2, 1])).toBe(2.5);
	});

	it('returns 0 for an empty list', () => {
		expect(median([])).toBe(0);
	});

	it('returns the only value of a single-element list', () => {
		expect(median([7])).toBe(7);
	});
});

describe('pickBestValue', () => {
	it('returns null for an empty set', () => {
		expect(pickBestValue([])).toBeNull();
	});

	it('picks the highest coding score', () => {
		const best = pickBestValue([
			point({ name: 'low', codingScore: 10 }),
			point({ name: 'high', codingScore: 90 }),
			point({ name: 'mid', codingScore: 50 })
		]);
		expect(best?.name).toBe('high');
	});

	it('breaks a score tie by preferring the cheaper model', () => {
		const best = pickBestValue([
			point({ name: 'expensive', codingScore: 70, totalPrice: 9 }),
			point({ name: 'cheap', codingScore: 70, totalPrice: 1 })
		]);
		expect(best?.name).toBe('cheap');
	});
});

describe('pricePerformanceStats', () => {
	it('returns null for an empty field', () => {
		expect(pricePerformanceStats([])).toBeNull();
	});

	it('splits the field on the median price and the median score', () => {
		const stats = pricePerformanceStats([
			point({ name: 'a', totalPrice: 0.5, codingScore: 40 }),
			point({ name: 'b', totalPrice: 1, codingScore: 60 }),
			point({ name: 'c', totalPrice: 2, codingScore: 80 }),
			point({ name: 'd', totalPrice: 8, codingScore: 20 })
		]);

		expect(stats?.medianPrice).toBe(1.5);
		expect(stats?.medianScore).toBe(50);
	});

	it('collects the models that are cheap AND capable into the sweet spot', () => {
		const stats = pricePerformanceStats([
			point({ name: 'cheap-and-good', totalPrice: 0.5, codingScore: 90 }),
			point({ name: 'cheap-and-shy', totalPrice: 0.6, codingScore: 10 }),
			point({ name: 'dear-but-good', totalPrice: 9, codingScore: 95 })
		]);

		expect(stats?.sweetSpot.map((p) => p.name)).toEqual(['cheap-and-good']);
	});

	it('marks the strongest model in the sweet spot as the best value', () => {
		const stats = pricePerformanceStats([
			point({ name: 'decent', totalPrice: 0.5, codingScore: 70 }),
			point({ name: 'strongest', totalPrice: 1, codingScore: 95 }),
			point({ name: 'pricey', totalPrice: 20, codingScore: 99 })
		]);

		expect(stats?.bestValue?.name).toBe('strongest');
	});

	it('has no best value when the sweet spot is empty', () => {
		const stats = pricePerformanceStats([
			point({ name: 'cheap-and-shy', totalPrice: 0.5, codingScore: 10 }),
			point({ name: 'dear-and-good', totalPrice: 20, codingScore: 99 })
		]);

		expect(stats?.sweetSpot).toEqual([]);
		expect(stats?.bestValue).toBeNull();
	});

	it('splits into four quadrants that partition the field', () => {
		const points = [
			point({ name: 'sweet', totalPrice: 0.5, codingScore: 90, burnScore: 80 }),
			point({ name: 'premium', totalPrice: 9, codingScore: 90, burnScore: 10 }),
			point({ name: 'budget', totalPrice: 0.5, codingScore: 10, burnScore: 80 }),
			point({ name: 'avoid', totalPrice: 9, codingScore: 10, burnScore: 10 })
		];
		const stats = pricePerformanceStats(points)!;
		expect(stats.quadrants.sweet.points.map((p) => p.name)).toEqual(['sweet']);
		expect(stats.quadrants.premium.points.map((p) => p.name)).toEqual(['premium']);
		expect(stats.quadrants.budget.points.map((p) => p.name)).toEqual(['budget']);
		expect(stats.quadrants.avoid.points.map((p) => p.name)).toEqual(['avoid']);
	});

	it('uses burn score for the X split in burn mode', () => {
		const points = [
			point({ name: 'efficient-good', totalPrice: 9, burnScore: 90, codingScore: 90 }),
			point({ name: 'wasteful-good', totalPrice: 0.5, burnScore: 10, codingScore: 90 })
		];
		const priceStats = pricePerformanceStats(points, 'price')!;
		const burnStats = pricePerformanceStats(points, 'burn')!;
		// Price mode: cheap (0.5) is sweet, burn mode: efficient (90) is sweet
		expect(priceStats.sweetSpot.map((p) => p.name)).toEqual(['wasteful-good']);
		expect(burnStats.sweetSpot.map((p) => p.name)).toEqual(['efficient-good']);
	});
});
