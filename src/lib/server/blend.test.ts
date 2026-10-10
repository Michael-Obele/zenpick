import { describe, it, expect } from 'vitest';
import { blendBenchmarks } from './blend';
import { makeAa, makeLlmStats, makeModelgrep } from '$lib/test/fixtures';

/**
 * Regression suite for the multi-source benchmark blend.
 *
 * The headline failure this guards: modelgrep's artificial_analysis block is
 * sparse, so `Coding` and `Math` rendered blank (`—`) on most models. The
 * fallback chains below recover comparable AA fields and LABEL the derived
 * source via `_meta.<field>.field` so the UI never passes a fallback off as
 * the primary score.
 */

describe('blendBenchmarks', () => {
	describe('coding — primary and fallbacks', () => {
		it('uses aa.coding as the primary, unlabeled source', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ coding: 61.4 })), null);
			expect(benchmarks.coding).toBe(61.4);
			expect(meta.coding).toEqual({ source: 'modelgrep' });
			expect(meta.coding.field).toBeUndefined();
		});

		it('falls back to llm-stats code (normalized) when aa.coding is missing', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa()),
				makeLlmStats({ code: 0.72 })
			);
			expect(benchmarks.coding).toBe(72);
			expect(meta.coding).toEqual({ source: 'llm-stats' });
		});

		it('prefers aa.coding over llm-stats', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa({ coding: 55 })),
				makeLlmStats({ code: 0.9 })
			);
			expect(benchmarks.coding).toBe(55);
			expect(meta.coding.source).toBe('modelgrep');
		});

		it('derives coding from LiveCodeBench and labels the field', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa({ livecodebench: 0.413 })),
				null
			);
			expect(benchmarks.coding).toBe(41);
			expect(meta.coding).toEqual({ source: 'modelgrep', field: 'livecodebench' });
		});

		it('falls back to SciCode when LiveCodeBench is missing', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ scicode: 0.519 })), null);
			expect(benchmarks.coding).toBe(52);
			expect(meta.coding).toEqual({ source: 'modelgrep', field: 'scicode' });
		});

		it('falls back to GPQA when SciCode is also missing', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ gpqa: 0.61 })), null);
			expect(benchmarks.coding).toBe(61);
			expect(meta.coding).toEqual({ source: 'modelgrep', field: 'gpqa' });
		});

		it('is null with a null source when no coding signal exists at all', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa()), null);
			expect(benchmarks.coding).toBeNull();
			expect(meta.coding).toEqual({ source: null });
		});

		it('rejects an out-of-scale llm-stats code score and falls through', () => {
			// 813.4 is a broken scale (seen on Gemini previews); must not leak in.
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa({ scicode: 0.4 })),
				makeLlmStats({ code: 813.4 })
			);
			expect(benchmarks.coding).toBe(40);
			expect(meta.coding).toEqual({ source: 'modelgrep', field: 'scicode' });
		});
	});

	describe('math — blend + fallbacks', () => {
		it('blends GPQA and llm-stats math, labeling the source as blended', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa({ gpqa: 0.5 })),
				makeLlmStats({ math: 50 })
			);
			// 0.5 * 60 + 50 * 0.4 = 50
			expect(benchmarks.math).toBe(50);
			expect(meta.math).toEqual({ source: 'blended' });
		});

		it('uses GPQA alone when llm-stats math is missing', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ gpqa: 0.62 })), null);
			expect(benchmarks.math).toBe(62);
			expect(meta.math).toEqual({ source: 'modelgrep' });
		});

		it('uses llm-stats math alone when GPQA is missing', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa()),
				makeLlmStats({ math: 0.71 })
			);
			expect(benchmarks.math).toBe(71);
			expect(meta.math).toEqual({ source: 'llm-stats' });
		});

		it('falls back to the aa.math composite and labels it', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ math: 47.6 })), null);
			expect(benchmarks.math).toBe(47.6);
			expect(meta.math).toEqual({ source: 'modelgrep', field: 'math' });
		});

		it('falls back to AIME when the math composite is missing', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ aime: 0.83 })), null);
			expect(benchmarks.math).toBe(83);
			expect(meta.math).toEqual({ source: 'modelgrep', field: 'aime' });
		});

		it('falls back to HLE as the last resort', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ hle: 0.392 })), null);
			expect(benchmarks.math).toBe(39);
			expect(meta.math).toEqual({ source: 'modelgrep', field: 'hle' });
		});

		it('is null when no math signal exists', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa()), null);
			expect(benchmarks.math).toBeNull();
			expect(meta.math).toEqual({ source: null });
		});

		it('ignores a broken-scale llm-stats math score (DeepSeek V4.1 Flash: 868.1)', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa({ aime: 0.6 })),
				makeLlmStats({ math: 868.1 })
			);
			expect(benchmarks.math).toBe(60);
			expect(meta.math).toEqual({ source: 'modelgrep', field: 'aime' });
		});
	});

	describe('reasoning', () => {
		it('uses aa.intelligence as primary', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa({ intelligence: 39.5 })),
				null
			);
			expect(benchmarks.reasoning).toBe(39.5);
			expect(meta.reasoning).toEqual({ source: 'modelgrep' });
		});

		it('falls back to llm-stats reasoning', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa()),
				makeLlmStats({ reasoning: 0.66 })
			);
			expect(benchmarks.reasoning).toBe(66);
			expect(meta.reasoning).toEqual({ source: 'llm-stats' });
		});

		it('rejects an out-of-scale llm-stats reasoning score (289.8)', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(makeAa()),
				makeLlmStats({ reasoning: 289.8 })
			);
			expect(benchmarks.reasoning).toBeNull();
			expect(meta.reasoning).toEqual({ source: null });
		});
	});

	describe('sweBenchVerified and designElo', () => {
		it('maps aa.scicode to sweBenchVerified (modelgrep only)', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa({ scicode: 0.519 })), null);
			expect(benchmarks.sweBenchVerified).toBe(0.519);
			expect(meta.sweBenchVerified).toEqual({ source: 'modelgrep' });
		});

		it('leaves sweBenchVerified null with a null source when absent', () => {
			const { benchmarks, meta } = blendBenchmarks(makeModelgrep(makeAa()), null);
			expect(benchmarks.sweBenchVerified).toBeNull();
			expect(meta.sweBenchVerified).toEqual({ source: null });
		});

		it('reads Design Arena Elo', () => {
			const { benchmarks } = blendBenchmarks(makeModelgrep(makeAa(), 1234), null);
			expect(benchmarks.designElo).toBe(1234);
		});
	});

	describe('degenerate inputs', () => {
		it('handles both sources absent without throwing', () => {
			const { benchmarks, meta } = blendBenchmarks(null, null);
			expect(benchmarks.coding).toBeNull();
			expect(benchmarks.reasoning).toBeNull();
			expect(benchmarks.math).toBeNull();
			expect(benchmarks.sweBenchVerified).toBeNull();
			expect(meta.coding.source).toBeNull();
			expect(meta.math.source).toBeNull();
		});

		it('handles a modelgrep model with a null AA block', () => {
			const { benchmarks, meta } = blendBenchmarks(
				makeModelgrep(null),
				makeLlmStats({ code: 0.5 })
			);
			expect(benchmarks.coding).toBe(50);
			expect(meta.coding.source).toBe('llm-stats');
		});
	});
});
