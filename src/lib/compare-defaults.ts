import type { GoModel } from '$lib/types/models';
import { capacityPer5h, REFERENCE_CACHED_PCT, REFERENCE_TOKENS } from '$lib/recommendation';

/**
 * Compare-page smart defaults
 * ---------------------------
 * Data-driven anchors and suggestions used to pre-seed the compare page so
 * a direct visit never lands on an empty comparison:
 *
 * - **Quality anchor** — highest composite benchmark score across the core
 *   fields (coding / reasoning / math / SWE-Bench — the same set as
 *   ModelCompare's verdict).
 * - **Value anchor** — most requests per 5-hour window at the reference
 *   workload (50K tokens / 50% cached), using the recommendation engine's
 *   own `capacityPer5h` so the "Best value" label means the same thing as
 *   "quota capacity" everywhere else in the app.
 * - **Random suggested pair** — `randomSuggestedPair()` draws two distinct
 *   models from the top composite-quality pool with usable capacity, so
 *   suggestions are always credible AND fresh: each visit (and each
 *   "Load suggested models" click) can surface a different pair.
 *
 * Anchors are deterministic (no hardcoded model IDs) and track the catalog
 * as models are added or retired. When both anchors resolve to the same
 * model, only one is returned. Functions never throw and return `null`
 * when the catalog has no usable data.
 */

/** Core benchmark fields that define "quality". */
const QUALITY_KEYS = ['coding', 'reasoning', 'math', 'sweBenchVerified'] as const;

/**
 * Normalize one benchmark value to the 0–100 display scale.
 * `sweBenchVerified` is actually the SciCode benchmark (see `server/tags.ts`),
 * which modelgrep reports as a 0–1 fraction — scale it to percent so it can
 * be compared and averaged against the 0–100 fields. Null-safe for use in
 * compare rows and model drawers.
 */
export function benchmarkToPercent(value: number | null | undefined, key: string): number | null {
	return value == null ? null : key === 'sweBenchVerified' && value < 1 ? value * 100 : value;
}

/**
 * True when the model has at least one benchmark field backed by
 * modelgrep/blended data. Models whose only evidence is an llm-stats
 * estimate (flagged `source: "llm-stats"`) are excluded from the quality
 * anchor: a catalog-wide "Top quality" claim must stand on solid data.
 */
function hasSolidBenchmark(model: GoModel): boolean {
	return QUALITY_KEYS.some((k) => {
		const source = model.benchmarks._meta?.[k]?.source;
		return !source || source !== 'llm-stats';
	});
}

/**
 * Average of the model's non-null core benchmark scores on the 0–100
 * scale, or `null` when it has none.
 */
export function compositeBenchmark(model: GoModel): number | null {
	const scores = QUALITY_KEYS.map((k) => {
		const v = model.benchmarks[k];
		return v == null || !Number.isFinite(v) ? null : benchmarkToPercent(v, k);
	}).filter((v): v is number => v != null);
	if (!scores.length) return null;
	return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Catalog-wide quality anchor: highest composite benchmark (ties → name). */
export function catalogQualityAnchor(models: GoModel[]): GoModel | null {
	return (
		models
			.filter(hasSolidBenchmark)
			.map((m) => ({ m, s: compositeBenchmark(m) }))
			.filter((x): x is { m: GoModel; s: number } => x.s != null)
			.sort((a, b) => b.s - a.s || a.m.name.localeCompare(b.m.name))[0]?.m ?? null
	);
}

/**
 * Catalog-wide value anchor: most requests per 5h at the reference workload
 * (ties → lower input price, then name).
 */
export function catalogValueAnchor(models: GoModel[]): GoModel | null {
	return (
		models
			.map((m) => ({ m, cap: capacityPer5h(m, REFERENCE_TOKENS, REFERENCE_CACHED_PCT) }))
			.filter((x): x is { m: GoModel; cap: number } => x.cap > 0)
			.sort(
				(a, b) =>
					b.cap - a.cap ||
					(a.m.pricing.inputPricePerM ?? Number.POSITIVE_INFINITY) -
						(b.m.pricing.inputPricePerM ?? Number.POSITIVE_INFINITY) ||
					a.m.name.localeCompare(b.m.name)
			)[0]?.m ?? null
	);
}

/** The smart-default pair: `[quality anchor, value anchor]`, deduped and ordered. */
export function defaultComparePair(models: GoModel[]): GoModel[] {
	const out: GoModel[] = [];
	const seen = new Set<string>();
	for (const m of [catalogQualityAnchor(models), catalogValueAnchor(models)]) {
		if (m && !seen.has(m.id)) {
			seen.add(m.id);
			out.push(m);
		}
	}
	return out;
}

/** How many top models the random suggestion pair draws from. */
const RANDOM_POOL_SIZE = 6;

/** Pick a random element (uniform). Returns `undefined` for an empty list. */
function pickRandom<T>(items: T[]): T | undefined {
	return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

/**
 * A fresh, credible suggestion pair — randomized for variety across visits.
 *
 * Draws two distinct models from the top `RANDOM_POOL_SIZE` composite-quality
 * models that also have usable quota capacity, so the pair is always "good"
 * while still changing each call (and each "Load suggested models" click).
 * Falls back to the deterministic quality+value anchors when the pool is
 * too small to randomize.
 */
export function randomSuggestedPair(models: GoModel[]): GoModel[] {
	const pool = models
		.filter(
			(m) => hasSolidBenchmark(m) && capacityPer5h(m, REFERENCE_TOKENS, REFERENCE_CACHED_PCT) > 0
		)
		.map((m) => ({ m, s: compositeBenchmark(m) }))
		.filter((x): x is { m: GoModel; s: number } => x.s != null)
		.sort((a, b) => b.s - a.s)
		.slice(0, RANDOM_POOL_SIZE)
		.map((x) => x.m);

	if (pool.length >= 2) {
		const first = pickRandom(pool);
		const second = pickRandom(pool.filter((m) => m.id !== first?.id));
		if (first && second) return [first, second];
	}
	return defaultComparePair(models);
}
