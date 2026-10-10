import { describe, it, expect } from 'vitest';
import {
	contentTypeFor,
	exportSection,
	sectionJson,
	sectionMarkdown,
	type DebugDataset
} from './export';
import { makeBenchmarks, makeGoModel, makeQuota } from '$lib/test/fixtures';

function dataset(): DebugDataset {
	return {
		models: [
			makeGoModel({
				id: 'm1',
				name: 'Alpha',
				provider: 'Acme',
				quota: makeQuota({ requestsPer5h: 1000 }),
				benchmarks: makeBenchmarks({
					coding: 61.4,
					reasoning: 50,
					math: 47,
					sweBenchVerified: 0.519,
					_meta: {
						coding: { source: 'modelgrep', field: 'livecodebench' },
						reasoning: { source: 'modelgrep' },
						math: { source: 'modelgrep', field: 'aime' },
						sweBenchVerified: { source: 'modelgrep' }
					}
				})
			}),
			makeGoModel({
				id: 'm2',
				name: 'Beta',
				quota: makeQuota({ unlimited: true })
			})
		],
		frontierSnapshot: {
			frontier: [
				{
					id: 'claude-opus-5',
					name: 'Claude Opus 5',
					organization: { id: 'anthropic', name: 'Anthropic' },
					releaseDate: '2025-06-01',
					benchmarks: makeBenchmarks({ coding: 70, reasoning: 72, math: 65 })
				}
			],
			cutoff: Date.UTC(2025, 0, 1)
		},
		catalogAudit: {
			apiCount: 3,
			docsRows: 2,
			matchedRows: 2,
			unmatchedDocsRows: [],
			pricedButUnlisted: [],
			listedButUnpriced: ['m1'],
			apiNotListed: ['deprecated-model']
		}
	};
}

describe('contentTypeFor', () => {
	it('maps json/md to their real content types', () => {
		expect(contentTypeFor('json')).toContain('application/json');
		expect(contentTypeFor('md')).toContain('text/markdown');
	});

	it('maps html to text/plain (the export endpoint never serves HTML)', () => {
		expect(contentTypeFor('html')).toContain('text/plain');
	});
});

describe('sectionJson', () => {
	it('pricing exposes each model’s pricing', () => {
		const out = sectionJson('pricing', dataset()) as {
			id: string;
			pricing: { inputPricePerM: number };
		}[];
		expect(out).toHaveLength(2);
		expect(out[0].id).toBe('m1');
		expect(out[0].pricing.inputPricePerM).toBe(1);
	});

	it('matching bundles the audit and per-model source metadata', () => {
		const out = sectionJson('matching', dataset()) as {
			audit: { apiNotListed: string[] };
			models: { id: string; benchmarkSources: { coding: { field?: string } | null } }[];
		};
		expect(out.audit.apiNotListed).toEqual(['deprecated-model']);
		expect(out.models[0].benchmarkSources.coding?.field).toBe('livecodebench');
	});

	it('raw returns the full model array', () => {
		const out = sectionJson('raw', dataset()) as unknown[];
		expect(out).toHaveLength(2);
	});

	it('compare includes the frontier snapshot', () => {
		const out = sectionJson('compare', dataset()) as { frontier: unknown[]; cutoff: number };
		expect(out.frontier).toHaveLength(1);
		expect(out.cutoff).toBe(Date.UTC(2025, 0, 1));
	});
});

describe('sectionMarkdown', () => {
	it('overview renders a pipe table with the models', () => {
		const md = sectionMarkdown('overview', dataset());
		expect(md).toContain('## Models Overview');
		expect(md).toContain('| Model |');
		expect(md).toContain('Alpha');
		expect(md).toContain('Beta');
	});

	it('benchmarks labels derived sources (LiveCodeBench, AIME)', () => {
		const md = sectionMarkdown('benchmarks', dataset());
		expect(md).toContain('LiveCodeBench');
		expect(md).toContain('AIME');
		expect(md).toContain('61.4');
	});

	it('quota marks an unlimited model', () => {
		const md = sectionMarkdown('quota', dataset());
		expect(md).toContain('Unlimited');
	});

	it('matching lists the audit sections', () => {
		const md = sectionMarkdown('matching', dataset());
		expect(md).toContain('### Unmatched docs rows');
		expect(md).toContain('deprecated-model');
	});

	it('raw wraps the JSON in a fenced block', () => {
		const md = sectionMarkdown('raw', dataset());
		expect(md).toContain('```json');
		expect(md).toContain('"id": "m1"');
	});
});

describe('exportSection', () => {
	it('returns parseable pretty JSON for format=json', () => {
		const body = exportSection('pricing', 'json', dataset());
		const parsed = JSON.parse(body);
		expect(Array.isArray(parsed)).toBe(true);
	});

	it('returns markdown for format=md', () => {
		const body = exportSection('overview', 'md', dataset());
		expect(body.startsWith('## Models Overview')).toBe(true);
	});

	it('treats html like markdown (the endpoint always serves text)', () => {
		const body = exportSection('overview', 'html', dataset());
		expect(body.startsWith('## Models Overview')).toBe(true);
	});
});
