import { query } from '$app/server';
import {
	loadModels,
	loadFrontierSnapshot,
	loadCatalogAudit,
	loadModelLifecycle
} from '$lib/server/models';

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
 * `pricedButUnlisted` means the catalog silently lost model(s). The
 * models.dev drift rows are applied at read time, so they stay fresh even
 * though the docs payload behind this call is cached for 24h.
 */
export const getCatalogAudit = query(() => loadCatalogAudit());

/**
 * The Go model lifecycle ledger (alive / deprecated / killed / drift) plus the
 * canonical benchmark index over the same universe. ADVISORY — it never
 * changes which models the catalog shows; it exists for `/debug`.
 */
export const getModelLifecycle = query(() => loadModelLifecycle());
