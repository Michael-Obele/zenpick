import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import CompareTray from './CompareTray.svelte';
import { buildCatalogRows } from '$lib/catalog';
import { compare } from '$lib/stores/compare.svelte';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

/**
 * The tray resolves `plan:id` keys against the whole catalog, so a Go pick and
 * a static-plan pick render side by side with their plan short labels. SSR is
 * enough here: the tray is derived from the store and the rows.
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
			id: 'go-model',
			name: 'Go Model',
			provider: 'Acme',
			pricing: makePricing({ inputPricePerM: 2, outputPricePerM: 10 }),
			benchmarks: makeBenchmarks({ reasoning: 60, coding: 55 })
		})
	],
	[makePlan('zed', [stackModel('zed-only', 'Zed Only', 3)])]
);

/** SSR body with hydration comments stripped and whitespace collapsed. */
function markup(): string {
	return render(CompareTray, { props: { rows } })
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('CompareTray', () => {
	beforeEach(() => {
		compare.selection = [];
	});

	it('renders a chip per resolved key with its plan short label', () => {
		compare.selection = ['go:go-model', 'zed:zed-only'];
		const body = markup();

		expect(body).toContain('Compare (2/10)');
		expect(body).toContain('Go Model');
		expect(body).toContain('Zed Only');
		expect(body).toContain('>Go</span>');
		expect(body).toContain('>Zed</span>');
	});

	it('links to /compare with both plan keys, keeping the colon readable', () => {
		compare.selection = ['go:go-model', 'zed:zed-only'];
		const body = markup();

		expect(body).toContain('href="/compare?models=go:go-model,zed:zed-only"');
	});

	it('counts only resolvable keys and hides when none resolve', () => {
		compare.selection = ['go:go-model', 'go:not-in-the-catalog'];
		expect(markup()).toContain('Compare (1/10)');

		compare.selection = ['go:not-in-the-catalog'];
		expect(markup()).not.toContain('Compare (');
	});
});
