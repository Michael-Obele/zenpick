import { burnRateFromPrice, isFreePricing, type BurnRate } from '$lib/burn';
import { costPerRequest } from '$lib/recommendation';
import type { StackModel } from './plans';
import type { StackWorkload } from './logic';

/**
 * Plan-agnostic model economics
 * -----------------------------
 * OpenCode Go publishes request windows, so its burn/quota numbers come from
 * the docs tables. Zed Pro and Copilot Pro instead sell a monthly dollar
 * allowance, so the same questions need a price-based answer:
 *
 *   - what does one request cost?
 *   - how many requests fit inside the included monthly allowance?
 *   - what share of that allowance does 100 requests consume?
 *   - is this model a slow, moderate or fast burn?
 *
 * The first three are the static-plan equivalent of Go's request windows. The
 * fourth is the price band Go already uses (`burnRateFromPrice`). All four are
 * derived from the plan's own marked-up pricing, so a Zed model uses Zed's
 * +10% rate rather than the provider list price.
 */
export interface PlanModelEconomics {
	/** Cost of one reference request (50K tokens, half cached) at this plan's rate. */
	costPerRequest: number | null;
	/** Cost of 100 reference requests. */
	costPer100: number | null;
	/** Whole requests covered by the plan's included monthly allowance. */
	includedRequests: number | null;
	/** Share of the included allowance 100 requests consume (can exceed 100). */
	budgetPer100Pct: number | null;
	/** Price-based burn band: free, slow, medium or fast; null without a price. */
	burnRate: BurnRate | null;
}

export function planModelEconomics(
	model: Pick<StackModel, 'pricing'>,
	includedUsd: number | null,
	w: Pick<StackWorkload, 'tokens' | 'cachedPct'>
): PlanModelEconomics {
	const cost = costPerRequest(model.pricing, w.tokens, w.cachedPct);
	const costPer100 = cost == null ? null : cost * 100;
	const allowance = includedUsd != null && includedUsd > 0 ? includedUsd : null;
	const includedRequests =
		cost != null && cost > 0 && allowance != null ? Math.floor(allowance / cost) : null;
	const budgetPer100Pct =
		costPer100 != null && allowance != null ? (costPer100 / allowance) * 100 : null;
	const burnRate: BurnRate | null =
		cost == null
			? null
			: isFreePricing(model.pricing)
				? 'free'
				: burnRateFromPrice(
						(model.pricing.inputPricePerM ?? 0) + (model.pricing.outputPricePerM ?? 0)
					);

	return {
		costPerRequest: cost,
		costPer100,
		includedRequests,
		budgetPer100Pct,
		burnRate
	};
}
