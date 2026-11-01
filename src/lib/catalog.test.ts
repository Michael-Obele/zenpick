import { describe, expect, it } from 'vite-plus/test';
import {
	buildCatalogRows,
	isFreePlanEntry,
	matchesCatalogPlan,
	matchesCatalogRow,
	PLAN_LABEL,
	rowPlanEntry,
	type CatalogPlanEntry
} from '$lib/catalog';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
import { makeBenchmarks, makeGoModel, makePricing } from '$lib/test/fixtures';

function pricing(
	inputPricePerM: number | null,
	outputPricePerM: number | null = 0
): StackModel['pricing'] {
	return { inputPricePerM, outputPricePerM, cachedReadPerM: null };
}

function makeStackModel(partial: Partial<StackModel> = {}): StackModel {
	return {
		id: 'model',
		name: 'Model',
		provider: 'Test',
		pricing: pricing(1, 2),
		contextWindow: null,
		intelligence: null,
		...partial
	};
}

function makePlan(id: PlanId, models: StackModel[]): StackPlan {
	return {
		id,
		name: PLAN_LABEL[id],
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models
	} satisfies StackPlan;
}

/** Freeze every object reachable from `value`, so any mutation throws. */
function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === 'object') {
		for (const nested of Object.values(value)) deepFreeze(nested);
		Object.freeze(value);
	}
	return value;
}

describe('buildCatalogRows', () => {
	it('merges a model on Go, Zed and Copilot into one row with three plan entries', () => {
		const go = makeGoModel({
			id: 'claude-sonnet-5.5',
			name: 'Claude Sonnet 5.5',
			displayName: 'Claude Sonnet 5.5 (Go)',
			provider: 'Anthropic',
			pricing: makePricing({ inputPricePerM: 2, outputPricePerM: 10 }),
			benchmarks: makeBenchmarks({ reasoning: 60, coding: 55 })
		});

		const rows = buildCatalogRows(
			[go],
			[
				// A different id spelling still shares the row through `modelKey`.
				makePlan('zed', [
					makeStackModel({
						id: 'claude-sonnet-5-5',
						pricing: pricing(2.2, 11)
					})
				]),
				makePlan('copilot', [makeStackModel({ id: 'claude-sonnet-5-5', pricing: pricing(2, 10) })]),
				makePlan('go', [makeStackModel({ id: 'claude-sonnet-5.5' })])
			]
		);

		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.id).toBe('claude-sonnet-5.5');
		expect(row.name).toBe('Claude Sonnet 5.5 (Go)');
		expect(row.provider).toBe('Anthropic');
		expect(row.go).toBe(go);
		expect(row.intelligence).toBe(60);
		expect(row.coding).toBe(55);
		expect(row.plans.map((entry) => entry.plan)).toEqual(['go', 'zed', 'copilot']);
		expect(row.plans.map((entry) => entry.pricing.inputPricePerM)).toEqual([2, 2.2, 2]);
	});

	it('keeps Zed-only and Copilot-only models as their own rows', () => {
		const rows = buildCatalogRows(
			[],
			[
				makePlan('zed', [
					makeStackModel({
						id: 'zed-only',
						name: 'Zed Only',
						provider: 'Anthropic'
					})
				]),
				makePlan('copilot', [
					makeStackModel({
						id: 'copilot-only',
						name: 'Copilot Only',
						provider: 'GitHub'
					})
				])
			]
		);

		expect(rows).toHaveLength(2);
		const zedRow = rows.find((row) => row.id === 'zed-only')!;
		expect(zedRow.go).toBeNull();
		expect(zedRow.plans.map((entry) => entry.plan)).toEqual(['zed']);
		const copilotRow = rows.find((row) => row.id === 'copilot-only')!;
		expect(copilotRow.go).toBeNull();
		expect(copilotRow.plans.map((entry) => entry.plan)).toEqual(['copilot']);
	});

	it('fills context, intelligence and coding from a static plan only where Go is null', () => {
		const go = makeGoModel({
			id: 'fill-me',
			contextWindow: null,
			benchmarks: makeBenchmarks()
		});
		const [row] = buildCatalogRows(
			[go],
			[
				makePlan('zed', [
					makeStackModel({
						id: 'fill-me',
						contextWindow: 200_000,
						intelligence: 61,
						coding: 59
					})
				])
			]
		);

		expect(row.contextWindow).toBe(200_000);
		expect(row.intelligence).toBe(61);
		expect(row.coding).toBe(59);
	});

	it('never overwrites values the Go row already has', () => {
		const go = makeGoModel({
			id: 'keep-me',
			contextWindow: 1_000_000,
			benchmarks: makeBenchmarks({ reasoning: 70, coding: 68 })
		});
		const [row] = buildCatalogRows(
			[go],
			[
				makePlan('copilot', [
					makeStackModel({
						id: 'keep-me',
						contextWindow: 200_000,
						intelligence: 61,
						coding: 59
					})
				])
			]
		);

		expect(row.contextWindow).toBe(1_000_000);
		expect(row.intelligence).toBe(70);
		expect(row.coding).toBe(68);
	});

	it('propagates description and modelgrepId from the plan and the Go row', () => {
		const go = makeGoModel({
			id: 'described',
			description: 'Go description',
			modelgrepId: 'maker/described'
		});
		const rows = buildCatalogRows(
			[go],
			[
				makePlan('zed', [
					makeStackModel({
						id: 'described',
						description: 'Zed description',
						modelgrepId: 'maker/described-zed'
					}),
					makeStackModel({
						id: 'static-only',
						description: 'Static description',
						modelgrepId: 'maker/static-only'
					})
				])
			]
		);

		const merged = rows.find((row) => row.id === 'described')!;
		expect(merged.description).toBe('Go description');
		expect(merged.modelgrepId).toBe('maker/described');
		expect(merged.plans.find((entry) => entry.plan === 'zed')?.modelgrepId).toBe(
			'maker/described-zed'
		);

		const staticOnly = rows.find((row) => row.id === 'static-only')!;
		expect(staticOnly.description).toBe('Static description');
		expect(staticOnly.modelgrepId).toBe('maker/static-only');
	});

	it('fills description and modelgrepId from a static plan only where Go is null', () => {
		const go = makeGoModel({
			id: 'fill-facts',
			description: '',
			modelgrepId: null
		});
		const [row] = buildCatalogRows(
			[go],
			[
				makePlan('copilot', [
					makeStackModel({
						id: 'fill-facts',
						description: 'Copilot blurb',
						modelgrepId: 'anthropic/fill-facts'
					})
				])
			]
		);

		expect(row.description).toBe('Copilot blurb');
		expect(row.modelgrepId).toBe('anthropic/fill-facts');
	});

	it('ignores the Go plan so a Go row keeps exactly one Go entry', () => {
		const go = makeGoModel({ id: 'dup-check' });
		const [row] = buildCatalogRows(
			[go],
			[makePlan('go', [makeStackModel({ id: 'dup-check', pricing: pricing(9, 9) })])]
		);

		expect(row.plans.filter((entry) => entry.plan === 'go')).toHaveLength(1);
		expect(row.plans).toHaveLength(1);
		expect(row.plans[0].pricing.inputPricePerM).toBe(go.pricing.inputPricePerM);
	});

	it('does not mutate its inputs', () => {
		// Deep-frozen, so a mutation of the Go model, a StackModel or any pricing
		// object would throw rather than pass silently.
		const go = deepFreeze(makeGoModel({ id: 'frozen' }));
		const models = [deepFreeze(makeStackModel({ id: 'frozen' }))];
		const plans = [deepFreeze(makePlan('zed', models))];

		expect(() => buildCatalogRows([go], plans)).not.toThrow();
	});
});

describe('rowPlanEntry', () => {
	it('returns the requested plan price and the cheapest input price for all plans', () => {
		const go = makeGoModel({
			id: 'priced',
			pricing: makePricing({ inputPricePerM: 3, outputPricePerM: 15 })
		});
		const [row] = buildCatalogRows(
			[go],
			[
				makePlan('zed', [makeStackModel({ id: 'priced', pricing: pricing(1.1, 9) })]),
				makePlan('copilot', [makeStackModel({ id: 'priced', pricing: pricing(1.1, 2) })])
			]
		);

		expect(rowPlanEntry(row, 'go')?.pricing.inputPricePerM).toBe(3);
		expect(rowPlanEntry(row, 'zed')?.pricing.inputPricePerM).toBe(1.1);
		// Tie on input price, so the cheaper output price wins.
		expect(rowPlanEntry(row, '')?.plan).toBe('copilot');
	});

	it('sorts null input prices last', () => {
		const go = makeGoModel({
			id: 'null-priced',
			pricing: makePricing({ inputPricePerM: null })
		});
		const [row] = buildCatalogRows(
			[go],
			[makePlan('copilot', [makeStackModel({ id: 'null-priced', pricing: pricing(2, 4) })])]
		);

		expect(rowPlanEntry(row, '')?.plan).toBe('copilot');
	});

	it('still returns an entry when every input price is null', () => {
		const [row] = buildCatalogRows(
			[],
			[makePlan('zed', [makeStackModel({ id: 'all-null', pricing: pricing(null, null) })])]
		);

		expect(rowPlanEntry(row, '')).toBe(row.plans[0]);
	});

	it('returns null for a plan the row is not on', () => {
		const [row] = buildCatalogRows([], [makePlan('zed', [makeStackModel({ id: 'zed-only' })])]);

		expect(rowPlanEntry(row, 'copilot')).toBeNull();
		expect(rowPlanEntry(row, 'zed')).not.toBeNull();
	});
});

describe('matchesCatalogRow', () => {
	const go = makeGoModel({
		id: 'shared-model',
		name: 'Shared Model',
		provider: 'Acme',
		tags: [{ label: 'Vision', icon: 'eye', source: 'computed' }]
	});
	const [row] = buildCatalogRows(
		[go],
		[makePlan('copilot', [makeStackModel({ id: 'shared-model' })])]
	);

	it('matches plan names and model identity', () => {
		expect(matchesCatalogRow(row, 'copilot')).toBe(true);
		expect(matchesCatalogRow(row, 'acme')).toBe(true);
		expect(matchesCatalogRow(row, 'shared')).toBe(true);
	});

	it('keeps Go tags searchable through the shared model search', () => {
		expect(matchesCatalogRow(row, 'vision')).toBe(true);
	});

	it('treats an empty query as a match and rejects nonsense', () => {
		expect(matchesCatalogRow(row, '   ')).toBe(true);
		expect(matchesCatalogRow(row, 'definitely-not-a-model')).toBe(false);
	});
});

describe('matchesCatalogPlan', () => {
	const rows = buildCatalogRows(
		[makeGoModel({ id: 'shared-model' })],
		[
			makePlan('zed', [makeStackModel({ id: 'shared-model' })]),
			makePlan('copilot', [makeStackModel({ id: 'copilot-only' })])
		]
	);
	const shared = rows.find((row) => row.id === 'shared-model')!;
	const copilotOnly = rows.find((row) => row.id === 'copilot-only')!;

	it('treats the empty filter as every plan', () => {
		expect(matchesCatalogPlan(shared, '')).toBe(true);
		expect(matchesCatalogPlan(copilotOnly, '')).toBe(true);
	});

	it('matches only the plans that carry the row', () => {
		expect(matchesCatalogPlan(shared, 'go')).toBe(true);
		expect(matchesCatalogPlan(shared, 'zed')).toBe(true);
		expect(matchesCatalogPlan(shared, 'copilot')).toBe(false);
		expect(matchesCatalogPlan(copilotOnly, 'copilot')).toBe(true);
		expect(matchesCatalogPlan(copilotOnly, 'zed')).toBe(false);
	});
});

describe('isFreePlanEntry', () => {
	it('flags only entries priced at zero in and out', () => {
		const free = {
			plan: 'zed',
			id: 'free',
			pricing: pricing(0, 0)
		} satisfies CatalogPlanEntry;
		const paid = {
			plan: 'zed',
			id: 'paid',
			pricing: pricing(0.1, 0)
		} satisfies CatalogPlanEntry;

		expect(isFreePlanEntry(free)).toBe(true);
		expect(isFreePlanEntry(paid)).toBe(false);
	});
});
