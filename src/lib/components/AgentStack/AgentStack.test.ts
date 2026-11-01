import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import AgentStack from './AgentStack.svelte';
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
const CODEX: StackPricing = {
	inputPricePerM: 1.75,
	outputPricePerM: 14,
	cachedReadPerM: 0.175
};
const KIMI: StackPricing = {
	inputPricePerM: 3,
	outputPricePerM: 15,
	cachedReadPerM: 0.3
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

const copilotPlan: StackPlan = {
	id: 'copilot',
	name: 'Copilot Pro',
	monthlyPriceUsd: 10,
	includedUsd: 15,
	allowance: 'Copilot allowance',
	caveat: 'Copilot caveat',
	sources: [{ label: 'Copilot docs', url: 'https://docs.github.com/en/copilot' }],
	verifiedOn: '2026-11-01',
	models: [
		model('claude-haiku-5.5', 'Claude Haiku 5.5', 'Anthropic', LUNA, 36.2),
		model('gpt-6-luna', 'GPT-6 Luna', 'OpenAI', LUNA, 27.8),
		model('claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic', SONNET, 45)
	]
};

const goPlan: StackPlan = {
	id: 'go',
	name: 'OpenCode Go',
	monthlyPriceUsd: 10,
	includedUsd: 60,
	allowance: 'Go allowance',
	caveat: 'Go caveat',
	sources: [{ label: 'OpenCode Go', url: 'https://opencode.ai/go' }],
	verifiedOn: null,
	models: [
		model('gpt-5.3-codex', 'GPT-5.3-Codex', 'OpenAI', CODEX, 35),
		model('kimi-k3', 'Kimi K3', 'Moonshot AI', KIMI, 30)
	]
};

const plans = [zedPlan, copilotPlan, goPlan];

/** SSR body with hydration comments stripped and whitespace collapsed. */
function text(params: StackParams): string {
	return render(AgentStack, { props: { plans, params } })
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

const base: StackParams = { stack: 'zed', main: '', sub: '', split: 70 };

/** The rendered Tabs.Trigger buttons, with tags stripped from their labels. */
function tabs(body: string): { attributes: string; label: string }[] {
	return [...body.matchAll(/<button[^>]*\brole="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((match) => ({
		attributes: match[0].slice(0, match[0].indexOf('>')),
		label: match[1]
			.replaceAll(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	}));
}

describe('AgentStack', () => {
	it('renders the editorial pair and economics for Zed Pro', () => {
		const body = text(base);
		for (const expected of [
			'Main agent',
			'Sub-agents',
			'Claude Sonnet 5.5',
			'GPT-6 Luna',
			'Recommended',
			'Cost per 100 requests',
			'Zed Pro'
		]) {
			expect(body).toContain(expected);
		}
	});

	it('offers an explicit Compare this pair link for the Zed pair', () => {
		const body = text(base);

		expect(body).toContain('Compare this pair');
		expect(body).toContain('/compare?models=zed:claude-sonnet-5.5,zed:gpt-6-luna');
	});

	it('flags a cheaper, smarter sub-agent on Copilot Pro', () => {
		const body = text({ ...base, stack: 'copilot' });
		expect(body).toContain('Claude Haiku 5.5 scores 36.2 vs 27.8');
	});

	it('falls back to auto-picked models on a plan without the recommended pair', () => {
		const body = text({ ...base, stack: 'go' });
		expect(body).toContain('Auto-picked');
		expect(body).not.toContain('Recommended');
		expect(body).toContain('Live from the OpenCode Go catalog');
	});

	it('renders the plan switcher as accessible tabs', () => {
		const body = text(base);
		const rendered = tabs(body);

		expect(body).toContain('role="tablist"');
		expect(rendered.map((tab) => /data-value="([^"]+)"/.exec(tab.attributes)?.[1])).toEqual([
			'zed',
			'copilot',
			'go'
		]);
		expect(rendered.map((tab) => tab.label)).toEqual([
			'Zed Pro $10/mo',
			'Copilot Pro $10/mo',
			'OpenCode Go $10/mo'
		]);

		const selected = rendered.filter((tab) => tab.attributes.includes('aria-selected="true"'));
		expect(selected).toHaveLength(1);
		expect(selected[0].attributes).toContain('data-value="zed"');
	});

	it('renders savings against the main-only baseline', () => {
		const body = text(base);
		expect(body).toContain('−67%');
		expect(body).toContain('($11.35 per 100)');
	});

	it('shows a cost increase instead of a double negative when sub-agents cost more', () => {
		const body = text({
			...base,
			stack: 'go',
			main: 'gpt-5.3-codex',
			sub: 'kimi-k3',
			split: 70
		});
		expect(body).not.toContain('−-');
		expect(body).not.toContain('+-');
		expect(body).toContain('+16% more');
		expect(body).toContain('($13.87 per 100)');
	});

	it('flags the plans that substitute a requested model, and only those', () => {
		const requested = text({
			...base,
			stack: 'go',
			main: 'gpt-5.3-codex',
			sub: 'kimi-k3'
		});

		// Zed and Copilot do not carry either requested pick; OpenCode Go does.
		expect(requested).toContain('Not every plan carries the models you picked');
		expect([...requested.matchAll(/best available on this plan/g)]).toHaveLength(2);

		const carried = text(base);
		expect(carried).not.toContain('best available on this plan');
		expect(carried).not.toContain('Not every plan carries the models you picked');
	});
});
