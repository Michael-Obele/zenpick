import type { GoModel, ModelgrepModelData } from '$lib/types/models';
import {
	COPILOT_PLAN,
	GO_PLAN_META,
	PLAN_IDS,
	ZED_PLAN,
	toPricing,
	type StackModel,
	type StackPlan,
	type StaticPlan
} from './plans';

function sortModels(models: StackModel[]): StackModel[] {
	return models.sort((a, b) => {
		if (a.intelligence == null) return b.intelligence == null ? a.name.localeCompare(b.name) : 1;
		if (b.intelligence == null) return -1;
		return b.intelligence - a.intelligence || a.name.localeCompare(b.name);
	});
}

function buildStaticPlan(plan: StaticPlan, byId: Map<string, ModelgrepModelData>): StackPlan {
	const { models: definitions, priceMultiplier, ...metadata } = plan;
	const models = definitions.map((definition): StackModel => {
		const modelgrep = definition.modelgrepId ? byId.get(definition.modelgrepId) : undefined;
		const contextWindow = definition.contextWindow ?? modelgrep?.context_length ?? null;

		return {
			id: definition.id,
			name: definition.name,
			provider: definition.provider,
			pricing: toPricing(definition.price, priceMultiplier),
			intelligence: modelgrep?.benchmarks?.artificial_analysis?.intelligence ?? null,
			coding: modelgrep?.benchmarks?.artificial_analysis?.coding ?? null,
			contextWindow: contextWindow === 0 ? null : contextWindow,
			description: modelgrep?.description || undefined,
			modelgrepId: definition.modelgrepId,
			...(definition.note == null ? {} : { note: definition.note })
		};
	});

	return { ...metadata, models: sortModels(models) };
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
			description: model.description,
			modelgrepId: model.modelgrepId
		}));

	return { ...GO_PLAN_META, models: sortModels(models) };
}

export function buildStackPlans(goModels: GoModel[], modelgrep: ModelgrepModelData[]): StackPlan[] {
	const byId = new Map(modelgrep.map((model) => [model.id, model]));
	const plans = {
		zed: buildStaticPlan(ZED_PLAN, byId),
		copilot: buildStaticPlan(COPILOT_PLAN, byId),
		go: buildGoPlan(goModels)
	};

	return PLAN_IDS.map((id) => plans[id]);
}
