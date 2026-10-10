/**
 * Test fixtures — builders for the enriched `GoModel` and the raw
 * modelgrep / llm-stats payload shapes.
 *
 * Kept deliberately minimal: each builder fills every required field with a
 * neutral default so a test only states the fields it actually exercises.
 */
import type {
	BurnDetails,
	GoModel,
	LlmStatsModel,
	ModelBenchmarks,
	ModelgrepModelData,
	ModelPricing,
	ModelQuota,
	ScenarioScores
} from '$lib/types/models';

export function makePricing(partial: Partial<ModelPricing> = {}): ModelPricing {
	return {
		inputPricePerM: 1,
		outputPricePerM: 2,
		cachedReadPerM: 0.1,
		source: 'go-docs',
		...partial
	};
}

export function makeQuota(partial: Partial<ModelQuota> = {}): ModelQuota {
	return {
		requestsPer5h: 100,
		requestsPerWeek: 1_000,
		requestsPerMonth: 4_000,
		unlimited: false,
		...partial
	};
}

export function makeBurnDetails(partial: Partial<BurnDetails> = {}): BurnDetails {
	return { score: 50, requestsPer12: 100, band: 'moderate', ...partial };
}

export function makeBenchmarks(partial: Partial<ModelBenchmarks> = {}): ModelBenchmarks {
	return {
		coding: null,
		reasoning: null,
		math: null,
		sweBenchVerified: null,
		designElo: null,
		codeArena: null,
		allScores: {},
		...partial
	};
}

export function makeScenarioScores(partial: Partial<ScenarioScores> = {}): ScenarioScores {
	return { brainstorming: 50, coding: 50, agentic: 50, budget: 50, frontend: 50, ...partial };
}

export function makeGoModel(partial: Partial<GoModel> = {}): GoModel {
	return {
		id: 'test-model',
		name: 'Test Model',
		provider: 'Test',
		description: '',
		openWeight: false,
		contextWindow: 128_000,
		releaseDate: '2025-01-01',
		pricing: makePricing(),
		burnDetails: makeBurnDetails(),
		quota: makeQuota(),
		burnRate: 'medium',
		plus: null,
		scenarioScores: makeScenarioScores(),
		tags: [],
		benchmarks: makeBenchmarks(),
		speed: null,
		capabilities: null,
		migrationHints: [],
		endpoint: 'openai-compatible',
		endpointUrl: 'https://opencode.ai/zen/go/v1',
		modelgrepId: null,
		llmStatsId: null,
		fetchedAt: 0,
		...partial
	};
}

/** The modelgrep artificial_analysis block with every field nulled. */
export type AaBlock = NonNullable<ModelgrepModelData['benchmarks']['artificial_analysis']>;

export function makeAa(partial: Partial<AaBlock> = {}): AaBlock {
	return {
		intelligence: null,
		coding: null,
		agentic: null,
		gpqa: null,
		math: null,
		hle: null,
		scicode: null,
		tau2: null,
		aime: null,
		livecodebench: null,
		terminalbench: null,
		mmlu_pro: null,
		ifbench: null,
		intelligence_pct: null,
		coding_pct: null,
		agentic_pct: null,
		math_pct: null,
		...partial
	};
}

/** A modelgrep model payload; pass `null` aaBlock for a model with no AA data. */
export function makeModelgrep(
	aaBlock: AaBlock | null = null,
	designElo: number | null = null
): ModelgrepModelData {
	return {
		id: 'lab/model',
		name: 'Lab: Model',
		maker: 'lab',
		description: '',
		context_length: 0,
		max_output: null,
		pricing: null,
		performance: { throughput_tps: null, latency_ms: null, uptime: null },
		capabilities: { tools: false, reasoning: false, structured: false, vision: false },
		benchmarks: {
			artificial_analysis: aaBlock,
			design_arena: designElo == null ? null : { elo: designElo, win_rate: 0.5, elo_pct: 50 }
		},
		url: ''
	};
}

/** An llm-stats model payload with the given 0-1 / mixed-scale `top_scores`. */
export function makeLlmStats(topScores: Record<string, number> = {}): LlmStatsModel {
	return {
		id: 'llm-stats-model',
		name: 'LLM Stats Model',
		description: '',
		organization: null,
		family: null,
		open_weight: false,
		model_type: 'chat',
		modalities: [],
		context_window: null,
		param_count: null,
		training_tokens: null,
		knowledge_cutoff: null,
		release_date: null,
		top_scores: topScores,
		source: 'llm-stats',
		url: ''
	};
}
