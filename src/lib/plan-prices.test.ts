import { describe, expect, it } from 'vite-plus/test';
import { buildCatalogRows } from '$lib/catalog';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { planPriceRows } from '$lib/plan-prices';
import { makeGoModel, makePricing } from '$lib/test/fixtures';

function stackModel(partial: Partial<StackModel> = {}): StackModel {
	return {
		id: 'model',
		name: 'Model',
		provider: 'Test',
		pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 },
		contextWindow: null,
		intelligence: null,
		...partial
	};
}

function makePlan(id: PlanId, models: StackModel[]): StackPlan {
	return {
		id,
		name: id,
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models
	};
}

describe('planPriceRows', () => {
	it('builds one formatted row per plan in display order', () => {
		const [row] = buildCatalogRows(
			[
				makeGoModel({
					id: 'shared',
					pricing: makePricing({
						inputPricePerM: 1,
						outputPricePerM: 4,
						cachedReadPerM: null
					})
				})
			],
			[
				makePlan('zed', [
					stackModel({
						id: 'shared',
						pricing: {
							inputPricePerM: 1.1,
							outputPricePerM: 4.4,
							cachedReadPerM: 0.11
						},
						note: 'Zed adds 10%.'
					})
				]),
				makePlan('copilot', [
					stackModel({
						id: 'shared',
						pricing: {
							inputPricePerM: 1,
							outputPricePerM: 4,
							cachedReadPerM: null
						}
					})
				])
			]
		);

		expect(planPriceRows(row)).toEqual([
			{
				plan: 'go',
				label: 'OpenCode Go',
				input: '$1.00',
				output: '$4.00',
				cached: '—',
				note: null,
				active: false
			},
			{
				plan: 'zed',
				label: 'Zed Pro',
				input: '$1.10',
				output: '$4.40',
				cached: '$0.11',
				note: 'Zed adds 10%.',
				active: false
			},
			{
				plan: 'copilot',
				label: 'Copilot Pro',
				input: '$1.00',
				output: '$4.00',
				cached: '—',
				note: null,
				active: false
			}
		]);
	});

	it('marks only the filtered plan as active', () => {
		const [row] = buildCatalogRows(
			[],
			[
				makePlan('zed', [stackModel({ id: 'only-zed' })]),
				makePlan('copilot', [stackModel({ id: 'only-zed' })])
			]
		);

		expect(planPriceRows(row, 'copilot').map((price) => price.active)).toEqual([false, true]);
		expect(planPriceRows(row, '').every((price) => !price.active)).toBe(true);
	});

	it('formats unpublished input and output prices as en dashes', () => {
		const [row] = buildCatalogRows(
			[
				makeGoModel({
					id: 'unpriced',
					pricing: makePricing({
						inputPricePerM: null,
						outputPricePerM: null,
						cachedReadPerM: null
					})
				})
			],
			[
				makePlan('zed', [
					stackModel({
						id: 'unpriced',
						pricing: {
							inputPricePerM: null,
							outputPricePerM: null,
							cachedReadPerM: null
						}
					})
				])
			]
		);

		expect(planPriceRows(row).map((price) => [price.input, price.output, price.cached])).toEqual([
			['—', '—', '—'],
			['—', '—', '—']
		]);
		expect(planPriceRows(row).map((price) => price.plan)).toEqual(['go', 'zed']);
	});
});
