import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import ModelTable from './ModelTable.svelte';
import { buildCatalogRows, type PlanFilter } from '$lib/catalog';
import { findNeed } from '$lib/needs';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

/**
 * The plan filter changes the table's DATASET, not just the badges: a static
 * plan lists only the models that plan carries, and every row stays
 * comparable and openable — the checkbox uses that plan's key, and the row
 * opens the shared detail drawer for Go and plan-only models alike. These
 * assertions run against the SSR body.
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

const sharedGo = makeGoModel({
	id: 'shared-model',
	name: 'Shared Model',
	provider: 'Acme',
	pricing: makePricing({ inputPricePerM: 2, outputPricePerM: 10 }),
	benchmarks: makeBenchmarks({ reasoning: 60, coding: 55 })
});

const rows = buildCatalogRows(
	[sharedGo],
	[
		makePlan('zed', [
			stackModel('shared-model', 'Shared Model', 2.2),
			stackModel('zed-only', 'Zed Only', 3)
		]),
		makePlan('copilot', [
			stackModel('shared-model', 'Shared Model', 2),
			stackModel('copilot-only', 'Copilot Only', 1)
		])
	]
);

/** SSR body with hydration comments stripped and whitespace collapsed. */
function renderBody(
	catalogRows: typeof rows,
	planFilter: PlanFilter,
	need: ReturnType<typeof findNeed> = null
): string {
	return render(ModelTable, {
		props: {
			rows: catalogRows,
			filter: '',
			scenario: '',
			planFilter,
			need,
			onSelectModel: () => {}
		}
	})
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

function body(planFilter: PlanFilter): string {
	return renderBody(rows, planFilter);
}

describe('ModelTable plan scope', () => {
	it('lists the rows a static plan carries and enables comparison for every row', () => {
		const markup = body('copilot');

		expect(markup).toContain('Shared Model');
		expect(markup).toContain('Copilot Only');
		expect(markup).not.toContain('Zed Only');
		expect(markup).toContain('title="Copilot Pro"');

		// The old Go-only branch is gone: static-plan rows carry their own key.
		expect(markup).not.toContain('Comparison is available for OpenCode Go models');
		for (const label of ['Add Shared Model to comparison', 'Add Copilot Only to comparison']) {
			expect(markup).toMatch(
				new RegExp(`<button(?![^>]*\\bdisabled\\b)[^>]*aria-label="${label}"`)
			);
		}
	});

	it('opens the detail drawer from every row, including plan-only ones', () => {
		const markup = body('copilot');

		// Both the shared row and the Copilot-only row are interactive; no row
		// keeps the old `cursor-default` dead zone. (Go-only column HEADERS still
		// use `cursor-default` when they are not sortable, so scope this to rows.)
		const rowTags = [...markup.matchAll(/<tr[^>]*>/g)].map(([tag]) => tag);
		expect(rowTags.some((tag) => tag.includes('cursor-default'))).toBe(false);
		expect(rowTags.filter((tag) => tag.includes('role="button"'))).toHaveLength(2);
		expect([...markup.matchAll(/role="button"/g)]).toHaveLength(2);
		expect([...markup.matchAll(/aria-pressed="false"/g)]).toHaveLength(2);
		expect(markup).toContain('tabindex="0"');
	});

	it('lists only the shared Go row when the Go plan is selected', () => {
		const markup = body('go');

		expect(markup).toContain('Shared Model');
		expect(markup).not.toContain('Zed Only');
		expect(markup).not.toContain('Copilot Only');
	});

	it('numbers every visible row in browse mode, including static-plan-only rows', () => {
		const staticRows = buildCatalogRows(
			[],
			[makePlan('zed', [stackModel('zed-a', 'Zed A', 1), stackModel('zed-b', 'Zed B', 2)])]
		);
		const markup = renderBody(staticRows, 'zed');

		expect(markup).toContain('Zed A');
		expect(markup).toContain('Zed B');
		// The SN column numbers all visible rows, not just the Go ones.
		const serials = [...markup.matchAll(/text-muted-foreground\/60 tabular-nums">(\d+)</g)].map(
			(match) => match[1]
		);
		expect(serials).toEqual(['1', '2']);
	});

	it('keeps non-Go rows visible, unranked, after the ranked rows', () => {
		const markup = renderBody(rows, '', findNeed('coding'));

		// The shared Go row is the only scored row, so it opens the ranking.
		expect(markup).toContain('title="#1 Shared Model"');
		expect(markup.indexOf('Zed Only')).toBeGreaterThan(markup.indexOf('Shared Model'));
		expect(markup.indexOf('Copilot Only')).toBeGreaterThan(markup.indexOf('Shared Model'));

		// Both static-plan-only rows are listed but never ranked: an em dash,
		// not a made-up position and not a silent drop.
		expect(markup.match(/title="No coding index data"/g)).toHaveLength(2);
	});
});
