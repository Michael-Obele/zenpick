import { describe, it, expect } from 'vite-plus/test';
import { detailRowsFor, type DetailRowSource } from '$lib/utils';

/**
 * The Details ROW RULE — not the drawer's markup.
 *
 * The rule lives in `detailRowsFor` (`$lib/utils`) and is tested there, through
 * this file which sits next to the component it serves. The drawer's own
 * `{#each detailRows}` wiring and its `<DeprecatedBadge>` placement are covered
 * by svelte-check ONLY: the drawer is a Bits UI Sheet whose Portal mounts
 * through `mount()`, a no-op under SSR, so `render(ModelDrawer, …)` always
 * yields empty comment anchors and would assert nothing.
 *
 * The Details section filters out every row whose payload the model lacks, so
 * the assertion is on the LABELS: a row that should be omitted must not be
 * listed at all.
 */
function labelsFor(model: DetailRowSource | null): string[] {
	return detailRowsFor(model).map((row) => row.label);
}

const ALL_LABELS = [
	'Context window',
	'Endpoint',
	'Speed',
	'Output cap',
	'Reasoning efforts',
	'Knowledge cutoff'
];

/** A model carrying every Details fact — each test removes the ones it omits. */
function fullModel(): DetailRowSource {
	return {
		contextWindow: 200_000,
		endpoint: 'openai-compatible',
		speed: { tokensPerSecond: 42 },
		maxOutputTokens: 32_000,
		reasoningEfforts: ['low', 'high'],
		knowledgeCutoff: '2025-03-01'
	};
}

describe('detailRowsFor — the drawer Details rows', () => {
	it('omits a row whose value is absent instead of rendering a placeholder', () => {
		// The regression: `formatTokens(null)` returned '—', which is truthy, so
		// an unknown context window still rendered a "Context window —" row.
		const model: DetailRowSource = {
			contextWindow: null,
			endpoint: null,
			speed: null,
			maxOutputTokens: null,
			reasoningEfforts: null,
			knowledgeCutoff: null
		};

		expect(labelsFor(model)).toEqual([]);
	});

	it('renders every row that has a value', () => {
		expect(labelsFor(fullModel())).toEqual(ALL_LABELS);
	});

	it('renders no Details row without a model (the rows never rely on the wrapper)', () => {
		expect(labelsFor(null)).toEqual([]);
	});

	it('drops only the rows the model lacks', () => {
		const model: DetailRowSource = {
			...fullModel(),
			endpoint: null,
			speed: null,
			reasoningEfforts: []
		};

		// An empty `reasoningEfforts` array is present-but-meaningless: it joins
		// to `''` and is dropped, exactly like an absent one.
		expect(labelsFor(model)).toEqual(['Context window', 'Output cap', 'Knowledge cutoff']);
	});

	it('formats the values it does render', () => {
		expect(detailRowsFor(fullModel())).toEqual([
			{ label: 'Context window', value: '200K' },
			{ label: 'Endpoint', value: 'openai-compatible' },
			{ label: 'Speed', value: '42 tok/s' },
			{ label: 'Output cap', value: '32K' },
			{ label: 'Reasoning efforts', value: 'low, high' },
			{ label: 'Knowledge cutoff', value: '2025-03-01' }
		]);
	});

	it('formats a million-token window as 1.0M', () => {
		const rows = detailRowsFor({ ...fullModel(), contextWindow: 1_000_000 });

		expect(rows.find((row) => row.label === 'Context window')?.value).toBe('1.0M');
	});

	it('never emits an em-dash placeholder for a missing value', () => {
		const model: DetailRowSource = {
			...fullModel(),
			contextWindow: null,
			maxOutputTokens: null
		};

		expect(detailRowsFor(model).some((row) => row.value === '—')).toBe(false);
	});
});
