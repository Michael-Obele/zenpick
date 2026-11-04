import { describe, expect, it } from 'vite-plus/test';
import { buildLlmStatsBenchmarkIndex, llmStatsKey, lookupLlmStatsScores } from './llm-stats-public';

/** A category payload in the shape the public leaderboard serves. */
function payload(rows: Array<{ id: string; name: string; score: unknown }>) {
	return {
		models: rows.map((row) => ({
			model_id: row.id,
			model_name: row.name,
			conservative: row.score
		}))
	};
}

describe('buildLlmStatsBenchmarkIndex', () => {
	it('merges the category indices and normalizes id punctuation', () => {
		const index = buildLlmStatsBenchmarkIndex({
			code: payload([{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', score: 48.7 }]),
			reasoning: payload([{ id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', score: 56 }]),
			math: payload([{ id: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5', score: 38.1 }])
		});

		const entry = index.byId.get(llmStatsKey('claude-sonnet-5.5'));
		expect(entry).toEqual({
			id: 'claude-sonnet-5-5',
			scores: { code: 48.7, reasoning: 56, math: 38.1 }
		});
		// The name maps to exactly one id, so the unique-name fallback exists too.
		expect(index.byName.get(llmStatsKey('Claude Sonnet 5.5'))).toBe(entry);
	});

	it('never indexes an ambiguous name', () => {
		const index = buildLlmStatsBenchmarkIndex({
			code: payload([
				{ id: 'lab-a/model', name: 'Shared Name', score: 40 },
				{ id: 'lab-b/model', name: 'Shared Name', score: 50 }
			])
		});

		expect(index.byId.size).toBe(2);
		expect(index.byName.has(llmStatsKey('Shared Name'))).toBe(false);
	});

	it('drops non-numeric and out-of-range scores', () => {
		const index = buildLlmStatsBenchmarkIndex({
			reasoning: payload([
				{ id: 'null-score', name: 'Null', score: null },
				{ id: 'nan-score', name: 'NaN', score: Number.NaN },
				{ id: 'negative', name: 'Negative', score: -1 },
				{ id: 'too-high', name: 'Too High', score: 101 },
				{ id: 'valid', name: 'Valid', score: 42 }
			])
		});

		expect([...index.byId.keys()]).toEqual([llmStatsKey('valid')]);
		expect(index.byId.get(llmStatsKey('valid'))?.scores).toEqual({
			reasoning: 42
		});
	});

	it('returns an empty index for malformed payloads', () => {
		const index = buildLlmStatsBenchmarkIndex({
			code: null,
			reasoning: { models: 'not-a-list' },
			math: {}
		});

		expect(index.byId.size).toBe(0);
		expect(index.byName.size).toBe(0);
	});
});

describe('lookupLlmStatsScores', () => {
	const index = buildLlmStatsBenchmarkIndex({
		code: payload([{ id: 'gpt-5-5', name: 'GPT-5.5', score: 36.1 }]),
		reasoning: payload([{ id: 'anthropic/claude-opus-5-5', name: 'Claude Opus 5.5', score: 58.5 }])
	});

	it('checks every known id before falling back to the name', () => {
		expect(lookupLlmStatsScores(index, ['gpt-5.5'])?.scores).toEqual({
			code: 36.1
		});
		const opus = lookupLlmStatsScores(
			index,
			['5-5', 'anthropic/claude-opus-5-5'],
			'Claude Opus 5.5'
		);
		expect(opus).toEqual({
			id: 'anthropic/claude-opus-5-5',
			scores: { reasoning: 58.5 }
		});
		expect(lookupLlmStatsScores(index, [null, 'missing'], 'Claude Opus 5.5')).toBe(opus);
	});

	it('does not prefix-match a longer model id', () => {
		expect(lookupLlmStatsScores(index, ['gpt-5.5-pro'], 'GPT-5.5 pro')).toBeNull();
	});

	it('returns null for an empty index', () => {
		expect(
			lookupLlmStatsScores(buildLlmStatsBenchmarkIndex({}), ['anything'], 'Anything')
		).toBeNull();
	});
});
