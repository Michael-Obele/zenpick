/** Fetches Go pricing data from the official OpenCode docs page. */

import { parse } from 'node-html-parser';
import type { ModelPricing, GoModelEntry, UsageLimits } from '$lib/types/models';
import { cacheGet, cacheSet, GO_DOCS_PRICING_TTL } from '$lib/cache';
import { goIdToName } from './opencode-go';

const GO_DOCS_URL = 'https://opencode.ai/docs/go/';
const GO_API_BASE = 'https://opencode.ai/zen/go/v1';
const CACHE_KEY = 'go-docs-data';

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
 * Combined Go docs data: pricing (per 1M tokens) + usage limits
 * (estimated request counts per quota window). Both are scraped from the
 * same docs/go/ page in a single fetch.
 */
export interface GoDocsData {
	pricing: Record<string, ModelPricing>;
	usageLimits: Record<string, UsageLimits>;
	/**
	 * Official model IDs scraped from the docs usage-limits table.
	 * Used as the source of truth to filter out deprecated/unlisted models
	 * that the API still returns but the docs no longer endorse.
	 */
	officialModelIds: Set<string>;
}

/**
 * Fetch combined Go docs data (pricing + usage limits) from the OpenCode
 * docs page (cached). Returns cached data instantly; refreshes in background
 * if stale.
 */
export async function fetchGoDocsData(): Promise<GoDocsData> {
	const cached = cacheGet<GoDocsData>(CACHE_KEY);

	if (cached && !cached.stale) {
		return cached.data;
	}

	if (cached && cached.stale) {
		refreshGoDocsData().catch((e) => {
			console.error('[go-docs] background refresh failed:', e);
		});
		return cached.data;
	}

	return await refreshGoDocsData();
}

/** Backward-compatible accessor: just the pricing map. */
export function fetchGoDocsPricing(): Promise<Record<string, ModelPricing>> {
	return fetchGoDocsData().then((d) => d.pricing);
}

/** Estimated request counts per Go quota window, keyed by Go model ID. */
export function fetchGoDocsUsageLimits(): Promise<Record<string, UsageLimits>> {
	return fetchGoDocsData().then((d) => d.usageLimits);
}

/** Parse an integer that may contain thousands separators (e.g. "30,100"). */
function parseCount(s: string): number | null {
	const cleaned = s.replace(/[,\s]/g, '').trim();
	if (!/^\d+$/.test(cleaned)) return null;
	const n = parseInt(cleaned, 10);
	return Number.isNaN(n) ? null : n;
}

/**
 * Fetch Go docs data (pricing + usage limits) from the OpenCode docs page.
 * Parses two tables with node-html-parser:
 *   - the usage-limits table (Model | requests/5h | requests/week | requests/month)
 *   - the pricing table (Model | Input | Output | Cached Read | Cached Write | Usage)
 * Returns a map of Go model ID → { pricing, usageLimits }.
 */
async function refreshGoDocsData(): Promise<GoDocsData> {
	let text: string;
	try {
		const res = await fetch(GO_DOCS_URL);
		if (!res.ok) {
			console.error(`[go-docs] returned ${res.status}: ${res.statusText}`);
			return { pricing: {}, usageLimits: {}, officialModelIds: new Set() };
		}
		text = await res.text();
	} catch (e) {
		console.error('[go-docs] fetch failed:', e);
		return { pricing: {}, usageLimits: {}, officialModelIds: new Set() };
	}

	const root = parse(text);

	// Build name map once before the row loop — not per row
	const nameMap = await buildNameToIdMap();

	const pricing: Record<string, ModelPricing> = {};
	const usageLimits: Record<string, UsageLimits> = {};
	const officialModelIds = new Set<string>();

	for (const table of root.querySelectorAll('table')) {
		const headers = table
			.querySelectorAll('thead th, tr:first-child td, tr:first-child th')
			.map((th) => th.text.trim().toLowerCase());

		const hasModel = headers.includes('model');

		// Usage-limits table: "Model", "requests per 5 hour", "requests per week", "requests per month"
		const isUsageTable =
			hasModel &&
			headers.some((h) => h.includes('requests per')) &&
			headers.some((h) => h.includes('5 hour') || h.includes('week'));

		// Pricing table: "Model", "Input", "Output", "Cached Read", "Cached Write", "Usage"
		const isPricingTable =
			hasModel &&
			headers.includes('input') &&
			headers.includes('output') &&
			headers.some((h) => h.includes('cached read'));

		if (!isUsageTable && !isPricingTable) continue;

		const rows = table.querySelectorAll('tbody tr, tr');
		for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
			const row = rows[rowIdx];
			// Skip the first row if it contains headers
			if (rowIdx === 0 && row.querySelectorAll('th').length > 0) continue;

			const cells = row.querySelectorAll('td').map((td) => td.text.trim());
			if (cells.length < 4) continue;

			const docsName = cells[0];
			const goId = matchDisplayName(docsName, nameMap);
			if (!goId) continue;

			if (isPricingTable) {
				const inputPrice = parsePrice(cells[1]);
				const outputPrice = parsePrice(cells[2]);
				const cachedRead = parsePrice(cells[3]);
				if (inputPrice != null && outputPrice != null) {
					pricing[goId] = {
						inputPricePerM: inputPrice,
						outputPricePerM: outputPrice,
						cachedReadPerM: cachedRead,
						source: 'go-docs'
					};
				}
			} else if (isUsageTable) {
				officialModelIds.add(goId);
				const per5h = parseCount(cells[1]);
				const perWeek = parseCount(cells[2]);
				const perMonth = parseCount(cells[3]);
				if (per5h != null) {
					usageLimits[goId] = {
						requestsPer5h: per5h,
						requestsPerWeek: perWeek ?? 0,
						requestsPerMonth: perMonth ?? 0
					};
				}
			}
		}
	}

	const pKeys = Object.keys(pricing);
	const uKeys = Object.keys(usageLimits);
	if (pKeys.length > 0) {
		console.log(`[go-docs] scraped pricing for ${pKeys.length} models: ${pKeys.join(', ')}`);
	} else {
		console.warn('[go-docs] no pricing rows parsed — page format may have changed');
	}
	if (uKeys.length > 0) {
		console.log(`[go-docs] scraped usage limits for ${uKeys.length} models: ${uKeys.join(', ')}`);
	} else {
		console.warn('[go-docs] no usage-limit rows parsed — page format may have changed');
	}

	console.log(
		`[go-docs] official model list: ${officialModelIds.size} models: ${[...officialModelIds].join(', ')}`
	);

	cacheSet(CACHE_KEY, { pricing, usageLimits, officialModelIds }, GO_DOCS_PRICING_TTL);
	return { pricing, usageLimits, officialModelIds };
}
