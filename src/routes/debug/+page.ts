import { getModels, getFrontierCandidates, getCatalogAudit } from '$lib/remote/models.remote';
import { validateSearchParams } from 'runed/kit';
import { debugSearchSchema } from '$lib/debug/sections';
import type { PageLoad } from './$types';

/**
 * Debug page load
 * ---------------
 * `validateSearchParams` (runed's server-side pairing with `useSearchParams`)
 * validates `?section=` / `?format=` through the same schema the client uses,
 * and makes this load re-run only when one of those schema params changes.
 * Returning the validated pair means the server HTML already reflects the URL,
 * so `/debug?section=pricing&format=md` is fully rendered without JavaScript —
 * the whole point for LLM agents and `curl`.
 */
export const load: PageLoad = async ({ url }) => {
	const { data } = validateSearchParams(url, debugSearchSchema);
	const [models, frontierSnapshot, catalogAudit] = await Promise.all([
		getModels(),
		getFrontierCandidates(),
		getCatalogAudit()
	]);
	return {
		models,
		frontierSnapshot,
		catalogAudit,
		section: data.section,
		format: data.format
	};
};
