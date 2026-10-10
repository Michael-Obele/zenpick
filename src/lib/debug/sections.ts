import * as v from 'valibot';

/**
 * Debug-route URL state
 * ---------------------
 * The `/debug` page is the working surface for inspecting the enrichment
 * pipeline, so its tab and output format are driven by the URL. That makes
 * every view addressable — `/debug?section=benchmarks&format=md` — which is
 * exactly what an LLM agent (or `curl`, or the `tomoshi` tools) needs to pull
 * one slice of data as clean text without a JavaScript-capable client.
 *
 * Consumed by Runed's `useSearchParams` on the client and `validateSearchParams`
 * in the page load, so both sides parse the URL through one schema. Invalid or
 * missing values fall back to `overview` / `html`.
 */

/** The debug tabs, in display order. `id` is the `?section=` value. */
export const DEBUG_SECTIONS = [
	{ id: 'overview', label: 'Models Overview' },
	{ id: 'pricing', label: 'Pricing Matrix' },
	{ id: 'quota', label: 'Quota Matrix' },
	{ id: 'burn', label: 'Burn Details' },
	{ id: 'benchmarks', label: 'Benchmarks' },
	{ id: 'matching', label: 'Matching & Coverage' },
	{ id: 'migration', label: 'Migration Report' },
	{ id: 'compare', label: 'Compare Logic' },
	{ id: 'tags', label: 'Tag Report' },
	{ id: 'scenarios', label: 'Scenario Breakdown' },
	{ id: 'raw', label: 'Raw JSON' }
] as const;

export type DebugSection = (typeof DEBUG_SECTIONS)[number]['id'];

export const DEBUG_SECTION_IDS = DEBUG_SECTIONS.map((s) => s.id) as readonly DebugSection[];

/**
 * `html` renders the interactive components; `md` and `json` are the
 * machine-readable views served by `/debug/export` and rendered inline.
 */
export const DEBUG_FORMATS = ['html', 'md', 'json'] as const;
export type DebugFormat = (typeof DEBUG_FORMATS)[number];

export const debugSearchSchema = v.object({
	section: v.optional(v.fallback(v.picklist(DEBUG_SECTION_IDS), 'overview'), 'overview'),
	format: v.optional(v.fallback(v.picklist(DEBUG_FORMATS), 'html'), 'html')
});

export type DebugSearchParams = v.InferOutput<typeof debugSearchSchema>;

/** Human label for a section id (falls back to the id itself). */
export function sectionLabel(section: DebugSection): string {
	return DEBUG_SECTIONS.find((s) => s.id === section)?.label ?? section;
}
