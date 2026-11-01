import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'svelte/server';
import AgentPairBuilder from './AgentPairBuilder.svelte';
import type { StackModel, StackPlan, StackPricing } from '$lib/stack/plans';
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

const params: StackParams = { stack: 'zed', main: '', sub: '', split: 70 };

/** SSR body with hydration comments stripped and whitespace collapsed. */
function text(
	overrides: Partial<{
		plans: StackPlan[];
		params: StackParams;
		selectedKeys: string[];
	}> = {}
): string {
	return render(AgentPairBuilder, {
		props: {
			plans,
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

	it('names the default main + sub pair and its one-line economics', () => {
		const body = text();

		expect(body).toContain('Claude Sonnet 5.5 + GPT-6 Luna');
		expect(body).toContain('$3.80 per 100 requests');
		expect(body).toContain('−67%');
		expect(body).toContain('70% of requests to sub-agents');
	});

	it('never adds the pair to the comparison on render', () => {
		const onUse = vi.fn();
		render(AgentPairBuilder, {
			props: { plans, params, defaultOpen: true, selectedKeys: [], onUse }
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
			params: { ...params, stack: 'go' },
			// Legacy bare Go key + the dashed spelling of the dotted catalog id.
			selectedKeys: ['gpt-6-luna', 'go:claude-sonnet-5-5']
		});

		expect(body).toContain('In comparison');
		expect(body).toMatch(/<button[^>]*disabled[^>]*>\s*In comparison/);
	});
});
