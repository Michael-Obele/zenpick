import { loadModels } from '$lib/server/models';
import { burnBandLabel, burnLabel, isFreePricing } from '$lib/burn';
import { llmStatsModelUrl } from '$lib/utils/llm-stats-url';
import type { GoModel } from '$lib/types/models';
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
	const body = render(models, url.origin);

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			// The underlying model cache lives 6h; keep CDN staleness well under that.
			'cache-control': 'public, max-age=600'
		}
	});
};

function render(models: GoModel[], origin: string): string {
	const lines: string[] = [
		'# ZenPick',
		'',
		'> ZenPick compares every OpenCode Go model side-by-side with live benchmarks, pricing, quota-burn estimates, and algorithmic task-fit scores — so developers pick the right model for the job before spending their subscription quota.',
		'',
		'ZenPick is a free, read-only comparison tool for the [OpenCode Go](https://opencode.ai/go) model catalog (the $10/month tier). It aggregates public data from modelgrep, LLM Stats, and the OpenCode Go docs, then ranks each model per task. The catalog is interactive on the site (JavaScript-rendered); the table below is the same catalog in plain markdown.',
		'',
		`- Models: ${models.length}`,
		`- Data as of: ${newestFetch(models)}`,
		`- Generated: ${new Date().toISOString()}`,
		'',
		'## Models',
		'',
		'| Model | ID | Provider | Context | Input $/M | Output $/M | Burn | Req/mo | Coding | Agentic | Replaces | Source |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	];

	for (const m of models) {
		const free = isFreePricing(m.pricing);
		lines.push(
			[
				cell(m.name),
				cell(m.id),
				cell(m.provider),
				formatContext(m.contextWindow),
				free ? 'Free' : formatPrice(m.pricing.inputPricePerM),
				free ? 'Free' : formatPrice(m.pricing.outputPricePerM),
				cell(burnLabelFor(m)),
				m.quota.unlimited ? 'Unlimited' : formatCount(m.quota.requestsPerMonth),
				formatScore(m.scenarioScores.coding),
				formatScore(m.scenarioScores.agentic),
				cell(formatReplaces(m)),
				`[llm-stats](${llmStatsModelUrl(m)})`
			].join(' | ')
		);
	}

	lines.push(
		'',
		'- **Context** — maximum input context window in tokens.',
		'- **Burn** — how fast a model consumes the Go quota (`Excellent` is quota-friendly, `Extreme` burns fastest).',
		'- **Req/mo** — estimated requests per month at the $60 Go tier.',
		'- **Coding / Agentic** — task-fit score, 0–100 (algorithmic, not a benchmark).',
		'- **Replaces** — closed-source frontier models this Go model substitutes.',
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
		'- [OpenCode Go docs](https://opencode.ai/docs/go/): official model list, pricing, and usage limits',
		'',
		'## Notes',
		'',
		`- This file is generated on request at \`${origin}/llms.txt\` from ZenPick's server-side model cache.`,
		'- Catalog data refreshes automatically (stale-while-revalidate, ~6h TTL).',
		'- Machine operators can force a fresh upstream fetch via `POST /api/revalidate` (see repository README).',
		''
	);

	return lines.join('\n');
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
