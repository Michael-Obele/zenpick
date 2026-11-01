import { describe, expect, it } from 'vite-plus/test';
import { makeAa, makeBenchmarks, makeGoModel, makeModelgrep } from '$lib/test/fixtures';
import type { GoModel, ModelgrepModelData } from '$lib/types/models';
import { buildStackPlans } from './build';

function modelgrepModel(
	id: string,
	intelligence: number | null = null,
	context_length = 0
): ModelgrepModelData {
	return {
		...makeModelgrep(makeAa({ intelligence })),
		id,
		context_length
	};
}

describe('buildStackPlans', () => {
	it('builds plans in tab order with static verification dates only', () => {
		const [zed, copilot, go] = buildStackPlans([], []);

		expect([zed.id, copilot.id, go.id]).toEqual(['zed', 'copilot', 'go']);
		expect(zed.verifiedOn).toBeTruthy();
		expect(copilot.verifiedOn).toBeTruthy();
		expect(go.verifiedOn).toBeNull();
		expect([zed, copilot, go].some((plan) => 'priceMultiplier' in plan)).toBe(false);
	});

	it('uses static pricing and modelgrep intelligence and context fallbacks', () => {
		const plans = buildStackPlans(
			[],
			[
				modelgrepModel('anthropic/claude-sonnet-5.5', 54.2),
				modelgrepModel('openai/gpt-6-luna', 50, 1_050_000),
				modelgrepModel('openai/gpt-5.6-luna', 30, 100_000),
				modelgrepModel('anthropic/claude-haiku-5.5', 45, 0)
			]
		);
		const zed = plans[0];
		const copilot = plans[1];
		const sonnet = zed.models.find((model) => model.id === 'claude-sonnet-5.5')!;
		const luna = zed.models.find((model) => model.id === 'gpt-6-luna')!;
		const copilotSonnet = copilot.models.find((model) => model.id === 'claude-sonnet-5.5')!;
		const copilotLuna = copilot.models.find((model) => model.id === 'gpt-6-luna')!;
		const haiku = copilot.models.find((model) => model.id === 'claude-haiku-5.5')!;
		const mai = copilot.models.find((model) => model.id === 'mai-code-1.1-flash')!;

		expect(sonnet.pricing.inputPricePerM).toBeCloseTo(2.2);
		expect(sonnet.pricing.outputPricePerM).toBeCloseTo(11);
		expect(sonnet.pricing.cachedReadPerM).toBeCloseTo(0.22);
		expect(copilotSonnet.pricing.inputPricePerM).toBeCloseTo(2);
		expect(copilotSonnet.pricing.outputPricePerM).toBeCloseTo(10);
		expect(copilotSonnet.pricing.cachedReadPerM).toBeCloseTo(0.1);
		expect(sonnet.intelligence).toBe(54.2);
		expect(mai.intelligence).toBeNull();
		expect(luna.contextWindow).toBe(272_000);
		expect(copilotLuna.contextWindow).toBe(1_050_000);
		expect(haiku.contextWindow).toBeNull();
	});

	it('filters and maps Go models, then sorts by intelligence and name', () => {
		const goModels = [
			makeGoModel({
				id: 'z-score',
				name: 'Z-score',
				displayName: 'Zeta',
				benchmarks: makeBenchmarks({ reasoning: 80 })
			}),
			makeGoModel({
				id: 'a-score',
				name: 'A-score',
				displayName: 'Alpha',
				benchmarks: makeBenchmarks({ reasoning: 80 })
			}),
			makeGoModel({ id: 'z-null', name: 'Zulu' }),
			makeGoModel({ id: 'a-null', name: 'Able' }),
			makeGoModel({ id: 'no-input', pricing: { ...makeGoModel().pricing, inputPricePerM: null } }),
			makeGoModel({ id: 'no-output', pricing: { ...makeGoModel().pricing, outputPricePerM: null } })
		];
		const plans = buildStackPlans(goModels, []);
		const models = plans[2].models;

		expect(models.map((model) => model.name)).toEqual(['Alpha', 'Zeta', 'Able', 'Zulu']);
		expect(models[0].id).toBe('a-score');
		expect(models[0].intelligence).toBe(80);
		expect(models[0].pricing).toEqual({
			inputPricePerM: 1,
			outputPricePerM: 2,
			cachedReadPerM: 0.1
		});
	});

	it('does not mutate input arrays', () => {
		const goModels = Object.freeze([makeGoModel()]) as unknown as GoModel[];
		const modelgrep = Object.freeze([
			modelgrepModel('anthropic/claude-sonnet-5.5')
		]) as unknown as ModelgrepModelData[];

		expect(() => buildStackPlans(goModels, modelgrep)).not.toThrow();
	});
});
