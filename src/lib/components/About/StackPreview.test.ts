import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import StackPreview from './StackPreview.svelte';
import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';

function model(
	id: string,
	name: string,
	pricing: StackModel['pricing'],
	intelligence: number | null
): StackModel {
	return {
		id,
		name,
		provider: 'Test',
		pricing,
		contextWindow: 200_000,
		intelligence
	};
}

function makePlan(id: PlanId, name: string, includedUsd: number, models: StackModel[]): StackPlan {
	return {
		id,
		name,
		monthlyPriceUsd: 10,
		includedUsd,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: null,
		models
	};
}

/** Carries both recommended defaults, so neither side is auto-picked. */
const recommendedPlan = makePlan('zed', 'Zed Test', 5, [
	model(
		'claude-sonnet-5.5',
		'Claude Sonnet 5.5',
		{ inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 },
		60
	),
	model(
		'gpt-6-luna',
		'GPT-6 Luna',
		{ inputPricePerM: 0.1, outputPricePerM: 0.5, cachedReadPerM: 0.01 },
		30
	)
]);

/** No recommended ids, so both sides fall back to the auto-pick rules. */
const autoPlan = makePlan('copilot', 'Copilot Test', 15, [
	model(
		'alpha',
		'Alpha Strong',
		{ inputPricePerM: 1, outputPricePerM: 8, cachedReadPerM: null },
		50
	),
	model(
		'beta',
		'Beta Cheap',
		{ inputPricePerM: 0.1, outputPricePerM: 0.5, cachedReadPerM: null },
		30
	)
]);

const emptyPlan = makePlan('go', 'Empty Test', 60, []);

/** SSR body with hydration comments stripped and whitespace collapsed. */
function body(plans: StackPlan[]): string {
	return render(StackPreview, { props: { plans } })
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

describe('StackPreview', () => {
	it('renders the table headers, plan names and pair names', () => {
		const markup = body([recommendedPlan, autoPlan]);

		for (const header of ['Plan', 'Default pair', 'Cost per 100 requests', 'Included each month']) {
			expect(markup).toContain(header);
		}
		expect(markup).toContain('Zed Test');
		expect(markup).toContain('Copilot Test');
		expect(markup).toContain('$10/mo');
		expect(markup).toContain('Claude Sonnet 5.5 + GPT-6 Luna');
		expect(markup).toContain('Alpha Strong + Beta Cheap');
	});

	it('pins the exact cost and monthly coverage from the real helpers', () => {
		// Sonnet: (17500*2 + 17500*0.2 + 7500*10) / 1e6 = 0.1135 per request.
		// Luna: (17500*0.1 + 17500*0.01 + 7500*0.5) / 1e6 = 0.005675 per request.
		// Blend at 70% sub: 0.3 * 0.1135 + 0.7 * 0.005675 = 0.0380225 -> $3.80 per 100.
		// $5 included / 0.0380225 = 131.5 -> 131 requests.
		const markup = body([recommendedPlan]);

		expect(markup).toContain('$3.80');
		expect(markup).toContain('≈ 131 requests');
	});

	it('marks only the auto-picked row and explains the rule once', () => {
		const markup = body([recommendedPlan, autoPlan]);

		expect(markup.match(/auto-picked/g)).toHaveLength(2);
		expect(markup).toMatch(/Alpha Strong \+ Beta Cheap<\/span>\s*<span[^>]*>auto-picked<\/span>/);
		expect(markup).toMatch(/\$\d+\.\d\d/);
		expect(markup).toMatch(/≈ [\d,]+ requests/);
	});

	it('shows the auto-pick note only when a row is auto-picked', () => {
		const note = 'An auto-picked row uses the strongest main model under $12';

		expect(body([recommendedPlan])).not.toContain(note);
		expect(body([recommendedPlan])).not.toContain('auto-picked');
		expect(body([recommendedPlan, autoPlan])).toContain(note);
	});

	it('states the workload assumptions', () => {
		expect(body([recommendedPlan])).toContain(
			'A request is 50K tokens, half of it cached. 70% of requests go to the sub-agent.'
		);
	});

	it('degrades to dashes when a plan has no priced pair', () => {
		const markup = body([emptyPlan]);

		expect(markup).toContain('No priced pair on this plan');
		expect(markup).not.toContain('requests</td>');
		expect(markup).toContain('—');
	});
});
