import * as v from 'valibot';

/**
 * Compare-page URL state (shareable deep links)
 * ----------------------------------------------
 * Consumed by Runed's `useSearchParams` hook. Invalid or missing values
 * gracefully fall back to the defaults, and the empty `models` value is
 * omitted from the URL (showDefaults: false) so a cleared comparison
 * shares a clean link.
 *
 * The value is a comma-separated list of model IDs, e.g. `?models=a,b,c`.
 * ID validation against the live catalog happens in the compare page —
 * the schema only guarantees the shape.
 */
export const compareSearchSchema = v.object({
	models: v.optional(v.fallback(v.string(), ''), '')
});

export type CompareSearchParams = v.InferOutput<typeof compareSearchSchema>;

export const DEFAULT_COMPARE_PARAMS: CompareSearchParams = {
	models: ''
};
