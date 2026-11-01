import { matchesModelSearch } from '$lib/model-search';
import { modelKey } from '$lib/stack/logic';
import type { PlanId, StackModel, StackPlan, StackPricing } from '$lib/stack/plans';
import type { GoModel } from '$lib/types/models';

/**
 * Cross-plan catalog: ONE row per model, whatever plans carry it.
 *
 * `$lib/stack/plans.ts` stays per-plan (a plan's own models and prices). This
 * module merges those plans into the rows the home table renders, keyed by
 * the same `modelKey()` identity the stack logic uses.
 */

/** `''` means "all plans". */
export type PlanFilter = '' | PlanId;

export const PLAN_LABEL: Record<PlanId, string> = {
	go: 'OpenCode Go',
	zed: 'Zed Pro',
	copilot: 'Copilot Pro'
};

export const PLAN_SHORT_LABEL: Record<PlanId, string> = {
	go: 'Go',
	zed: 'Zed',
	copilot: 'Copilot'
};

export const PLAN_FILTER_OPTIONS: { value: PlanFilter; label: string }[] = [
	{ value: '', label: 'All plans' },
	{ value: 'go', label: 'OpenCode Go' },
	{ value: 'zed', label: 'Zed Pro' },
	{ value: 'copilot', label: 'Copilot Pro' }
];

/** Display order of plan entries within a row (differs from `PLAN_IDS` tab order). */
export const PLAN_ORDER: Record<PlanId, number> = { go: 0, zed: 1, copilot: 2 };

/** One plan's offer for a model. A model can be on several plans. */
export interface CatalogPlanEntry {
	plan: PlanId;
	/** Plan-local model id. */
	id: string;
	pricing: StackPricing;
	note?: string;
	/** modelgrep id for this plan's model, when one is known. */
	modelgrepId?: string | null;
}

export interface CatalogRow {
	/** Cross-plan identity: `modelKey(id)` from `$lib/stack/logic`. */
	key: string;
	/** Canonical id for display/copy: the Go id when the model is on Go. */
	id: string;
	name: string;
	provider: string;
	contextWindow: number | null;
	/** Artificial Analysis intelligence index (0-100), null when unpublished. */
	intelligence: number | null;
	/** Artificial Analysis coding score (0-100), null when unpublished. */
	coding: number | null;
	/** One-line description for the detail drawer; null when no source has one. */
	description: string | null;
	/** modelgrep id for the model page; null when no source has one. */
	modelgrepId: string | null;
	/** Every plan carrying this model, in go/zed/copilot display order (not `PLAN_IDS` tab order). */
	plans: CatalogPlanEntry[];
	/** The Go catalog row when this model is on OpenCode Go; null otherwise. */
	go: GoModel | null;
}

function goEntry(go: GoModel): CatalogPlanEntry {
	return {
		plan: 'go',
		id: go.id,
		modelgrepId: go.modelgrepId,
		pricing: {
			inputPricePerM: go.pricing.inputPricePerM,
			outputPricePerM: go.pricing.outputPricePerM,
			cachedReadPerM: go.pricing.cachedReadPerM
		}
	};
}

function staticEntry(plan: PlanId, model: StackModel): CatalogPlanEntry {
	return {
		plan,
		id: model.id,
		pricing: { ...model.pricing },
		modelgrepId: model.modelgrepId ?? null,
		...(model.note ? { note: model.note } : {})
	};
}

/**
 * Merge the Go catalog and the static plans into one row per model.
 *
 * The Go plan inside `plans` is ignored: it is derived from `goModels`, and
 * walking it would add a second `go` entry to every Go row.
 */
export function buildCatalogRows(goModels: GoModel[], plans: StackPlan[]): CatalogRow[] {
	const rows: CatalogRow[] = [];
	const byKey = new Map<string, CatalogRow>();

	for (const go of goModels) {
		const key = modelKey(go.id);
		const row: CatalogRow = {
			key,
			id: go.id,
			name: go.displayName ?? go.name,
			provider: go.provider,
			contextWindow: go.contextWindow,
			intelligence: go.benchmarks.reasoning,
			coding: go.benchmarks.coding,
			description: go.description || null,
			modelgrepId: go.modelgrepId,
			plans: [goEntry(go)],
			go
		};
		rows.push(row);
		// A duplicate Go id keeps the first row as the merge target.
		if (!byKey.has(key)) byKey.set(key, row);
	}

	for (const plan of plans) {
		if (plan.id === 'go') continue;

		for (const model of plan.models) {
			const key = modelKey(model.id);
			const existing = byKey.get(key);
			const entry = staticEntry(plan.id, model);

			if (!existing) {
				const row: CatalogRow = {
					key,
					id: model.id,
					name: model.name,
					provider: model.provider,
					contextWindow: model.contextWindow,
					intelligence: model.intelligence,
					coding: model.coding ?? null,
					description: model.description ?? null,
					modelgrepId: model.modelgrepId ?? null,
					plans: [entry],
					go: null
				};
				rows.push(row);
				byKey.set(key, row);
				continue;
			}

			existing.plans.push(entry);
			fillFactsFromStatic(existing, model);
		}
	}

	for (const row of rows) {
		row.plans.sort((a, b) => PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan]);
	}

	return rows;
}

/** Fill a Go row's missing facts from a static plan; Go values always win. */
function fillFactsFromStatic(row: CatalogRow, model: StackModel): void {
	if (row.contextWindow == null) row.contextWindow = model.contextWindow;
	if (row.intelligence == null) row.intelligence = model.intelligence;
	if (row.coding == null) row.coding = model.coding ?? null;
	if (row.description == null) row.description = model.description ?? null;
	if (row.modelgrepId == null) row.modelgrepId = model.modelgrepId ?? null;
}

/** Nulls sort last, so "cheapest known price" never loses to an unknown one. */
function comparePrice(a: number | null, b: number | null): number {
	if (a == null) return b == null ? 0 : 1;
	if (b == null) return -1;
	return a - b;
}

/**
 * The plan entry a filter is asking about: that plan's entry, or — for
 * `''` — the cheapest entry by input price.
 */
export function rowPlanEntry(row: CatalogRow, filter: PlanFilter): CatalogPlanEntry | null {
	if (filter !== '') {
		return row.plans.find((entry) => entry.plan === filter) ?? null;
	}

	const entries = row.plans;
	if (entries.length === 0) return null;
	// Without any input price there is nothing to compare, so keep the first.
	if (entries.every((entry) => entry.pricing.inputPricePerM == null)) return entries[0];

	return [...entries].sort(
		(a, b) =>
			comparePrice(a.pricing.inputPricePerM, b.pricing.inputPricePerM) ||
			comparePrice(a.pricing.outputPricePerM, b.pricing.outputPricePerM) ||
			PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan]
	)[0];
}

/** Whether the plan filter carries this row (`''` means every plan). */
export function matchesCatalogPlan(row: CatalogRow, plan: PlanFilter): boolean {
	return plan === '' || row.plans.some((entry) => entry.plan === plan);
}

/**
 * Search across plan names as well as the model itself. Go rows keep the
 * shared model search so tags and capabilities stay searchable.
 */
export function matchesCatalogRow(row: CatalogRow, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === '') return true;
	if (row.go !== null && matchesModelSearch(row.go, q)) return true;

	const haystack = [
		row.name,
		row.provider,
		row.id,
		...row.plans.flatMap((entry) => [PLAN_LABEL[entry.plan], PLAN_SHORT_LABEL[entry.plan]])
	]
		.join(' ')
		.toLowerCase();

	return haystack.includes(q);
}

export function isFreePlanEntry(entry: CatalogPlanEntry): boolean {
	return entry.pricing.inputPricePerM === 0 && entry.pricing.outputPricePerM === 0;
}
