/**
 * Compare identity across plans
 * -----------------------------
 * The comparison selection is a list of `plan:id` keys
 * (`go:deepseek-v4.1-flash`, `zed:claude-sonnet-5.5`), so one selection can
 * hold models from any plan. A bare id is a legacy Go key (`gpt-6-luna` →
 * `go:gpt-6-luna`), which keeps share links written before Phase 3 working.
 *
 * Parsing, resolving and key selection live here; the store stays `string[]`.
 * Matching goes through `modelKey()`, never exact string equality, because a
 * plan may spell the same model differently (`claude-sonnet-5-5` vs
 * `claude-sonnet-5.5`).
 */
import {
	PLAN_SHORT_LABEL,
	type CatalogPlanEntry,
	type CatalogRow,
	type PlanFilter
} from '$lib/catalog';
import { modelKey } from '$lib/stack/logic';
import { PLAN_IDS, type PlanId } from '$lib/stack/plans';

export interface CompareEntry {
	/** The key exactly as it was passed in, so `remove(key)` round-trips. */
	key: string;
	row: CatalogRow;
	plan: CatalogPlanEntry;
}

const PLAN_ID_SET: ReadonlySet<string> = new Set<PlanId>(PLAN_IDS);

function isPlanId(value: string): value is PlanId {
	return PLAN_ID_SET.has(value);
}

/** `plan:id`. Model ids never contain a colon. */
export function compareKey(plan: PlanId, id: string): string {
	return `${plan}:${id}`;
}

/** `plan:modelKey(id)` — the identity two keys are matched on. Null when unparseable. */
export function compareIdentity(key: string): string | null {
	const parsed = parseCompareKey(key);
	if (!parsed) return null;
	return `${parsed.plan}:${modelKey(parsed.id)}`;
}

/**
 * Whether `selection` already holds this key's identity (legacy bare ids and
 * alternate spellings match).
 */
export function isCompareSelected(selection: string[], key: string): boolean {
	const identity = compareIdentity(key);
	if (identity === null) return false;
	return selection.some((stored) => compareIdentity(stored) === identity);
}

/**
 * Parse a key. A bare id (no colon) is a legacy Go key.
 * Returns null for an empty key, an empty id, or an unknown plan.
 */
export function parseCompareKey(key: string): { plan: PlanId; id: string } | null {
	const trimmed = key.trim();
	if (trimmed === '') return null;

	// Split on the FIRST colon only, so a plan prefix never swallows the id.
	const colon = trimmed.indexOf(':');
	if (colon === -1) return { plan: 'go', id: trimmed };

	const plan = trimmed.slice(0, colon);
	const id = trimmed.slice(colon + 1);
	if (id === '' || !isPlanId(plan)) return null;

	return { plan, id };
}

function findPlanEntry(row: CatalogRow, plan: PlanId, id: string): CatalogPlanEntry | null {
	const wanted = modelKey(id);
	return row.plans.find((entry) => entry.plan === plan && modelKey(entry.id) === wanted) ?? null;
}

/**
 * Resolve keys to catalog entries in the input order. Skips unknown keys and
 * duplicates (same plan + modelKey(id)), keeping the first occurrence.
 * The returned `key` is the input key, not the canonical one, so removal works.
 */
export function resolveCompareEntries(rows: CatalogRow[], keys: string[]): CompareEntry[] {
	const entries: CompareEntry[] = [];
	const seen = new Set<string>();

	for (const key of keys) {
		const parsed = parseCompareKey(key);
		if (!parsed) continue;

		const identity = `${parsed.plan}:${modelKey(parsed.id)}`;
		if (seen.has(identity)) continue;

		const row = rows.find((candidate) => findPlanEntry(candidate, parsed.plan, parsed.id) !== null);
		if (!row) continue;

		const plan = findPlanEntry(row, parsed.plan, parsed.id);
		if (!plan) continue;

		seen.add(identity);
		entries.push({ key, row, plan });
	}

	return entries;
}

/**
 * The key a row should use in the compare checkbox:
 * the active plan filter when the row has that plan, else the Go entry,
 * else the row's first plan entry. Null only when the row has no plans.
 */
export function selectedKeyForRow(row: CatalogRow, planFilter: PlanFilter): string | null {
	if (planFilter !== '') {
		const active = row.plans.find((entry) => entry.plan === planFilter);
		if (active) return compareKey(active.plan, active.id);
	}

	const go = row.plans.find((entry) => entry.plan === 'go');
	if (go) return compareKey(go.plan, go.id);

	const [first] = row.plans;
	return first ? compareKey(first.plan, first.id) : null;
}

/** `/compare?models=key1,key2`, or `/compare` when empty. */
export function compareHref(keys: string[]): string {
	if (keys.length === 0) return '/compare';
	return `/compare?models=${keys
		.map((key) => {
			const parsed = parseCompareKey(key);
			// Encode only the id: the separator stays readable in a shared link.
			return parsed ? `${parsed.plan}:${encodeURIComponent(parsed.id)}` : encodeURIComponent(key);
		})
		.join(',')}`;
}

/** Every selectable (row, plan) pair — used by the compare picker. */
export function catalogCompareEntries(rows: CatalogRow[]): CompareEntry[] {
	return rows.flatMap((row) =>
		row.plans.map((plan) => ({
			key: compareKey(plan.plan, plan.id),
			row,
			plan
		}))
	);
}

/** Narrow the picker pool to one plan. `''` keeps every plan. */
export function filterEntriesByPlan(
	entries: CompareEntry[],
	planFilter: PlanFilter
): CompareEntry[] {
	return planFilter === '' ? entries : entries.filter((entry) => entry.plan.plan === planFilter);
}

/** A short chip label: the model name plus the plan short label. */
export function compareEntryLabel(entry: CompareEntry): string {
	return `${entry.row.name} · ${PLAN_SHORT_LABEL[entry.plan.plan]}`;
}
