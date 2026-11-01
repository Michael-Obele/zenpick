import { describe, expect, it } from 'vite-plus/test';
import { render } from 'svelte/server';
import FilterBar from './FilterBar.svelte';
import type { PlanFilter } from '$lib/catalog';

/**
 * SSR smoke test for the plan filter's conditional controls. No Bits UI mocking:
 * the point is that a static-plan filter drops the Go-only rankings (they rank
 * by scenario scores those plans do not carry) and says why.
 */

function body(plan: PlanFilter): string {
	return render(FilterBar, {
		props: { filter: '', scenario: '', need: '', plan }
	})
		.body.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replace(/\s+/g, ' ');
}

/** Plan-filter button label → aria-pressed value. */
function pressed(markup: string): Record<string, string> {
	return Object.fromEntries(
		[...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].map(
			(match) => [match[2].replaceAll(/<[^>]+>/g, '').trim(), match[1]]
		)
	);
}

describe('FilterBar plan controls', () => {
	it('keeps the Go-only rankings and the quota switch for Go plans', () => {
		for (const plan of ['', 'go'] as const) {
			const markup = body(plan);
			expect(markup).toContain('aria-label="Filter models by plan"');
			expect(markup).toContain('Rank by');
			expect(markup).toContain('Weight by');
			expect(markup).toContain('Go limits');
			expect(markup).not.toContain('OpenCode Go data');
		}
	});

	it('drops the Go-only controls and explains the blanks for static plans', () => {
		const markup = body('zed');
		expect(markup).not.toContain('Rank by');
		expect(markup).not.toContain('Weight by');
		expect(markup).not.toContain('Go limits');
		expect(markup).toContain('Burn, quotas and task fit are OpenCode Go data');
	});

	it('keeps aria-pressed in sync with the plan value', () => {
		expect(pressed(body(''))).toEqual({
			'All plans': 'true',
			'OpenCode Go': 'false',
			'Zed Pro': 'false',
			'Copilot Pro': 'false'
		});

		const zed = pressed(body('zed'));
		expect(zed['Zed Pro']).toBe('true');
		expect(Object.values(zed).filter((value) => value === 'true')).toHaveLength(1);
	});
});
