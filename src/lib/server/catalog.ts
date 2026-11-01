import { buildCatalogRows, type CatalogRow } from '$lib/catalog';
import { loadModels } from '$lib/server/models';
import { loadStackPlans } from '$lib/server/stack';

/**
 * The merged cross-plan rows.
 *
 * `loadModels` and `loadStackPlans` already cache their data behind
 * content-addressed keys, so this function only merges. Do not add a second
 * cache here: a catalog cache keyed on this module kept serving rows built
 * from a previous model cache, which is exactly how the compare "Replaces"
 * column stayed empty after the hint pipeline changed.
 */
export async function loadCatalogRows(): Promise<CatalogRow[]> {
	const [goModels, plans] = await Promise.all([loadModels(), loadStackPlans()]);
	return buildCatalogRows(goModels, plans);
}
