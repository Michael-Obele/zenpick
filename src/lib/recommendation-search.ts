import * as v from 'valibot';

/**
 * Recommendation funnel URL state
 * --------------------------------
 * The calculator exposes a typed, schema-validated URL state so users can:
 *   1. Share a recommendation link with their assumptions baked in.
 *   2. Refresh the page without losing their current selection.
 *
 * The schema is consumed by Runed's `useSearchParams` hook — every invalid
 * or missing URL value gracefully falls back to the documented defaults.
 */

const RECOMMEND_SCENARIOS = [
	'coding',
	'agentic',
	'competitive',
	'brainstorming',
	'budget',
	'frontend'
] as const;

const scenarioSchema = v.union([v.literal(''), v.picklist(RECOMMEND_SCENARIOS)]);

export const recommendationSearchSchema = v.object({
	recommend: v.optional(v.fallback(v.boolean(), true), true),
	tokens: v.optional(v.fallback(v.number(), 50_000), 50_000),
	cached: v.optional(v.fallback(v.number(), 50), 50),
	scenario: v.optional(v.fallback(scenarioSchema, ''), ''),
	model: v.optional(v.fallback(v.string(), ''), '')
});

export type RecommendationSearchParams = v.InferOutput<typeof recommendationSearchSchema>;

export const DEFAULT_RECOMMENDATION_PARAMS: RecommendationSearchParams = {
	recommend: true,
	tokens: 50_000,
	cached: 50,
	scenario: '',
	model: ''
};

export const RECOMMENDATION_SCENARIO_VALUES = RECOMMEND_SCENARIOS;
