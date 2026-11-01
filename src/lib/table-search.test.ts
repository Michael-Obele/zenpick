import { describe, expect, it } from 'vite-plus/test';
import * as v from 'valibot';
import { homeSearchSchema } from '$lib/table-search';

/**
 * `?plan=` is the model table's plan filter: one of the plan ids, or `''` for
 * every plan. It defaults to `go`, so a fresh visit reads the OpenCode Go
 * catalog the site is built around. The key is merged into the homepage schema
 * through the `tableSearchSchema` spread, so these assertions go through the
 * merged schema a page actually uses.
 */
describe('tableSearchSchema plan key', () => {
	function planFrom(input: Record<string, unknown>): string | null {
		const result = v.safeParse(homeSearchSchema, input);
		return result.success ? result.output.plan : null;
	}

	it('keeps a known plan id', () => {
		expect(planFrom({ plan: 'zed' })).toBe('zed');
	});

	it('falls back to OpenCode Go for an unknown plan id', () => {
		expect(planFrom({ plan: 'bogus' })).toBe('go');
	});

	it('defaults a missing plan to OpenCode Go', () => {
		expect(planFrom({})).toBe('go');
	});

	it('keeps an explicit empty plan as all plans', () => {
		expect(planFrom({ plan: '' })).toBe('');
	});
});
