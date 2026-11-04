import { describe, expect, it } from 'vite-plus/test';
import { planModelEconomics } from './allowance';

const WORKLOAD = { tokens: 50_000, cachedPct: 50 };

describe('planModelEconomics', () => {
	it('turns a monthly dollar allowance into requests, cost per 100 and budget share', () => {
		const economics = planModelEconomics(
			{ pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 } },
			5,
			WORKLOAD
		);

		// 17.5K uncached in + 17.5K cached in + 7.5K out at $2 / $0.20 / $10 per 1M.
		expect(economics.costPerRequest).toBeCloseTo(0.1135, 6);
		expect(economics.costPer100).toBeCloseTo(11.35, 6);
		expect(economics.includedRequests).toBe(44);
		expect(economics.budgetPer100Pct).toBeCloseTo(227, 1);
		expect(economics.burnRate).toBe('fast');
	});

	it('marks a free model as zero-burn with no request ceiling', () => {
		const economics = planModelEconomics(
			{ pricing: { inputPricePerM: 0, outputPricePerM: 0, cachedReadPerM: null } },
			5,
			WORKLOAD
		);

		expect(economics.costPerRequest).toBe(0);
		expect(economics.costPer100).toBe(0);
		expect(economics.includedRequests).toBeNull();
		expect(economics.budgetPer100Pct).toBe(0);
		expect(economics.burnRate).toBe('free');
	});

	it('leaves allowance-derived figures unknown when the plan has no allowance', () => {
		const economics = planModelEconomics(
			{ pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 } },
			null,
			WORKLOAD
		);

		expect(economics.costPer100).not.toBeNull();
		expect(economics.includedRequests).toBeNull();
		expect(economics.budgetPer100Pct).toBeNull();
	});

	it('uses the price band for the burn rate', () => {
		expect(
			planModelEconomics(
				{ pricing: { inputPricePerM: 0.1, outputPricePerM: 0.5, cachedReadPerM: 0.01 } },
				5,
				WORKLOAD
			).burnRate
		).toBe('slow');
		expect(
			planModelEconomics(
				{ pricing: { inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: 0.1 } },
				5,
				WORKLOAD
			).burnRate
		).toBe('medium');
	});
});
