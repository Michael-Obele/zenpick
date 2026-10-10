import type { CatalogAudit, FrontierSnapshot, GoModel, ModelQuota } from '$lib/types/models';
import { benchmarkSourceNote, benchmarkToPercent } from '$lib/compare-defaults';
import type { DebugFormat, DebugSection } from './sections';

/**
 * LLM-consumable renderings of the debug data
 * -------------------------------------------
 * Every debug tab has a Markdown and a JSON projection produced here, from the
 * SAME enriched `GoModel` array the interactive components render. This is the
 * "clean text" surface for agents: `/debug/export?section=benchmarks&format=md`
 * returns a pipe table, `...&format=json` a compact object — no Tailwind HTML
 * to scrape. The functions are pure and isomorphic, so the page can also
 * server-render them (correct without JavaScript) while `/debug/export` serves
 * them directly.
 */

export interface DebugDataset {
	models: GoModel[];
	frontierSnapshot: FrontierSnapshot;
	catalogAudit: CatalogAudit;
}

const DASH = '—';

/** Content type for a machine format (used by the export endpoint). */
export function contentTypeFor(format: DebugFormat): string {
	if (format === 'json') return 'application/json; charset=utf-8';
	if (format === 'md') return 'text/markdown; charset=utf-8';
	return 'text/plain; charset=utf-8';
}

/** A nullable number, fixed to `digits`, or an em-style dash. */
function n(value: number | null | undefined, digits = 1): string {
	return value == null ? DASH : value.toFixed(digits);
}

function usd(value: number | null | undefined): string {
	return value == null ? DASH : `$${value}`;
}

/** One request-count cell for a quota window ("Unlimited" for free previews). */
function quotaCell(
	quota: ModelQuota | null | undefined,
	key: 'requestsPer5h' | 'requestsPerWeek' | 'requestsPerMonth'
): string {
	if (!quota) return DASH;
	if (quota.unlimited) return 'Unlimited';
	return quota[key].toLocaleString();
}

/** A GitHub-flavored Markdown pipe table. */
function mdTable(headers: string[], rows: (string | number)[][]): string {
	if (rows.length === 0) return '_No rows._';
	return [
		`| ${headers.join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows.map((r) => `| ${r.map((c) => String(c)).join(' | ')} |`)
	].join('\n');
}

/** Source of a benchmark value: its fallback field label, or "primary". */
function sourceOf(meta: { source: unknown; field?: string } | undefined, fallback = DASH): string {
	if (!meta) return fallback;
	return benchmarkSourceNote(meta as never) ?? 'primary';
}

/** A bulleted list, or `_None._` when empty. */
function bullets(items: string[]): string {
	return items.length ? items.map((i) => `- ${i}`).join('\n') : '_None._';
}

// ─── Markdown projections ──────────────────────────────────────────────

const MARKDOWN: Record<DebugSection, (d: DebugDataset) => string> = {
	overview: (d) =>
		`## Models Overview\n\n${mdTable(
			[
				'Model',
				'Provider',
				'Price src',
				'Burn',
				'Score',
				'Coding',
				'Brain',
				'Agent',
				'Budget',
				'Front'
			],
			d.models.map((m) => [
				m.name,
				m.provider,
				m.pricing.source,
				m.burnDetails.band ?? DASH,
				m.burnDetails.score,
				m.scenarioScores.coding,
				m.scenarioScores.brainstorming,
				m.scenarioScores.agentic,
				m.scenarioScores.budget,
				m.scenarioScores.frontend
			])
		)}`,

	pricing: (d) =>
		`## Pricing Matrix\n\n${mdTable(
			['Model', 'Input /1M', 'Output /1M', 'Cached /1M', 'Source'],
			d.models.map((m) => [
				m.name,
				usd(m.pricing.inputPricePerM),
				usd(m.pricing.outputPricePerM),
				usd(m.pricing.cachedReadPerM),
				m.pricing.source
			])
		)}`,

	quota: (d) =>
		`## Quota Matrix\n\n${mdTable(
			['Model', 'Go 5h', 'Go wk', 'Go mo', 'Plus 5h', 'Plus wk', 'Plus mo'],
			d.models.map((m) => [
				m.name,
				quotaCell(m.quota, 'requestsPer5h'),
				quotaCell(m.quota, 'requestsPerWeek'),
				quotaCell(m.quota, 'requestsPerMonth'),
				quotaCell(m.plus?.quota, 'requestsPer5h'),
				quotaCell(m.plus?.quota, 'requestsPerWeek'),
				quotaCell(m.plus?.quota, 'requestsPerMonth')
			])
		)}`,

	burn: (d) =>
		`## Burn Details\n\n${mdTable(
			['Model', 'Band', 'Score', 'Req/$12', 'Plus band', 'Plus score'],
			d.models.map((m) => [
				m.name,
				m.burnDetails.band ?? DASH,
				m.burnDetails.score,
				m.burnDetails.requestsPer12 ?? DASH,
				m.plus?.burnDetails.band ?? DASH,
				m.plus?.burnDetails.score ?? DASH
			])
		)}`,

	benchmarks: (d) =>
		`## Benchmark Scores\n\n${mdTable(
			['Model', 'Coding', 'Reasoning', 'Math', 'SciCode', 'Coding src', 'Math src'],
			d.models.map((m) => [
				m.name,
				n(m.benchmarks.coding),
				n(m.benchmarks.reasoning),
				n(m.benchmarks.math),
				n(benchmarkToPercent(m.benchmarks.sweBenchVerified, 'sweBenchVerified')),
				sourceOf(m.benchmarks._meta?.coding, DASH),
				sourceOf(m.benchmarks._meta?.math, DASH)
			])
		)}`,

	matching: (d) => {
		const a = d.catalogAudit;
		return [
			'## Matching & Coverage',
			'',
			'### Catalog coverage',
			`- API models: ${a.apiCount}`,
			`- Docs rows: ${a.docsRows}`,
			`- Matched rows: ${a.matchedRows}`,
			'',
			`### Unmatched docs rows (${a.unmatchedDocsRows.length})`,
			bullets(a.unmatchedDocsRows.map((r) => `${r.name} · ${r.table}`)),
			'',
			`### Priced but not in the usage table (${a.pricedButUnlisted.length})`,
			bullets(a.pricedButUnlisted),
			'',
			`### In the catalog but unpriced (${a.listedButUnpriced.length})`,
			bullets(a.listedButUnpriced),
			'',
			`### In the API but not on the docs page (${a.apiNotListed.length})`,
			bullets(a.apiNotListed),
			'',
			'### Source matching',
			mdTable(
				['Go ID', 'modelgrep', 'llm-stats', 'Coding src', 'Reasoning src', 'Math src'],
				d.models.map((m) => [
					m.id,
					m.modelgrepId ?? DASH,
					m.llmStatsId ?? DASH,
					sourceOf(m.benchmarks._meta?.coding, DASH),
					sourceOf(m.benchmarks._meta?.reasoning, DASH),
					sourceOf(m.benchmarks._meta?.math, DASH)
				])
			)
		].join('\n');
	},

	migration: (d) =>
		`## Migration Report\n\n${mdTable(
			['Go Model', 'Open', 'Coding', 'Reasoning', 'Math', 'Replaces'],
			d.models.map((m) => [
				m.name,
				m.openWeight ? 'yes' : 'no',
				n(m.benchmarks.coding),
				n(m.benchmarks.reasoning),
				n(m.benchmarks.math),
				m.migrationHints.map((h) => `${h.model} (${h.reason})`).join('; ') || DASH
			])
		)}`,

	compare: (d) => {
		const cutoff = new Date(d.frontierSnapshot.cutoff).toISOString().slice(0, 10);
		return [
			'## Compare Logic',
			'',
			`- Recency cutoff: ${cutoff} (frontier models released before this are excluded)`,
			`- Frontier candidates: ${d.frontierSnapshot.frontier.length}`,
			'',
			'### Go model blended scores',
			mdTable(
				['Model', 'Coding', 'Reasoning', 'Math', 'Replaces'],
				d.models.map((m) => [
					m.name,
					n(m.benchmarks.coding),
					n(m.benchmarks.reasoning),
					n(m.benchmarks.math),
					m.migrationHints.map((h) => h.model).join('; ') || DASH
				])
			),
			'',
			'### Frontier candidates',
			mdTable(
				['Model', 'Org', 'Released', 'Coding', 'Reasoning', 'Math'],
				d.frontierSnapshot.frontier.map((f) => [
					f.name,
					f.organization?.name ?? DASH,
					f.releaseDate ?? DASH,
					n(f.benchmarks.coding),
					n(f.benchmarks.reasoning),
					n(f.benchmarks.math)
				])
			)
		].join('\n');
	},

	tags: (d) =>
		`## Tag Report\n\n${mdTable(
			['Model', 'Tags', 'Benchmarks'],
			d.models.map((m) => [
				m.name,
				m.tags.map((t) => `${t.label} (${t.source})`).join(', ') || DASH,
				`coding=${n(m.benchmarks.coding)} reasoning=${n(m.benchmarks.reasoning)} math=${n(
					m.benchmarks.math
				)} swe=${n(benchmarkToPercent(m.benchmarks.sweBenchVerified, 'sweBenchVerified'))} ctx=${
					m.contextWindow ?? DASH
				}`
			])
		)}`,

	scenarios: (d) =>
		`## Scenario Score Breakdown\n\n${mdTable(
			['Model', 'Coding', 'Brainstorm', 'Agentic', 'Budget', 'Frontend'],
			d.models.map((m) => [
				m.name,
				m.scenarioScores.coding,
				m.scenarioScores.brainstorming,
				m.scenarioScores.agentic,
				m.scenarioScores.budget,
				m.scenarioScores.frontend
			])
		)}`,

	raw: (d) => `## Raw GoModel JSON\n\n\`\`\`json\n${JSON.stringify(d.models, null, 2)}\n\`\`\``
};

// ─── JSON projections ──────────────────────────────────────────────────

const JSON_PAYLOAD: Record<DebugSection, (d: DebugDataset) => unknown> = {
	overview: (d) =>
		d.models.map((m) => ({
			id: m.id,
			name: m.name,
			provider: m.provider,
			openWeight: m.openWeight,
			pricingSource: m.pricing.source,
			burn: {
				band: m.burnDetails.band,
				score: m.burnDetails.score,
				requestsPer12: m.burnDetails.requestsPer12
			},
			scenarioScores: m.scenarioScores
		})),
	pricing: (d) => d.models.map((m) => ({ id: m.id, name: m.name, pricing: m.pricing })),
	quota: (d) =>
		d.models.map((m) => ({ id: m.id, name: m.name, quota: m.quota, plus: m.plus?.quota ?? null })),
	burn: (d) =>
		d.models.map((m) => ({
			id: m.id,
			name: m.name,
			burn: m.burnDetails,
			plus: m.plus?.burnDetails ?? null
		})),
	benchmarks: (d) => d.models.map((m) => ({ id: m.id, name: m.name, benchmarks: m.benchmarks })),
	matching: (d) => ({
		audit: d.catalogAudit,
		models: d.models.map((m) => ({
			id: m.id,
			name: m.name,
			modelgrepId: m.modelgrepId,
			llmStatsId: m.llmStatsId,
			benchmarkSources: {
				coding: m.benchmarks._meta?.coding ?? null,
				reasoning: m.benchmarks._meta?.reasoning ?? null,
				math: m.benchmarks._meta?.math ?? null
			}
		}))
	}),
	migration: (d) =>
		d.models.map((m) => ({
			id: m.id,
			name: m.name,
			openWeight: m.openWeight,
			benchmarks: m.benchmarks,
			migrationHints: m.migrationHints
		})),
	compare: (d) => ({
		cutoff: d.frontierSnapshot.cutoff,
		models: d.models.map((m) => ({
			id: m.id,
			name: m.name,
			benchmarks: m.benchmarks,
			migrationHints: m.migrationHints
		})),
		frontier: d.frontierSnapshot.frontier
	}),
	tags: (d) => d.models.map((m) => ({ id: m.id, name: m.name, tags: m.tags })),
	scenarios: (d) =>
		d.models.map((m) => ({ id: m.id, name: m.name, scenarioScores: m.scenarioScores })),
	raw: (d) => d.models
};

/** The JSON-serializable projection of a section's data. */
export function sectionJson(section: DebugSection, data: DebugDataset): unknown {
	return JSON_PAYLOAD[section](data);
}

/** The Markdown projection of a section's data. */
export function sectionMarkdown(section: DebugSection, data: DebugDataset): string {
	return `${MARKDOWN[section](data)}\n`;
}

/** Render a section as the requested machine format. */
export function exportSection(
	section: DebugSection,
	format: DebugFormat,
	data: DebugDataset
): string {
	if (format === 'json') return `${JSON.stringify(sectionJson(section, data), null, 2)}\n`;
	return sectionMarkdown(section, data);
}
