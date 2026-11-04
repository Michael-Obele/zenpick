import { matchesModelSearch } from '$lib/model-search';
import { modelKey } from '$lib/stack/logic';
import type { PlanId, StackModel, StackPlan, StackPricing } from '$lib/stack/plans';
import { GO_PLAN_META } from '$lib/stack/plans';
import type {
	GoModel,
	ModelBenchmarks,
	ModelCapabilities,
	ModelSpeed,
	ModelTag
} from '$lib/types/models';

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
	/** Plan's included monthly token budget in USD (Go $60, Zed $5, Copilot $15). */
	includedUsd?: number | null;
	/** Plan's monthly subscription price. */
	monthlyPriceUsd?: number | null;
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
	/**
	 * Blended benchmark fields for the compare views (modelgrep primary,
	 * llm-stats fallback). Go rows carry the Go model's own object; plan-only
	 * rows carry the static plan's resolved benchmarks.
	 */
	benchmarks?: ModelBenchmarks | null;
	/** Fact sheet for plan-only rows; Go rows read these off `go`. */
	capabilities?: ModelCapabilities | null;
	openWeight?: boolean | null;
	speed?: ModelSpeed | null;
	tags?: ModelTag[];
	/** llm-stats slug for this plan entry, when a source matched it. */
	llmStatsId?: string | null;
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
		includedUsd: GO_PLAN_META.includedUsd,
		monthlyPriceUsd: GO_PLAN_META.monthlyPriceUsd,
		pricing: {
			inputPricePerM: go.pricing.inputPricePerM,
			outputPricePerM: go.pricing.outputPricePerM,
			cachedReadPerM: go.pricing.cachedReadPerM
		}
	};
}

function staticEntry(plan: StackPlan, model: StackModel): CatalogPlanEntry {
	return {
		plan: plan.id,
		id: model.id,
		pricing: { ...model.pricing },
		modelgrepId: model.modelgrepId ?? null,
		includedUsd: plan.includedUsd,
		monthlyPriceUsd: plan.monthlyPriceUsd,
		...(model.note ? { note: model.note } : {})
	};
}

/** A row built from a Go model (it always carries the Go entry). */
function goRow(go: GoModel): CatalogRow {
	return {
		key: modelKey(go.id),
		id: go.id,
		name: go.displayName ?? go.name,
		provider: go.provider,
		contextWindow: go.contextWindow,
		intelligence: go.benchmarks.reasoning,
		coding: go.benchmarks.coding,
		benchmarks: go.benchmarks,
		description: go.description || null,
		modelgrepId: go.modelgrepId,
		plans: [goEntry(go)],
		go
	};
}

/** A row for a model only a static plan carries. */
function staticRow(model: StackModel, entry: CatalogPlanEntry): CatalogRow {
	return {
		key: modelKey(model.id),
		id: model.id,
		name: model.name,
		provider: model.provider,
		contextWindow: model.contextWindow,
		intelligence: model.intelligence,
		coding: model.coding ?? null,
		benchmarks: model.benchmarks ?? null,
		capabilities: model.capabilities ?? null,
		openWeight: model.openWeight ?? null,
		speed: model.speed ?? null,
		tags: model.tags ?? [],
		llmStatsId: model.llmStatsId ?? null,
		description: model.description ?? null,
		modelgrepId: model.modelgrepId ?? null,
		plans: [entry],
		go: null
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
		const row = goRow(go);
		rows.push(row);
		// A duplicate Go id keeps the first row as the merge target.
		if (!byKey.has(row.key)) byKey.set(row.key, row);
	}

	for (const plan of plans) {
		if (plan.id === 'go') continue;

		for (const model of plan.models) {
			const existing = byKey.get(modelKey(model.id));
			const entry = staticEntry(plan, model);

			if (existing) {
				existing.plans.push(entry);
				fillFactsFromStatic(existing, model);
				continue;
			}

			const row = staticRow(model, entry);
			rows.push(row);
			byKey.set(row.key, row);
		}
	}

	for (const row of rows) {
		row.plans.sort((a, b) => PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan]);
	}

	return rows;
}

/** Fill a Go row's missing scalar facts from a static plan; Go values always win. */
function fillModelFacts(row: CatalogRow, model: StackModel): void {
	if (row.contextWindow == null) row.contextWindow = model.contextWindow;
	if (row.intelligence == null) row.intelligence = model.intelligence;
	if (row.coding == null) row.coding = model.coding ?? null;
	if (row.description == null) row.description = model.description ?? null;
	if (row.modelgrepId == null) row.modelgrepId = model.modelgrepId ?? null;
}

/** Fill the optional fact-sheet fields the static-plan builder resolved. */
function fillPlanFacts(row: CatalogRow, model: StackModel): void {
	if (row.benchmarks == null) row.benchmarks = model.benchmarks ?? null;
	if (row.capabilities == null) row.capabilities = model.capabilities ?? null;
	if (row.openWeight == null) row.openWeight = model.openWeight ?? null;
	if (row.speed == null) row.speed = model.speed ?? null;
	if (row.tags == null || row.tags.length === 0) row.tags = model.tags ?? [];
	if (row.llmStatsId == null) row.llmStatsId = model.llmStatsId ?? null;
}

/** Fill a Go row's missing facts from a static plan; Go values always win. */
function fillFactsFromStatic(row: CatalogRow, model: StackModel): void {
	fillModelFacts(row, model);
	fillPlanFacts(row, model);
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
