import { describe, expect, it } from 'vite-plus/test';
import * as v from 'valibot';
import { compareSearchSchema } from '$lib/compare-search';
import { homeSearchSchema } from '$lib/table-search';
import { stackSearchSchema } from './search';

describe('stackSearchSchema', () => {
	it('defaults missing values and falls back from invalid values', () => {
		expect(v.parse(stackSearchSchema, {})).toEqual({
			stack: 'zed',
			main: '',
			sub: '',
			split: 70
		});
		expect(v.parse(stackSearchSchema, { stack: 'invalid' }).stack).toBe('zed');
		expect(v.parse(stackSearchSchema, { split: 150 }).split).toBe(70);
		expect(v.parse(stackSearchSchema, { split: -1 }).split).toBe(70);
		expect(v.parse(stackSearchSchema, { split: 'abc' }).split).toBe(70);
		expect(v.parse(stackSearchSchema, { split: 40 }).split).toBe(40);
	});

	it('merges stack keys into both page schemas without dropping existing keys', () => {
		const stackKeys = ['stack', 'main', 'sub', 'split'];
		const homeKeys = Object.keys(homeSearchSchema.entries);
		const compareKeys = Object.keys(compareSearchSchema.entries);

		for (const key of stackKeys) {
			expect(homeKeys).toContain(key);
			expect(compareKeys).toContain(key);
		}
		for (const key of ['q', 'need', 'tokens']) expect(homeKeys).toContain(key);
		for (const key of ['models', 'scenario']) expect(compareKeys).toContain(key);
	});
});
