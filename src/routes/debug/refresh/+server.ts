import { json } from '@sveltejs/kit';
import { revalidateModels } from '$lib/server/models';
import type { RequestHandler } from './$types';

/**
 * Force a fresh upstream rebuild for the debug page's "Refresh data" button.
 *
 * Unlike the operator `/api/revalidate` endpoint (which requires
 * `REVALIDATE_SECRET`), this is unauthenticated because it backs a control on
 * the debug page — a diagnostic surface whose whole job is to show data that
 * bypasses the 6h stale-while-revalidate window. It mutates only the per-
 * instance in-memory cache, and a rebuild is idempotent, so repeated calls are
 * safe (they cost upstream API calls, nothing more). Not linked from the
 * public site.
 */
export const POST: RequestHandler = async () => {
	const started = Date.now();
	const models = await revalidateModels();
	return json({
		ok: true,
		models: models.length,
		durationMs: Date.now() - started,
		at: new Date().toISOString()
	});
};
