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
 *
 * `scenario` is the optional task focus ("scenario crown"): it must be one
 * of the recommendation scenarios or empty (Any task), mirroring the
 * recommendation funnel schema so both pages share the same vocabulary.
 */
const COMPARE_SCENARIOS = ['coding', 'agentic', 'brainstorming', 'budget', 'frontend'] as const;

const compareScenarioSchema = v.union([v.literal(''), v.picklist(COMPARE_SCENARIOS)]);

export const compareSearchSchema = v.object({
	models: v.optional(v.fallback(v.string(), ''), ''),
	scenario: v.optional(v.fallback(compareScenarioSchema, ''), '')
});

export type CompareSearchParams = v.InferOutput<typeof compareSearchSchema>;

export const DEFAULT_COMPARE_PARAMS: CompareSearchParams = {
	models: '',
	scenario: ''
};

/** Scenario values accepted by the compare URL (empty string excluded). */
export const COMPARE_SCENARIO_VALUES = COMPARE_SCENARIOS;
