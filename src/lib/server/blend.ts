/**
 * Multi-source benchmark blending engine.
 *
 * Takes data from modelgrep and llm-stats and produces a unified
 * benchmark view with per-field source tracking.
 *
 * Strategy — field-specific sourcing:
 * - Coding: modelgrep primary (TrueSkill), llm-stats fallback
 * - Reasoning: modelgrep primary (TrueSkill), llm-stats fallback with outlier guard
 * - Math: blended consensus (GPQA × 0.6 + llm-stats.math × 0.4)
 * - SWE-bench (SciCode): modelgrep only (aa.scicode)
 */

import type { ModelBenchmarks, BenchmarkMeta, BenchmarkSource } from '$lib/types/models';
import type { ModelgrepModelData } from '$lib/types/models';
import type { LlmStatsModel } from '$lib/types/models';
import { normalizeTopScore } from './llm-stats';

// ─── Math Blending ─────────────────────────────────────────────────────

/**
 * Blend math scores from GPQA (modelgrep) and llm-stats math composite.
 * Both are 0-1 accuracy scores, making them methodologically comparable.
 * llm-stats values are normalized first (it serves a mixed 0-1 / 0-100 scale).
 */
function blendMath(gpqa: number | null, lsMath: number | null): number | null {
	const ls = normalizeTopScore(lsMath);
	if (gpqa != null && ls != null) {
		return Math.round(gpqa * 60 + ls * 0.4);
	}
	if (gpqa != null) return Math.round(gpqa * 100);
	return ls;
}

// ─── llm-stats Normalization ───────────────────────────────────────────

/**
 * Convert llm-stats category scores to display scale (0-100).
 * llm-stats serves a mixed scale (some models 0-1, others 0-100), so we
 * auto-detect via normalizeTopScore instead of blindly multiplying by 100.
 */
function lsToDisplay(value: number | null | undefined): number | null {
	const n = normalizeTopScore(value);
	return n == null ? null : Math.round(n);
}

/**
 * Guard against extreme llm-stats reasoning outliers.
 * Some models (MiMo-V2-Omni, Grok 4.5, etc.) report reasoning scores > 100,
 * which indicates a different scale — return null in those cases.
 */
function lsReasoningSafe(value: number | null | undefined): number | null {
	const n = normalizeTopScore(value);
	return n == null || n > 100 ? null : Math.round(n);
}

// ─── Source Tracking ────────────────────────────────────────────────────

function sourceMeta(
	mgAvailable: boolean,
	lsAvailable: boolean,
	field: 'coding' | 'reasoning' | 'math' | 'sweBenchVerified'
): { source: BenchmarkSource } {
	if (field === 'math' && mgAvailable && lsAvailable) {
		return { source: 'blended' as const };
	}
	if (mgAvailable) return { source: 'modelgrep' as const };
	if (lsAvailable) return { source: 'llm-stats' as const };
	return { source: null };
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Blend benchmarks from modelgrep and llm-stats into a unified view.
 */
export function blendBenchmarks(
	mgModel: ModelgrepModelData | null,
	lsModel: LlmStatsModel | null
): { benchmarks: ModelBenchmarks; meta: BenchmarkMeta } {
	const aa = mgModel?.benchmarks?.artificial_analysis;
	const lsScores = lsModel?.top_scores;

	// Coding: modelgrep primary, llm-stats fallback
	const coding = aa?.coding ?? (lsScores ? lsToDisplay(lsScores.code) : null);
	const codingMg = aa?.coding != null;
	const codingLs = !codingMg && lsScores?.code != null;

	// Reasoning: modelgrep primary, llm-stats fallback (with outlier guard)
	const reasoning = aa?.intelligence ?? (lsScores ? lsReasoningSafe(lsScores.reasoning) : null);
	const reasoningMg = aa?.intelligence != null;
	const reasoningLs = !reasoningMg && lsScores?.reasoning != null && lsScores.reasoning <= 100;

	// Math: blended consensus
	const gpqa = aa?.gpqa ?? null;
	const lsMath = lsScores?.math ?? null;
	const math = blendMath(gpqa, lsMath);
	const mathMg = gpqa != null;
	const mathLs = lsMath != null;

	// SciCode (sweBenchVerified): modelgrep only
	const scicode = aa?.scicode ?? null;

	// Design Arena Elo: modelgrep only — human-preference votes for UI generation
	const designElo = mgModel?.benchmarks?.design_arena?.elo ?? null;

	const benchmarks: ModelBenchmarks = {
		coding,
		reasoning,
		math,
		sweBenchVerified: scicode,
		designElo,
		codeArena: null,
		allScores: {}
	};

	const meta: BenchmarkMeta = {
		coding: sourceMeta(codingMg, codingLs, 'coding'),
		reasoning: sourceMeta(reasoningMg, reasoningLs, 'reasoning'),
		math: sourceMeta(mathMg, mathLs, 'math'),
		sweBenchVerified: sourceMeta(scicode != null, false, 'sweBenchVerified')
	};

	return { benchmarks, meta };
}
