/**
 * LLM Stats URL helpers (client-safe, no server imports).
 *
 * Slug resolution: prefer the verified llm-stats match (`m.llmStatsId`), and
 * fall back to the Go model ID (`m.id`) when matching missed the model. The
 * fallback works in practice: llm-stats serves Go-style slugs directly
 * (e.g. `qwen3.7-max`, `minimax-m3`, `hy3`) or 308-redirects them to the
 * canonical slug (e.g. `deepseek-v4-pro` → `deepseek-v4-pro-max`).
 */

/** Max models llm-stats.com allows in a single compare URL (their API caps at 4). */
export const LLM_STATS_MAX_COMPARE = 4;

/** Best-effort llm-stats slug: the verified match if we have one, else the Go ID. */
export function llmStatsSlug(m: { id: string; llmStatsId: string | null }): string {
	return m.llmStatsId ?? m.id;
}

/** URL for a single model's llm-stats page. */
export function llmStatsModelUrl(m: { id: string; llmStatsId: string | null }): string {
	return `https://llm-stats.com/models/${llmStatsSlug(m)}`;
}

/** Build the llm-stats.com side-by-side compare URL (e.g. .../compare/a-vs-b-vs-c).
 *  Each model resolves to its verified llm-stats slug when available, else its
 *  Go ID (which llm-stats serves directly or canonical-redirects). Returns ''
 *  unless the count is within llm-stats' 2–4 limit. */
export function buildLlmStatsCompareUrl(
	models: { id: string; llmStatsId: string | null }[]
): string {
	if (models.length < 2) return '';
	if (models.length > LLM_STATS_MAX_COMPARE) return '';
	const slugs = models.map(llmStatsSlug);
	return `https://llm-stats.com/models/compare/${slugs.join('-vs-')}`;
}
