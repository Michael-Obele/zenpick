import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'svelte/server';
import AgentPairBuilder from './AgentPairBuilder.svelte';
import type { CompareModel } from '$lib/compare-model';
import type { PlanId, StackModel, StackPlan, StackPricing } from '$lib/stack/plans';
import type { StackParams } from '$lib/stack/search';

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
function column(m: StackModel, plan: PlanId = 'zed'): CompareModel {
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
		go: null
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
});
