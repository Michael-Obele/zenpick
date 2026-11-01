import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import PlanCompare from './PlanCompare.svelte';
import { buildCatalogRows } from '$lib/catalog';
import { resolveCompareEntries } from '$lib/compare-selection';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

/**
 * `PlanCompare` is the mixed/static-plan view, so the fixture deliberately
 * pairs one Zed-only model with one OpenCode Go model: the two plans publish
 * different price points, which is what the best-cell highlight must compare.
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
			pricing: makePricing({
				inputPricePerM: 2,
				outputPricePerM: 10,
				cachedReadPerM: 0.1
			}),
			benchmarks: makeBenchmarks({ reasoning: 60, coding: 55 })
		})
	],
	[makePlan('zed', [stackModel('zed-model', 'Zed Model', 3)])]
);

const entries = resolveCompareEntries(rows, ['zed:zed-model', 'go:go-model']);

/** SSR body with hydration comments stripped and whitespace collapsed. */
function markup(): string {
	return render(PlanCompare, {
		props: { entries, onRemove: () => {}, onMove: () => {} }
	})
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('PlanCompare', () => {
	it('renders one row per entry with its plan label', () => {
		const body = markup();

		expect(entries).toHaveLength(2);
		expect(body).toContain('Zed Model');
		expect(body).toContain('Go Model');
		expect(body).toContain('Zed Pro');
		expect(body).toContain('OpenCode Go');
	});

	it('formats the published prices per million tokens', () => {
		const body = markup();

		expect(body).toContain('$3.00');
		expect(body).toContain('$15.00');
		expect(body).toContain('$2.00');
		expect(body).toContain('$10.00');
	});

	it('labels the remove controls with the model name and its plan', () => {
		const body = markup();

		expect(body).toContain('aria-label="Remove Zed Model (Zed Pro)"');
		expect(body).toContain('aria-label="Remove Go Model (OpenCode Go)"');
	});

	it('renders an en dash for a metric the plan does not publish', () => {
		const body = markup();

		// Zed publishes no cached-read price and no coding score.
		expect(body).toMatch(/tabular-nums">\s*<span[^>]*>—<\/span>/);
	});

	it('disables the arrows at the ends of the selection', () => {
		const body = markup();

		expect(body).toMatch(
			/aria-disabled="true"[^>]*aria-label="Move Zed Model \(Zed Pro\) earlier"/
		);
		expect(body).toMatch(
			/aria-disabled="true"[^>]*aria-label="Move Go Model \(OpenCode Go\) later"/
		);
		expect(body).toMatch(/aria-disabled="false"[^>]*aria-label="Move Zed Model \(Zed Pro\) later"/);
		expect(body).toMatch(
			/aria-disabled="false"[^>]*aria-label="Move Go Model \(OpenCode Go\) earlier"/
		);
	});

	it('highlights only the best value in a numeric column', () => {
		const body = markup();

		// Go is cheaper on input ($2.00 vs $3.00) and owns the highlight.
		expect(body).toMatch(/font-semibold text-primary">\$2\.00</);
		expect(body).not.toMatch(/font-semibold text-primary">\$3\.00</);
	});

	it('explains what the cross-plan view leaves to the Go comparison', () => {
		expect(markup()).toContain('Burn and OpenCode Go quotas appear on the Go comparison.');
	});
});
