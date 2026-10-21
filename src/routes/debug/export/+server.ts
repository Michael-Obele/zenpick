import {
	loadModels,
	loadFrontierSnapshot,
	loadCatalogAudit,
	loadModelLifecycle
} from '$lib/server/models';
import { contentTypeFor, exportSection } from '$lib/debug/export';
import { debugSearchSchema } from '$lib/debug/sections';
import { validateSearchParams } from 'runed/kit';
import type { RequestHandler } from './$types';

const EMPTY_LIFECYCLE = { rows: [], canonicalByModel: [], benchmarks: [], builtAt: null };

/** Log and degrade — an advisory source never breaks the export. */
function advisoryFailure<T>(name: string, empty: T): (e: unknown) => T {
	return (e: unknown) => {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[debug/export] ${name} unavailable:`, msg);
		return empty;
	};
}

/**
 * Machine-readable export of one debug tab.
 *
 *   GET /debug/export?section=benchmarks&format=md
 *   GET /debug/export?section=pricing&format=json
 *
 * Renders the SAME data as the interactive `/debug` page but as Markdown or
 * JSON with the correct content type — a clean one-URL-per-slice interface for
 * LLM agents, `curl`, and the `tomoshi` tools, with `cache-control: no-store`
 * so a fetch always reflects the current in-memory catalog. `format=html`
 * (or an unknown format) is treated as `md`, since this endpoint only ever
 * serves text.
 */
export const GET: RequestHandler = async ({ url }) => {
	const { data } = validateSearchParams(url, debugSearchSchema);
	const format = data.format === 'html' ? 'md' : data.format;

	const [models, frontierSnapshot, catalogAudit, lifecycle] = await Promise.all([
		loadModels(),
		loadFrontierSnapshot(),
		loadCatalogAudit(),
		// Advisory: an export of another section must still work when the
		// history sweep is down. The canonical benchmark rows come from this
		// same report (`lifecycle.benchmarks`) — a second `models.json` fetch +
		// index build would be paid on every request to produce data the
		// lifecycle already carries, so there is deliberately no separate
		// loader. On a failed sweep the benchmark table degrades to empty too.
		loadModelLifecycle().catch(advisoryFailure('lifecycle', EMPTY_LIFECYCLE))
	]);

	const body = exportSection(data.section, format, {
		models,
		frontierSnapshot,
		catalogAudit,
		lifecycle,
		benchmarks: lifecycle.benchmarks
	});
	return new Response(body, {
		headers: { 'content-type': contentTypeFor(format), 'cache-control': 'no-store' }
	});
};
