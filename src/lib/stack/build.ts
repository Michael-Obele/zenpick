import type { GoModel, ModelgrepModelData, ModelSpeed } from '$lib/types/models';
import { blendBenchmarks } from '$lib/server/blend';
import { fuzzyMatchModelgrep } from '$lib/server/modelgrep';
import { isClosedWeight } from '$lib/server/frontier';
import { computeTags } from '$lib/server/tags';
import { buildCapabilities } from '$lib/capabilities';
import {
	emptyLlmStatsBenchmarkIndex,
	lookupLlmStatsScores,
	type LlmStatsBenchmarkIndex
} from '$lib/server/llm-stats-public';
import {
	COPILOT_PLAN,
	GO_PLAN_META,
	PLAN_IDS,
	ZED_PLAN,
	toPricing,
	type StackModel,
	type StackPlan,
	type StaticModelDef,
	type StaticPlan
} from './plans';

function sortModels(models: StackModel[]): StackModel[] {
	return models.sort((a, b) => {
		if (a.intelligence == null) return b.intelligence == null ? a.name.localeCompare(b.name) : 1;
		if (b.intelligence == null) return -1;
		return b.intelligence - a.intelligence || a.name.localeCompare(b.name);
	});
}

function buildStaticPlan(
	plan: StaticPlan,
	byId: Map<string, ModelgrepModelData>,
	all: ModelgrepModelData[],
	llmStats: LlmStatsBenchmarkIndex
): StackPlan {
	const { models: definitions, priceMultiplier, ...metadata } = plan;
	const models = definitions.map((definition): StackModel => {
		const modelgrep = resolveStaticModelgrep(definition, byId, all);
		const lsMatch = lookupLlmStatsScores(
			llmStats,
			[definition.id, definition.modelgrepId?.split('/').pop()],
			definition.name
		);
		// Same pipeline as a Go model: modelgrep's headline metrics win, with
		// llm-stats' category index and modelgrep's AA fallbacks filling the gaps.
		// Reading `aa.intelligence` / `aa.coding` directly (the old behaviour) left
		// every static-plan coding score null, because modelgrep publishes no
		// `coding` for the closed models these plans carry.
		const { benchmarks, meta } = blendBenchmarks(
			modelgrep,
			lsMatch ? { top_scores: lsMatch.scores } : null
		);
		benchmarks._meta = meta;

		const contextWindow = definition.contextWindow ?? modelgrep?.context_length ?? null;
		const speed: ModelSpeed | null = modelgrep?.performance
			? {
					tokensPerSecond: modelgrep.performance.throughput_tps ?? 0,
					timeToFirstToken: modelgrep.performance.latency_ms ?? null
				}
			: null;

		return {
			id: definition.id,
			name: definition.name,
			provider: definition.provider,
			pricing: toPricing(definition.price, priceMultiplier),
			intelligence: benchmarks.reasoning,
			coding: benchmarks.coding,
			benchmarks,
			capabilities: buildCapabilities(modelgrep, null),
			openWeight: modelgrep ? !isClosedWeight(modelgrep) : null,
			speed,
			// Burn/quota are Go-only, so a plan row gets the benchmark-derived
			// tags only (coding, reasoning, context, speed).
			tags: computeTags(
				benchmarks,
				{ score: 0, requestsPer12: null, band: null },
				speed,
				modelgrep
			),
			llmStatsId: lsMatch?.id ?? null,
			contextWindow: contextWindow === 0 ? null : contextWindow,
			description: modelgrep?.description || undefined,
			modelgrepId: modelgrep?.id ?? definition.modelgrepId ?? null,
			...(definition.note == null ? {} : { note: definition.note })
		};
	});

	return { ...metadata, models: sortModels(models) };
}

/**
 * Resolve a hand-verified plan row to its modelgrep record.
 *
 * The plan data already carries the exact modelgrep id where one is known. The
 * fuzzy fallback is deliberately EXACT-normalized only: a containment match
 * (e.g. `gpt-5.5` for `gpt-5.5-pro`) would silently attach a sibling model's
 * benchmarks to the row.
 */
function resolveStaticModelgrep(
	definition: StaticModelDef,
	byId: Map<string, ModelgrepModelData>,
	all: ModelgrepModelData[]
): ModelgrepModelData | null {
	if (definition.modelgrepId) {
		const exact = byId.get(definition.modelgrepId);
		if (exact) return exact;
	}
	return fuzzyMatchModelgrep(definition.id, all, 1);
}

function buildGoPlan(goModels: GoModel[]): StackPlan {
	const models = goModels
		.filter(
			(model) => model.pricing.inputPricePerM != null && model.pricing.outputPricePerM != null
		)
		.map((model): StackModel => ({
			id: model.id,
			name: model.displayName ?? model.name,
			provider: model.provider,
			pricing: {
				inputPricePerM: model.pricing.inputPricePerM,
				outputPricePerM: model.pricing.outputPricePerM,
				cachedReadPerM: model.pricing.cachedReadPerM
			},
			contextWindow: model.contextWindow,
			intelligence: model.benchmarks.reasoning,
			coding: model.benchmarks.coding,
			benchmarks: model.benchmarks,
			capabilities: model.capabilities,
			openWeight: model.openWeight,
			speed: model.speed,
			tags: model.tags,
			description: model.description,
			modelgrepId: model.modelgrepId,
			llmStatsId: model.llmStatsId
		}));

	return { ...GO_PLAN_META, models: sortModels(models) };
}

export function buildStackPlans(
	goModels: GoModel[],
	modelgrep: ModelgrepModelData[],
	llmStats: LlmStatsBenchmarkIndex = emptyLlmStatsBenchmarkIndex()
): StackPlan[] {
	const byId = new Map(modelgrep.map((model) => [model.id, model]));
	const plans = {
		zed: buildStaticPlan(ZED_PLAN, byId, modelgrep, llmStats),
		copilot: buildStaticPlan(COPILOT_PLAN, byId, modelgrep, llmStats),
		go: buildGoPlan(goModels)
	};

	return PLAN_IDS.map((id) => plans[id]);
}
