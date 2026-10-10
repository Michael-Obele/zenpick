/** Fetches Go pricing data from the official OpenCode docs page. */

import { parse, type HTMLElement as NodeHtmlElement } from 'node-html-parser';
import type {
	ModelPricing,
	GoModelEntry,
	UsageLimits,
	CatalogAudit,
	PlanTier
} from '$lib/types/models';
import { cacheGet, cacheSet, GO_DOCS_PRICING_TTL } from '$lib/cache';
import { goIdToName } from './opencode-go';

const GO_DOCS_URL = 'https://opencode.ai/docs/go/';
const GO_API_BASE = 'https://opencode.ai/zen/go/v1';
const CACHE_KEY = 'go-docs-data';

/**
 * Normalize a display name for matching.
 * Strips hyphens, spaces AND dots, lowercases, removes "v" prefix from version
 * numbers.
 *
 * Dots matter: version separators are not consistent across the two sources.
 * The API writes `claude-haiku-5-5` (hyphen) while the docs write
 * "Claude Haiku 5.5" (dot) — without collapsing both, the docs row fails to
 * match any Go ID and the model is silently dropped from the catalog.
 */
export function normalizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[\s.-]+/g, '')
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
export function matchDisplayName(docsName: string, map: Map<string, string>): string | null {
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
export function parsePrice(s: string): number | null {
	const trimmed = s.trim();
	// The docs page prints "Free" for zero-cost models (e.g. LongCat 2.5 Preview
	// Free). Treat it as $0 so the pricing row is KEPT — otherwise parseFloat
	// returns NaN and the row is dropped, leaving the model stuck at "unknown".
	if (/^free$/i.test(trimmed)) return 0;
	const cleaned = trimmed.replace(/[$,]/g, '');
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
	/** Per-plan request allowances: `go` is the $10 plan, `plus` is Go Plus. */
	usageLimits: Record<PlanTier, Record<string, UsageLimits>>;
	/**
	 * Official model IDs scraped from the docs usage-limits table.
	 * Used as the source of truth to filter out deprecated/unlisted models
	 * that the API still returns but the docs no longer endorse.
	 */
	officialModelIds: Set<string>;
	/** Docs↔API reconciliation — see CatalogAudit. Surfaced on /debug. */
	audit: CatalogAudit;
}

/** Empty audit for the failure paths (docs or API unreachable). */
function emptyAudit(): CatalogAudit {
	return {
		apiCount: 0,
		docsRows: 0,
		matchedRows: 0,
		unmatchedDocsRows: [],
		pricedButUnlisted: [],
		listedButUnpriced: [],
		apiNotListed: []
	};
}

/** Empty GoDocsData for the failure paths (docs or API unreachable). */
export function emptyGoDocsData(): GoDocsData {
	return {
		pricing: {},
		usageLimits: { go: {}, plus: {} },
		officialModelIds: new Set(),
		audit: emptyAudit()
	};
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
export function fetchGoDocsUsageLimits(): Promise<Record<PlanTier, Record<string, UsageLimits>>> {
	return fetchGoDocsData().then((d) => d.usageLimits);
}

/** Parse an integer that may contain thousands separators (e.g. "30,100"). */
export function parseCount(s: string): number | null {
	const cleaned = s.replace(/[,\s]/g, '').trim();
	if (!/^\d+$/.test(cleaned)) return null;
	const n = parseInt(cleaned, 10);
	return Number.isNaN(n) ? null : n;
}

/**
 * Parse one usage-limits row into UsageLimits, or null when the row carries no
 * usable counts. Free preview models publish "Unlimited" instead of numbers —
 * recorded with unlimited=true so the burn engine treats them as zero-burn
 * instead of dropping the row (which produced a misleading "Unknown" badge).
 */
export function parseUsageLimitsRow(cells: string[]): UsageLimits | null {
	if ([cells[1], cells[2], cells[3]].some((c) => /unlimited/i.test(c))) {
		return { requestsPer5h: 0, requestsPerWeek: 0, requestsPerMonth: 0, unlimited: true };
	}
	const per5h = parseCount(cells[1]);
	if (per5h == null) return null;
	return {
		requestsPer5h: per5h,
		requestsPerWeek: parseCount(cells[2]) ?? 0,
		requestsPerMonth: parseCount(cells[3]) ?? 0,
		unlimited: false
	};
}

/** Parse one pricing row into ModelPricing, or null when prices are missing. */
export function parsePricingRow(cells: string[]): ModelPricing | null {
	const inputPrice = parsePrice(cells[1]);
	const outputPrice = parsePrice(cells[2]);
	if (inputPrice == null || outputPrice == null) return null;
	return {
		inputPricePerM: inputPrice,
		outputPricePerM: outputPrice,
		cachedReadPerM: parsePrice(cells[3]),
		source: 'go-docs'
	};
}

/** Build the docs↔API reconciliation report (pure — see CatalogAudit). */
export function buildCatalogAudit(input: {
	apiIds: Set<string>;
	docsRows: number;
	unmatchedDocsRows: { name: string; table: 'pricing' | 'usage' }[];
	matchedGoIds: Set<string>;
	pricingIds: string[];
	usageIds: string[];
	officialModelIds: Set<string>;
}): CatalogAudit {
	const pricingSet = new Set(input.pricingIds);
	return {
		apiCount: input.apiIds.size,
		docsRows: input.docsRows,
		matchedRows: input.docsRows - input.unmatchedDocsRows.length,
		unmatchedDocsRows: input.unmatchedDocsRows,
		pricedButUnlisted: input.pricingIds.filter((id) => !input.officialModelIds.has(id)),
		listedButUnpriced: input.usageIds.filter((id) => !pricingSet.has(id)),
		apiNotListed: [...input.apiIds].filter((id) => !input.matchedGoIds.has(id))
	};
}

/**
 * Emit the reconciliation report. Unmatched docs rows and priced-but-unlisted
 * models mean the catalog SILENTLY LOST models (the Claude Haiku 5.5 failure),
 * so they log at error level — the whole point is that they are impossible to
 * miss. Skipped when the API list is unknown (everything would look unmatched).
 */
function logCatalogAudit(audit: CatalogAudit, apiKnown: boolean): void {
	if (!apiKnown) return;
	if (audit.unmatchedDocsRows.length > 0) {
		console.error(
			`[go-docs] ⚠️ ${audit.unmatchedDocsRows.length} docs row(s) matched NO Go model ID — missing from the catalog: ` +
				audit.unmatchedDocsRows.map((r) => `${r.name} (${r.table})`).join(', ')
		);
	}
	if (audit.pricedButUnlisted.length > 0) {
		console.error(
			`[go-docs] ⚠️ priced in docs but absent from the usage table, so DROPPED from catalog: ${audit.pricedButUnlisted.join(', ')}`
		);
	}
	if (audit.listedButUnpriced.length > 0) {
		console.warn(
			`[go-docs] no scraped price for catalog models: ${audit.listedButUnpriced.join(', ')}`
		);
	}
}
/**
 * Extract text content from a table cell, preferring <strong> text when present.
 *
 * Handles promotional markup like:
 *   <del>6,500</del><br><strong>26,000</strong>
 *
 * Without this, td.text concatenates into "6,50026,000" → 65,002,600.
 * Preferring <strong> gives the intended current value "26,000".
 */
function cellText(td: NodeHtmlElement): string {
	const strong = td.querySelector('strong, b');
	if (strong) return strong.text.trim();
	return td.text.trim();
}
/**
 * Fetch Go docs data (pricing + per-plan usage limits) from the docs page.
 * Parses the two plan tiers with node-html-parser:
 *   - pricing tables (Model | Input | Output | Cached Read | Cached Write | Monthly limit),
 *     one per plan (tagged by the Monthly limit column)
 *   - usage tables (Model | requests/5h | requests/week | requests/month), one per plan
 *     in the SAME order as the pricing tables
 * Returns pricing plus `{ go, plus }` request allowances.
 */
async function refreshGoDocsData(): Promise<GoDocsData> {
	let text: string;
	try {
		const res = await fetch(GO_DOCS_URL);
		if (!res.ok) {
			console.error(`[go-docs] returned ${res.status}: ${res.statusText}`);
			return emptyGoDocsData();
		}
		text = await res.text();
	} catch (e) {
		console.error('[go-docs] fetch failed:', e);
		return emptyGoDocsData();
	}

	const root = parse(text);

	// Build name map once before the row loop — not per row
	const nameMap = await buildNameToIdMap();

	const pricing: Record<string, ModelPricing> = {};
	const usageLimits: Record<PlanTier, Record<string, UsageLimits>> = { go: {}, plus: {} };
	const officialModelIds = new Set<string>();
	// The pricing tables come first (one per plan, tagged by their "Monthly
	// limit" column), then the usage tables in the SAME order — so the Nth usage
	// table belongs to the Nth plan. Index 0 is the $10 Go plan, 1 is Go Plus.
	let usageTableIndex = 0;

	// Reconciliation tracking — names every docs↔API mismatch so a mapping
	// failure can never silently shrink the catalog (see CatalogAudit).
	const matchedGoIds = new Set<string>();
	const unmatchedDocsRows: { name: string; table: 'pricing' | 'usage' }[] = [];
	let docsRows = 0;

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

		const tier: PlanTier = isUsageTable ? (usageTableIndex++ === 0 ? 'go' : 'plus') : 'go';

		const rows = table.querySelectorAll('tbody tr, tr');
		for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
			const row = rows[rowIdx];
			// Skip the first row if it contains headers
			if (rowIdx === 0 && row.querySelectorAll('th').length > 0) continue;

			const cells = row.querySelectorAll('td').map((td) => cellText(td));
			if (cells.length < 4) continue;

			docsRows++;
			const docsName = cells[0];
			const goId = matchDisplayName(docsName, nameMap);
			if (!goId) {
				unmatchedDocsRows.push({ name: docsName, table: isPricingTable ? 'pricing' : 'usage' });
				continue;
			}
			matchedGoIds.add(goId);

			if (isPricingTable) {
				const row = parsePricingRow(cells);
				if (row) pricing[goId] = row;
			} else if (isUsageTable) {
				officialModelIds.add(goId);
				const limits = parseUsageLimitsRow(cells);
				if (limits) usageLimits[tier][goId] = limits;
			}
		}
	}

	const pKeys = Object.keys(pricing);
	// Union of both plans' keys — a model missing from one tier's table is still
	// cataloged (it just won't offer that tier's limits).
	const uKeys = [...new Set([...Object.keys(usageLimits.go), ...Object.keys(usageLimits.plus)])];
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

	const audit = buildCatalogAudit({
		apiIds: new Set(nameMap.values()),
		docsRows,
		unmatchedDocsRows,
		matchedGoIds,
		pricingIds: pKeys,
		usageIds: uKeys,
		officialModelIds
	});
	logCatalogAudit(audit, nameMap.size > 0);

	console.log(
		`[go-docs] official model list: ${officialModelIds.size} models: ${[...officialModelIds].join(', ')}`
	);

	const data: GoDocsData = { pricing, usageLimits, officialModelIds, audit };
	cacheSet(CACHE_KEY, data, GO_DOCS_PRICING_TTL);
	return data;
}
