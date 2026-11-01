import { describe, expect, it } from 'vite-plus/test';
import {
	betterValue,
	compareAcrossPlans,
	DEFAULT_WORKLOAD,
	findModel,
	isRecommended,
	modelKey,
	RECOMMENDED_MAIN,
	RECOMMENDED_SUB,
	requestCost,
	resolveStack,
	stackEconomics,
	type StackWorkload
} from './logic';
import type { StackModel, StackPlan, StackPricing } from './plans';

function model(
	id: string,
	pricing: StackPricing = {
		inputPricePerM: 2,
		outputPricePerM: 10,
		cachedReadPerM: 0.2
	},
	intelligence: number | null = 40
): StackModel {
	return {
		id,
		name: id,
		provider: 'Test',
		pricing,
		contextWindow: null,
		intelligence
	};
}

function plan(models: StackModel[], includedUsd = 15): StackPlan {
	return {
		id: 'zed',
		name: 'Test plan',
		monthlyPriceUsd: 10,
		includedUsd,
		allowance: 'Test allowance',
		caveat: 'Test caveat',
		sources: [],
		verifiedOn: null,
		models
	};
}

const workload: StackWorkload = { tokens: 50_000, cachedPct: 50, subShare: 70 };
const mainPricing: StackPricing = {
	inputPricePerM: 2,
	outputPricePerM: 10,
	cachedReadPerM: 0.2
};
const subPricing: StackPricing = {
	inputPricePerM: 0.1,
	outputPricePerM: 0.5,
	cachedReadPerM: 0.01
};

describe('stack logic', () => {
	it('normalizes model identity and finds recommendations by model key', () => {
		expect(modelKey('claude-haiku-5.5')).toBe(modelKey('claude-haiku-5-5'));
		expect(findModel([model('claude-haiku-5.5')], 'claude-haiku-5-5')?.id).toBe('claude-haiku-5.5');
		expect(findModel([model('anything')], '')).toBeNull();
		expect(isRecommended(model(RECOMMENDED_MAIN), 'main')).toBe(true);
		expect(isRecommended(model(RECOMMENDED_SUB), 'sub')).toBe(true);
	});

	it('calculates blended and main-only request costs', () => {
		const economics = stackEconomics(
			plan([]),
			model('main', mainPricing),
			model('sub', subPricing),
			workload
		);
		expect(economics).not.toBeNull();
		expect(economics!.costPerRequest).toBeCloseTo(0.0380225);
		expect(economics!.costPer100).toBeCloseTo(3.80225);
		expect(economics!.mainOnlyCostPer100).toBeCloseTo(11.35);
		expect(economics!.savingsPct).toBeGreaterThanOrEqual(66);
		expect(economics!.savingsPct).toBeLessThanOrEqual(67);
		expect(economics!.requestsPerMonth).toBe(394);
	});

	it('clamps sub-agent share at both ends', () => {
		const main = model('main', mainPricing);
		const sub = model('sub', subPricing);
		const mainCost = requestCost(main, workload);
		const subCost = requestCost(sub, workload);
		expect(stackEconomics(plan([]), main, sub, { ...workload, subShare: 0 })?.costPerRequest).toBe(
			mainCost
		);
		expect(
			stackEconomics(plan([]), main, sub, { ...workload, subShare: 100 })?.costPerRequest
		).toBe(subCost);
		expect(
			stackEconomics(plan([]), main, sub, { ...workload, subShare: 150 })?.costPerRequest
		).toBe(subCost);
		expect(stackEconomics(plan([]), main, sub, { ...workload, subShare: -5 })?.costPerRequest).toBe(
			mainCost
		);
	});

	it('treats zero-cost models as unlimited and null pricing as unusable', () => {
		const free = model('free', {
			inputPricePerM: 0,
			outputPricePerM: 0,
			cachedReadPerM: 0
		});
		const freeEconomics = stackEconomics(plan([]), free, free, workload);
		expect(freeEconomics?.requestsPerMonth).toBeNull();
		expect(freeEconomics?.savingsPct).toBe(0);

		const missing = model('missing', {
			inputPricePerM: null,
			outputPricePerM: 1,
			cachedReadPerM: null
		});
		expect(requestCost(missing, workload)).toBeNull();
		expect(stackEconomics(plan([]), missing, free, workload)).toBeNull();
		expect(stackEconomics(plan([]), free, missing, workload)).toBeNull();
	});

	it('resolves URL choices first, then editorial defaults', () => {
		const main = model(RECOMMENDED_MAIN);
		const sub = model(RECOMMENDED_SUB);
		const other = model('other');
		const available = plan([main, sub, other]);

		const selected = resolveStack(available, 'other', RECOMMENDED_SUB, workload);
		expect(selected.main).toBe(other);
		expect(selected.sub).toBe(sub);
		expect(selected.autoMain).toBe(false);
		expect(selected.autoSub).toBe(false);

		const fallback = resolveStack(available, 'unknown-main', 'unknown-sub', workload);
		expect(fallback.main).toBe(main);
		expect(fallback.sub).toBe(sub);
		expect(fallback.autoMain).toBe(false);
		expect(fallback.autoSub).toBe(false);
	});

	it('auto-picks by role rules when editorial defaults are absent', () => {
		const nullIntelligence = model(
			'cheap-null-intelligence',
			{ inputPricePerM: 0.01, outputPricePerM: 1, cachedReadPerM: 0 },
			null
		);
		const highMain = model(
			'high-main',
			{ inputPricePerM: 2, outputPricePerM: 20, cachedReadPerM: 0.2 },
			50
		);
		const lowerMain = model(
			'lower-main',
			{ inputPricePerM: 1, outputPricePerM: 20, cachedReadPerM: 0.1 },
			40
		);
		const cheapestQualifiedSub = model(
			'qualified-sub',
			{ inputPricePerM: 0.1, outputPricePerM: 15, cachedReadPerM: 0.01 },
			25
		);
		const resolved = resolveStack(
			plan([nullIntelligence, highMain, lowerMain, cheapestQualifiedSub]),
			'unknown-main',
			'unknown-sub',
			workload
		);
		expect(resolved.main).toBe(highMain);
		expect(resolved.sub).toBe(cheapestQualifiedSub);
		expect(resolved.autoMain).toBe(true);
		expect(resolved.autoSub).toBe(true);
	});

	it('uses lower cost and higher intelligence to break role-specific ties', () => {
		const mainCostlier = model(
			'main-costlier',
			{ inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 },
			50
		);
		const mainCheaper = model(
			'main-cheaper',
			{ inputPricePerM: 1, outputPricePerM: 10, cachedReadPerM: 0.1 },
			50
		);
		const subLowerIntelligence = model('sub-lower-intelligence', subPricing, 30);
		const subHigherIntelligence = model('sub-higher-intelligence', subPricing, 35);
		const resolved = resolveStack(
			plan([mainCostlier, mainCheaper, subLowerIntelligence, subHigherIntelligence]),
			'',
			'',
			workload
		);
		expect(resolved.main).toBe(mainCheaper);
		expect(resolved.sub).toBe(subHigherIntelligence);
	});

	it('falls back to all priced models for sub and to any scored model for main', () => {
		const nullIntelligence = model(
			'null-intelligence',
			{ inputPricePerM: 0, outputPricePerM: 1, cachedReadPerM: 0 },
			null
		);
		const higherScore = model(
			'higher-score',
			{ inputPricePerM: 1, outputPricePerM: 20, cachedReadPerM: 0.1 },
			24
		);
		const lowerCost = model(
			'lower-cost',
			{ inputPricePerM: 0.1, outputPricePerM: 30, cachedReadPerM: 0.01 },
			24
		);
		const resolved = resolveStack(
			plan([nullIntelligence, higherScore, lowerCost]),
			'',
			'',
			workload
		);
		expect(resolved.main).toBe(higherScore);
		expect(resolved.sub).toBe(nullIntelligence);
	});

	it('returns null main when no model has intelligence, even when priced', () => {
		const onlyModel = model('only', mainPricing, null);
		const resolved = resolveStack(plan([onlyModel]), '', '', workload);
		expect(resolved.main).toBeNull();
		expect(resolved.sub).toBe(onlyModel);
		expect(resolved.autoMain).toBe(true);
		expect(resolved.autoSub).toBe(true);
	});

	it('finds a cheaper-or-equal model with at least five more intelligence points', () => {
		const picked = model('luna-like', subPricing, 27.8);
		const haiku = model('haiku-like', subPricing, 36.2);
		expect(betterValue([picked, haiku], picked, workload)).toBe(haiku);

		const pricier = model(
			'pricier',
			{ inputPricePerM: 0.2, outputPricePerM: 0.5, cachedReadPerM: 0.02 },
			40
		);
		expect(betterValue([picked, pricier], picked, workload)).toBeNull();

		const smallDelta = model('small-delta', subPricing, 32.7);
		expect(betterValue([picked, smallDelta], picked, workload)).toBeNull();
		expect(
			betterValue(
				[model('no-intelligence', subPricing, null)],
				model('no-intelligence', subPricing, null),
				workload
			)
		).toBeNull();
	});

	it('compares plans in order and leaves economics null if a stack cannot resolve', () => {
		const main = model(RECOMMENDED_MAIN, mainPricing);
		const sub = model(RECOMMENDED_SUB, subPricing);
		const available = plan([main, sub]);
		const unavailable: StackPlan = {
			...plan([]),
			id: 'copilot',
			name: 'Unavailable'
		};
		const rows = compareAcrossPlans(
			[available, unavailable],
			RECOMMENDED_MAIN,
			RECOMMENDED_SUB,
			DEFAULT_WORKLOAD
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.plan)).toEqual([available, unavailable]);
		expect(rows[0].economics).not.toBeNull();
		expect(rows[1].economics).toBeNull();
	});
});
