import type {
	LLMStatsModel,
	LLMStatsRanking,
	ModelBenchmarks,
	ModelSpeed,
	ScenarioScores,
	BurnDetails,
	ModelPricing
} from '$lib/types/models';
import { matchRanking } from './benchmarks';

interface ScenarioInputs {
	goId: string;
	pricing: ModelPricing;
	benchmarks: ModelBenchmarks;
	burnDetails: BurnDetails;
	speed: ModelSpeed | null;
	model: LLMStatsModel | null;
	codingRankings: LLMStatsRanking[];
	reasoningRankings: LLMStatsRanking[];
	mathRankings: LLMStatsRanking[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function normalize(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(1, Math.max(0, value / max));
}

/** Get rank position using strict matchRanking (convention map + Levenshtein). */
function findRankPct(goId: string, rankings: LLMStatsRanking[]): number {
	if (rankings.length === 0) return 0;
	const matched = matchRanking(goId, rankings);
	if (!matched) return 0;
	const idx = rankings.findIndex((r) => r.model_name === matched.ranking.model_name);
	if (idx < 0) return 0;
	return Math.max(0, 1 - idx / rankings.length);
}

/** Compute a burn percentile by comparing this model's score to all other models. */
function burnPercentile(burnScore: number, allBurnScores: number[]): number {
	if (allBurnScores.length <= 1) return 0.5;
	const worse = allBurnScores.filter((s) => s < burnScore).length;
	return worse / (allBurnScores.length - 1);
}

// ─── Two-axis scoring ─────────────────────────────────────────────────

function scoreQualityCoding(codingRankPct: number, benchmarks: ModelBenchmarks): number {
	// Blend: coding rank percentile (70%) + raw benchmarks for tiebreaking (30%)
	let score = codingRankPct * 0.7;
	let weight = 0.7;
	if (benchmarks.sweBenchVerified != null) {
		score += normalize(benchmarks.sweBenchVerified, 60) * 0.2;
		weight += 0.2;
	}
	if (benchmarks.codeArena != null) {
		score += normalize(benchmarks.codeArena, 80) * 0.1;
		weight += 0.1;
	}
	return weight > 0 ? score / weight : 0;
}

function scoreFitCoding(speed: ModelSpeed | null, burnDetails: BurnDetails): number {
	let score = 0;
	let weight = 0;
	if (speed?.tokensPerSecond) {
		score += normalize(speed.tokensPerSecond, 200) * 0.5;
		weight += 0.5;
	}
	if (burnDetails.band != null) {
		score += normalize(burnDetails.score, 100) * 0.5;
		weight += 0.5;
	}
	return weight > 0 ? score / weight : 0.5;
}

function scoreQualityReasoning(reasoningRankPct: number): number {
	return reasoningRankPct;
}

function scoreFitBrainstorming(ctx: number, burnDetails: BurnDetails): number {
	let score = 0;
	let weight = 0;
	score += normalize(ctx, 1_000_000) * 0.6;
	weight += 0.6;
	if (burnDetails.band != null) {
		const burnFit = burnDetails.score >= 40 && burnDetails.score < 80 ? 1 : 0.5;
		score += burnFit * 0.4;
		weight += 0.4;
	}
	return weight > 0 ? score / weight : 0.5;
}

function scoreQualityCompetitive(benchmarks: ModelBenchmarks): number {
	let score = 0;
	let weight = 0;
	if (benchmarks.sweBenchVerified != null) {
		score += normalize(benchmarks.sweBenchVerified, 60) * 0.6;
		weight += 0.6;
	}
	if (benchmarks.codeArena != null) {
		score += normalize(benchmarks.codeArena, 80) * 0.4;
		weight += 0.4;
	}
	return weight > 0 ? score / weight : 0;
}

function scoreFitCompetitive(codingRankPct: number): number {
	return 0.5 + codingRankPct * 0.5;
}

function scoreQualityAgentic(codingRankPct: number, benchmarks: ModelBenchmarks): number {
	return scoreQualityCoding(codingRankPct, benchmarks);
}

function scoreFitAgentic(
	ctx: number,
	speed: ModelSpeed | null,
	model: LLMStatsModel | null
): number {
	let score = 0;
	let weight = 0;
	score += normalize(Math.min(ctx, 1_000_000), 1_000_000) * 0.5;
	weight += 0.5;
	if (speed?.tokensPerSecond) {
		score += normalize(speed.tokensPerSecond, 200) * 0.3;
		weight += 0.3;
	}
	if (model?.inference?.supports_tools != null) {
		score += (model.inference.supports_tools ? 1 : 0.3) * 0.2;
		weight += 0.2;
	}
	return weight > 0 ? score / weight : 0.3;
}

function scoreQualityBudget(pricing: ModelPricing, burnDetails: BurnDetails): number {
	let score = 0;
	let weight = 0;
	if (pricing.inputPricePerM != null && pricing.outputPricePerM != null) {
		const totalPrice = pricing.inputPricePerM + pricing.outputPricePerM;
		score += Math.max(0, 1 - totalPrice / 10) * 0.4;
		weight += 0.4;
	}
	// Use burn score normalized to 100 (score 51/100 = 0.51)
	if (burnDetails.band != null) {
		score += normalize(burnDetails.score, 100) * 0.6;
		weight += 0.6;
	}
	return weight > 0 ? score / weight : 0;
}

function scoreFitBudget(): number {
	return 1.0;
}

// ─── Public API ───────────────────────────────────────────────────────

export function computeScenarioScores(inputs: ScenarioInputs): ScenarioScores {
	const codingRankPct = findRankPct(inputs.goId, inputs.codingRankings);
	const reasoningRankPct = findRankPct(inputs.goId, inputs.reasoningRankings);

	return {
		coding: computeScore(
			scoreQualityCoding(codingRankPct, inputs.benchmarks),
			scoreFitCoding(inputs.speed, inputs.burnDetails)
		),
		brainstorming: computeScore(
			scoreQualityReasoning(reasoningRankPct),
			scoreFitBrainstorming(inputs.model?.context_window ?? 128_000, inputs.burnDetails)
		),
		competitive: computeScore(
			scoreQualityCompetitive(inputs.benchmarks),
			scoreFitCompetitive(codingRankPct)
		),
		agentic: computeScore(
			scoreQualityAgentic(codingRankPct, inputs.benchmarks),
			scoreFitAgentic(inputs.model?.context_window ?? 128_000, inputs.speed, inputs.model)
		),
		budget: computeScore(scoreQualityBudget(inputs.pricing, inputs.burnDetails), scoreFitBudget())
	};
}

function computeScore(quality: number, fit: number): number {
	return Math.round(quality * fit * 100);
}
