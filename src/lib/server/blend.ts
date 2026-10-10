/**
 * Multi-source benchmark blending engine.
 *
 * Takes data from modelgrep and llm-stats and produces a unified
 * benchmark view with per-field source tracking.
 *
 * Strategy — field-specific sourcing:
 * - Coding: modelgrep primary (TrueSkill), then llm-stats, then modelgrep's
 *   own AA coding fields (LiveCodeBench / SciCode / GPQA) as a best-effort
 *   fallback when the headline `coding` score is missing.
 * - Reasoning: modelgrep primary (TrueSkill), llm-stats fallback with outlier guard
 * - Math: blended consensus (GPQA × 0.6 + llm-stats.math × 0.4), falling back
 *   to modelgrep's `math` composite then AIME / HLE when the primary is absent.
 * - SWE-bench (SciCode): modelgrep only (aa.scicode)
 *
 * modelgrep's `benchmarks.artificial_analysis` is sparse — across 180 AA-block
 * models only ~54% carry `coding`, ~30% carry `math`. Without fallbacks those
 * rows render blank (`—`) even though a comparable AA metric exists, so each
 * fallback records which field it used in `_meta` for the UI to label.
 */

import type {
	BenchmarkMeta,
	BenchmarkSource,
	BenchmarkSourceMeta,
	ModelBenchmarks
} from '$lib/types/models';
import type { ModelgrepModelData } from '$lib/types/models';
import type { LlmStatsModel } from '$lib/types/models';
import { normalizeTopScore } from './llm-stats';

/** A resolved benchmark value plus where it came from. */
type Resolved = { value: number | null; source: BenchmarkSource; field?: string };

/** Convert a 0-1 accuracy field to the 0-100 display scale (or null). */
function asPercent(v: number | null | undefined): number | null {
	return v == null ? null : Math.round(v * 100);
}

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

// ─── Field Resolution (primary + fallbacks) ─────────────────────────────

/** modelgrep's artificial_analysis block, or null/undefined when absent. */
type AaBlock = NonNullable<ModelgrepModelData['benchmarks']>['artificial_analysis'];

/**
 * Coding, best available source:
 *   1. `aa.coding` — the AA coding TrueSkill score (headline metric)
 *   2. llm-stats `code` — normalized, outlier-guarded
 *   3. `aa.livecodebench` — competitive-programming pass rate
 *   4. `aa.scicode` / `aa.gpqa` — science/code reasoning, last resort
 * Every fallback is labeled with its field so the UI can say "via X".
 */
function resolveCoding(aa: AaBlock | undefined, lsCode: number | null): Resolved {
	if (aa?.coding != null) return { value: aa.coding, source: 'modelgrep' };
	if (lsCode != null) return { value: lsCode, source: 'llm-stats' };

	const lcb = asPercent(aa?.livecodebench);
	if (lcb != null) return { value: lcb, source: 'modelgrep', field: 'livecodebench' };

	if (aa?.scicode != null) {
		return { value: asPercent(aa.scicode), source: 'modelgrep', field: 'scicode' };
	}
	if (aa?.gpqa != null) return { value: asPercent(aa.gpqa), source: 'modelgrep', field: 'gpqa' };

	return { value: null, source: null };
}

/**
 * Math, best available source:
 *   1. blended GPQA × llm-stats.math consensus
 *   2. `aa.math` — the AA math composite (0-100)
 *   3. `aa.aime` — AIME competition accuracy
 *   4. `aa.hle` — Humanity's Last Exam, last resort
 */
function resolveMath(
	aa: AaBlock | undefined,
	gpqa: number | null,
	lsMath: number | null
): Resolved {
	const blended = blendMath(gpqa, lsMath);
	if (blended != null) {
		const source: BenchmarkSource =
			gpqa != null && lsMath != null ? 'blended' : gpqa != null ? 'modelgrep' : 'llm-stats';
		return { value: blended, source };
	}

	if (aa?.math != null) return { value: aa.math, source: 'modelgrep', field: 'math' };
	const aime = asPercent(aa?.aime);
	if (aime != null) return { value: aime, source: 'modelgrep', field: 'aime' };
	const hle = asPercent(aa?.hle);
	if (hle != null) return { value: hle, source: 'modelgrep', field: 'hle' };

	return { value: null, source: null };
}

/** Keep only the source-tracking half of a resolved field. */
function metaOf(r: Resolved): BenchmarkSourceMeta {
	return r.field == null ? { source: r.source } : { source: r.source, field: r.field };
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

	// Coding: modelgrep primary, then llm-stats, then modelgrep AA fallbacks.
	const coding = resolveCoding(aa, lsOutlierSafe(lsScores?.code));

	// Reasoning: modelgrep primary, llm-stats fallback (with outlier guard).
	const lsReasoning = lsOutlierSafe(lsScores?.reasoning);
	const reasoning = aa?.intelligence ?? lsReasoning;
	const reasoningMeta: BenchmarkSourceMeta =
		aa?.intelligence != null
			? { source: 'modelgrep' }
			: lsReasoning != null
				? { source: 'llm-stats' }
				: { source: null };

	// Math: blended consensus, then modelgrep AA math / AIME / HLE fallbacks.
	const math = resolveMath(aa, aa?.gpqa ?? null, lsOutlierSafe(lsScores?.math));

	// SciCode (sweBenchVerified): modelgrep only
	const scicode = aa?.scicode ?? null;
	const sweMeta: BenchmarkSourceMeta = scicode != null ? { source: 'modelgrep' } : { source: null };

	// Design Arena Elo: modelgrep only — human-preference votes for UI generation
	const designElo = mgModel?.benchmarks?.design_arena?.elo ?? null;

	const benchmarks: ModelBenchmarks = {
		coding: coding.value,
		reasoning,
		math: math.value,
		sweBenchVerified: scicode,
		designElo,
		codeArena: null,
		allScores: {}
	};

	const meta: BenchmarkMeta = {
		coding: metaOf(coding),
		reasoning: reasoningMeta,
		math: metaOf(math),
		sweBenchVerified: sweMeta
	};

	return { benchmarks, meta };
}
