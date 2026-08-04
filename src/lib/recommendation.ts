import type { GoModel, ModelPricing, ScenarioScores } from '$lib/types/models';

/**
 * Recommendation funnel ranking
 * -----------------------------
 * Pure, deterministic ranking over enriched `GoModel` data. Used by
 * the homepage recommendation card to suggest a best-fit model for
 * the user's workload assumptions.
 *
 * Weights (from the funnel design doc):
 *   - 45% scenario fit
 *   - 30% quota capacity (estimated requests per 5-hour window)
 *   - 25% benchmark quality
 *
 * The function never throws on missing data; models with insufficient
 * pricing are ranked conservatively. The returned score is rounded to
 * one decimal so URL/snapshot comparisons stay stable.
 */

export type RecommendationScenario = keyof ScenarioScores;

export interface RecommendationOptions {
	/** Average tokens per request (input+output+cached mix, same shape as the calculator). */
	tokens: number;
	/** Cached-read percentage, 0..90 — only applied when the model has cached pricing. */
	cachedPct: number;
	/** Optional task scenario. When omitted, a balanced default fit is used. */
	scenario?: RecommendationScenario;
}

export interface RecommendationResult {
	model: GoModel;
	score: number;
	rationale: string;
}

const WEIGHT_FIT = 0.45;
const WEIGHT_CAPACITY = 0.3;
const WEIGHT_QUALITY = 0.25;

/** Default scenario blend when none is selected — favors well-rounded models. */
const DEFAULT_FIT_KEYS: RecommendationScenario[] = ['coding', 'agentic', 'brainstorming'];

/** Clamp a number into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Normalize `value` from the [min, max] range into 0..100. Safe for collapsed ranges. */
function normalize(value: number, min: number, max: number): number {
	if (!Number.isFinite(value) || max <= min) return 0;
	return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

/**
 * Estimate cost per request for a model using the same 70/15 input/output
 * split as the homepage calculator. Cached reads are applied when the
 * model advertises a cached-read rate. Returns `null` for unusable pricing.
 */
function costPerRequest(pricing: ModelPricing, tokens: number, cachedPct: number): number | null {
	if (pricing.inputPricePerM == null || pricing.outputPricePerM == null) return null;
	if (tokens <= 0) return null;
	const inputTokens = tokens * 0.7;
	const outputTokens = tokens * 0.15;
	const hasCached = pricing.cachedReadPerM != null;
	const effectiveCached = hasCached ? cachedPct : 0;
	const cachedInputTokens = Math.round(inputTokens * (effectiveCached / 100));
	const uncachedInput = inputTokens - cachedInputTokens;
	const cachedRate = pricing.cachedReadPerM ?? pricing.inputPricePerM;
	return (
		(uncachedInput * pricing.inputPricePerM +
			cachedInputTokens * cachedRate +
			outputTokens * pricing.outputPricePerM) /
		1_000_000
	);
}

/** Estimate requests per 5-hour window using the official $12 limit. */
function requestsPer5h(pricing: ModelPricing, tokens: number, cachedPct: number): number {
	const cost = costPerRequest(pricing, tokens, cachedPct);
	if (cost == null || cost <= 0) return 0;
	return Math.floor(12 / cost);
}

/** Average available benchmark fields, skipping nulls. Returns 0..100. */
function benchmarkQuality(model: GoModel): number {
	const fields: Array<number | null> = [
		model.benchmarks.coding,
		model.benchmarks.reasoning,
		model.benchmarks.math,
		model.benchmarks.sweBenchVerified,
		model.benchmarks.designElo != null ? model.benchmarks.designElo / 10 : null,
		model.benchmarks.codeArena != null ? model.benchmarks.codeArena / 10 : null
	];
	const usable = fields.filter((v): v is number => v != null && Number.isFinite(v));
	if (usable.length === 0) return 0;
	// Benchmark fields are on different scales; clamp to a sane ceiling.
	const sum = usable.reduce((acc, v) => acc + Math.min(100, v), 0);
	return sum / usable.length;
}

/** Pick the scenario fit used for ranking. */
function scenarioFit(model: GoModel, scenario?: RecommendationScenario): number {
	if (scenario && typeof model.scenarioScores[scenario] === 'number') {
		return model.scenarioScores[scenario];
	}
	const total = DEFAULT_FIT_KEYS.reduce((acc, key) => acc + (model.scenarioScores[key] ?? 0), 0);
	return total / DEFAULT_FIT_KEYS.length;
}

/**
 * Rank every model in the candidate set, then return the highest-scoring
 * entry with a short rationale. Returns `null` for an empty list.
 */
export function recommendModel(
	models: GoModel[],
	options: RecommendationOptions
): RecommendationResult | null {
	if (!Array.isArray(models) || models.length === 0) return null;
	const { tokens, cachedPct, scenario } = options;

	// Pass 1 — compute raw capacity per model.
	const capacities = models.map((m) => ({
		model: m,
		capacity: requestsPer5h(m.pricing, tokens, cachedPct)
	}));
	const maxCapacity = Math.max(...capacities.map((c) => c.capacity), 0);

	// Pass 2 — combine weighted signals.
	const ranked = capacities.map(({ model, capacity }) => {
		const fit = scenarioFit(model, scenario);
		const fitScore = clamp(fit, 0, 100);
		const capacityScore = normalize(capacity, 0, maxCapacity);
		const qualityScore = clamp(benchmarkQuality(model), 0, 100);
		const score =
			fitScore * WEIGHT_FIT + capacityScore * WEIGHT_CAPACITY + qualityScore * WEIGHT_QUALITY;
		return { model, score, capacity, fit, qualityScore };
	});

	// Deterministic order: score desc, then name asc for ties.
	ranked.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.model.name.localeCompare(b.model.name);
	});

	const winner = ranked[0];
	const roundedScore = Math.round(winner.score * 10) / 10;
	const scenarioLabel = scenario ? humanizeScenario(scenario) : 'your workload';
	const requestsRounded = winner.capacity.toLocaleString();
	const rationale =
		winner.capacity > 0
			? `Strong fit for ${scenarioLabel} with approximately ${requestsRounded} requests per 5-hour window at your workload.`
			: `Strong fit for ${scenarioLabel} at your workload. Quota estimate unavailable with current pricing.`;

	return {
		model: winner.model,
		score: roundedScore,
		rationale
	};
}

function humanizeScenario(scenario: RecommendationScenario): string {
	switch (scenario) {
		case 'brainstorming':
			return 'brainstorming';
		case 'coding':
			return 'coding';
		case 'competitive':
			return 'competitive tasks';
		case 'agentic':
			return 'agentic work';
		case 'budget':
			return 'budget-friendly use';
		case 'frontend':
			return 'frontend work';
	}
}
