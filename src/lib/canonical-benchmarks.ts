/**
 * Canonical benchmarks from models.dev's canonical model layer — PURE.
 *
 * WHY THIS MODULE IS NOT UNDER `server/`
 * --------------------------------------
 * It has no imports and touches no network or filesystem, so both server code
 * and the client-side debug UI import it with plain value imports
 * (`MIN_COVERAGE`, `benchmarkKey`). SvelteKit's guard rightly refuses to let a
 * client file pull anything under `$lib/server/`, so the pure shapes live here
 * and the network fetch lives in `$lib/server/canonical-benchmarks.ts`.
 *
 * WHY THIS IS A SEPARATE STORE
 * ---------------------------
 * models.dev's canonical layer carries agentic-coding evals ZenPick lacks
 * entirely (Terminal-Bench, DeepSWE, SWE-Bench Pro, Humanity's Last Exam).
 * But the data is NOT mergeable into ZenPick's 0-100 blend fields:
 *
 *  - the SAME benchmark arrives with incompatible metrics — Terminal-Bench
 *    appears as pass@1, score, success rate, avg@3, avg@10, accuracy and
 *    dominance;
 *  - scales are not uniform — GDPval-AA and AA-Briefcase are Elo (1615-1773)
 *    and Codeforces is a rating (3471), alongside 0-100 percentages;
 *  - even within one model the numbers diverge 3x (glm-5.3: Terminal-Bench
 *    pass@1 88.2 vs avg@3 28.3).
 *
 * So scores are stored metric-qualified, keyed `name|metric`, and NEVER enter
 * `ModelBenchmarks`. blend.ts is untouched.
 *
 * CALIBRATION FIGURES — READ THE UNIVERSE
 * ---------------------------------------
 * Every figure below was measured on ONE specific input universe: the 37 live
 * Go models joined via `canonicalId`, where each model resolves through
 * `resolveModelsDevEntry` (`opencode-go` block first, then the `opencode`/Zen
 * fallback). On that universe:
 *
 *  - 176 distinct (name|metric) pairs;
 *  - 19 of 304 scores outside 0-100.
 *
 * Coverage is MONOTONE in the input set, so a narrower universe yields smaller
 * numbers: joining ONLY the `opencode-go` block (no Zen fallback) gives 160
 * pairs / 18 pairs at MIN_COVERAGE. Neither number contradicts the other —
 * they describe different universes. Before treating a mismatch as upstream
 * drift, check which universe your measurement used; nothing in this module
 * depends on either figure at runtime, so read `index.comparable` instead of
 * hardcoding a count.
 */

export interface CanonicalBenchmark {
	/** Benchmark name, e.g. "Terminal-Bench". */
	name: string;
	/** Metric qualifier, e.g. "pass@1". Null when the source omits it. */
	metric: string | null;
	/** Raw score. May be Elo/rating — not necessarily 0-100. */
	score: number;
	/** True when the score is a percentage (0-100). */
	isPercentage: boolean;
	/** How many live Go models report this exact name|metric pair. */
	coverage: number;
}

/** The canonical model layer, keyed by canonical id. */
export interface CanonicalModel {
	id: string;
	name?: string;
	benchmarks?: { name: string; score: number; metric?: string }[];
}

/** Canonical benchmarks indexed for lookup, with a comparability filter. */
export interface CanonicalBenchmarkIndex {
	/** Every benchmark for a model, keyed by `name|metric`. */
	byModel: Map<string, CanonicalBenchmark[]>;
	/** How many live Go models report each `name|metric` pair. */
	coverage: Map<string, number>;
	/**
	 * The comparable set: `name|metric` pairs reported by at least
	 * MIN_COVERAGE models. Pairs below it are single-model noise.
	 */
	comparable: Set<string>;
}

/** A benchmark name needs this many models before it is comparable. */
export const MIN_COVERAGE = 3;

/** The stable key for a name|metric pair. */
export function benchmarkKey(name: string, metric: string | null): string {
	return `${name}|${metric ?? '-'}`;
}

/** True when a score is on a percentage scale. */
export function isPercentageScore(score: number): boolean {
	return score >= 0 && score <= 100;
}

/**
 * Build the benchmark index for the live Go catalog.
 *
 * Only models with a `canonicalId` contribute. `coverage` counts DISTINCT
 * models reporting a pair, so one model reporting two variants of a benchmark
 * does not inflate the count.
 */
export function buildBenchmarkIndex(
	canonical: Map<string, CanonicalModel>,
	goModels: { id: string; canonicalId: string | null }[]
): CanonicalBenchmarkIndex {
	const { byModel, perModelKeys } = indexModels(canonical, goModels);
	const coverage = countCoverage(perModelKeys);

	// Fill coverage back into each row now that the counts are known.
	for (const rows of byModel.values()) {
		for (const row of rows) {
			row.coverage = coverage.get(benchmarkKey(row.name, row.metric)) ?? 0;
		}
	}

	const comparable = new Set<string>();
	for (const [key, count] of coverage) {
		if (count >= MIN_COVERAGE) comparable.add(key);
	}

	return { byModel, coverage, comparable };
}

/**
 * Map each model to its benchmark rows.
 *
 * Only models with a `canonicalId` contribute. The `perModelKeys` set is what
 * coverage is counted from — DISTINCT `name|metric` pairs per model, so one
 * model reporting two variants of a benchmark does not inflate the count, and a
 * duplicate Go id (counted ONCE — it is one distinct model) never double-counts.
 */
function indexModels(
	canonical: Map<string, CanonicalModel>,
	goModels: { id: string; canonicalId: string | null }[]
): { byModel: Map<string, CanonicalBenchmark[]>; perModelKeys: Map<string, Set<string>> } {
	const byModel = new Map<string, CanonicalBenchmark[]>();
	const perModelKeys = new Map<string, Set<string>>();

	for (const model of goModels) {
		if (!model.canonicalId) continue;
		// The first occurrence wins, so a repeated id never double-counts.
		if (byModel.has(model.id)) continue;
		const entry = canonical.get(model.canonicalId);
		if (!entry?.benchmarks?.length) continue;

		byModel.set(
			model.id,
			entry.benchmarks.map((b) => ({
				name: b.name,
				metric: b.metric ?? null,
				score: b.score,
				isPercentage: isPercentageScore(b.score),
				coverage: 0
			}))
		);
		perModelKeys.set(
			model.id,
			new Set(entry.benchmarks.map((b) => benchmarkKey(b.name, b.metric ?? null)))
		);
	}

	return { byModel, perModelKeys };
}

/** How many DISTINCT models report each `name|metric` pair. */
function countCoverage(perModelKeys: Map<string, Set<string>>): Map<string, number> {
	const coverage = new Map<string, number>();
	for (const keys of perModelKeys.values()) {
		for (const key of keys) coverage.set(key, (coverage.get(key) ?? 0) + 1);
	}
	return coverage;
}
