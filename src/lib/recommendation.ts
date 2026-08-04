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
 *   - 30% quota capacity (requests per 5-hour window)
 *   - 25% benchmark quality
 *
 * Three design rules keep the ranking honest across the whole catalog:
 *
 * 1. **Workload-aware capacity** — requests per 5-hour window are derived
 *    from the user's assumptions (avg tokens per request + cached-read %).
 *    When OpenCode publishes usage-limit counts they calibrate the estimate:
 *    the published number was measured at a fixed reference workload, so we
 *    apply the same workload ratio to the user's numbers. The sliders stay
 *    meaningful while preserving the ground-truth correction for models
 *    whose price under- or over-states real burn.
 *
 * 2. **Log-scale capacity** — capacity is normalized on a fixed log scale
 *    (1 → 0, 1000 requests/5h → 100) instead of linearly against the
 *    cheapest model. A 10× price difference no longer crushes every other
 *    signal, so the recommendation reacts to scenario and quality instead
 *    of always defaulting to the cheapest model.
 *
 * 3. **Absolute fit & quality** — scenario fit and benchmark quality keep
 *    their 0–100 meaning (no min-max across the catalog), so a stronger
 *    model wins by its real margin instead of a frontier model landslide
 *    that would otherwise hand every scenario to the same premium pick.
 *
 * 4. **Workload-scaled weights** — at the reference workload the blend is
 *    the design-doc 45/30/25; above it, capacity weight grows (up to 65%)
 *    so heavy requests let burn rate decide while light requests let fit
 *    and quality decide.
 *
 * The function never throws on missing data; models with insufficient
 * pricing are ranked conservatively. Scores are rounded to one decimal so
 * URL/snapshot comparisons stay stable.
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

/** Ranked shortlist — `top` is best-fit first; `winner` aliases `top[0]`. */
export interface RecommendationReport {
	top: RecommendationResult[];
	winner: RecommendationResult;
}

const WEIGHT_FIT = 0.45;
const WEIGHT_CAPACITY = 0.3;
const WEIGHT_QUALITY = 0.25;

/** Capacity weight ceiling — burn rate can never fully override fit+quality. */
const CAPACITY_WEIGHT_MAX = 0.65;

/** Fixed log-scale anchors for capacity: 1 request/5h → 0, 1000 requests/5h → 100. */
const CAPACITY_ANCHOR_MIN = 1;
const CAPACITY_ANCHOR_MAX = 1000;

/** How many ranked results to surface in the shortlist. */
const SHORTLIST_SIZE = 3;

/**
 * Reference workload used to calibrate published quota limits to the user's
 * assumptions. Mirrors the funnel URL defaults (50K tokens, 50% cached).
 * Exported so the compare page's smart defaults anchor to the same workload.
 */
export const REFERENCE_TOKENS = 50_000;
export const REFERENCE_CACHED_PCT = 50;

/** Default scenario blend when none is selected — favors well-rounded models. */
const DEFAULT_FIT_KEYS: RecommendationScenario[] = ['coding', 'agentic', 'brainstorming'];

/**
 * Workload-scaled blend weights.
 *
 * At the reference workload the design-doc weights apply (45/30/25). Above
 * it, capacity matters more: each 10× in tokens adds up to 35 points of
 * weight (capped at 65%), and fit/quality renormalize proportionally.
 * Heavy requests make burn rate the deciding factor; light requests let
 * fit and quality decide.
 */
function workloadWeights(tokens: number): { fit: number; capacity: number; quality: number } {
	const growth =
		tokens <= REFERENCE_TOKENS
			? 0
			: Math.min(
					CAPACITY_WEIGHT_MAX - WEIGHT_CAPACITY,
					0.35 * Math.log10(tokens / REFERENCE_TOKENS)
				);
	const wCap = WEIGHT_CAPACITY + growth;
	const rest = 1 - wCap;
	const fitShare = WEIGHT_FIT / (WEIGHT_FIT + WEIGHT_QUALITY);
	return {
		fit: fitShare * rest,
		capacity: wCap,
		quality: (1 - fitShare) * rest
	};
}

/** Clamp a number into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
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

/**
 * Estimate requests per 5-hour window from pricing for the user's workload.
 * Fallback only — published usage limits are preferred when available.
 */
function estimateRequestsPer5h(pricing: ModelPricing, tokens: number, cachedPct: number): number {
	const cost = costPerRequest(pricing, tokens, cachedPct);
	if (cost == null || cost <= 0) return 0;
	return Math.floor(12 / cost);
}

/**
 * Requests per 5-hour window for the user's workload.
 *
 * Starts from the user's token mix and cached-read rate, then calibrates
 * against OpenCode's published usage limit: the published count was
 * measured at the reference workload, so the same workload ratio is
 * applied to the user's numbers. This keeps both sliders meaningful while
 * preserving the ground-truth correction for models whose price-based
 * estimate is systematically off (e.g. Kimi K3 burns ~12× slower than its
 * price suggests).
 *
 * Exported for the compare page, which uses it as the catalog-wide
 * "Best value" anchor at the reference workload.
 */
export function capacityPer5h(model: GoModel, tokens: number, cachedPct: number): number {
	const userEstimate = estimateRequestsPer5h(model.pricing, tokens, cachedPct);
	const official = model.quota.requestsPer5h;
	if (!(official > 0)) return userEstimate;
	const refEstimate = estimateRequestsPer5h(model.pricing, REFERENCE_TOKENS, REFERENCE_CACHED_PCT);
	if (refEstimate <= 0) return official;
	// At the reference workload this collapses to the published number;
	// heavier or lighter workloads scale it proportionally.
	return userEstimate * (official / refEstimate);
}

/**
 * Log-scale capacity score on fixed anchors: 1 request/5h → 0, 1000 → 100.
 * Each 10× in capacity adds ~33 points, so cheap models stay competitive
 * without silencing every other signal.
 */
function capacityScore(capacity: number): number {
	if (!Number.isFinite(capacity) || capacity <= 0) return 0;
	const logFloor = Math.log10(CAPACITY_ANCHOR_MIN);
	const logCeil = Math.log10(CAPACITY_ANCHOR_MAX);
	const logVal = Math.log10(capacity);
	return clamp(((logVal - logFloor) / (logCeil - logFloor)) * 100, 0, 100);
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
 * Rank every model in the candidate set and return a shortlist of the best
 * fits with short rationales. Returns `null` for an empty list.
 */
export function recommendModel(
	models: GoModel[],
	options: RecommendationOptions
): RecommendationReport | null {
	if (!Array.isArray(models) || models.length === 0) return null;
	const { tokens, cachedPct, scenario } = options;

	// Pass 1 — raw signals per model: capacity, fit, benchmark quality.
	const rows = models.map((model) => ({
		model,
		capacity: capacityPer5h(model, tokens, cachedPct),
		fit: scenarioFit(model, scenario),
		quality: benchmarkQuality(model)
	}));

	// Pass 2 — combine weighted signals. Fit and quality keep their absolute
	// 0–100 meaning; capacity is absolute on the fixed log scale, and its
	// weight grows with the workload so burn rate decides heavy requests.
	const w = workloadWeights(tokens);
	const ranked = rows.map(({ model, capacity, fit, quality }) => {
		const fitScore = clamp(fit, 0, 100);
		const qualityScore = clamp(quality, 0, 100);
		const capScore = capacityScore(capacity);
		const score = fitScore * w.fit + capScore * w.capacity + qualityScore * w.quality;
		return { model, score, capacity, capacitySource: capacitySourceOf(model) };
	});

	// Deterministic order: score desc, then name asc for ties.
	ranked.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.model.name.localeCompare(b.model.name);
	});

	const scenarioLabel = scenario ? humanizeScenario(scenario) : 'your workload';
	const winnerPhrase = scenario ? `Strong ${scenarioLabel} fit` : 'Strong fit for your workload';
	const top = ranked.slice(0, SHORTLIST_SIZE).map((row, index) => {
		const hasCapacity = row.capacity > 0;
		const requests = row.capacity.toLocaleString();
		const capacityNote = capacitySourceNote(row.capacitySource);
		const rationale = !hasCapacity
			? `${winnerPhrase} at your workload. Quota estimate unavailable with current pricing.`
			: index === 0
				? `${winnerPhrase} with approximately ${requests} requests per 5-hour window at your workload${capacityNote}.`
				: `Strong alternative for ${scenarioLabel} with approximately ${requests} requests per 5-hour window.`;
		return {
			model: row.model,
			score: Math.round(row.score * 10) / 10,
			rationale
		};
	});

	return { top, winner: top[0] };
}

/** Where a model's capacity estimate came from. */
type CapacitySource = 'calibrated' | 'official' | 'estimated';

function capacitySourceOf(model: GoModel): CapacitySource {
	if (model.quota.requestsPer5h > 0) {
		const ref = estimateRequestsPer5h(model.pricing, REFERENCE_TOKENS, REFERENCE_CACHED_PCT);
		return ref > 0 ? 'calibrated' : 'official';
	}
	return 'estimated';
}

function capacitySourceNote(source: CapacitySource): string {
	switch (source) {
		case 'calibrated':
			return ' — OpenCode quota limits scaled to your workload';
		case 'official':
			return ' — based on OpenCode’s published quota limits';
		case 'estimated':
			return ' — estimated from current pricing and your workload';
	}
}

function humanizeScenario(scenario: RecommendationScenario): string {
	switch (scenario) {
		case 'brainstorming':
			return 'brainstorming';
		case 'coding':
			return 'coding';
		case 'agentic':
			return 'agentic work';
		case 'budget':
			return 'budget-friendly use';
		case 'frontend':
			return 'frontend work';
	}
}
