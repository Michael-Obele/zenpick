import { cacheGet, cacheSet, DEGRADED_STACK_TTL, MODELS_TTL } from '$lib/cache';
import { buildCatalogRows, type CatalogRow } from '$lib/catalog';
import { fnv1a, loadModels } from '$lib/server/models';
import { loadStackPlans } from '$lib/server/stack';
import type { StackPlan } from '$lib/stack/plans';

const CATALOG_CACHE_KEY = `plan-catalog:${fnv1a(
	[buildCatalogRows, loadCatalogRows].map((fn) => fn.toString()).join('\n')
)}`;

/** The in-flight rebuild, so concurrent cold requests share one rebuild. */
let catalogRowsInflight: Promise<CatalogRow[]> | null = null;

/**
 * A modelgrep-less build: static plans exist, but not one of their models
 * carries an Artificial Analysis score. `loadStackPlans` already caches such a
 * build for the short TTL; the rows derived from it must not outlive it, or
 * every static-plan row keeps null intelligence/coding for `MODELS_TTL`.
 */
function isDegradedBuild(plans: StackPlan[]): boolean {
	const staticModels = plans.filter((plan) => plan.id !== 'go').flatMap((plan) => plan.models);
	if (staticModels.length === 0) return false;
	return staticModels.every((model) => model.intelligence == null && model.coding == null);
}

/**
 * The merged cross-plan rows, cached by content-addressed key so a change to
 * the merge logic invalidates the entry. Concurrent cold requests share one
 * rebuild; cached non-stale rows are returned immediately.
 */
export async function loadCatalogRows(): Promise<CatalogRow[]> {
	const cached = cacheGet<CatalogRow[]>(CATALOG_CACHE_KEY);
	if (cached && !cached.stale) return cached.data;

	if (!catalogRowsInflight) {
		catalogRowsInflight = (async () => {
			const [goModels, plans] = await Promise.all([loadModels(), loadStackPlans()]);
			const rows = buildCatalogRows(goModels, plans);
			cacheSet(CATALOG_CACHE_KEY, rows, isDegradedBuild(plans) ? DEGRADED_STACK_TTL : MODELS_TTL);
			return rows;
		})().finally(() => {
			catalogRowsInflight = null;
		});
	}
	return catalogRowsInflight;
}
