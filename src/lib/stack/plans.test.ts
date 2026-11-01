import { describe, expect, it } from 'vite-plus/test';
import { findModel, RECOMMENDED_MAIN, RECOMMENDED_SUB } from './logic';
import { COPILOT_PLAN, toPricing, ZED_PLAN, type StackModel, type StaticPlan } from './plans';

function modelsFor(plan: StaticPlan): StackModel[] {
	return plan.models.map((model) => ({
		id: model.id,
		name: model.name,
		provider: model.provider,
		pricing: toPricing(model.price, plan.priceMultiplier),
		contextWindow: model.contextWindow ?? null,
		intelligence: null,
		note: model.note
	}));
}

describe('static stack plans', () => {
	it('has the documented model counts, unique ids, and positive listed prices', () => {
		expect(ZED_PLAN.models).toHaveLength(33);
		expect(COPILOT_PLAN.models).toHaveLength(15);

		const zedProviders = ZED_PLAN.models.reduce<Record<string, number>>((counts, model) => {
			counts[model.provider] = (counts[model.provider] ?? 0) + 1;
			return counts;
		}, {});
		expect(zedProviders).toEqual({ Anthropic: 13, OpenAI: 16, Google: 4 });

		for (const plan of [ZED_PLAN, COPILOT_PLAN]) {
			expect(new Set(plan.models.map((model) => model.id)).size).toBe(plan.models.length);
			for (const model of plan.models) {
				expect(model.price[0]).toBeGreaterThan(0);
				expect(model.price[1]).toBeGreaterThan(0);
			}
		}
	});

	it('includes both editorial defaults in each static plan', () => {
		for (const plan of [ZED_PLAN, COPILOT_PLAN]) {
			const models = modelsFor(plan);
			expect(findModel(models, RECOMMENDED_MAIN)).not.toBeNull();
			expect(findModel(models, RECOMMENDED_SUB)).not.toBeNull();
		}
	});

	it('keeps unsupported models out of the Copilot Pro list', () => {
		expect(
			COPILOT_PLAN.models.some((model) => /opus|fable|astra|-sol$|argon|sonnet-4/i.test(model.id))
		).toBe(false);
	});

	it('applies price multipliers and preserves null cached prices', () => {
		expect(toPricing([2, 10, 0.2], 1.1)).toEqual({
			inputPricePerM: 2.2,
			outputPricePerM: 11,
			cachedReadPerM: 0.22
		});

		const small = toPricing([0.1, 0.5, 0.01], 1.1);
		expect(small.inputPricePerM).toBeCloseTo(0.11);
		expect(small.outputPricePerM).toBeCloseTo(0.55);
		expect(small.cachedReadPerM).toBeCloseTo(0.011);
		expect(toPricing([30, 180, null], 1.1).cachedReadPerM).toBeNull();
		expect(toPricing([2, 10, 0.2])).toEqual(toPricing([2, 10, 0.2], 1));
	});
});
