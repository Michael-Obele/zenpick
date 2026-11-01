import { costPerRequest, REFERENCE_CACHED_PCT, REFERENCE_TOKENS } from '$lib/recommendation';
import type { StackModel, StackPlan } from './plans';

export const RECOMMENDED_MAIN = 'claude-sonnet-5.5';
export const RECOMMENDED_SUB = 'gpt-6-luna';
export type StackRole = 'main' | 'sub';
export const DEFAULT_SUB_SHARE = 70;

export interface StackWorkload {
	tokens: number;
	cachedPct: number;
	subShare: number;
}
export const DEFAULT_WORKLOAD: StackWorkload = {
	tokens: REFERENCE_TOKENS,
	cachedPct: REFERENCE_CACHED_PCT,
	subShare: DEFAULT_SUB_SHARE
};

const MAIN_OUTPUT_CEILING = 12;
const SUB_MIN_INTELLIGENCE = 25;
const BETTER_BY = 5;

export function modelKey(id: string): string {
	return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isRecommended(model: StackModel, role: StackRole): boolean {
	return modelKey(model.id) === modelKey(role === 'main' ? RECOMMENDED_MAIN : RECOMMENDED_SUB);
}

export function findModel(models: StackModel[], id: string): StackModel | null {
	const key = modelKey(id);
	if (!key) return null;
	return models.find((model) => modelKey(model.id) === key) ?? null;
}

export function requestCost(model: StackModel, w: StackWorkload): number | null {
	return costPerRequest(model.pricing, w.tokens, w.cachedPct);
}

export interface StackEconomics {
	costPerRequest: number;
	costPer100: number;
	mainOnlyCostPer100: number;
	savingsPct: number;
	requestsPerMonth: number | null;
}

export function stackEconomics(
	plan: StackPlan,
	main: StackModel,
	sub: StackModel,
	w: StackWorkload
): StackEconomics | null {
	const mainCost = requestCost(main, w);
	const subCost = requestCost(sub, w);
	if (mainCost == null || subCost == null) return null;

	const subShare = Math.min(100, Math.max(0, w.subShare)) / 100;
	const costPerRequest = (1 - subShare) * mainCost + subShare * subCost;
	return {
		costPerRequest,
		costPer100: costPerRequest * 100,
		mainOnlyCostPer100: mainCost * 100,
		savingsPct: mainCost === 0 ? 0 : Math.round((1 - costPerRequest / mainCost) * 100),
		requestsPerMonth: costPerRequest <= 0 ? null : Math.floor(plan.includedUsd / costPerRequest)
	};
}

export interface ResolvedStack {
	main: StackModel | null;
	sub: StackModel | null;
	autoMain: boolean;
	autoSub: boolean;
}

function usableModels(models: StackModel[], w: StackWorkload) {
	return models
		.map((model) => ({ model, cost: requestCost(model, w) }))
		.filter((entry): entry is { model: StackModel; cost: number } => entry.cost != null);
}

function autoMain(models: StackModel[], w: StackWorkload): StackModel | null {
	const usable = usableModels(models, w).filter(({ model }) => model.intelligence != null);
	const belowCeiling = usable.filter(
		({ model }) =>
			model.pricing.outputPricePerM != null && model.pricing.outputPricePerM <= MAIN_OUTPUT_CEILING
	);
	const pool = belowCeiling.length > 0 ? belowCeiling : usable;
	pool.sort((a, b) => b.model.intelligence! - a.model.intelligence! || a.cost - b.cost);
	return pool[0]?.model ?? null;
}

function autoSub(models: StackModel[], w: StackWorkload): StackModel | null {
	const usable = usableModels(models, w);
	const aboveThreshold = usable.filter(
		({ model }) => model.intelligence != null && model.intelligence >= SUB_MIN_INTELLIGENCE
	);
	const pool = aboveThreshold.length > 0 ? aboveThreshold : usable;
	pool.sort(
		(a, b) =>
			a.cost - b.cost ||
			(b.model.intelligence ?? Number.NEGATIVE_INFINITY) -
				(a.model.intelligence ?? Number.NEGATIVE_INFINITY)
	);
	return pool[0]?.model ?? null;
}

export function resolveStack(
	plan: StackPlan,
	mainId: string,
	subId: string,
	w: StackWorkload = DEFAULT_WORKLOAD
): ResolvedStack {
	const mainFromUrl = findModel(plan.models, mainId);
	const mainDefault = findModel(plan.models, RECOMMENDED_MAIN);
	const main = mainFromUrl ?? mainDefault ?? autoMain(plan.models, w);
	const subFromUrl = findModel(plan.models, subId);
	const subDefault = findModel(plan.models, RECOMMENDED_SUB);
	const sub = subFromUrl ?? subDefault ?? autoSub(plan.models, w);
	return {
		main,
		sub,
		autoMain: mainFromUrl == null && mainDefault == null,
		autoSub: subFromUrl == null && subDefault == null
	};
}

export function betterValue(
	models: StackModel[],
	picked: StackModel,
	w: StackWorkload
): StackModel | null {
	if (picked.intelligence == null) return null;
	const pickedCost = requestCost(picked, w);
	if (pickedCost == null) return null;

	return (
		models
			.filter((model) => modelKey(model.id) !== modelKey(picked.id))
			.map((model) => ({ model, cost: requestCost(model, w) }))
			.filter(
				(entry): entry is { model: StackModel; cost: number } =>
					entry.cost != null &&
					entry.cost <= pickedCost + 1e-12 &&
					entry.model.intelligence != null &&
					entry.model.intelligence >= picked.intelligence! + BETTER_BY
			)
			.sort((a, b) => b.model.intelligence! - a.model.intelligence!)[0]?.model ?? null
	);
}

export interface PlanStackRow {
	plan: StackPlan;
	stack: ResolvedStack;
	economics: StackEconomics | null;
}

export function compareAcrossPlans(
	plans: StackPlan[],
	mainId: string,
	subId: string,
	w: StackWorkload
): PlanStackRow[] {
	return plans.map((plan) => {
		const stack = resolveStack(plan, mainId, subId, w);
		return {
			plan,
			stack,
			economics: stack.main && stack.sub ? stackEconomics(plan, stack.main, stack.sub, w) : null
		};
	});
}
