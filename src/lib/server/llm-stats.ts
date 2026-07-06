/** LLM Stats API client — fetches model benchmarks, pricing, and rankings. */

import { env } from '$env/dynamic/private';
import type { LLMStatsModel, LLMStatsRanking } from '$lib/types/models';

const LLM_STATS_BASE = 'https://api.llm-stats.com/stats/v1';

function headers(): HeadersInit {
	const key = env.API_KEY;
	if (!key) throw new Error('API_KEY environment variable is required');
	return {
		Authorization: `Bearer ${key}`,
		'Content-Type': 'application/json'
	};
}

async function fetchLLMStats<T>(
	path: string,
	params: URLSearchParams,
	resultKey: string
): Promise<T> {
	const url = `${LLM_STATS_BASE}${path}?${params}`;
	const res = await fetch(url, { headers: headers() });
	if (!res.ok) {
		throw new Error(`LLM Stats ${path} returned ${res.status}: ${res.statusText}`);
	}
	const json = await res.json();
	return json[resultKey] as T;
}

/** Fetch all models from LLM Stats, optionally filtered by organization. */
export async function fetchLLMStatsModels(organization?: string): Promise<LLMStatsModel[]> {
	const params = new URLSearchParams({ limit: '200' });
	if (organization) params.set('organization', organization);
	return fetchLLMStats<LLMStatsModel[]>('/models', params, 'models');
}

/** Fetch rankings for a specific category (coding, reasoning, math). */
export async function fetchLLMStatsRankings(
	category: string,
	limit = 50
): Promise<LLMStatsRanking[]> {
	const params = new URLSearchParams({ category, limit: String(limit) });
	return fetchLLMStats<LLMStatsRanking[]>('/rankings', params, 'models');
}

/** Get the LLM Stats compare URL for a model. */
export function llmStatsModelUrl(modelId: string): string {
	return `https://llm-stats.com/models/${encodeURIComponent(modelId)}`;
}
