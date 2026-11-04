import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import ModelCompare from './ModelCompare.svelte';
import { buildCatalogRows } from '$lib/catalog';
import { resolveCompareEntries } from '$lib/compare-selection';
import { toCompareModels } from '$lib/compare-model';
import type { StackModel, StackPlan } from '$lib/stack/plans';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

/**
 * The full grid must render the same rows for every plan. The old split
 * (`ModelCompare` for Go, `PlanCompare` for everything else) is what left Zed
 * and Copilot without the rich table, so this fixture deliberately mixes one
 * Go column with one Zed column.
 */

const go = makeGoModel({
	id: 'go-model',
	name: 'Go Model',
	displayName: 'Go Model',
	provider: 'Acme',
	pricing: makePricing({
		inputPricePerM: 2,
		outputPricePerM: 10,
		cachedReadPerM: 0.1
	}),
	contextWindow: 200_000,
	benchmarks: makeBenchmarks({
		coding: 55,
		reasoning: 60,
		math: 50,
		sweBenchVerified: 0.5
	})
});

function stackModel(partial: Partial<StackModel> = {}): StackModel {
	return {
		id: 'zed-model',
		name: 'Zed Model',
		provider: 'Anthropic',
		pricing: { inputPricePerM: 3, outputPricePerM: 15, cachedReadPerM: 0.3 },
		contextWindow: 1_000_000,
		intelligence: 55,
		coding: 40,
		benchmarks: makeBenchmarks({
			coding: 40,
			reasoning: 55,
			math: 44.5,
			sweBenchVerified: 0.61
		}),
		capabilities: null,
		openWeight: false,
		speed: null,
		tags: [],
		llmStatsId: 'claude-sonnet-5-5',
		...partial
	};
}

function staticPlan(models: StackModel[]): StackPlan {
	return {
		id: 'zed',
		name: 'Zed Pro',
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models
	};
}

const rows = buildCatalogRows([go], [staticPlan([stackModel()])]);
const models = toCompareModels(resolveCompareEntries(rows, ['go:go-model', 'zed:zed-model']));

function markup(): string {
	return render(ModelCompare, {
		props: { models, onRemove: () => {}, onMove: () => {} }
	})
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('ModelCompare', () => {
	it('renders one full-grid column per plan with a plan badge', () => {
		const body = markup();

		expect(models).toHaveLength(2);
		expect(body).toContain('Go Model');
		expect(body).toContain('Zed Model');
		expect(body).toContain('OpenCode Go');
		expect(body).toContain('Zed Pro');
	});

	it('renders the same benchmark rows for a static-plan column', () => {
		const body = markup();

		expect(body).toContain('Coding');
		expect(body).toContain('Math');
		expect(body).toContain('SciCode');
		// Zed's blended math and SciCode values must reach the full grid.
		expect(body).toContain('44.5');
		expect(body).toContain('61.0');
	});

	it('keeps Go-only rows available in a mixed comparison', () => {
		const body = markup();

		// The Go column owns quota rows; the Zed column reads a dash there
		// instead of pretending the plan publishes them.
		expect(body).toContain('Req / 5h');
		expect(body).toContain('100');
	});

	it('renders plan economics for a static-plan column', () => {
		const body = markup();

		// Zed's $5 allowance: $17.03 per 100 requests, 341% of the allowance,
		// about 29 requests/month, and a fast price burn (3 + 15 per 1M).
		expect(body).toContain('Cost / 100');
		expect(body).toContain('Allowance / 100');
		expect(body).toContain('Requests / month');
		expect(body).toContain('Price burn');
		expect(body).toContain('$17.03');
		expect(body).toContain('341%');
		expect(body).toContain('29');
		expect(body).toContain('Fast burn');
	});

	it('labels remove and reorder controls with the model and its plan', () => {
		const body = markup();

		expect(body).toContain('Remove Zed Model (Zed Pro) from comparison');
		expect(body).toContain('Move Zed Model (Zed Pro) one column left');
	});
});
