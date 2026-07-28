import type { GoModel } from '$lib/types/models';

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

/** Max models llm-stats.com allows in a single compare URL (their API caps at 4). */
export const LLM_STATS_MAX_COMPARE = 4;

/** Canonical OpenCode Go docs — the AI can read these for deeper context. */
const OPENCODE_GO_DOCS = 'https://opencode.ai/docs/go/';

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

/**
 * Build a self-contained prompt that gives the AI all the decision-relevant
 * context about the compared models, ending with a seed question the user can
 * continue from. Kept under ~2000 chars so it survives URL encoding.
 */
export function buildComparePrompt(models: GoModel[]): string {
	const blocks = models
		.map((m, i) => {
			const s = m.scenarioScores;
			const tags = m.tags.map((t) => t.label).join(', ') || 'none';
			const mig = m.migrationHints.length
				? m.migrationHints.map((h) => `${h.model} (${h.reason})`).join('; ')
				: 'none';
			return `=== Model ${i + 1}: ${m.name} (${m.provider}) ===
- ID: opencode-go/${m.id}
- Description: ${m.description || 'n/a'}
- Benchmarks (0-100): Coding ${m.benchmarks.coding ?? 'n/a'}, Reasoning ${
				m.benchmarks.reasoning ?? 'n/a'
			}, Math ${m.benchmarks.math ?? 'n/a'}, SWE-Bench Verified ${
				m.benchmarks.sweBenchVerified ?? 'n/a'
			}
- Scenario fit (0-100): Coding ${s.coding}, Agentic ${s.agentic}, Brainstorming ${
				s.brainstorming
			}, Competitive ${s.competitive}, Budget ${s.budget}, Frontend ${s.frontend}
- Pricing: ${fmtPrice(m.pricing.inputPricePerM)}/1M input, ${fmtPrice(
				m.pricing.outputPricePerM
			)}/1M output
- Context window: ${fmtTokens(m.contextWindow)} tokens
- Speed: ${m.speed ? `${m.speed.tokensPerSecond} tok/s` : 'unknown'}
- Burn tier: ${m.burnDetails.band ?? 'unknown'} (score ${m.burnDetails.score ?? 'n/a'})
- Open weights: ${m.openWeight ? 'yes' : 'no'}
- Release date: ${m.releaseDate ?? 'unknown'}
- Tags: ${tags}
- Migration: replaces ${mig}`;
		})
		.join('\n\n');

	return `You are helping me choose between OpenCode Go models. Below is the live data ZenPick collected for each. Use it to answer my follow-up questions about which model best fits a given task.

${blocks}

Useful links to research further (open them for the latest benchmarks, pricing, and docs):
- OpenCode Go models docs: ${OPENCODE_GO_DOCS}
${buildResearchLinks(models)}

I'll follow up with my specific task next — please wait for it before answering.`;
}

/** Build a compact list of per-model + aggregate research links for the prompt. */
function buildResearchLinks(models: GoModel[]): string {
	const lines: string[] = [];

	const llmStatsCompare = buildLlmStatsCompareUrl(models);
	if (llmStatsCompare) {
		lines.push(`- Side-by-side on LLM Stats: ${llmStatsCompare}`);
	}

	for (const m of models) {
		const links: string[] = [];
		if (m.llmStatsId) links.push(`LLM Stats: https://llm-stats.com/models/${m.llmStatsId}`);
		if (m.modelgrepId) links.push(`modelgrep: https://modelgrep.com/models/${m.modelgrepId}`);
		if (links.length) {
			lines.push(`- ${m.name} → ${links.join(' | ')}`);
		}
	}

	return lines.join('\n');
}

/** Build the llm-stats.com side-by-side compare URL (e.g. .../compare/a-vs-b-vs-c).
 *  Uses each model's matched llm-stats slug (m.llmStatsId). The Go model ID (m.id)
 *  is a different namespace and is NOT a valid llm-stats slug, so it is never used as a
 *  fallback — doing so produces a URL llm-stats can't resolve. Returns '' unless every
 *  model has a matched slug and the count is within llm-stats' 2–4 limit. */
export function buildLlmStatsCompareUrl(models: GoModel[]): string {
	if (models.length < 2) return '';
	if (models.length > LLM_STATS_MAX_COMPARE) return '';
	const slugs = models.map((m) => m.llmStatsId).filter((s): s is string => Boolean(s));
	if (slugs.length !== models.length) return '';
	return `https://llm-stats.com/models/compare/${slugs.join('-vs-')}`;
}

/** Build the deep-link URL for a provider with the given models' context. */
export function askAiUrl(providerId: AiProviderId, models: GoModel[]): string {
	const provider = AI_PROVIDERS.find((p) => p.id === providerId);
	if (!provider) return '';
	return provider.buildUrl(buildComparePrompt(models));
}
