import { query } from '$app/server';
import { loadModels, loadFrontierSnapshot, loadCatalogAudit } from '$lib/server/models';

/**
 * Fetch all enriched Go models.
 * Uses stale-while-revalidate: returns cached data instantly,
 * refreshes in background if stale.
 *
 * The pipeline itself lives in `$lib/server/models` because remote modules may
 * only export remote functions — the revalidation endpoint needs the raw
 * `loadModels` / `revalidateModels` functions.
 */
export const getModels = query(() => loadModels());

/**
 * Fetch the frontier comparison snapshot (closed-source candidates + the
 * recency cutoff the hint algorithm applies). Built by the SAME refreshCache
 * that enriches the Go models, so it is always consistent with the
 * "replaces" hints on the models — never a second, divergent fetch.
 */
export const getFrontierCandidates = query(() => loadFrontierSnapshot());

/**
 * Docs↔API reconciliation report. Non-empty `unmatchedDocsRows` or
 * `pricedButUnlisted` means the catalog silently lost model(s).
 */
export const getCatalogAudit = query(() => loadCatalogAudit());
