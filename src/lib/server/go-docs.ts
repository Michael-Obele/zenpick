/** Fetches Go pricing data from the official OpenCode docs page. */

import { parse } from 'node-html-parser';
import type { ModelPricing, GoModelEntry } from '$lib/types/models';
import { cacheGet, cacheSet, GO_DOCS_PRICING_TTL } from '$lib/cache';
import { goIdToName } from './opencode-go';

const GO_DOCS_URL = 'https://opencode.ai/docs/go/';
const GO_API_BASE = 'https://opencode.ai/zen/go/v1';
const CACHE_KEY = 'go-docs-pricing';

/**
 * Normalize a display name for matching.
 * Strips hyphens, spaces, lowercases, removes "v" prefix from version numbers.
 */
function normalizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[\s-]+/g, '')
		.replace(/^v(\d)/, '$1');
}

/**
 * Fetch current Go model IDs from the API and build a dynamic
 * display-name → model-ID map. No hardcoded model list.
 */
async function buildNameToIdMap(): Promise<Map<string, string>> {
	let goModels: GoModelEntry[];
	try {
		const res = await fetch(`${GO_API_BASE}/models`);
		if (!res.ok) {
			console.error(`[go-docs] Go API returned ${res.status}: ${res.statusText}`);
			return new Map();
		}
		const json = await res.json();
		goModels = json.data as GoModelEntry[];
	} catch (e) {
		console.error('[go-docs] failed to fetch Go models:', e);
		return new Map();
	}

	const map = new Map<string, string>();
	for (const model of goModels) {
		const name = goIdToName(model.id);
		map.set(normalizeName(name), model.id);
		map.set(normalizeName(model.id), model.id);
	}
	return map;
}

/**
 * Try to match a docs-page display name (e.g. "MiMo V2.5", "Qwen3.7 Plus")
 * to a Go model ID using the provided name map.
 */
function matchDisplayName(docsName: string, map: Map<string, string>): string | null {
	const normalized = normalizeName(docsName);
	const exact = map.get(normalized);
	if (exact) return exact;

	// For parenthetical variants like "Qwen3.7 Plus (≤ 256K tokens)", strip the parens and retry
	const parenIdx = docsName.indexOf('(');
	if (parenIdx > 0) {
		const baseName = docsName.substring(0, parenIdx).trim();
		const baseNormalized = normalizeName(baseName);
		const baseMatch = map.get(baseNormalized);
		if (baseMatch) return baseMatch;
	}

	// Try substring: check if any known name is contained in or contains the docs name
	for (const [normKey, goId] of map) {
		if (normKey.includes(normalized) || normalized.includes(normKey)) {
			return goId;
		}
	}

	return null;
}

/** Parse a dollar amount string like "$1.40" or "$0.0028" to a number. */
function parsePrice(s: string): number | null {
	const cleaned = s.replace(/[$,]/g, '').trim();
	const n = parseFloat(cleaned);
	return isNaN(n) ? null : n;
}

/**
 * Fetch Go pricing from the OpenCode docs page (cached).
 * Returns cached data instantly; refreshes in background if stale.
 */
export async function fetchGoDocsPricing(): Promise<Record<string, ModelPricing>> {
	const cached = cacheGet<Record<string, ModelPricing>>(CACHE_KEY);

	if (cached && !cached.stale) {
		return cached.data;
	}

	if (cached && cached.stale) {
		refreshGoDocsPricing().catch((e) => {
			console.error('[go-docs] background refresh failed:', e);
		});
		return cached.data;
	}

	return await refreshGoDocsPricing();
}

/**
 * Fetch Go pricing from the OpenCode docs page.
 * Parses HTML tables using node-html-parser.
 * Returns a map of Go model ID → pricing.
 */
async function refreshGoDocsPricing(): Promise<Record<string, ModelPricing>> {
	let text: string;
	try {
		const res = await fetch(GO_DOCS_URL);
		if (!res.ok) {
			console.error(`[go-docs] returned ${res.status}: ${res.statusText}`);
			return {};
		}
		text = await res.text();
	} catch (e) {
		console.error('[go-docs] fetch failed:', e);
		return {};
	}

	const root = parse(text);

	// Build name map once before the row loop — not per row
	const nameMap = await buildNameToIdMap();

	const result: Record<string, ModelPricing> = {};

	// Find the pricing table by looking for a table whose headers include
	// "Model", "Input", "Output", and "Cached Read"
	for (const table of root.querySelectorAll('table')) {
		const headers = table
			.querySelectorAll('thead th, tr:first-child td, tr:first-child th')
			.map((th) => th.text.trim().toLowerCase());

		const hasModel = headers.includes('model');
		const hasInput = headers.includes('input');
		const hasOutput = headers.includes('output');
		const hasCachedRead = headers.some((h) => h.includes('cached read'));

		if (!hasModel || !hasInput || !hasOutput || !hasCachedRead) {
			continue;
		}

		// Parse data rows (skip header row)
		const rows = table.querySelectorAll('tbody tr, tr');
		for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
			const row = rows[rowIdx];
			// Skip the first row if it contains headers
			if (rowIdx === 0 && row.querySelectorAll('th').length > 0) continue;

			const cells = row.querySelectorAll('td').map((td) => td.text.trim());
			if (cells.length < 4) continue;

			const docsName = cells[0];
			const inputPrice = parsePrice(cells[1]);
			const outputPrice = parsePrice(cells[2]);
			const cachedRead = parsePrice(cells[3]);

			const goId = matchDisplayName(docsName, nameMap);
			if (goId && inputPrice != null && outputPrice != null) {
				result[goId] = {
					inputPricePerM: inputPrice,
					outputPricePerM: outputPrice,
					cachedReadPerM: cachedRead,
					source: 'go-docs'
				};
			}
		}
	}

	const keys = Object.keys(result);
	if (keys.length > 0) {
		console.log(`[go-docs] scraped pricing for ${keys.length} models: ${keys.join(', ')}`);
	} else {
		console.warn('[go-docs] no pricing rows parsed — page format may have changed');
	}

	cacheSet(CACHE_KEY, result, GO_DOCS_PRICING_TTL);
	return result;
}
