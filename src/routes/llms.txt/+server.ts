import { loadModels } from '$lib/server/models';
import { burnBandLabel, burnLabel, isFreePricing } from '$lib/burn';
import { NEEDS, findNeed, needAnswer, rankNeed } from '$lib/needs';
import { DEBUG_SECTION_IDS } from '$lib/debug/sections';
import { matchesModelSearch } from '$lib/model-search';
import { tableSearchSchema } from '$lib/table-search';
import { llmStatsModelUrl } from '$lib/utils/llm-stats-url';
import { validateSearchParams } from 'runed/kit';
import type { GoModel } from '$lib/types/models';
import type { NeedSpec } from '$lib/needs';
import type { TableSearchParams } from '$lib/table-search';
import type { RequestHandler } from './$types';

/**
 * Dynamically generated `/llms.txt` (the llmstxt.org convention).
 *
 * The model catalog is fetched server-side and rendered to markdown on every
 * request, so LLM crawlers that cannot execute the client-side app still see
 * the live data. This is deliberately a `+server.ts` route (the same pattern
 * used for `/sitemap.xml`) rather than a static file in `static/`, because the
 * content depends on the in-memory model cache.
 */

// Served dynamically (route default) — output depends on request origin and live data.

export const GET: RequestHandler = async ({ url }) => {
	const models = await loadModels();
	// The same `?need=` / `?q=` the interactive table reads, so a crawler can ask
	// for a ranked or filtered view instead of receiving the catalog and sorting it.
	const { data } = validateSearchParams(url, tableSearchSchema);
	const body = render(models, url.origin, data);

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			// The underlying model cache lives 6h; keep CDN staleness well under that.
			'cache-control': 'public, max-age=600'
		}
	});
};

/**
 * The "read me first" block: an agent that fetches this file cold needs to know
 * what is inside, how to answer from it, and where to go when the table is not
 * enough. It sits above the catalog so it survives a truncating fetch.
 */
function usageLines(origin: string): string[] {
	return [
		'## How to use this file',
		'',
		'This one file answers "which OpenCode Go model should I use". It is regenerated on every request from the same cache the site reads (at most ~6 hours stale), so a single fetch is current. No browser and no API key required.',
		'',
		"**1. Read the answers before the data.** `Quick answers` below is this site's own ranking per leaderboard: `coding`, `design`, `smartest`, `reasoning`, `vision`, `open-source`, `long-context`, and `cheapest`. Use those lines instead of recomputing: tied leaders, fit weighting, and models that have no data for a metric are already handled.",
		'',
		'**2. Search by filtering what you already fetched.** The catalog is small enough to hold in context: grep or sort the table by the column the question is about. `Input $/M` for cost, `Context` for window size, `Coding` or `Agentic` for capability, `Burn` for quota drain, `Replaces` for which closed model it substitutes. On the site, `?q=` searches model name, provider, tags, and capability words. Both parameters work on this file too (`?need=cheapest`, `?q=vision`), which sorts or filters the table before you read it.',
		'',
		'**3. Quote the `ID`, not the name.** IDs like `deepseek-v4.1-flash` are the stable keys used by the site, its compare URLs, and this file; names are display text and change.',
		'',
		`**4. Know what is not in the table.** Input/output modalities (image, video, audio, file), tool calling, structured output, and reasoning flags are not columns here. For those, open the model's LLM Stats link in the \`Source\` column, or fetch the \`raw\` slice (see **Query URLs**), which returns the full model objects including \`capabilities\`.`,
		'',
		'**5. When this file is not enough:**',
		'',
		`- **Methodology** (how scores, burn bands, and replacement hints are computed): \`${origin}/about\`.`,
		'- **The upstream docs**, whose numbers this file summarizes: [OpenCode Go docs](https://opencode.ai/v2/docs/console/go) is the source of truth for the official model list, prices, and usage limits, so it wins on anything contractual; [modelgrep](https://modelgrep.com) holds OpenRouter pricing plus the Artificial Analysis and Design Arena benchmarks; [LLM Stats](https://llm-stats.com) holds per-model metadata, releases, and capabilities.',
		`- **The site itself**: the homepage renders in the browser, so fetching its HTML returns a shell rather than the catalog. A client that runs JavaScript can open a leaderboard or comparison URL directly; **Query URLs** below lists them.`,
		'',
		`**6. Cite the freshness.** When quoting a number, link \`${origin}/llms.txt\` and mention the \`Data as of\` timestamp above, so a reader can judge how current the answer is.`,
		''
	];
}

function render(models: GoModel[], origin: string, params: TableSearchParams): string {
	const view = modelView(models, params);
	const lines: string[] = [
		'# ZenPick',
		'',
		'> ZenPick compares every OpenCode Go model side-by-side with live benchmarks, pricing, quota-burn estimates, and algorithmic task-fit scores — so developers pick the right model for the job before spending their subscription quota.',
		'',
		'ZenPick is a free, read-only comparison tool for the [OpenCode Go](https://opencode.ai/go) model catalog (the $10/month tier). It aggregates public data from modelgrep, LLM Stats, and the OpenCode Go docs, then ranks each model per task. The catalog is interactive on the site (JavaScript-rendered); the table below is the same catalog in plain markdown.',
		'',
		`- Models: ${view.count}${view.count === models.length ? '' : ` of ${models.length}`}`,
		`- View: ${view.label}`,
		`- Data as of: ${newestFetch(models)}`,
		`- Generated: ${new Date().toISOString()}`,
		'',
		...usageLines(origin),
		'',
		'## Quick answers',
		'',
		'One line per leaderboard:',
		'',
		// The site's own verdict per leaderboard, from the same ranking the
		// interactive table runs, so a reader does not have to recompute the scores
		// (or guess at tie-breaking and data gaps) from the table below.
		...NEEDS.map((need) => `- ${needAnswer(need, rankNeed(need, models))}`),
		...view.section
	];

	lines.push(
		'',
		'- **Context** — maximum input context window in tokens.',
		'- **Output cap** — maximum output tokens (`—`: not published).',
		'- **Reasoning efforts** — reasoning-effort levels the model accepts (e.g. `low, high`); `—` if no effort control is published.',
		'- **Knowledge cutoff** — training-data cutoff date (`—`: not published).',
		'- **Status** — `active`, or `deprecated` when the upstream catalog marks the model deprecated. `—` means models.dev published no status for the model (or its catalog was unavailable), so the lifecycle is unknown rather than confirmed active. Advisory: a deprecated model may still be served.',
		'- **Burn** — how fast a model consumes the Go quota (`Excellent` is quota-friendly, `Extreme` burns fastest).',
		'- **Req/mo** — estimated requests per month at the $60 Go tier.',
		'- **Coding / Agentic** — task-fit score, 0–100 (algorithmic, not a benchmark).',
		'- **Replaces** — closed-source frontier models this Go model substitutes.',
		'- **Source** — LLM Stats page for the model.',
		''
	);

	lines.push(
		'',
		'## Query URLs',
		'',
		'The interactive table keeps its search and leaderboard in the URL, so every answer above has a link:',
		'',
		`- Leaderboard: \`${origin}/?need=<slug>\`, where \`<slug>\` is one of ${NEEDS.map((n) => `\`${n.slug}\``).join(', ')}.`,
		`- Search: \`${origin}/?q=<text>\` across model name, provider, tags, and capabilities.`,
		`- Both at once: \`${origin}/?need=cheapest&q=vision\`.`,
		`- The same view as data: \`${origin}/llms.txt?need=<slug>\` or \`${origin}/llms.txt?q=<text>\` returns this file with the model table ranked or filtered, using the site's own algorithm.`,
		`- Side by side: \`${origin}/compare?models=<id>,<id>\` (up to four model IDs).`,
		`- Data, not prose: \`${origin}/debug/export?section=<id>&format=json\` (or \`format=md\`) returns one slice of the catalog with the right content type. Sections: ${DEBUG_SECTION_IDS.map((id) => `\`${id}\``).join(', ')}.`,
		'',
		'Those URLs render in the browser, so a crawler that cannot run JavaScript sees only the page shell; the markdown in this file is the machine-readable form of the same data.',
		''
	);

	lines.push(
		'',
		'## Key pages',
		'',
		`- [Model comparison](${origin}/): sortable table, scenario filters, and quota calculator`,
		`- [Side-by-side comparison](${origin}/compare): compare up to four models on pricing, benchmarks, and fit`,
		`- [Methodology & about](${origin}/about): how scores, burn bands, and migration hints are computed`,
		'',
		'## Data sources',
		'',
		'- [modelgrep](https://modelgrep.com): OpenRouter pricing plus Artificial Analysis and Design Arena benchmarks',
		'- [LLM Stats](https://llm-stats.com): model benchmarks and release metadata',
		'- [OpenCode Go docs](https://opencode.ai/v2/docs/console/go): official model list, pricing, and usage limits',
		'- [models.dev](https://models.dev): first-party OpenCode catalog metadata (display names, output caps, reasoning efforts, knowledge cutoff) and the Go model lifecycle history. Advisory only: it never changes which models are listed.',
		'',
		'## Notes',
		'',
		`- This file is generated on request at \`${origin}/llms.txt\` from ZenPick's server-side model cache.`,
		'- Catalog data refreshes automatically (stale-while-revalidate, ~6h TTL).',
		'- `?need=` and `?q=` change the model table in this file, so caches should key on the full URL.',
		'- Machine operators can force a fresh upstream fetch via `POST /api/revalidate` (see repository README).',
		''
	);

	return lines.join('\n');
}

/** One model's place in a rendered table: rank and metric value only when ranked. */
type TableRow = { model: GoModel; rank: number | null; value: number | null };

/** The `## Models` section, plus what the file header needs to describe it. */
type ModelView = { section: string[]; label: string; count: number };

/**
 * The requested view of the catalog. `?need=` ranks with the site's own algorithm
 * and `?q=` filters with the site's own search (both shared with the browser), so
 * a crawler can ask for the view it wants instead of sorting the catalog itself.
 */
function modelView(models: GoModel[], params: TableSearchParams): ModelView {
	const needSpec = findNeed(params.need);
	const query = params.q.trim();
	const shown = query ? models.filter((m) => matchesModelSearch(m, query)) : models;
	const rows = needSpec
		? rankNeed(needSpec, shown).map((entry) => ({
				model: entry.model,
				rank: entry.rank,
				value: entry.value
			}))
		: shown.map((model) => ({ model, rank: null, value: null }));

	const columns = tableColumns(needSpec);
	const section = [
		'',
		'## Models',
		'',
		`| ${columns.join(' | ')} |`,
		`| ${columns.map(() => '---').join(' | ')} |`,
		...rows.map((row) => tableRow(row, needSpec)),
		''
	];

	return { section, label: viewLabel(needSpec, query), count: rows.length };
}

/** Column headers: a ranked view carries the need's own metric next to the name. */
function tableColumns(needSpec: NeedSpec | null): string[] {
	const tail = [
		'ID',
		'Provider',
		'Context',
		'Output cap',
		'Reasoning efforts',
		'Knowledge cutoff',
		'Status',
		'Input $/M',
		'Output $/M',
		'Burn',
		'Req/mo',
		'Coding',
		'Agentic',
		'Replaces',
		'Source'
	];
	return needSpec ? ['Rank', 'Model', cell(needSpec.metricLabel), ...tail] : ['Model', ...tail];
}

/** One markdown row. Column order and count must match `tableColumns`. */
function tableRow(row: TableRow, needSpec: NeedSpec | null): string {
	const m = row.model;
	const free = isFreePricing(m.pricing);
	const head = needSpec
		? [
				row.rank == null ? '—' : String(row.rank),
				cell(m.name),
				row.value == null ? '—' : needSpec.format(row.value)
			]
		: [cell(m.name)];

	return [
		...head,
		cell(m.id),
		cell(m.provider),
		formatContext(m.contextWindow),
		formatContext(m.maxOutputTokens),
		cell(m.reasoningEfforts?.length ? m.reasoningEfforts.join(', ') : '—'),
		cell(m.knowledgeCutoff ?? '—'),
		// `null` is UNKNOWN (models.dev has no entry, or its catalog was unavailable),
		// never "active" — this file is consumed by crawlers, so a false lifecycle
		// claim is a factual error. Same em-dash convention as the columns above,
		// routed through `cell()` like every other text column.
		cell(m.modelsDevStatus ?? '—'),
		free ? 'Free' : formatPrice(m.pricing.inputPricePerM),
		free ? 'Free' : formatPrice(m.pricing.outputPricePerM),
		cell(burnLabelFor(m)),
		m.quota.unlimited ? 'Unlimited' : formatCount(m.quota.requestsPerMonth),
		formatScore(m.scenarioScores.coding),
		formatScore(m.scenarioScores.agentic),
		cell(formatReplaces(m)),
		`[llm-stats](${llmStatsModelUrl(m)})`
	].join(' | ');
}

/** One line for the file header: which view this response is. */
function viewLabel(needSpec: NeedSpec | null, query: string): string {
	const parts = [
		needSpec ? `ranked for ${needSpec.cardTitle}, best first` : null,
		query ? `filtered by "${query}"` : null
	];
	return parts.filter(Boolean).join('; ') || 'full catalog';
}

/** Escape a markdown table cell. */
function cell(value: string): string {
	return value.replaceAll('|', '\\|').replaceAll('\n', ' ').trim();
}

function burnLabelFor(m: GoModel): string {
	return m.burnDetails.band ? burnBandLabel(m.burnDetails.band) : burnLabel(m.burnRate);
}

function formatContext(tokens: number | null): string {
	if (tokens == null) return '—';
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
	}
	if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
	return String(tokens);
}

function formatPrice(price: number | null): string {
	return price == null ? '—' : `$${price.toFixed(2)}`;
}

function formatScore(score: number | null): string {
	return score == null ? '—' : String(Math.round(score));
}

function formatCount(count: number | null): string {
	return count == null || count <= 0 ? '—' : Math.round(count).toLocaleString('en-US');
}

function formatReplaces(m: GoModel): string {
	const names = m.migrationHints.map((h) => h.model).slice(0, 2);
	return names.length ? names.join(', ') : '—';
}

/** Newest `fetchedAt` across the catalog, as an ISO timestamp. */
function newestFetch(models: GoModel[]): string {
	const latest = models.reduce((max, m) => Math.max(max, m.fetchedAt ?? 0), 0);
	return latest > 0 ? new Date(latest).toISOString() : 'unknown';
}
