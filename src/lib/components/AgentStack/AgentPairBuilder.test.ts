import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'svelte/server';
import AgentPairBuilder from './AgentPairBuilder.svelte';
import type { CompareModel } from '$lib/compare-model';
import type { PlanId, StackModel, StackPlan, StackPricing } from '$lib/stack/plans';
import type { StackParams } from '$lib/stack/search';
import { makeBurnDetails, makeGoModel, makePricing } from '$lib/test/fixtures';
import type { GoModel } from '$lib/types/models';

const SONNET: StackPricing = {
	inputPricePerM: 2,
	outputPricePerM: 10,
	cachedReadPerM: 0.2
};
const LUNA: StackPricing = {
	inputPricePerM: 0.1,
	outputPricePerM: 0.5,
	cachedReadPerM: 0.01
};

function model(
	id: string,
	name: string,
	provider: string,
	pricing: StackPricing,
	intelligence: number | null
): StackModel {
	return { id, name, provider, pricing, contextWindow: 200_000, intelligence };
}

/**
 * A compare column whose benchmark fields all match `intelligence`, so
 * `stackQuality` returns the same score the plan-model fixture already names.
 */
function column(m: StackModel, plan: PlanId = 'zed', go: GoModel | null = null): CompareModel {
	const bench = {
		coding: m.intelligence,
		reasoning: m.intelligence,
		math: m.intelligence,
		sweBenchVerified: m.intelligence == null ? null : m.intelligence / 100,
		designElo: null,
		codeArena: null,
		allScores: {}
	};
	return {
		key: `${plan}:${m.id}`,
		plan,
		id: m.id,
		name: m.name,
		provider: m.provider,
		description: null,
		note: null,
		modelgrepId: null,
		llmStatsId: null,
		pricing: m.pricing,
		contextWindow: m.contextWindow,
		includedUsd: 5,
		monthlyPriceUsd: 10,
		benchmarks: bench,
		capabilities: null,
		openWeight: null,
		speed: null,
		tags: [],
		go
	};
}

/** Zed-like plan: the recommended pair is Claude Sonnet 5.5 + GPT-6 Luna. */
const zedPlan: StackPlan = {
	id: 'zed',
	name: 'Zed Pro',
	monthlyPriceUsd: 10,
	includedUsd: 5,
	allowance: 'Zed allowance',
	caveat: 'Zed caveat',
	sources: [
		{
			label: 'Zed docs',
			url: 'https://zed.dev/docs/account/zed-hosted-models'
		}
	],
	verifiedOn: '2026-11-01',
	models: [
		model('claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic', SONNET, 45),
		model('gpt-6-luna', 'GPT-6 Luna', 'OpenAI', LUNA, 27.8)
	]
};

const plans = [zedPlan];

/** The same catalog under Go, so a legacy bare key is a Go key. */
const goPlan: StackPlan = { ...zedPlan, id: 'go', name: 'OpenCode Go' };

const models = zedPlan.models.map((m) => column(m));

const params: StackParams = { stack: 'zed', main: '', sub: '', split: 70 };

/** SSR body with hydration comments stripped and whitespace collapsed. */
function text(
	overrides: Partial<{
		plans: StackPlan[];
		models: CompareModel[];
		params: StackParams;
		selectedKeys: string[];
	}> = {}
): string {
	return render(AgentPairBuilder, {
		props: {
			plans,
			models,
			params,
			defaultOpen: true,
			selectedKeys: [],
			onUse: () => {},
			...overrides
		}
	})
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('AgentPairBuilder', () => {
	it('renders the collapsed trigger and the opened builder controls', () => {
		const body = text();

		expect(body).toContain('Build an agent pair');
		expect(body).toContain('>Plan<');
		expect(body).toContain('>Main agent<');
		expect(body).toContain('>Sub-agents<');
		expect(body).toContain('Use this pair');
	});

	it('recommends the strongest selected model as main and the cheaper one as sub', () => {
		const body = text();

		expect(body).toContain('Recommended from this comparison');
		expect(body).toContain('Claude Sonnet 5.5 + GPT-6 Luna');
		expect(body).toContain('$3.80');
		expect(body).toContain('−67%');
		expect(body).toContain('70%');
	});

	it('explains the plan allowance and each role’s burn rate', () => {
		const body = text();

		expect(body).toContain('Zed Pro includes $5 of tokens each month');
		expect(body).toContain('Main burn: Fast burn');
		expect(body).toContain('sub burn: Slow burn');
	});

	it('lists what the pair offers and what to watch out for', () => {
		const body = text();

		expect(body).toContain('What this pair offers');
		expect(body).toContain('Watch out');
		// Luna retains ~62% of Sonnet's composite, below the 70% comfort line.
		expect(body).toContain('keeps only 62% of the main');
	});

	it('lets an explicit sub claim its role, pushing the other model to main', () => {
		// The URL can carry `sub=claude-sonnet-5.5` while `main` is left to the
		// auto-suggestion — the sub's claim must win instead of being discarded.
		const body = text({ params: { ...params, sub: 'claude-sonnet-5.5' } });

		expect(body).toContain('Your pick');
		expect(body).toContain('GPT-6 Luna + Claude Sonnet 5.5');
	});

	it('follows an explicit main and offers the remaining model as sub', () => {
		const body = text({ params: { ...params, main: 'gpt-6-luna' } });

		expect(body).toContain('Your pick');
		expect(body).toContain('GPT-6 Luna + Claude Sonnet 5.5');
	});

	it('refuses to build a pair from models on different plans', () => {
		const body = text({
			models: [column(zedPlan.models[0]), column(zedPlan.models[1], 'copilot')]
		});

		expect(body).toContain('does not have two models on the same plan');
		expect(body).not.toContain('Use this pair');
	});

	it('never adds the pair to the comparison on render', () => {
		const onUse = vi.fn();
		render(AgentPairBuilder, {
			props: {
				plans,
				models,
				params,
				defaultOpen: true,
				selectedKeys: [],
				onUse
			}
		});

		expect(onUse).not.toHaveBeenCalled();
	});

	it('reports a pair that is already in the comparison', () => {
		const body = text({
			selectedKeys: ['zed:claude-sonnet-5.5', 'zed:gpt-6-luna']
		});

		expect(body).toContain('In comparison');
		expect(body).toMatch(/<button[^>]*disabled[^>]*>\s*In comparison/);
	});

	it('matches selected keys by identity, not exact spelling', () => {
		const body = text({
			plans: [goPlan],
			models: zedPlan.models.map((m) => column(m, 'go')),
			params: { ...params, stack: 'go' },
			// Legacy bare Go key + the dashed spelling of the dotted catalog id.
			selectedKeys: ['gpt-6-luna', 'go:claude-sonnet-5-5']
		});

		expect(body).toContain('In comparison');
		expect(body).toMatch(/<button[^>]*disabled[^>]*>\s*In comparison/);
	});

	it('judges a Go pair’s cost by the docs burn windows, not list price', () => {
		// The sub costs MORE per token but burns far less of the Go allowance —
		// the price-only verdict wrongly called this pair a non-saver.
		const mainStack = model('glm-go', 'GLM 5.3 Flash', 'Z.ai', SONNET, 45);
		const subStack = model(
			'deepseek-go',
			'DeepSeek 4.1 Flash',
			'DeepSeek',
			{
				inputPricePerM: 2.5,
				outputPricePerM: 10.5,
				cachedReadPerM: 0.25
			},
			27.8
		);
		const body = text({
			plans: [goPlan],
			models: [
				column(
					mainStack,
					'go',
					makeGoModel({
						id: 'glm-go',
						name: 'GLM 5.3 Flash',
						provider: 'Z.ai',
						pricing: makePricing({
							inputPricePerM: 2,
							outputPricePerM: 10,
							cachedReadPerM: 0.2
						}),
						burnDetails: makeBurnDetails({
							score: 67,
							requestsPer12: 6320,
							band: 'good'
						})
					})
				),
				column(
					subStack,
					'go',
					makeGoModel({
						id: 'deepseek-go',
						name: 'DeepSeek 4.1 Flash',
						provider: 'DeepSeek',
						pricing: makePricing({
							inputPricePerM: 2.5,
							outputPricePerM: 10.5,
							cachedReadPerM: 0.25
						}),
						burnDetails: makeBurnDetails({
							score: 99,
							requestsPer12: 43330,
							band: 'excellent'
						})
					})
				)
			],
			params: { ...params, stack: 'go' }
		});

		expect(body).toContain('GLM 5.3 Flash + DeepSeek 4.1 Flash');
		// Window share at split 70: blended = 0.3 + 0.7·(6320/43330) = 40.2% of
		// all-main → 60% saved — even though list price says +8% more.
		expect(body).toContain('−60%');
		expect(body).toContain('fits 6.9× more requests into the same $12 window');
		expect(body).not.toContain('saves nothing');
	});
});
