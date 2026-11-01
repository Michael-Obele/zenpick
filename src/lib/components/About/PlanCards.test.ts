import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import PlanCards from './PlanCards.svelte';
import type { StackModel, StackPlan } from '$lib/stack/plans';

function model(id: string): StackModel {
	return {
		id,
		name: id,
		provider: 'Test',
		pricing: { inputPricePerM: 1, outputPricePerM: 2, cachedReadPerM: null },
		contextWindow: null,
		intelligence: null
	};
}

const checkedPlan: StackPlan = {
	id: 'zed',
	name: 'Zed Test',
	monthlyPriceUsd: 12,
	includedUsd: 5,
	allowance: 'Allowance copy for the checked plan.',
	caveat: 'Caveat copy for the checked plan.',
	sources: [
		{ label: 'First source', url: 'https://example.com/first' },
		{ label: 'Second source', url: 'https://example.com/second' }
	],
	verifiedOn: '2026-11-01',
	models: [model('a'), model('b'), model('c')]
};

const livePlan: StackPlan = {
	id: 'go',
	name: 'Live Test',
	monthlyPriceUsd: 7,
	includedUsd: 60,
	allowance: 'Allowance copy for the live plan.',
	caveat: 'Caveat copy for the live plan.',
	sources: [{ label: 'Live source', url: 'https://example.com/live' }],
	verifiedOn: null,
	models: [model('only')]
};

/** SSR body with hydration comments stripped and whitespace collapsed. */
const markup = render(PlanCards, { props: { plans: [checkedPlan, livePlan] } })
	.body.replaceAll(/<!--[\s\S]*?-->/g, '')
	.replace(/\s+/g, ' ');

describe('PlanCards', () => {
	it('renders one article per plan with its name and monthly price', () => {
		expect(markup.match(/<article/g)).toHaveLength(2);
		expect(markup).toContain('Zed Test');
		expect(markup).toContain('Live Test');
		expect(markup).toContain('$12/mo');
		expect(markup).toContain('$7/mo');
	});

	it('renders the allowance and caveat of each plan', () => {
		expect(markup).toContain('What $12/mo buys');
		expect(markup).toContain('What $7/mo buys');
		expect(markup).toContain('Watch out');
		expect(markup).toContain('Allowance copy for the checked plan.');
		expect(markup).toContain('Caveat copy for the checked plan.');
		expect(markup).toContain('Allowance copy for the live plan.');
		expect(markup).toContain('Caveat copy for the live plan.');
	});

	it('links every source in a new tab', () => {
		for (const [label, url] of [
			['First source', 'https://example.com/first'],
			['Second source', 'https://example.com/second'],
			['Live source', 'https://example.com/live']
		]) {
			expect(markup).toContain(`href="${url}"`);
			expect(markup).toContain(label);
		}
		expect(markup.match(/target="_blank"/g)).toHaveLength(3);
		expect(markup.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
	});

	it('states provenance from verifiedOn', () => {
		expect(markup).toContain('Checked 2026-11-01');
		expect(markup).toContain('Model list live; plan terms from the Go docs');
		expect(markup.match(/Checked /g)).toHaveLength(1);
	});

	it('pluralises the model count', () => {
		expect(markup).toContain('3 models');
		expect(markup).toContain('1 model');
		expect(markup).not.toContain('1 models');
	});
});
