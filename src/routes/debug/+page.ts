import {
	getModels,
	getFrontierCandidates,
	getCatalogAudit,
	getModelLifecycle
} from '$lib/remote/models.remote';
import { validateSearchParams } from 'runed/kit';
import { debugSearchSchema } from '$lib/debug/sections';
import type { ModelLifecycleReport } from '$lib/server/models';
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
/** An empty report — what a failed lifecycle sweep degrades to. */
const EMPTY_LIFECYCLE_REPORT: ModelLifecycleReport = {
	rows: [],
	canonicalByModel: [],
	benchmarks: [],
	builtAt: null
};

/** Log and degrade — an advisory source never takes the page down silently. */
function reportAdvisoryFailure<T>(name: string, empty: T): (e: unknown) => T {
	return (e: unknown) => {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[debug] ${name} unavailable:`, msg);
		return empty;
	};
}

export const load: PageLoad = async ({ url }) => {
	const { data } = validateSearchParams(url, debugSearchSchema);
	const [models, frontierSnapshot, catalogAudit, lifecycle] = await Promise.all([
		getModels(),
		getFrontierCandidates(),
		getCatalogAudit(),
		// ADVISORY: a failed history sweep must not take the whole debug page
		// down with it, so it degrades to an empty result — and says so in the
		// UI rather than showing a silent all-clear.
		//
		// Canonical benchmarks are NOT fetched separately here. The lifecycle
		// report already carries them (`lifecycle.benchmarks`), and that is what
		// the HTML section renders, so a second `models.json` fetch + index build
		// would be paid by all 12 sections and discarded. `/debug/export` reads
		// the same field for the same reason — there is only one source.
		getModelLifecycle().catch(reportAdvisoryFailure('lifecycle', EMPTY_LIFECYCLE_REPORT))
	]);
	return {
		models,
		frontierSnapshot,
		catalogAudit,
		lifecycle,
		// The export dataset's `benchmarks`, projected from the lifecycle report
		// so `section=lifecycle&format=md|json` still carries the benchmark table.
		benchmarks: lifecycle.benchmarks,
		section: data.section,
		format: data.format
	};
};
