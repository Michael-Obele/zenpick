import type { BurnBand, BurnDetails, ModelPricing, UsageLimits } from '$lib/types/models';
import { estimateQuota, DEFAULT_QUOTA_INPUTS } from './quota';
import { isFreePricing } from '$lib/burn';

/**
 * Burn score maps published request counts onto 0–100 on a LOG scale — the
 * counts span multiple orders of magnitude, so a linear scale would crush
 * almost every model into one band.
 *
 * The anchors are DERIVED FROM THE LIVE CATALOG (deriveBurnScale), not
 * hardcoded. The old fixed range (100 … 32,000) was right when written, but the
 * published counts have since grown well past 32,000/5h, so every model above
 * it saturated at 100 — "Excellent" for most of the catalog and useless for
 * ranking. Re-deriving the range on every refresh keeps the scale descriptive
 * of the catalog as it actually is, so it cannot silently go stale again.
 */
export interface BurnScale {
	/** Requests/window mapping to ~0 (fastest-burning model). */
	lo: number;
	/** Requests/window mapping to 100 (slowest-burning model). */
	hi: number;
}

/** Fallback when no published usage counts exist (docs fetch failed). */
export const DEFAULT_BURN_SCALE: BurnScale = { lo: 100, hi: 32_000 };

/**
 * Derive score anchors from the published request counts: log-space min→max, so
 * the current fastest model sits near 0 and the slowest near 100. Falls back to
 * DEFAULT_BURN_SCALE when the sample is too small or the span too narrow.
 */
export function deriveBurnScale(requestCounts: number[]): BurnScale {
	const values = requestCounts.filter((n) => Number.isFinite(n) && n > 0);
	if (values.length < 2) return DEFAULT_BURN_SCALE;
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	if (!(hi > lo * 2)) return DEFAULT_BURN_SCALE;
	return { lo, hi };
}

/** Compute continuous burn score (0-100) from requests per $12 window. */
export function computeBurnScore(
	requestsPer12: number,
	scale: BurnScale = DEFAULT_BURN_SCALE
): number {
	if (requestsPer12 <= 0) return 0;
	const loLog = Math.log(scale.lo);
	const hiLog = Math.log(scale.hi);
	const v = Math.log(Math.min(Math.max(requestsPer12, scale.lo), scale.hi));
	const raw = ((v - loLog) / (hiLog - loLog)) * 100;
	return Math.min(100, Math.max(0, Math.round(raw)));
}

/** Map a burn score to a named band. */
export function scoreToBand(score: number): BurnBand {
	if (score >= 80) return 'excellent';
	if (score >= 60) return 'good';
	if (score >= 40) return 'moderate';
	if (score >= 20) return 'high';
	return 'extreme';
}

/**
 * Infer burn details. Prefer OpenCode's published usage-limit request counts
 * (the ground truth for Go quota burn); fall back to a price-based estimate
 * when a model isn't listed on the docs usage-limits table.
 */
export function inferBurnDetails(
	pricing: ModelPricing,
	usageLimits?: UsageLimits | null,
	scale: BurnScale = DEFAULT_BURN_SCALE
): BurnDetails {
	// Free models cost nothing against the Go allowance, and "Unlimited" usage
	// limits mean no ceiling either way — both are zero burn. Checked FIRST so a
	// free/unlimited model never falls through to the price-based estimate and
	// lands in a numeric band (or, worse, the old null/"Unknown" state).
	if (isFreePricing(pricing) || usageLimits?.unlimited) {
		return { score: 100, requestsPer12: null, band: 'free' };
	}

	if (usageLimits && usageLimits.requestsPer5h > 0) {
		const score = computeBurnScore(usageLimits.requestsPer5h, scale);
		return {
			score,
			requestsPer12: usageLimits.requestsPer5h,
			band: scoreToBand(score)
		};
	}

	const quota = estimateQuota(
		pricing,
		DEFAULT_QUOTA_INPUTS.inputTokens,
		DEFAULT_QUOTA_INPUTS.outputTokens,
		DEFAULT_QUOTA_INPUTS.cachedInputTokens
	);

	if (!quota) {
		return { score: 0, requestsPer12: null, band: null };
	}

	const score = computeBurnScore(quota.requestsPer5h, scale);
	return {
		score,
		requestsPer12: quota.requestsPer5h,
		band: scoreToBand(score)
	};
}
