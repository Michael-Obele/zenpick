/** modelgrep.com API client — fetches model benchmarks, pricing, and speed data. */

import type { ModelgrepModelData } from '$lib/types/models';
import { goIdToName } from './opencode-go';

const MODELGREP_BASE = 'https://modelgrep.com/api/v1';

/**
 * Result of a modelgrep fetch: indexed map for fast exact lookups,
 * plus flat array for fuzzy fallback matching.
 */
export interface ModelgrepResult {
	byId: Map<string, ModelgrepModelData>;
	all: ModelgrepModelData[];
}

/** Batch-fetch all models by maker and index by modelgrep ID. */
export async function fetchModelgrepModels(): Promise<ModelgrepResult> {
	const makers = ['deepseek', 'z-ai', 'moonshotai', 'xiaomi', 'minimax', 'qwen'];
	const results = await Promise.all(
		makers.map(async (maker) => {
			const url = `${MODELGREP_BASE}/models?q=${maker}&limit=30`;
			try {
				const res = await fetch(url);
				if (!res.ok) {
					console.error(`[modelgrep] ${maker} returned ${res.status}: ${res.statusText}`);
					return [];
				}
				const json = await res.json();
				return (json.data ?? []) as ModelgrepModelData[];
			} catch (e) {
				console.error(`[modelgrep] ${maker} fetch failed:`, e);
				return [];
			}
		})
	);

	const all = results.flat();
	const byId = new Map<string, ModelgrepModelData>();
	for (const model of all) {
		byId.set(model.id, model);
	}
	return { byId, all };
}

// ─── Fuzzy matching (fallback — no hardcoded model list) ────────────────

function normalize(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function similarity(a: string, b: string): number {
	const [na, nb] = [normalize(a), normalize(b)];
	if (na === nb) return 1;
	if (na.includes(nb) || nb.includes(na)) return 0.85;
	return 0;
}

const SIMILARITY_THRESHOLD = 0.7;

/**
 * Fuzzy-match a Go model to a modelgrep model by name.
 * Checks against: display name, maker-stripped name, and modelgrep model ID suffix.
 * Returns null if no model meets the threshold.
 * Uses the algorithmically derived display name from goIdToName(),
 * so new Go models resolve automatically — no code changes needed.
 */
export function fuzzyMatchModelgrep(
	goId: string,
	allModels: ModelgrepModelData[]
): ModelgrepModelData | null {
	const goName = goIdToName(goId).toLowerCase();
	let best: ModelgrepModelData | null = null;
	let bestScore = 0;

	for (const model of allModels) {
		// Strip "Maker: " prefix from modelgrep names (e.g. "DeepSeek: DeepSeek V4 Pro" → "DeepSeek V4 Pro")
		const strippedName = model.name.includes(': ') ? model.name.split(': ')[1] : model.name;
		// Last segment of modelgrep ID (e.g. "deepseek-v4-pro" from "deepseek/deepseek-v4-pro")
		const idSuffix = model.id.split('/').pop() ?? '';

		const sim = Math.max(
			similarity(goName, model.name.toLowerCase()),
			similarity(goName, strippedName.toLowerCase()),
			similarity(goName, idSuffix.toLowerCase())
		);

		if (sim >= SIMILARITY_THRESHOLD && sim > bestScore) {
			best = model;
			bestScore = sim;
		}
	}

	if (best) {
		console.log(
			`[modelgrep] fuzzy matched "${goId}" → "${best.id}" (score: ${bestScore.toFixed(2)})`
		);
	}
	return best;
}
