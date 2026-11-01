import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import PlanBadges from './PlanBadges.svelte';
import type { CatalogPlanEntry, PlanFilter } from '$lib/catalog';

/**
 * The badge leaf is the only place a row says WHICH plans carry it, and the
 * filter's active plan has to read differently from the rest without a colour
 * of its own. These assertions run against the rendered body, not the source.
 */

const GO: CatalogPlanEntry = {
	plan: 'go',
	id: 'claude-sonnet-5.5',
	pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.2 }
};

const ZED: CatalogPlanEntry = {
	plan: 'zed',
	id: 'claude-sonnet-5.5',
	pricing: { inputPricePerM: 2.2, outputPricePerM: 11, cachedReadPerM: 0.22 }
};

/** SSR body with hydration comments stripped and whitespace collapsed. */
function body(active: PlanFilter = ''): string {
	return render(PlanBadges, { props: { entries: [GO, ZED], active } })
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

/** The rendered badges, one per plan entry (attribute values may contain `>`). */
function badges(markup: string): { attributes: string; label: string }[] {
	return [...markup.matchAll(/<span((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/span>/g)]
		.filter((match) => match[1].includes('data-slot="badge"'))
		.map((match) => ({
			attributes: match[1],
			label: match[2].replaceAll(/<[^>]+>/g, '').trim()
		}));
}

function labels(markup: string): string[] {
	return badges(markup).map((badge) => badge.label);
}

describe('PlanBadges', () => {
	it('renders one short label per plan the model is on', () => {
		const markup = body();
		expect(labels(markup)).toEqual(['Go', 'Zed']);
		expect(markup).not.toContain('Copilot');
	});

	it('names the full plan for assistive tech and for hover', () => {
		const markup = body();
		for (const label of ['OpenCode Go', 'Zed Pro']) {
			expect(markup).toContain(`aria-label="${label}"`);
			expect(markup).toContain(`title="${label}"`);
		}
	});

	it('marks the filtered plan as secondary and leaves the others outlined', () => {
		const rendered = badges(body('go'));
		expect(rendered).toHaveLength(2);

		expect(rendered[0].attributes).toContain('bg-secondary');
		expect(rendered[0].attributes).toContain('border-primary/40');

		expect(rendered[1].attributes).toContain('bg-input/30');
		expect(rendered[1].attributes).not.toContain('border-primary/40');
	});
});
