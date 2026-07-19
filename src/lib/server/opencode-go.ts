/** OpenCode Go API client — fetches list of available Go models. */

import type { GoModelEntry } from '$lib/types/models';

const GO_API_BASE = 'https://opencode.ai/zen/go/v1';

/** Fetch all available Go model IDs from the OpenCode Go API. */
export async function fetchGoModels(): Promise<GoModelEntry[]> {
	const res = await fetch(`${GO_API_BASE}/models`);
	if (!res.ok) {
		throw new Error(`OpenCode Go API returned ${res.status}: ${res.statusText}`);
	}
	const json = await res.json();
	return json.data as GoModelEntry[];
}

/** Brand display names for known model provider prefixes. */
const BRAND_NAME: Record<string, string> = {
	deepseek: 'DeepSeek',
	glm: 'GLM',
	kimi: 'Kimi',
	mimo: 'MiMo',
	minimax: 'MiniMax',
	qwen: 'Qwen',
	grok: 'Grok',
	hy3: 'Hy3'
};

/**
 * Derive a display name from a Go model ID algorithmically.
 * No hardcoded model list — works for any model the Go API returns.
 *
 * Examples:
 *   "deepseek-v4-pro"   → "DeepSeek V4 Pro"
 *   "qwen3.7-max"       → "Qwen 3.7 Max"
 *   "glm-5.2"           → "GLM 5.2"
 *   "kimi-k2.7-code"    → "Kimi K2.7 Code"
 */
export function goIdToName(id: string): string {
	// Split at the boundary between the alphabetic provider prefix and the first digit.
	// Handles both "prefix-version" (e.g. "glm-5") and "prefixversion" (e.g. "qwen3").
	const match = id.match(/^([a-z]+?)([0-9].*)$/);
	if (!match) {
		// No digit found — just title-case the whole thing
		return id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
	}

	const [, prefix, rest] = match;
	const brand = BRAND_NAME[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);

	// Format the version+suffix part: split on hyphens, capitalize suffix words
	const parts = rest.split('-');
	const formatted = parts
		.map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ');

	return `${brand} ${formatted}`;
}

/**
 * Determine endpoint type from model ID.
 * Uses prefix-based pattern matching — no hardcoded model IDs.
 */
export function goEndpointType(id: string): 'openai-compatible' | 'anthropic-compatible' {
	// Models from these provider prefixes use Anthropic-compatible endpoints
	// Source: https://opencode.ai/docs/go/ endpoint table
	const anthropicPrefixes = ['minimax', 'qwen'];
	return anthropicPrefixes.some((p) => id.startsWith(p))
		? 'anthropic-compatible'
		: 'openai-compatible';
}

/** Get the API endpoint URL for a model. */
export function goEndpointUrl(id: string): string {
	return goEndpointType(id) === 'anthropic-compatible'
		? 'https://opencode.ai/zen/go/v1/messages'
		: 'https://opencode.ai/zen/go/v1/chat/completions';
}
