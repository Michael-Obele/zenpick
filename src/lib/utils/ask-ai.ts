import type { CompareModel } from '$lib/compare-model';
import { benchmarkToPercent } from '$lib/compare-defaults';
import { PLAN_LABEL } from '$lib/catalog';
import { buildLlmStatsCompareUrl, llmStatsModelUrl } from './llm-stats-url';

export type AiProviderId = 'grok' | 'chatgpt' | 'claude' | 'gemini';

export interface AiProvider {
	id: AiProviderId;
	label: string;
	/** Lucide icon name (resolved by the component). */
	icon: string;
	/** Tailwind text color class for the icon. */
	accent: string;
	/** Build the deep-link URL that pre-fills the prompt. */
	buildUrl: (prompt: string) => string;
}

const enc = (s: string) => encodeURIComponent(s);

/** Canonical pricing/model docs the AI can read for deeper context. */
const RESEARCH_DOCS = [
	'- OpenCode Go models docs: https://opencode.ai/v2/docs/console/go',
	'- Zed hosted models: https://zed.dev/docs/account/zed-hosted-models',
	'- GitHub Copilot supported models: https://docs.github.com/en/copilot/reference/ai-models/supported-models'
].join('\n');

/**
 * AI chat providers that support a `?q=` pre-fill parameter.
 * Grok auto-submits; ChatGPT/Claude/Gemini pre-fill (user hits Enter).
 */
export const AI_PROVIDERS: AiProvider[] = [
	{
		id: 'grok',
		label: 'Grok',
		icon: 'bot',
		accent: 'text-sky-400',
		buildUrl: (p) => `https://grok.com/?q=${enc(p)}`
	},
	{
		id: 'chatgpt',
		label: 'ChatGPT',
		icon: 'message-square-text',
		accent: 'text-emerald-400',
		buildUrl: (p) => `https://chatgpt.com/?q=${enc(p)}`
	},
	{
		id: 'claude',
		label: 'Claude',
		icon: 'brain',
		accent: 'text-orange-400',
		buildUrl: (p) => `https://claude.ai/new?q=${enc(p)}`
	},
	{
		id: 'gemini',
		label: 'Gemini',
		icon: 'sparkles',
		accent: 'text-blue-400',
		buildUrl: (p) => `https://gemini.google.com/app?q=${enc(p)}`
	}
];

function fmtPrice(n: number | null): string {
	return n == null ? 'unknown' : `$${n.toFixed(2)}`;
}

function fmtTokens(n: number | null): string {
	if (!n) return 'unknown';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
	return `${n}`;
}

/** Facts every plan publishes: pricing, context, speed, open weights, tags. */
function sharedFactLines(m: CompareModel): string[] {
	const lines = [
		`- Pricing on ${PLAN_LABEL[m.plan]}: ${fmtPrice(m.pricing.inputPricePerM)}/1M input, ${fmtPrice(
			m.pricing.outputPricePerM
		)}/1M output`,
		`- Context window: ${fmtTokens(m.contextWindow)} tokens`
	];

	if (m.speed) lines.push(`- Speed: ${m.speed.tokensPerSecond} tok/s`);
	if (m.openWeight != null) lines.push(`- Open weights: ${m.openWeight ? 'yes' : 'no'}`);

	const tags = m.tags.map((t) => t.label).join(', ');
	if (tags) lines.push(`- Tags: ${tags}`);

	return lines;
}

/** Facts only a Go row has: scenario fit, burn, release date, migration hints. */
function goFactLines(m: CompareModel): string[] {
	if (!m.go) return [];

	const s = m.go.scenarioScores;
	const lines = [
		`- Scenario fit (0-100): Coding ${s.coding}, Agentic ${s.agentic}, Brainstorming ${s.brainstorming}, Budget ${s.budget}, Frontend ${s.frontend}`,
		`- Burn tier: ${m.go.burnDetails.band ?? 'unknown'} (score ${m.go.burnDetails.score ?? 'n/a'})`
	];

	if (m.go.releaseDate) lines.push(`- Release date: ${m.go.releaseDate}`);

	const migrations = m.go.migrationHints.map((h) => `${h.model} (${h.reason})`).join('; ');
	if (migrations) lines.push(`- Migration: replaces ${migrations}`);

	return lines;
}

/** The per-model block. Go-only facts are included only when the row has them. */
function modelBlock(m: CompareModel, index: number): string {
	const lines = [
		`=== Model ${index + 1}: ${m.name} (${m.provider}) — ${PLAN_LABEL[m.plan]} ===`,
		`- ID: ${m.plan}/${m.id}`,
		`- Description: ${m.description || 'n/a'}`,
		`- Benchmarks (0-100): Coding ${m.benchmarks.coding ?? 'n/a'}, Reasoning ${
			m.benchmarks.reasoning ?? 'n/a'
		}, Math ${m.benchmarks.math ?? 'n/a'}, SciCode ${
			benchmarkToPercent(m.benchmarks.sweBenchVerified, 'sweBenchVerified') ?? 'n/a'
		}`
	];

	if (m.note) lines.push(`- Plan note: ${m.note}`);

	return [...lines, ...sharedFactLines(m), ...goFactLines(m)].join('\n');
}

/**
 * Build a self-contained prompt that gives the AI all the decision-relevant
 * context about the compared models, ending with a seed question the user can
 * continue from. Works for Go, Zed Pro and Copilot Pro columns: fields a plan
 * does not publish are simply omitted instead of being reported as zero.
 *
 * Kept under ~2000 chars for a typical 2–4 model comparison so it survives URL
 * encoding.
 */
export function buildComparePrompt(models: CompareModel[]): string {
	const blocks = models.map(modelBlock).join('\n\n');

	return `You are helping me choose between models across OpenCode Go, Zed Pro and Copilot Pro. Below is the live data ZenPick collected for each — pricing is that plan's own rate, and the benchmark columns are the same blended modelgrep + llm-stats scores shown in the app. Use it to answer my follow-up questions about which model best fits a given task.

${blocks}

Useful links to research further (open them for the latest benchmarks, pricing, and docs):
${RESEARCH_DOCS}
${buildResearchLinks(models)}

I'll follow up with my specific task next — please wait for it before answering.`;
}

/** Build a compact list of per-model + aggregate research links for the prompt. */
function buildResearchLinks(models: CompareModel[]): string {
	const lines: string[] = [];

	const llmStatsCompare = buildLlmStatsCompareUrl(models);
	if (llmStatsCompare) {
		lines.push(`- Side-by-side on LLM Stats: ${llmStatsCompare}`);
	}

	for (const m of models) {
		const links: string[] = [];
		// llmStatsModelUrl prefers the verified llm-stats match and falls back to
		// the plan id, which llm-stats serves directly or canonical-redirects.
		links.push(`LLM Stats: ${llmStatsModelUrl(m)}`);
		if (m.modelgrepId) links.push(`modelgrep: https://modelgrep.com/models/${m.modelgrepId}`);
		if (links.length) {
			lines.push(`- ${m.name} (${PLAN_LABEL[m.plan]}) → ${links.join(' | ')}`);
		}
	}

	return lines.join('\n');
}

/** Build the deep-link URL for a provider with the given columns' context. */
export function askAiUrl(providerId: AiProviderId, models: CompareModel[]): string {
	const provider = AI_PROVIDERS.find((p) => p.id === providerId);
	if (!provider) return '';
	return provider.buildUrl(buildComparePrompt(models));
}
