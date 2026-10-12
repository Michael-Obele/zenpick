import * as v from 'valibot';
import type { ReturnUseSearchParams } from 'runed/kit';
import { NEEDS } from '$lib/needs';
import { recommendationSearchSchema } from '$lib/recommendation-search';

/**
 * Model-table URL state (deep links into the catalog)
 * ---------------------------------------------------
 * The "Compare Models" table reads everything it shows from the URL, so a
 * link can carry the whole question — "which model is cheapest?" is
 * `/?need=cheapest`, "which is best at coding?" is `/?need=coding`. The URL
 * is the single source of truth for DISPLAY (derived, zero effects), and
 * every mutation is a plain write to `params`.
 *
 * Keys:
 *   q    — free-text search (model name, provider, tags, capabilities)
 *   need — a NEEDS leaderboard slug, e.g. `cheapest`, `coding`, `vision`
 *
 * Invalid or missing values fall back to the defaults, and default values are
 * omitted from the URL (`showDefaults` is off), so clearing the search leaves
 * a clean link. `?scenario=` is deliberately NOT here: it already belongs to
 * the quota calculator (see `recommendation-search.ts`) and the two would
 * fight over one key.
 *
 * ── One hook per page ────────────────────────────────────────────────
 * `homeSearchSchema` is what the homepage passes to `useSearchParams`, and
 * the resulting object is handed to the calculator as a prop. Runed's hook
 * navigates to `?` + its OWN params, so a second instance on the same page
 * would rewrite the query string from its own keys alone and silently drop
 * the other one's parameters.
 */

/** Leaderboard slugs accepted by `?need=`, derived from the NEEDS registry. */
const NEED_SLUGS = NEEDS.map((n) => n.slug) as [string, ...string[]];

/** Empty (no leaderboard) or one of the registered slugs. */
const needSchema = v.union([v.literal(''), v.picklist(NEED_SLUGS)]);

export const tableSearchSchema = v.object({
	q: v.optional(v.fallback(v.string(), ''), ''),
	need: v.optional(v.fallback(needSchema, ''), '')
});

export type TableSearchParams = v.InferOutput<typeof tableSearchSchema>;

export const DEFAULT_TABLE_PARAMS: TableSearchParams = {
	q: '',
	need: ''
};

/** Everything the homepage keeps in the URL: the table's keys + the calculator's. */
export const homeSearchSchema = v.object({
	...tableSearchSchema.entries,
	...recommendationSearchSchema.entries
});

export type HomeSearchParams = v.InferOutput<typeof homeSearchSchema>;

/** The live params object the homepage owns and passes to its children. */
export type HomeSearchParamsHook = ReturnUseSearchParams<typeof homeSearchSchema>;
