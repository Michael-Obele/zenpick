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
 * llm-stats values are normalized first (it serves a mixed 0-1 / 0-100
 * scale) and dropped when they land outside 0-100 — see lsOutlierSafe.
 */
function blendMath(gpqa: number | null, lsMath: number | null): number | null {
	const ls = lsOutlierSafe(lsMath);
	if (gpqa != null && ls != null) {
		return Math.round(gpqa * 60 + ls * 0.4);
	}
	if (gpqa != null) return Math.round(gpqa * 100);
	return ls;
}

// ─── llm-stats Normalization ───────────────────────────────────────────

/**
 * Normalize an llm-stats category score to the 0–100 display scale,
 * guarding against broken-scale outliers.
 *
 * llm-stats serves a mixed scale (some models 0-1, others 0-100), so we
 * auto-detect via normalizeTopScore instead of blindly multiplying by 100.
 * Some models are on a third, simply broken scale (DeepSeek V4.1 Flash:
 * math 868.1, reasoning 289.8; Gemini previews: code 813.4) — values above
 * 100 after normalization are rejected as no data, because a fake score
 * would otherwise leak into the UI and win comparison rows outright.
 */
function lsOutlierSafe(value: number | null | undefined): number | null {
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

	// Coding: modelgrep primary, llm-stats fallback (with outlier guard)
	const lsCode = lsOutlierSafe(lsScores?.code);
	const coding = aa?.coding ?? lsCode;
	const codingMg = aa?.coding != null;
	const codingLs = !codingMg && lsCode != null;

	// Reasoning: modelgrep primary, llm-stats fallback (with outlier guard)
	const lsReasoning = lsOutlierSafe(lsScores?.reasoning);
	const reasoning = aa?.intelligence ?? lsReasoning;
	const reasoningMg = aa?.intelligence != null;
	const reasoningLs = !reasoningMg && lsReasoning != null;

	// Math: blended consensus (with outlier guard on the llm-stats side)
	const gpqa = aa?.gpqa ?? null;
	const lsMath = lsOutlierSafe(lsScores?.math);
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
