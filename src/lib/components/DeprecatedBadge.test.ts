import { describe, it, expect } from 'vite-plus/test';
import { render } from 'svelte/server';
import DeprecatedBadge from './DeprecatedBadge.svelte';

/**
 * The badge renders NOTHING unless models.dev marks the model deprecated, and
 * the drawer relies on exactly that: it drops the component in with no `{#if}`
 * around it, so its pinned fallow template complexity does not move.
 *
 * Runtime data cannot exercise the deprecated branch — models.dev's one
 * deprecated Go model (minimax-m2.7) is no longer endorsed by the Go docs page,
 * so it is filtered out of the visible catalog. Hence this test.
 *
 * These assertions run against the RENDERED component body (`svelte/server`),
 * not its source text, so a behavioural change in the component fails the test
 * instead of silently passing.
 */

function bodyFor(status: 'active' | 'deprecated' | null): string {
	return render(DeprecatedBadge, { props: { status } }).body;
}

describe('DeprecatedBadge', () => {
	it('renders the marker for a deprecated model', () => {
		expect(bodyFor('deprecated')).toContain('Marked deprecated upstream');
	});

	it('renders nothing for an active model', () => {
		expect(bodyFor('active')).not.toContain('Marked deprecated upstream');
	});

	it('renders nothing when models.dev published no status (null)', () => {
		expect(bodyFor(null)).not.toContain('Marked deprecated upstream');
	});

	it('renders no element at all for a non-deprecated status', () => {
		// A stray wrapper would still shift the drawer's layout, so assert the body
		// carries no markup beyond the renderer's comment anchors.
		const markup = bodyFor('active')
			.replaceAll(/<!--[\s\S]*?-->/g, '')
			.trim();
		expect(markup).toBe('');
	});

	it('does not claim the model is gone, and credits the upstream catalogue', () => {
		const body = bodyFor('deprecated');
		expect(body).toContain('still served');
		expect(body.toLowerCase()).not.toMatch(/discontinued|no longer available|removed/);
	});

	it('is text only — the rendered output contains no icon', () => {
		expect(bodyFor('deprecated')).not.toContain('<svg');
	});

	it('exposes the fuller explanation as a title tooltip', () => {
		expect(bodyFor('deprecated')).toMatch(/title="[^"]+"/);
	});
});
