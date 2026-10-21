/**
 * Axis tick selection for a COMPRESSED (log-like) scale.
 *
 * A compressed scale spaces its ticks unevenly: the cheap end of the axis
 * gets most of the room and the expensive end is squeezed into a few pixels.
 * A fixed tick COUNT is applied in DATA units, so it still crowds the labels
 * at one end — the same number of ticks that reads fine on a wide chart
 * overlaps on a narrow one, and the same ticks that fit in a 1,100px card
 * collide in a 350px drawer.
 *
 * This picks the smallest "nice" step whose ticks are at least `minGapPx`
 * apart IN PIXELS on the scale, so the labels never collide at any width.
 */

/** The scale shape this needs: callable, with a domain and a range. */
export interface PositionScale {
	(value: number): number;
	domain(): number[];
	range(): number[];
}

/** The steps a price axis is allowed to use, smallest first. */
const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * The tick values for a scale, spaced so their LABELS never overlap.
 *
 * @param scale - the scale the ticks are placed on
 * @param minGapPx - the room two tick labels need, in pixels
 */
export function readableTicks(scale: PositionScale, minGapPx = 48): number[] {
	const domain = scale.domain();
	if (domain.length < 2) return domain;

	const [d0, d1] = domain;
	if (!Number.isFinite(d1 - d0) || d1 === d0) return [d0, d1];

	for (const step of NICE_STEPS) {
		const ticks: number[] = [];
		for (let v = Math.ceil(d0 / step) * step; v <= d1 + step / 1000; v += step) {
			ticks.push(Math.round(v * 1000) / 1000);
		}
		// One tick is not an axis.
		if (ticks.length < 2) continue;

		// The scale is compressed, so the TIGHTEST pair of ticks is the one
		// at the expensive end — that is the pair that decides the step.
		let minGap = Infinity;
		for (let i = 1; i < ticks.length; i++) {
			minGap = Math.min(minGap, Math.abs(scale(ticks[i]) - scale(ticks[i - 1])));
		}
		if (minGap >= minGapPx) return ticks;
	}

	// Nothing fits — the two ends are still readable on their own.
	return [d0, d1];
}
