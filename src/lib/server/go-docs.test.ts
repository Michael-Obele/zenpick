import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import {
	buildCatalogAudit,
	matchDisplayName,
	normalizeName,
	parseCount,
	parseGoDocsTables,
	parsePrice,
	parsePricingRow,
	parseUsageLimitsRow
} from './go-docs';

describe('normalizeName', () => {
	it('collapses the dot-vs-hyphen version separator (Claude Haiku 5.5 regression)', () => {
		// The docs print "Claude Haiku 5.5" (dot); the API id is
		// "claude-haiku-5-5" (hyphens). Both must normalize identically.
		expect(normalizeName('Claude Haiku 5.5')).toBe(normalizeName('claude-haiku-5-5'));
		expect(normalizeName('Claude Haiku 5.5')).toBe('claudehaiku55');
	});

	it('strips spaces, dots and hyphens and lowercases', () => {
		// only a LEADING "v" is treated as a version prefix, so the mid-name
		// "v" in "MiMo V2.5" survives normalization.
		expect(normalizeName('MiMo V2.5')).toBe('mimov25');
		expect(normalizeName('Qwen3.7 Plus')).toBe('qwen37plus');
	});

	it('drops a leading "v" prefix on a version', () => {
		expect(normalizeName('V2')).toBe('2');
	});
});

describe('matchDisplayName', () => {
	const map = new Map<string, string>([
		[normalizeName('Claude Haiku 5.5'), 'claude-haiku-5-5'],
		[normalizeName('claude-haiku-5-5'), 'claude-haiku-5-5'],
		[normalizeName('Qwen3.7 Plus'), 'qwen37plus'],
		[normalizeName('Qwen3.7 Plus'), 'qwen37plus']
	]);

	it('matches an exact normalized name', () => {
		expect(matchDisplayName('Claude Haiku 5.5', map)).toBe('claude-haiku-5-5');
	});

	it('matches across the dot/hyphen difference', () => {
		expect(matchDisplayName('claude-haiku-5-5', map)).toBe('claude-haiku-5-5');
	});

	it('strips a parenthetical suffix before matching', () => {
		expect(matchDisplayName('Qwen3.7 Plus (≤ 256K tokens)', map)).toBe('qwen37plus');
	});

	it('returns null for an unknown name', () => {
		expect(matchDisplayName('Totally Unknown Model', map)).toBeNull();
	});
});

describe('parsePrice', () => {
	it('parses dollar amounts', () => {
		expect(parsePrice('$1.40')).toBeCloseTo(1.4);
		expect(parsePrice('$0.0028')).toBeCloseTo(0.0028);
	});

	it('strips thousands separators', () => {
		expect(parsePrice('$1,234.50')).toBeCloseTo(1234.5);
	});

	it('treats "Free" (any case) as 0 so the row is kept', () => {
		expect(parsePrice('Free')).toBe(0);
		expect(parsePrice('  free ')).toBe(0);
	});

	it('returns null for unusable input', () => {
		expect(parsePrice('')).toBeNull();
		expect(parsePrice('n/a')).toBeNull();
	});
});

describe('parseCount', () => {
	it('parses integers with separators', () => {
		expect(parseCount('30,100')).toBe(30100);
		expect(parseCount('1 000')).toBe(1000);
	});

	it('returns null for non-numeric input', () => {
		expect(parseCount('')).toBeNull();
		expect(parseCount('12abc')).toBeNull();
		expect(parseCount('Unlimited')).toBeNull();
	});
});

describe('parseUsageLimitsRow', () => {
	it('records "Unlimited" as an unlimited zero-burn row', () => {
		const limits = parseUsageLimitsRow(['Model', 'Unlimited', 'Unlimited', 'Unlimited']);
		expect(limits).toEqual({
			requestsPer5h: 0,
			requestsPerWeek: 0,
			requestsPerMonth: 0,
			unlimited: true
		});
	});

	it('detects "Unlimited" in any single window cell', () => {
		expect(parseUsageLimitsRow(['Model', '100', 'Unlimited', '4,000'])?.unlimited).toBe(true);
	});

	it('parses numeric windows, defaulting missing ones to 0', () => {
		expect(parseUsageLimitsRow(['Model', '100', '1,000', '4,000'])).toEqual({
			requestsPer5h: 100,
			requestsPerWeek: 1000,
			requestsPerMonth: 4000,
			unlimited: false
		});
		expect(parseUsageLimitsRow(['Model', '100', '', ''])).toEqual({
			requestsPer5h: 100,
			requestsPerWeek: 0,
			requestsPerMonth: 0,
			unlimited: false
		});
	});

	it('returns null when the 5h count is unusable', () => {
		expect(parseUsageLimitsRow(['Model', '', '1,000', '4,000'])).toBeNull();
	});
});

describe('parsePricingRow', () => {
	it('parses input/output/cached prices with the go-docs source', () => {
		expect(parsePricingRow(['Model', '$1.40', '$2.80', '$0.14'])).toEqual({
			inputPricePerM: 1.4,
			outputPricePerM: 2.8,
			cachedReadPerM: 0.14,
			source: 'go-docs'
		});
	});

	it('keeps a free row (prices $0)', () => {
		const row = parsePricingRow(['Model', 'Free', 'Free', 'Free']);
		expect(row).toEqual({
			inputPricePerM: 0,
			outputPricePerM: 0,
			cachedReadPerM: 0,
			source: 'go-docs'
		});
	});

	it('returns null when input or output price is missing', () => {
		expect(parsePricingRow(['Model', '', '$2.80', ''])).toBeNull();
		expect(parsePricingRow(['Model', '$1.40', 'n/a', ''])).toBeNull();
	});

	it('leaves cachedReadPerM null when absent', () => {
		const row = parsePricingRow(['Model', '$1.40', '$2.80', '']);
		expect(row?.cachedReadPerM).toBeNull();
	});
});

describe('buildCatalogAudit', () => {
	it('reports every docs↔API mismatch', () => {
		const audit = buildCatalogAudit({
			apiIds: new Set(['a', 'b', 'c', 'gone']),
			docsRows: 5,
			unmatchedDocsRows: [{ name: 'Mystery', table: 'usage' }],
			matchedGoIds: new Set(['a', 'b', 'c']),
			pricingIds: ['a', 'b'],
			usageIds: ['a', 'b', 'c'],
			officialModelIds: new Set(['a', 'b', 'c'])
		});

		expect(audit.apiCount).toBe(4);
		expect(audit.docsRows).toBe(5);
		expect(audit.matchedRows).toBe(4);
		expect(audit.unmatchedDocsRows).toEqual([{ name: 'Mystery', table: 'usage' }]);
		// every pricing id is endorsed, so nothing is priced-but-unlisted.
		expect(audit.pricedButUnlisted).toEqual([]);
		// 'c' is in the usage table but not priced.
		expect(audit.listedButUnpriced).toEqual(['c']);
		// 'gone' is in the API but in no docs table.
		expect(audit.apiNotListed).toEqual(['gone']);
	});

	it('flags a priced-but-unlisted model (dropped by the catalog filter)', () => {
		const audit = buildCatalogAudit({
			apiIds: new Set(['a', 'b']),
			docsRows: 2,
			unmatchedDocsRows: [],
			matchedGoIds: new Set(['a', 'b']),
			pricingIds: ['a', 'b'],
			usageIds: ['a'],
			officialModelIds: new Set(['a'])
		});

		expect(audit.pricedButUnlisted).toEqual(['b']);
		expect(audit.listedButUnpriced).toEqual([]);
		expect(audit.apiNotListed).toEqual([]);
	});

	it('is all-clear when docs and API agree', () => {
		const audit = buildCatalogAudit({
			apiIds: new Set(['a']),
			docsRows: 2,
			unmatchedDocsRows: [],
			matchedGoIds: new Set(['a']),
			pricingIds: ['a'],
			usageIds: ['a'],
			officialModelIds: new Set(['a'])
		});

		expect(audit.unmatchedDocsRows).toEqual([]);
		expect(audit.pricedButUnlisted).toEqual([]);
		expect(audit.listedButUnpriced).toEqual([]);
		expect(audit.apiNotListed).toEqual([]);
	});
});
/**
 * The docs publish a model on SEVERAL pricing rows when it is tiered by
 * context size or by DeepSeek's peak/off-peak windows. Every row normalizes to
 * the same Go id, so the parser must keep the FIRST (base) tier — the last row
 * would otherwise publish the long-context/peak surcharge.
 */
describe('parseGoDocsTables', () => {
	const fixture = `
		<table>
			<thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cached Read</th><th>Cached Write</th><th>Monthly limit</th></tr></thead>
			<tbody>
				<tr><td>Claude Haiku 5.5 (\u2264 100K tokens)</td><td>$0.10</td><td>$0.50</td><td>$0.01</td><td>$0.125</td><td>$15</td></tr>
				<tr><td>Claude Haiku 5.5 (&gt; 100K tokens)</td><td>$0.50</td><td>$2.50</td><td>$0.05</td><td>$0.625</td><td>$15</td></tr>
				<tr><td>GLM-5.3-Flash</td><td>$0.15</td><td>$0.50</td><td>$0.03</td><td>-</td><td>$60</td></tr>
			</tbody>
		</table>
		<table>
			<thead><tr><th>Model</th><th>Requests per 5 hours</th><th>Requests per week</th><th>Requests per month</th></tr></thead>
			<tbody>
				<tr><td>Claude Haiku 5.5</td><td>3,850</td><td>9,620</td><td>19,230</td></tr>
			</tbody>
		</table>`;

	const nameMap = new Map<string, string>([
		[normalizeName('Claude Haiku 5.5'), 'claude-haiku-5-5'],
		[normalizeName('claude-haiku-5-5'), 'claude-haiku-5-5'],
		[normalizeName('GLM-5.3-Flash'), 'glm-5.3-flash'],
		[normalizeName('glm-5.3-flash'), 'glm-5.3-flash']
	]);

	it('keeps the BASE tier when a model spans several pricing rows', () => {
		const { pricing } = parseGoDocsTables(parse(fixture), nameMap);

		// The ≤ 100K row comes first and must win; the > 100K row is a 5x surcharge
		// that applies only beyond 100K tokens.
		expect(pricing['claude-haiku-5-5']).toEqual({
			inputPricePerM: 0.1,
			outputPricePerM: 0.5,
			cachedReadPerM: 0.01,
			source: 'go-docs'
		});
		// A single-row model is unaffected.
		expect(pricing['glm-5.3-flash']?.inputPricePerM).toBeCloseTo(0.15);
	});

	it('parses the usage table into the Go tier', () => {
		const { usageLimits, officialModelIds } = parseGoDocsTables(parse(fixture), nameMap);

		expect(usageLimits.go['claude-haiku-5-5']).toEqual({
			requestsPer5h: 3850,
			requestsPerWeek: 9620,
			requestsPerMonth: 19230,
			unlimited: false
		});
		expect([...officialModelIds]).toEqual(['claude-haiku-5-5']);
	});
});
