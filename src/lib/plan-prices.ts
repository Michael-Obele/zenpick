/**
 * Plan-price rows for the non-Go detail drawer.
 *
 * `PlanModelDrawer` renders one compact row per plan that carries the model.
 * The formatting and the active-plan flag live here (pure, no Svelte) so the
 * branching is testable without a DOM — the Sheet portals via `mount()`, so
 * the drawer itself renders nothing under SSR.
 */
import { PLAN_LABEL, type CatalogRow, type PlanFilter } from '$lib/catalog';
import { formatPricePerM } from '$lib/stack/format';
import type { PlanId } from '$lib/stack/plans';

export interface PlanPriceRow {
	plan: PlanId;
	/** Full plan name, e.g. "Zed Pro". */
	label: string;
	/** Per-1M-token prices, already formatted. */
	input: string;
	output: string;
	cached: string;
	note: string | null;
	/** True when this entry is the plan the table is filtered to. */
	active: boolean;
}

/** One row per plan entry, in the catalog's go/zed/copilot display order. */
export function planPriceRows(row: CatalogRow, activePlan: PlanFilter = ''): PlanPriceRow[] {
	return row.plans.map((entry) => ({
		plan: entry.plan,
		label: PLAN_LABEL[entry.plan],
		input: formatPricePerM(entry.pricing.inputPricePerM),
		output: formatPricePerM(entry.pricing.outputPricePerM),
		cached: formatPricePerM(entry.pricing.cachedReadPerM),
		note: entry.note ?? null,
		active: entry.plan === activePlan
	}));
}
