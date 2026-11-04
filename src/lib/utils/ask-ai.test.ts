import { describe, expect, it } from 'vite-plus/test';
import type { CompareModel } from '$lib/compare-model';
import { makeBenchmarks, makeGoModel } from '$lib/test/fixtures';
import { askAiUrl, buildComparePrompt } from './ask-ai';

/** A plan-agnostic column, mirroring what `toCompareModel` produces. */
function column(partial: Partial<CompareModel>): CompareModel {
	return {
		key: 'go:go-model',
		plan: 'go',
		id: 'go-model',
		name: 'Go Model',
		provider: 'Acme',
		description: 'A Go model',
		note: null,
		modelgrepId: 'acme/go-model',
		llmStatsId: 'go-model',
		pricing: { inputPricePerM: 2, outputPricePerM: 10, cachedReadPerM: 0.1 },
		contextWindow: 200_000,
		benchmarks: makeBenchmarks({
			coding: 55,
			reasoning: 60,
			math: 50,
			sweBenchVerified: 0.5
		}),
		capabilities: null,
		openWeight: true,
		speed: null,
		tags: [],
		go: makeGoModel({ id: 'go-model', name: 'Go Model', provider: 'Acme' }),
		...partial
	};
}

const go = column({});
const zed = column({
	key: 'zed:zed-model',
	plan: 'zed',
	id: 'zed-model',
	name: 'Zed Model',
	provider: 'Anthropic',
	description: null,
	note: 'Price doubles above 200K input tokens.',
	modelgrepId: 'anthropic/zed-model',
	llmStatsId: 'claude-sonnet-5-5',
	pricing: { inputPricePerM: 3, outputPricePerM: 15, cachedReadPerM: 0.3 },
	contextWindow: 1_000_000,
	benchmarks: makeBenchmarks({
		coding: 40,
		reasoning: 55,
		math: 44.5,
		sweBenchVerified: 0.61
	}),
	openWeight: false,
	go: null
});

describe('buildComparePrompt', () => {
	it('labels each column with its plan and includes the shared benchmarks', () => {
		const prompt = buildComparePrompt([go, zed]);

		expect(prompt).toContain('Go Model (Acme) — OpenCode Go');
		expect(prompt).toContain('Zed Model (Anthropic) — Zed Pro');
		expect(prompt).toContain('Coding 40');
		expect(prompt).toContain('Reasoning 55');
		expect(prompt).toContain('Math 44.5');
		// SciCode is stored as a 0-1 fraction; the prompt uses the 0-100 view.
		expect(prompt).toContain('SciCode 61');
	});

	it('includes Go-only facts only for the Go column', () => {
		const zedPrompt = buildComparePrompt([zed]);
		expect(zedPrompt).not.toContain('Burn tier');
		expect(zedPrompt).not.toContain('Scenario fit');

		const goPrompt = buildComparePrompt([go]);
		expect(goPrompt).toContain('Burn tier');
		expect(goPrompt).toContain('Scenario fit');
	});

	it('adds the LLM Stats compare and per-model research links', () => {
		const prompt = buildComparePrompt([go, zed]);

		expect(prompt).toContain('Side-by-side on LLM Stats: https://llm-stats.com/models/compare/');
		expect(prompt).toContain('LLM Stats: https://llm-stats.com/models/claude-sonnet-5-5');
		expect(prompt).toContain('modelgrep: https://modelgrep.com/models/anthropic/zed-model');
	});
});

describe('askAiUrl', () => {
	it('encodes the prompt into the provider deep link', () => {
		const url = askAiUrl('grok', [go, zed]);

		expect(url.startsWith('https://grok.com/?q=')).toBe(true);
		expect(decodeURIComponent(url.slice('https://grok.com/?q='.length))).toContain(
			'Zed Model (Anthropic) — Zed Pro'
		);
	});
});
