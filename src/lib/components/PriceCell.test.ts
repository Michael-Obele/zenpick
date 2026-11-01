import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import PriceCell from './PriceCell.svelte';
import { buildCatalogRows, type PlanFilter } from '$lib/catalog';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

/**
 * The provenance badge describes the Go entry's pricing source, so it may only
 * appear while the Go entry is the one on display — never under a Zed or
 * Copilot rate on a shared row.
 */

function stackModel(id: string, name: string, inputPricePerM: number): StackModel {
	return {
		id,
		name,
		provider: 'Test',
		pricing: {
			inputPricePerM,
			outputPricePerM: inputPricePerM * 5,
			cachedReadPerM: null
		},
		contextWindow: 200_000,
		intelligence: inputPricePerM * 10
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

const rows = buildCatalogRows(
	[
		makeGoModel({
			id: 'shared-model',
			name: 'Shared Model',
			provider: 'Acme',
			pricing: makePricing({ inputPricePerM: 2, outputPricePerM: 10, source: 'go-docs' }),
			benchmarks: makeBenchmarks({ coding: 55 })
		})
	],
	[
		makePlan('zed', [stackModel('shared-model', 'Shared Model', 2.2)]),
		makePlan('copilot', [stackModel('shared-model', 'Shared Model', 2)])
	]
);

const sharedRow = rows[0];

/** SSR body with hydration comments stripped and whitespace collapsed. */
function body(planFilter: PlanFilter): string {
	return render(PriceCell, { props: { row: sharedRow, planFilter } })
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('PriceCell provenance badge', () => {
	it('hides the Go provenance badge under a static-plan price', () => {
		const markup = body('zed');

		expect(markup).toContain('$2.20');
		expect(markup).not.toContain('Go Docs');
		expect(markup).not.toContain('Pricing from OpenCode Go docs page');
	});

	it('shows the Go provenance badge when the Go entry is displayed', () => {
		const markup = body('go');

		expect(markup).toContain('$2.00');
		expect(markup).toContain('Go Docs');
		expect(markup).toContain('Pricing from OpenCode Go docs page');
	});
});
