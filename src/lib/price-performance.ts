import type { BurnBand } from '$lib/types/models';

/**
 * The burn-band vocabulary and the analytical core of the
 * price-vs-performance chart.
 *
 * The component is only a renderer: it draws whatever these functions decide
 * is worth drawing. Keeping the maths here means it can be unit-tested
 * without a DOM, and it means the "sweet spot" definition lives in one
 * obvious place instead of being spread across a `$derived` block.
 */

/** Burn bands, ordered best -> worst. The legend reads in this order. */
export const BURN_BAND_ORDER: BurnBand[] = [
	'free',
	'excellent',
	'good',
	'moderate',
	'high',
	'extreme'
];

export const BURN_BAND_LABEL: Record<BurnBand, string> = {
	free: 'Free',
	excellent: 'Excellent',
	good: 'Good',
	moderate: 'Moderate',
	high: 'High',
	extreme: 'Extreme'
};

/**
 * Band -> colour.
 *
 * These are the SAME colours the burn badges and the "Thermal key" section
 * already use. The chart palette (--chart-1..5) is a single magenta ramp, so
 * it cannot express "excellent -> extreme" — a legend naming cyan and red
 * would be describing colours that do not exist.
 *
 * The custom properties are defined in `src/routes/layout.css`.
 */
export const BURN_BAND_COLOR: Record<BurnBand, string> = {
	free: 'var(--burn-free)',
	excellent: 'var(--burn-excellent)',
	good: 'var(--burn-good)',
	moderate: 'var(--burn-moderate)',
	high: 'var(--burn-high)',
	extreme: 'var(--burn-extreme)'
};

/** Which cost axis the chart is showing. */
export type XMode = 'price' | 'burn';

/** One model as the chart sees it: a dot with a position and a colour. */
export interface PricePerfPoint {
	name: string;
	provider: string;
	/** Input + output price per 1M tokens, in USD. */
	totalPrice: number;
	/** Coding benchmark score, 0-100. */
	codingScore: number;
	/** Burn score 0-100 (100 = free/excellent, 0 = extreme). */
	burnScore: number;
	band: BurnBand;
}

export interface Quadrant {
	/** Human label for the quadrant. */
	label: string;
	points: PricePerfPoint[];
	bestValue: PricePerfPoint | null;
}

export interface PricePerfStats {
	/** Median price across the plotted models - the sweet spot's right edge in price mode. */
	medianPrice: number;
	/** Median burn score - the sweet spot's right edge in burn mode (inverted: high = left). */
	medianBurn: number;
	/** Median coding score - the sweet spot's bottom edge. */
	medianScore: number;
	/** Models that cost less than the median price AND score above the median (price mode). */
	sweetSpot: PricePerfPoint[];
	/** The strongest model inside the sweet spot. */
	bestValue: PricePerfPoint | null;
	/** All four quadrants, even when some are empty. */
	quadrants: Record<'sweet' | 'premium' | 'budget' | 'avoid', Quadrant>;
	/** Which axis the stats were computed for. */
	mode: XMode;
}

/**
 * The median of a list.
 *
 * Even-length lists average the two middle values, so a field with an even
 * number of models still splits cleanly in half.
 */
export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The strongest model of a set.
 *
 * "Strongest" is the higher coding score; ties go to the cheaper model. It
 * deliberately does NOT use a score-per-dollar ratio: a free model wins that
 * outright and says nothing about which model to actually pick.
 */
export function pickBestValue(points: PricePerfPoint[]): PricePerfPoint | null {
	let best: PricePerfPoint | null = null;
	for (const point of points) {
		if (
			best === null ||
			point.codingScore > best.codingScore ||
			(point.codingScore === best.codingScore && point.totalPrice < best.totalPrice)
		) {
			best = point;
		}
	}
	return best;
}

/**
 * Everything the chart needs to draw its reference marks.
 *
 * The "sweet spot" is the top-left quadrant: cheaper than the median price
 * while scoring above the median score. That is exactly the claim the card's
 * description makes ("cheaper isn't always worse"), so the chart has to SHOW
 * the quadrant rather than merely promise it.
 *
 * In burn mode the X axis is inverted (100 left, 0 right) so "cheap" becomes
 * "efficient" but the sweet spot stays top-left in both modes.
 *
 * Returns `null` for an empty field - there is nothing to divide and nothing
 * to mark.
 */
export function pricePerformanceStats(
	points: PricePerfPoint[],
	mode: XMode = 'price'
): PricePerfStats | null {
	if (points.length === 0) return null;

	const medianPrice = median(points.map((p) => p.totalPrice));
	const medianBurn = median(points.map((p) => p.burnScore));
	const medianScore = median(points.map((p) => p.codingScore));

	const isXGood = (p: PricePerfPoint) =>
		mode === 'price' ? p.totalPrice <= medianPrice : p.burnScore >= medianBurn;
	const isYGood = (p: PricePerfPoint) => p.codingScore >= medianScore;

	const sweet = points.filter((p) => isXGood(p) && isYGood(p));
	const premium = points.filter((p) => !isXGood(p) && isYGood(p));
	const budget = points.filter((p) => isXGood(p) && !isYGood(p));
	const avoid = points.filter((p) => !isXGood(p) && !isYGood(p));

	return {
		medianPrice,
		medianBurn,
		medianScore,
		sweetSpot: sweet,
		bestValue: pickBestValue(sweet),
		mode,
		quadrants: {
			sweet: { label: 'Sweet spot', points: sweet, bestValue: pickBestValue(sweet) },
			premium: { label: 'Premium', points: premium, bestValue: pickBestValue(premium) },
			budget: { label: 'Budget', points: budget, bestValue: pickBestValue(budget) },
			avoid: { label: 'Avoid', points: avoid, bestValue: pickBestValue(avoid) }
		}
	};
}
