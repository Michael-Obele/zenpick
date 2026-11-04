/**
 * llm-stats public leaderboard index — keyless benchmark fallback.
 *
 * WHY THIS EXISTS
 * ---------------
 * The keyed llm-stats API (`api.llm-stats.com/stats/v1/models`) needs
 * `LLM_STATS_API_KEY`, and a missing or rejected key leaves every closed-source
 * plan model with null intelligence/coding scores on the compare page. The
 * llm-stats site itself is powered by ZeroEval's public leaderboard API, which
 * exposes the SAME category indices (`code`, `reasoning`, `math`) without a key.
 *
 * This module turns those three indices into the `top_scores` shape
 * `blendBenchmarks` already understands, so plan-only models go through the
 * identical modelgrep-primary → llm-stats-fallback pipeline as Go models.
 *
 * The values are TrueSkill conservative ratings on a 0-100 scale (mu - 3σ),
 * which is exactly the scale the keyed API's category scores use. They are
 * ADVISORY: a failed fetch returns an empty index and the plan rows keep
 * whatever modelgrep published — never a fabricated score.
 *
 * STRICT MATCHING
 * ---------------
 * Only an exact normalized id or an exact, globally-unique normalized name is
 * used. A prefix/containment match would happily hand `gpt-5.5-pro` the scores
 * of `gpt-5.5`, which is worse than showing a dash.
 */

import { cacheGet, cacheSet, MODELS_TTL } from '$lib/cache';

/** The leaderboard categories the blend reads. */
export type LlmStatsCategory = 'code' | 'reasoning' | 'math';

export const LLM_STATS_CATEGORIES: readonly LlmStatsCategory[] = ['code', 'reasoning', 'math'];

/** Category scores for one model, on the 0-100 display scale. */
export type LlmStatsCategoryScores = Partial<Record<LlmStatsCategory, number>>;

/** One indexed llm-stats model: its canonical id plus the category scores. */
export interface LlmStatsModelScores {
	/** Canonical provider model id, used for llm-stats links. */
	id: string;
	scores: LlmStatsCategoryScores;
}

/** Models indexed by normalized id, with a unique-name fallback. */
export interface LlmStatsBenchmarkIndex {
	byId: Map<string, LlmStatsModelScores>;
	/** Only names that resolve to exactly one model id, so collisions are skipped. */
	byName: Map<string, LlmStatsModelScores>;
}

/** An empty index — a failed fetch must not break plan building. */
export function emptyLlmStatsBenchmarkIndex(): LlmStatsBenchmarkIndex {
	return { byId: new Map(), byName: new Map() };
}

/** Fold an id or name to its matching key (`gpt-5.5` === `gpt-5-5`). */
export function llmStatsKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** One model row as published by a category index. */
interface CategoryModel {
	model_id?: unknown;
	model_name?: unknown;
	conservative?: unknown;
}

/** The rows of one category payload, or an empty list for a malformed body. */
function categoryModels(payload: unknown): unknown[] {
	if (!isRecord(payload) || !Array.isArray(payload.models)) return [];
	return payload.models;
}

/**
 * A comparable 0-100 rating, or null.
 *
 * Out-of-range values are broken rows, not comparable scores (the same guard
 * `blend.ts` applies to top_scores).
 */
function ratingOf(raw: CategoryModel): number | null {
	const score = raw.conservative;
	if (typeof score !== 'number' || !Number.isFinite(score)) return null;
	if (score < 0 || score > 100) return null;
	return score;
}

/** Record one category's score for a model and remember its display name. */
function mergeRow(
	byId: Map<string, LlmStatsModelScores>,
	names: Map<string, Set<string>>,
	category: LlmStatsCategory,
	raw: CategoryModel
): void {
	const id = typeof raw.model_id === 'string' ? raw.model_id : '';
	const idKey = llmStatsKey(id);
	if (!idKey) return;
	const score = ratingOf(raw);
	if (score == null) return;

	const entry = byId.get(idKey) ?? { id, scores: {} };
	entry.scores[category] = score;
	byId.set(idKey, entry);

	const nameKey = llmStatsKey(typeof raw.model_name === 'string' ? raw.model_name : '');
	if (!nameKey) return;
	const ids = names.get(nameKey) ?? new Set<string>();
	ids.add(idKey);
	names.set(nameKey, ids);
}

/** Keep only names that resolve to one model — ambiguous names would cross-match. */
function uniqueNames(
	byId: Map<string, LlmStatsModelScores>,
	names: Map<string, Set<string>>
): Map<string, LlmStatsModelScores> {
	const byName = new Map<string, LlmStatsModelScores>();
	for (const [nameKey, ids] of names) {
		if (ids.size !== 1) continue;
		const [idKey] = ids;
		const entry = byId.get(idKey);
		if (entry) byName.set(nameKey, entry);
	}
	return byName;
}

/**
 * Build the lookup index from the three raw category payloads.
 *
 * Exported for tests: the fetch itself is a thin I/O wrapper around this pure
 * function, so payload handling can be exercised without network access.
 */
export function buildLlmStatsBenchmarkIndex(
	payloads: Partial<Record<LlmStatsCategory, unknown>>
): LlmStatsBenchmarkIndex {
	const byId = new Map<string, LlmStatsModelScores>();
	/** name key → the model ids that carry it (used to reject ambiguous names). */
	const names = new Map<string, Set<string>>();

	for (const category of LLM_STATS_CATEGORIES) {
		for (const raw of categoryModels(payloads[category])) {
			if (isRecord(raw)) mergeRow(byId, names, category, raw as CategoryModel);
		}
	}

	return { byId, byName: uniqueNames(byId, names) };
}

/**
 * Look a model up by any of its known ids, then by its display name.
 * Returns null when nothing matches — callers render a dash.
 */
export function lookupLlmStatsScores(
	index: LlmStatsBenchmarkIndex,
	ids: (string | null | undefined)[],
	name?: string | null
): LlmStatsModelScores | null {
	for (const id of ids) {
		if (!id) continue;
		const hit = index.byId.get(llmStatsKey(id));
		if (hit) return hit;
	}

	if (name) {
		const hit = index.byName.get(llmStatsKey(name));
		if (hit) return hit;
	}

	return null;
}

const CACHE_KEY = 'llm-stats-public-index:v1';
const CATEGORY_URL = (category: LlmStatsCategory) =>
	`https://api.zeroeval.com/leaderboard/categories/${category}/index`;
const FETCH_TIMEOUT_MS = 20_000;

async function fetchCategory(category: LlmStatsCategory): Promise<unknown> {
	try {
		const res = await fetch(CATEGORY_URL(category), {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});
		if (!res.ok) {
			console.error(`[llm-stats-public] ${category} returned ${res.status}: ${res.statusText}`);
			return null;
		}
		return await res.json();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[llm-stats-public] ${category} fetch failed:`, msg);
		return null;
	}
}

/**
 * Fetch and index the public category leaderboards.
 *
 * Cached for the model TTL. A stale index is served when every category fetch
 * fails, and a completely empty result is never cached — so a transient outage
 * is retried on the next plan rebuild instead of being pinned for six hours.
 */
export async function fetchLlmStatsBenchmarkIndex(): Promise<LlmStatsBenchmarkIndex> {
	const cached = cacheGet<LlmStatsBenchmarkIndex>(CACHE_KEY);
	if (cached && !cached.stale) return cached.data;

	const payloads = await Promise.all(
		LLM_STATS_CATEGORIES.map((category) => fetchCategory(category))
	);
	const index = buildLlmStatsBenchmarkIndex({
		code: payloads[0],
		reasoning: payloads[1],
		math: payloads[2]
	});

	if (index.byId.size === 0) {
		// Nothing usable came back. Prefer an older index over none at all.
		return cached?.data ?? index;
	}

	console.log(
		`[llm-stats-public] indexed ${index.byId.size} models (${index.byName.size} unique names)`
	);
	cacheSet(CACHE_KEY, index, MODELS_TTL);
	return index;
}
