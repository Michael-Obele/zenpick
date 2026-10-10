import type { BurnDetails, GoModel, ModelQuota, PlanTier } from '$lib/types/models';

/**
 * Plan-tier selectors.
 *
 * Every model carries two quota/burn sets: the default `quota` / `burnDetails`
 * (the $10 Go plan) and an optional `plus` block (the pricier Go Plus plan,
 * whose usage-limit table allows more requests for the same model). The UI
 * reads through these helpers so the selected plan — tracked in
 * `$lib/stores/plan.svelte.ts` — is applied in one place, and any model without
 * Go Plus data transparently falls back to its Go values.
 */

/** A model's request allowances for the selected plan (Go Plus falls back to Go). */
export function quotaFor(model: GoModel, plan: PlanTier): ModelQuota {
	return plan === 'plus' && model.plus ? model.plus.quota : model.quota;
}

/** Burn details for the selected plan (Go Plus falls back to Go). */
export function burnFor(model: GoModel, plan: PlanTier): BurnDetails {
	return plan === 'plus' && model.plus ? model.plus.burnDetails : model.burnDetails;
}
