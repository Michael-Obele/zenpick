import { loadModels, loadFrontierSnapshot, loadCatalogAudit } from '$lib/server/models';
import { contentTypeFor, exportSection } from '$lib/debug/export';
import { debugSearchSchema } from '$lib/debug/sections';
import { validateSearchParams } from 'runed/kit';
import type { RequestHandler } from './$types';

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

	const [models, frontierSnapshot, catalogAudit] = await Promise.all([
		loadModels(),
		loadFrontierSnapshot(),
		loadCatalogAudit()
	]);

	const body = exportSection(data.section, format, { models, frontierSnapshot, catalogAudit });
	return new Response(body, {
		headers: { 'content-type': contentTypeFor(format), 'cache-control': 'no-store' }
	});
};
