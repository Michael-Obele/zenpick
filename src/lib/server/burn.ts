import type { BurnBand, BurnDetails, ModelPricing, UsageLimits } from '$lib/types/models';
import { estimateQuota, DEFAULT_QUOTA_INPUTS } from './quota';

/**
 * Burn score is mapped on a LOG scale. OpenCode Go's actual usage-limit
 * request counts span ~110 req/5h (Kimi K3 — burns fastest) to ~31,650
 * req/5h (DeepSeek V4 Flash — burns slowest). A linear scale would crush
 * almost every model into the "extreme" band, so we log-map the real range
 * across 0–100, which spreads the models sensibly across all five bands.
 */
const BURN_SCORE_LO = Math.log(100); // fastest realistic burn (Kimi K3 / Grok 4.5)
const BURN_SCORE_HI = Math.log(32_000); // slowest realistic burn (DeepSeek V4 Flash)

/** Compute continuous burn score (0-100) from requests per $12 window. */
export function computeBurnScore(requestsPer12: number): number {
	if (requestsPer12 <= 0) return 0;
	const v = Math.log(Math.min(requestsPer12, Math.exp(BURN_SCORE_HI)));
	const raw = ((v - BURN_SCORE_LO) / (BURN_SCORE_HI - BURN_SCORE_LO)) * 100;
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
	usageLimits?: UsageLimits | null
): BurnDetails {
	if (usageLimits && usageLimits.requestsPer5h > 0) {
		const score = computeBurnScore(usageLimits.requestsPer5h);
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

	const score = computeBurnScore(quota.requestsPer5h);
	return {
		score,
		requestsPer12: quota.requestsPer5h,
		band: scoreToBand(score)
	};
}
