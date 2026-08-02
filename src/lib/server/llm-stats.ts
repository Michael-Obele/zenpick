/**
 * LLM Stats API client — fetches model benchmark scores from llm-stats.com.
 *
 * API docs: https://docs.llm-stats.com/api-reference/list-models
 * Base: https://api.llm-stats.com/stats/v1/models
 * Auth: Bearer token via LLM_STATS_API_KEY env var
 */

import type { LlmStatsModel } from '$lib/types/models';
import { goIdToName } from './opencode-go';

const LLM_STATS_BASE = 'https://api.llm-stats.com/stats/v1/models';

/**
 * Fetch all models from the LLM Stats API (the full catalog, every org).
 * Uses pagination via next_cursor. Returns empty array on failure.
 */
export async function fetchLlmStatsModels(apiKey: string): Promise<LlmStatsModel[]> {
	const allModels: LlmStatsModel[] = [];
	let cursor: string | null = null;

	try {
		while (true) {
			const params = new URLSearchParams({ limit: '200' });
			if (cursor) params.set('cursor', cursor);

			// Retry transient failures (e.g. rate-limit 403/429) so a rebuild doesn't
			// end up with a partial model list — an incomplete frontier set makes the
			// "Replaces" hints come back empty for some models.
			let res: Response | null = null;
			for (let attempt = 0; attempt < 3; attempt++) {
				res = await fetch(`${LLM_STATS_BASE}?${params.toString()}`, {
					headers: {
						Authorization: `Bearer ${apiKey}`,
						Accept: 'application/json'
					}
				});
				if (res.ok) break;
				if (attempt < 2) {
					console.warn(`[llm-stats] attempt ${attempt + 1} returned ${res.status}; retrying…`);
					await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
				}
			}

			if (!res || !res.ok) {
				console.error(`[llm-stats] API returned ${res?.status}: ${res?.statusText}`);
				break;
			}

			const json = await res.json();
			const models = (json.models ?? []) as LlmStatsModel[];
			allModels.push(...models);

			cursor = json.next_cursor ?? null;
			if (!cursor) break;
		}

		console.log(`[llm-stats] fetched ${allModels.length} models total`);
		return allModels;
	} catch (e) {
		console.error('[llm-stats] fetch failed:', e instanceof Error ? e.message : String(e));
		return [];
	}
}

/** Closed-source labs whose models we treat as "frontier" replacement targets. */
const FRONTIER_ORGS = [
	'openai',
	'anthropic',
	'google',
	'xai',
	'meta',
	'mistral',
	'cohere',
	'amazon',
	'databricks',
	'microsoft'
];

/**
 * How recent a closed-source model must be to count as a "replacement" peer.
 * Old generations (e.g. Claude 3.x, GPT-4) share the same compressed top_scores
 * as current open models, so matching against them produces misleading "replaces"
 * claims (a 2026 flagship ends up "comparable" to a 2024 small model). Restrict to
 * models released within this window. Models without a release_date are kept
 * (we can't verify their age, and the goal is only to drop known-old ones).
 */
const FRONTIER_MAX_AGE_DAYS = 200; // ~6 months

/**
 * Closed-source models from major frontier labs — the candidates an open-weight
 * Go model can "replace". Open-weight orgs are excluded (they're already matched
 * as the Go model itself), we only keep models that expose category scores, and
 * we drop models older than FRONTIER_MAX_AGE_DAYS so comparisons stay peer-to-peer.
 */
export function filterFrontierModels(models: LlmStatsModel[]): LlmStatsModel[] {
	const cutoff = Date.now() - FRONTIER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
	return models.filter((m) => {
		if (m.open_weight) return false;
		const orgId = m.organization?.id ?? '';
		if (!FRONTIER_ORGS.includes(orgId)) return false;
		const ts = m.top_scores ?? {};
		if (!(ts.code ?? ts.reasoning ?? ts.math)) return false;
		if (m.release_date) {
			const t = Date.parse(m.release_date);
			if (!Number.isNaN(t) && t < cutoff) return false;
		}
		return true;
	});
}

/**
 * Normalize an llm-stats category score to a 0–100 scale.
 * llm-stats stores some models' scores as 0–1 and others as 0–100, so we
 * auto-detect: values ≤ 1 are treated as 0–1 and scaled up. Returns null if
 * the input is null/undefined. This makes scores comparable across models
 * despite the inconsistent source scale.
 */
export function normalizeTopScore(v: number | null | undefined): number | null {
	if (v == null) return null;
	return v <= 1 ? v * 100 : v;
}

// ─── Model Matching ───────────────────────────────────────────────────────

/**
 * Normalize a model ID for comparison: lowercase, strip dots and dashes.
 */
function normalize(id: string): string {
	return id.toLowerCase().replace(/[.-]/g, '');
}

/**
 * Match a Go model ID to an LLM Stats model against the FULL catalog.
 *
 * Company-agnostic by design: no org allow-list, so a Go model from any lab
 * resolves as long as llm-stats tracks it. Strategy (in order of precedence):
 * 1. Exact ID match
 * 2. Normalized exact match (ignoring dots/dashes)
 * 3. Fuzzy: Go ID is a prefix of LS ID (e.g., "deepseek-v4-flash" → "deepseek-v4-flash-max")
 * 4. Fuzzy: normalized substring inclusion (e.g., "glm-5" matches "glm-5",
 *    preferring the same normalized length)
 * 5. Name-based similarity (e.g., Go "microsoft-mai-1" → LS "Microsoft MAI-1"
 *    when ID formats diverge)
 */
export function matchLlmStatsModel(goId: string, allModels: LlmStatsModel[]): LlmStatsModel | null {
	const goNorm = normalize(goId);

	// Pass 1: Exact match
	const exact = allModels.find((m) => m.id === goId);
	if (exact) return exact;

	// Pass 2: Normalized exact match
	const normExact = allModels.find((m) => normalize(m.id) === goNorm);
	if (normExact) return normExact;

	// Pass 3: Go ID is a prefix of LS model ID
	const prefix = allModels.find((m) => {
		const lsNorm = normalize(m.id);
		return lsNorm.startsWith(goNorm) && lsNorm.length > goNorm.length;
	});
	if (prefix) return prefix;

	// Pass 4: Normalized substring inclusion (prefer exact-length match)
	const candidates = allModels.filter((m) => normalize(m.id).includes(goNorm));
	if (candidates.length === 1) return candidates[0];
	if (candidates.length > 1) {
		// Prefer the one with the same normalized length (not "glm-5" matching "glm-5v-turbo")
		const sameLen = candidates.find((m) => normalize(m.id).length === goNorm.length);
		return sameLen ?? candidates[0];
	}

	// Pass 5: Name-based similarity (catches ID-format divergence)
	const goName = goIdToName(goId);
	const nameCandidates = allModels
		.map((m) => ({ m, score: nameSimilarity(goName, m.name) }))
		.filter((x) => x.score >= 0.85);
	if (nameCandidates.length === 1) return nameCandidates[0].m;
	if (nameCandidates.length > 1) {
		// Prefer the name whose normalized length is closest to the Go name's
		const goLen = normalize(goName).length;
		nameCandidates.sort(
			(a, b) =>
				Math.abs(normalize(a.m.name).length - goLen) - Math.abs(normalize(b.m.name).length - goLen)
		);
		return nameCandidates[0].m;
	}

	return null;
}

/**
 * Name similarity score: 1 for exact normalized equality, 0.85 when one
 * name contains the other (e.g. "Hy3 3" vs "Hy3"). 0 otherwise.
 */
function nameSimilarity(a: string, b: string): number {
	const [na, nb] = [normalize(a), normalize(b)];
	if (!na || !nb) return 0;
	if (na === nb) return 1;
	if (na.includes(nb) || nb.includes(na)) return 0.85;
	return 0;
}
