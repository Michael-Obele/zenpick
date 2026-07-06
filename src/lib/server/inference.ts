/**
 * Algorithmic inference engine.
 * Generates "best for" tags, burn rates, migration hints, burnout tiers,
 * and quota estimates from raw LLM Stats + OpenCode Go data.
 * Zero manual curation — everything derived from benchmarks, pricing, and rankings.
 */

import { burnRateFromPrice, type BurnRate } from '$lib/burn';
import type {
	GoModel,
	LLMStatsModel,
	LLMStatsRanking,
	MigrationHint,
	ModelBenchmarks,
	ModelSpeed,
	ModelTag,
	ScenarioScores
} from '$lib/types/models';
import { goEndpointType, goEndpointUrl, goIdToName } from './opencode-go';
import { llmStatsModelUrl } from './llm-stats';

/** Enrich a Go model ID with LLM Stats data and algorithmic inference. */
export function inferModel(
	goId: string,
	llmStatsModel: LLMStatsModel | null,
	codingRankings: LLMStatsRanking[],
	reasoningRankings: LLMStatsRanking[],
	mathRankings: LLMStatsRanking[]
): GoModel {
	const name = goIdToName(goId);
	const pricing = inferPricing(goId, llmStatsModel);
	const quota = inferQuota(pricing);
	const burnRate = inferBurnRate(pricing);
	const benchmarks = inferBenchmarksForModel(name, goId, llmStatsModel, {
		codingRankings,
		reasoningRankings,
		mathRankings
	});
	const speed = inferSpeed(llmStatsModel);
	const tags = inferTags(goId, pricing, benchmarks, burnRate, speed, llmStatsModel, codingRankings);
	const migrationHints = inferMigrationHints(goId, pricing, benchmarks);
	const scenarioScores = inferScenarioScores({
		goId,
		pricing,
		benchmarks,
		burnRate,
		speed,
		model: llmStatsModel,
		codingRankings,
		reasoningRankings,
		mathRankings
	});

	return buildGoModel({
		goId,
		name,
		llmStatsModel,
		pricing,
		quota,
		burnRate,
		benchmarks,
		speed,
		tags,
		migrationHints,
		scenarioScores
	});
}

interface GoModelParts {
	goId: string;
	name: string;
	llmStatsModel: LLMStatsModel | null;
	pricing: ModelPricing;
	quota: GoModel['quota'];
	burnRate: BurnRate;
	benchmarks: ModelBenchmarks;
	speed: ModelSpeed | null;
	tags: ModelTag[];
	migrationHints: MigrationHint[];
	scenarioScores: ScenarioScores;
}

function buildGoModel(parts: GoModelParts): GoModel {
	const m = parts.llmStatsModel;
	return {
		id: parts.goId,
		name: parts.name,
		provider: m?.organization?.name ?? inferProvider(parts.goId),
		description: m?.description ?? '',
		openWeight: m?.open_weight ?? true,
		contextWindow: m?.context_window ?? inferContextWindow(parts.goId),
		releaseDate: m?.release_date ?? null,
		pricing: parts.pricing,
		quota: parts.quota,
		burnRate: parts.burnRate,
		tags: parts.tags,
		benchmarks: parts.benchmarks,
		speed: parts.speed,
		migrationHints: parts.migrationHints,
		scenarioScores: parts.scenarioScores,
		endpoint: goEndpointType(parts.goId),
		endpointUrl: goEndpointUrl(parts.goId),
		isNew: m === null,
		llmStatsUrl: m ? llmStatsModelUrl(m.id) : '',
		fetchedAt: Date.now()
	};
}

// ─── Pricing ────────────────────────────────────────────────────────────

interface ModelPricing {
	inputPricePerM: number;
	outputPricePerM: number;
	cachedReadPerM: number | null;
}

function inferPricing(goId: string, model: LLMStatsModel | null): ModelPricing {
	// Try LLM Stats provider data first
	if (model?.providers?.length) {
		const bestProvider = model.providers.find((p) => p.available && p.input_price_per_m != null);
		if (bestProvider) {
			return {
				inputPricePerM: bestProvider.input_price_per_m!,
				outputPricePerM: bestProvider.output_price_per_m ?? bestProvider.input_price_per_m! * 2.5,
				cachedReadPerM: null // LLM Stats doesn't expose cached pricing detail
			};
		}
	}

	// Fallback to known pricing from OpenCode docs (as of July 2026)
	const known: Record<string, ModelPricing> = {
		'deepseek-v4-pro': { inputPricePerM: 1.74, outputPricePerM: 3.48, cachedReadPerM: 0.0145 },
		'deepseek-v4-flash': { inputPricePerM: 0.14, outputPricePerM: 0.28, cachedReadPerM: 0.0028 },
		'glm-5.2': { inputPricePerM: 1.4, outputPricePerM: 4.4, cachedReadPerM: 0.26 },
		'glm-5.1': { inputPricePerM: 1.4, outputPricePerM: 4.4, cachedReadPerM: 0.26 },
		'kimi-k2.7-code': { inputPricePerM: 0.95, outputPricePerM: 4.0, cachedReadPerM: 0.19 },
		'kimi-k2.6': { inputPricePerM: 0.95, outputPricePerM: 4.0, cachedReadPerM: 0.16 },
		'mimo-v2.5': { inputPricePerM: 0.14, outputPricePerM: 0.28, cachedReadPerM: 0.0028 },
		'mimo-v2.5-pro': { inputPricePerM: 1.74, outputPricePerM: 3.48, cachedReadPerM: 0.0145 },
		'minimax-m3': { inputPricePerM: 0.3, outputPricePerM: 1.2, cachedReadPerM: 0.06 },
		'minimax-m2.7': { inputPricePerM: 0.3, outputPricePerM: 1.2, cachedReadPerM: 0.06 },
		'qwen3.7-max': { inputPricePerM: 2.5, outputPricePerM: 7.5, cachedReadPerM: 0.5 },
		'qwen3.7-plus': { inputPricePerM: 0.4, outputPricePerM: 1.6, cachedReadPerM: 0.04 },
		'qwen3.6-plus': { inputPricePerM: 0.5, outputPricePerM: 3.0, cachedReadPerM: 0.05 }
	};

	return known[goId] ?? { inputPricePerM: 1.0, outputPricePerM: 3.0, cachedReadPerM: null };
}

// ─── Quota Estimates ─────────────────────────────────────────────────────

function inferQuota(pricing: ModelPricing): GoModel['quota'] {
	// Estimate average tokens per request from known OpenCode patterns:
	// ~50% of tokens are cached reads (huge discount for most models),
	// ~700 input tokens + ~200 output tokens per typical coding request.
	const avgCostPerRequest = pricing.inputPricePerM * 0.0007 + pricing.outputPricePerM * 0.0002;

	if (avgCostPerRequest <= 0) {
		return { requestsPer5h: 0, requestsPerWeek: 0, requestsPerMonth: 0 };
	}

	return {
		requestsPer5h: Math.round(12 / avgCostPerRequest),
		requestsPerWeek: Math.round(30 / avgCostPerRequest),
		requestsPerMonth: Math.round(60 / avgCostPerRequest)
	};
}

// ─── Burn Rate ───────────────────────────────────────────────────────────

function inferBurnRate(pricing: ModelPricing): BurnRate {
	return burnRateFromPrice(pricing.inputPricePerM + pricing.outputPricePerM);
}

// ─── Rankings ────────────────────────────────────────────────────────────

function findRanking(modelName: string, rankings: LLMStatsRanking[]): LLMStatsRanking | null {
	const lowered = modelName.toLowerCase();
	return (
		rankings.find(
			(r) =>
				r.model_name.toLowerCase().includes(lowered) || lowered.includes(r.model_name.toLowerCase())
		) ?? null
	);
}

// ─── Benchmarks ──────────────────────────────────────────────────────────

interface RankingSets {
	codingRankings: LLMStatsRanking[];
	reasoningRankings: LLMStatsRanking[];
	mathRankings: LLMStatsRanking[];
}

function inferBenchmarksForModel(
	name: string,
	goId: string,
	model: LLMStatsModel | null,
	rankings: RankingSets
): ModelBenchmarks {
	const codingRank = findRanking(name, rankings.codingRankings);
	const reasoningRank = findRanking(name, rankings.reasoningRankings);
	const mathRank = findRanking(name, rankings.mathRankings);
	return buildBenchmarks(model, codingRank, reasoningRank, mathRank);
}

function buildBenchmarks(
	model: LLMStatsModel | null,
	codingRank: LLMStatsRanking | null,
	reasoningRank: LLMStatsRanking | null,
	mathRank: LLMStatsRanking | null
): ModelBenchmarks {
	const allScores = extractAllScores(model);
	const sweBenchKey = findScoreKey(allScores, 'swe-bench');
	const arenaKey = findScoreKey(allScores, 'code', 'arena');

	return {
		coding: codingRank?.score ?? null,
		reasoning: reasoningRank?.score ?? null,
		math: mathRank?.score ?? null,
		sweBenchVerified: sweBenchKey ? allScores[sweBenchKey] : null,
		codeArena: arenaKey ? allScores[arenaKey] : null,
		allScores
	};
}

function extractAllScores(model: LLMStatsModel | null): Record<string, number> {
	if (!model?.top_scores) return {};
	return { ...model.top_scores };
}

function findScoreKey(scores: Record<string, number>, ...needles: string[]): string | undefined {
	return Object.keys(scores).find((k) => {
		const lower = k.toLowerCase();
		return needles.every((n) => lower.includes(n));
	});
}

// ─── Speed ───────────────────────────────────────────────────────────────

function inferSpeed(model: LLMStatsModel | null): ModelSpeed | null {
	if (!model?.inference?.available) return null;
	return {
		tokensPerSecond:
			((model.inference as unknown as Record<string, unknown>).tokens_per_second as number) ?? 0,
		timeToFirstToken:
			((model.inference as unknown as Record<string, unknown>).time_to_first_token as number) ??
			null
	};
}

// ─── Tags ────────────────────────────────────────────────────────────────

function inferTags(
	goId: string,
	pricing: ModelPricing,
	benchmarks: ModelBenchmarks,
	burnRate: BurnRate,
	speed: ModelSpeed | null,
	model: LLMStatsModel | null,
	codingRankings: LLMStatsRanking[]
): ModelTag[] {
	const ctx = model?.context_window ?? 0;
	const tagBuilders = [
		() => codingTags(goId, benchmarks, codingRankings),
		() => competitiveTags(benchmarks),
		() => reasoningTags(benchmarks),
		() => mathTags(benchmarks),
		() => agenticTags(benchmarks, ctx),
		() => contextTags(ctx),
		() => budgetTags(burnRate),
		() => speedTags(speed),
		() => newModelTag(model)
	];

	const tags = tagBuilders.flatMap((build) => build());
	return dedupeTags(tags);
}

function codingTags(
	goId: string,
	benchmarks: ModelBenchmarks,
	rankings: LLMStatsRanking[]
): ModelTag[] {
	if (benchmarks.coding === null || benchmarks.coding <= 0) return [];
	const totalModels = rankings.length || 13;
	const rank = rankings.findIndex((r) => r.model_name.toLowerCase().includes(goId.toLowerCase()));
	if (rank < 0) return [];
	if (rank < Math.ceil(totalModels * 0.25)) {
		return [{ label: 'Top-tier coding', emoji: '💻', source: 'ranking' }];
	}
	if (rank < totalModels * 0.5) {
		return [{ label: 'Solid coding', emoji: '🔧', source: 'ranking' }];
	}
	return [];
}

function competitiveTags(benchmarks: ModelBenchmarks): ModelTag[] {
	if (benchmarks.sweBenchVerified !== null && benchmarks.sweBenchVerified > 50) {
		return [{ label: 'Competitive programming', emoji: '⚔️', source: 'computed' }];
	}
	if (benchmarks.codeArena && benchmarks.codeArena > 70) {
		return [{ label: 'Code Arena strong', emoji: '🏟️', source: 'computed' }];
	}
	return [];
}

function reasoningTags(benchmarks: ModelBenchmarks): ModelTag[] {
	if (benchmarks.reasoning !== null && benchmarks.reasoning > 0) {
		return [{ label: 'Strong reasoning', emoji: '🧠', source: 'ranking' }];
	}
	return [];
}

function mathTags(benchmarks: ModelBenchmarks): ModelTag[] {
	if (benchmarks.math !== null && benchmarks.math > 0) {
		return [{ label: 'Math & research', emoji: '📐', source: 'ranking' }];
	}
	return [];
}

function agenticTags(benchmarks: ModelBenchmarks, ctx: number): ModelTag[] {
	if (benchmarks.coding !== null && benchmarks.coding > 0 && ctx >= 500_000) {
		return [{ label: 'Agentic / autonomous', emoji: '🤖', source: 'computed' }];
	}
	return [];
}

function contextTags(ctx: number): ModelTag[] {
	if (ctx >= 500_000) {
		return [{ label: `${formatContext(ctx)} context`, emoji: '📚', source: 'context' }];
	}
	return [];
}

function budgetTags(burnRate: BurnRate): ModelTag[] {
	if (burnRate === 'slow') {
		return [
			{ label: 'Quota-friendly', emoji: '❄️', source: 'pricing' },
			{ label: 'High-volume budget', emoji: '⚡', source: 'pricing' }
		];
	}
	if (burnRate === 'fast') {
		return [{ label: 'Burns quota fast', emoji: '🔥', source: 'pricing' }];
	}
	return [];
}

function speedTags(speed: ModelSpeed | null): ModelTag[] {
	if (speed && speed.tokensPerSecond > 100) {
		return [{ label: 'Fast inference', emoji: '🚀', source: 'computed' }];
	}
	return [];
}

function newModelTag(model: LLMStatsModel | null): ModelTag[] {
	if (!model) {
		return [{ label: 'New — benchmarking', emoji: '🆕', source: 'computed' }];
	}
	return [];
}

function dedupeTags(tags: ModelTag[]): ModelTag[] {
	const seen = new Set<string>();
	return tags.filter((t) => {
		if (seen.has(t.label)) return false;
		seen.add(t.label);
		return true;
	});
}

interface ScenarioInputs {
	goId: string;
	pricing: ModelPricing;
	benchmarks: ModelBenchmarks;
	burnRate: BurnRate;
	speed: ModelSpeed | null;
	model: LLMStatsModel | null;
	codingRankings: LLMStatsRanking[];
	reasoningRankings: LLMStatsRanking[];
	mathRankings: LLMStatsRanking[];
}

function inferScenarioScores(inputs: ScenarioInputs): ScenarioScores {
	const { goId, pricing, benchmarks, burnRate, speed, model, codingRankings, reasoningRankings } =
		inputs;
	const totalModels = codingRankings.length || 13;
	const ctx = model?.context_window ?? inferContextWindow(goId);
	const quota = inferQuota(pricing);

	const ranks = {
		coding: findRank(goId, codingRankings),
		reasoning: findRank(goId, reasoningRankings),
		math: findRank(goId, inputs.mathRankings)
	};

	return {
		coding: Math.round(scoreCoding(benchmarks, ranks.coding, totalModels, speed)),
		brainstorming: Math.round(scoreBrainstorming(ranks.reasoning, totalModels, ctx, burnRate)),
		competitive: Math.round(scoreCompetitive(benchmarks, ranks.coding, totalModels)),
		agentic: Math.round(scoreAgentic(ranks.coding, totalModels, ctx, speed, model)),
		budget: Math.round(scoreBudget(pricing, quota))
	};
}

function findRank(goId: string, rankings: LLMStatsRanking[]): number {
	return rankings.findIndex((r) => r.model_name.toLowerCase().includes(goId.toLowerCase()));
}

function scoreCoding(
	benchmarks: ModelBenchmarks,
	rank: number,
	totalModels: number,
	speed: ModelSpeed | null
): number {
	const rankScore = rank >= 0 ? normalizeScore(totalModels - rank, totalModels) * 0.5 : 0;
	return (
		rankScore +
		normalizeScore(benchmarks.sweBenchVerified ?? 0, 100) * 0.25 +
		normalizeScore(benchmarks.codeArena ?? 0, 100) * 0.15 +
		normalizeScore(speed?.tokensPerSecond ?? 0, 200) * 0.1
	);
}

function scoreBrainstorming(
	rank: number,
	totalModels: number,
	ctx: number,
	burnRate: BurnRate
): number {
	const rankScore = rank >= 0 ? normalizeScore(totalModels - rank, totalModels) * 0.5 : 0;
	const burnScore = burnRate === 'medium' ? 100 : burnRate === 'slow' ? 70 : 40;
	return rankScore + normalizeScore(ctx, 1_000_000) * 0.3 + burnScore * 0.2;
}

function scoreCompetitive(benchmarks: ModelBenchmarks, rank: number, totalModels: number): number {
	const rankScore = rank >= 0 ? normalizeScore(totalModels - rank, totalModels) * 0.25 : 0;
	return (
		normalizeScore(benchmarks.sweBenchVerified ?? 0, 100) * 0.4 +
		normalizeScore(benchmarks.codeArena ?? 0, 100) * 0.35 +
		rankScore
	);
}

function scoreAgentic(
	rank: number,
	totalModels: number,
	ctx: number,
	speed: ModelSpeed | null,
	model: LLMStatsModel | null
): number {
	const rankScore = rank >= 0 ? normalizeScore(totalModels - rank, totalModels) * 0.4 : 0;
	const contextBonus = ctx >= 500_000 ? 100 : ctx >= 256_000 ? 60 : 0;
	const toolSupport = model?.inference?.supports_tools ? 100 : 50;
	return (
		rankScore +
		contextBonus * 0.3 +
		normalizeScore(speed?.tokensPerSecond ?? 0, 200) * 0.15 +
		toolSupport * 0.15
	);
}

function scoreBudget(pricing: ModelPricing, quota: GoModel['quota']): number {
	const totalPrice = pricing.inputPricePerM + pricing.outputPricePerM;
	return (
		normalizeScore(Math.max(0, 10 - totalPrice), 10) * 0.6 +
		normalizeScore(quota.requestsPer5h, 30_000) * 0.4
	);
}

// ─── Migration Hints ─────────────────────────────────────────────────────

function inferMigrationHints(
	_goId: string,
	pricing: ModelPricing,
	benchmarks: ModelBenchmarks
): MigrationHint[] {
	return [
		codingMigrationHint(benchmarks.coding, pricing.inputPricePerM),
		reasoningMigrationHint(benchmarks.reasoning),
		budgetMigrationHint(pricing.inputPricePerM)
	].filter((h): h is MigrationHint => h !== null);
}

function codingMigrationHint(score: number | null, inputPrice: number): MigrationHint | null {
	if (!score || score <= 80) return null;
	const multiplier = inputPrice < 1 ? '10x+' : '5x';
	return {
		model: 'Claude Sonnet 4.6 / Opus 4.8',
		reason: `Comparable coding quality at ~${multiplier} lower input cost`
	};
}

function reasoningMigrationHint(score: number | null): MigrationHint | null {
	if (!score || score <= 80) return null;
	return {
		model: 'GPT-5.4 / Claude Mythos',
		reason: 'Strong reasoning performance rivaling frontier closed-source models'
	};
}

function budgetMigrationHint(inputPrice: number): MigrationHint | null {
	if (inputPrice >= 0.3) return null;
	return {
		model: 'Any API pay-per-token plan',
		reason: 'Included in $10/month Go subscription — no per-request billing'
	};
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const PROVIDER_BY_PREFIX: Record<string, string> = {
	deepseek: 'DeepSeek',
	qwen: 'Alibaba / Qwen Team',
	glm: 'Zhipu AI',
	kimi: 'Moonshot AI',
	minimax: 'MiniMax',
	mimo: 'Xiaomi',
	hy3: 'Unknown'
};

function inferProvider(goId: string): string {
	const prefix = Object.keys(PROVIDER_BY_PREFIX).find((p) => goId.startsWith(p));
	return prefix ? PROVIDER_BY_PREFIX[prefix] : 'Unknown';
}

function inferContextWindow(goId: string): number {
	if (goId.includes('glm-5') || goId.includes('qwen3.6') || goId.includes('deepseek-v4-pro')) {
		return 1_000_000;
	}
	if (goId.includes('kimi-k2') || goId.includes('qwen3.7')) {
		return 256_000;
	}
	return 128_000;
}

function formatContext(tokens: number): string {
	if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
	return `${Math.round(tokens / 1_000)}K`;
}

function normalizeScore(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}
