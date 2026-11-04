import type {
	ModelBenchmarks,
	ModelCapabilities,
	ModelPricing,
	ModelSpeed,
	ModelTag
} from '$lib/types/models';

/** The plans a stack can be built on. Order here is the tab order in the UI. */
export type PlanId = 'zed' | 'copilot' | 'go';
export const PLAN_IDS: PlanId[] = ['zed', 'copilot', 'go'];

/** The price fields the cost math reads (same names as ModelPricing). */
export type StackPricing = Pick<
	ModelPricing,
	'inputPricePerM' | 'outputPricePerM' | 'cachedReadPerM'
>;

export interface StackModel {
	/** Plan-local id. Cross-plan identity goes through `modelKey()` in logic.ts. */
	id: string;
	name: string;
	provider: string;
	/** What THIS plan charges per 1M tokens (Zed's +10% already applied). */
	pricing: StackPricing;
	contextWindow: number | null;
	/** Artificial Analysis intelligence index via modelgrep; null when unpublished. */
	intelligence: number | null;
	/** Artificial Analysis coding score (0-100) when modelgrep publishes it. */
	coding?: number | null;
	/**
	 * Blended benchmark fields (modelgrep primary, llm-stats fallback). The
	 * scalar `intelligence` / `coding` fields above are the two columns every
	 * consumer already reads; this carries the rest (math, SciCode, source
	 * metadata) so plan views can show the same benchmark set as Go views.
	 */
	benchmarks?: ModelBenchmarks;
	capabilities?: ModelCapabilities | null;
	/** Open-weight evidence; null when no source can tell. */
	openWeight?: boolean | null;
	speed?: ModelSpeed | null;
	tags?: ModelTag[];
	/** llm-stats slug for links and the side-by-side compare URL. */
	llmStatsId?: string | null;
	/** Plan-specific gotcha worth showing next to the model. */
	note?: string;
	/** One-line model description; null/absent when the source has none. */
	description?: string;
	/** modelgrep id ("anthropic/claude-sonnet-5.5") for the model page; null = none. */
	modelgrepId?: string | null;
}

export interface StackPlan {
	id: PlanId;
	name: string;
	monthlyPriceUsd: number;
	/** Token budget (USD, at this plan's own rates) included in the monthly price. */
	includedUsd: number;
	/** One-line description of what the monthly price buys. */
	allowance: string;
	/** What the visitor must know before trusting the numbers. */
	caveat: string;
	sources: { label: string; url: string }[];
	/** ISO date the static data was checked against the docs; null for live-derived plans. */
	verifiedOn: string | null;
	models: StackModel[];
}

/** A hand-verified model row before modelgrep fills `intelligence` / context. */
export interface StaticModelDef {
	id: string;
	name: string;
	provider: string;
	/** modelgrep id ("anthropic/claude-sonnet-5.5") for the intelligence lookup; null = none. */
	modelgrepId: string | null;
	/** Provider LIST price per 1M tokens: [input, output, cachedRead | null]. */
	price: [number, number, number | null];
	/** Plan-documented context window; omitted = fall back to modelgrep's. */
	contextWindow?: number;
	note?: string;
}

export interface StaticPlan extends Omit<StackPlan, 'models'> {
	/** Applied to every list price (Zed bills list +10%). */
	priceMultiplier: number;
	models: StaticModelDef[];
}

type Maker = 'anthropic' | 'openai' | 'google' | 'x-ai' | 'moonshotai' | 'microsoft';

const MAKER_NAME: Record<Maker, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	google: 'Google',
	'x-ai': 'xAI',
	moonshotai: 'Moonshot AI',
	microsoft: 'Microsoft'
};

function row(
	maker: Maker,
	id: string,
	name: string,
	price: StaticModelDef['price'],
	contextWindow?: number,
	note?: string
): StaticModelDef {
	return {
		id,
		name,
		provider: MAKER_NAME[maker],
		modelgrepId: `${maker}/${id}`,
		price,
		contextWindow,
		note
	};
}

/** Apply a plan's price multiplier to a list-price row (rounded to kill float noise). */
export function toPricing(price: StaticModelDef['price'], multiplier = 1): StackPricing {
	const scale = (v: number) => Math.round(v * multiplier * 1e6) / 1e6;
	return {
		inputPricePerM: scale(price[0]),
		outputPricePerM: scale(price[1]),
		cachedReadPerM: price[2] == null ? null : scale(price[2])
	};
}

const M1 = 1_000_000;
const K200 = 200_000;
/** OpenAI models on Zed: 272k input / 400k total. */
const K272 = 272_000;

const FABLE_NOTE = 'Anthropic keeps prompts and outputs for at least 30 days (trust and safety).';

/** https://zed.dev/docs/account/zed-hosted-models (list price; Zed adds 10%). */
const ZED_MODELS: StaticModelDef[] = [
	row('anthropic', 'claude-fable-5.1', 'Claude Fable 5.1', [10, 50, 0.25], M1, FABLE_NOTE),
	row('anthropic', 'claude-fable-5', 'Claude Fable 5', [10, 50, 1], M1, FABLE_NOTE),
	row('anthropic', 'claude-opus-5.5', 'Claude Opus 5.5', [4, 20, 0.2], M1),
	row('anthropic', 'claude-opus-5', 'Claude Opus 5', [5, 25, 0.5], M1),
	row('anthropic', 'claude-opus-4.8', 'Claude Opus 4.8', [5, 25, 0.5], M1),
	row('anthropic', 'claude-opus-4.7', 'Claude Opus 4.7', [5, 25, 0.5], M1),
	row('anthropic', 'claude-opus-4.6', 'Claude Opus 4.6', [5, 25, 0.5], M1),
	row('anthropic', 'claude-opus-4.5', 'Claude Opus 4.5', [5, 25, 0.5], K200),
	row('anthropic', 'claude-sonnet-5.5', 'Claude Sonnet 5.5', [2, 10, 0.2], M1),
	row('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', [2, 10, 0.2], M1),
	row('anthropic', 'claude-sonnet-4.6', 'Claude Sonnet 4.6', [3, 15, 0.3], M1),
	row('anthropic', 'claude-sonnet-4.5', 'Claude Sonnet 4.5', [3, 15, 0.3], K200),
	row('anthropic', 'claude-haiku-4.5', 'Claude Haiku 4.5', [1, 5, 0.1], K200),
	row('openai', 'gpt-6-astra', 'GPT-6 Astra', [10, 50, 1], K272),
	row('openai', 'gpt-6.1-sol', 'GPT-6.1 Sol', [2, 10, 0.1], K272),
	row('openai', 'gpt-6-sol', 'GPT-6 Sol', [2, 10, 0.2], K272),
	row('openai', 'gpt-6-luna', 'GPT-6 Luna', [0.1, 0.5, 0.01], K272),
	row('openai', 'gpt-5.6-sol', 'GPT-5.6 Sol', [4, 20, 0.4], K272),
	row('openai', 'gpt-5.6-terra', 'GPT-5.6 Terra', [2, 12, 0.2], K272),
	row('openai', 'gpt-5.6-luna', 'GPT-5.6 Luna', [0.2, 1.2, 0.02], K272),
	row('openai', 'gpt-5.5-pro', 'GPT-5.5 pro', [30, 180, null], K272),
	row('openai', 'gpt-5.5', 'GPT-5.5', [5, 30, 0.5], K272),
	row('openai', 'gpt-5.4-pro', 'GPT-5.4 pro', [30, 180, null], K272),
	row('openai', 'gpt-5.4', 'GPT-5.4', [2.5, 15, 0.25], K272),
	row('openai', 'gpt-5.3-codex', 'GPT-5.3-Codex', [1.75, 14, 0.175], K272),
	row('openai', 'gpt-5.2', 'GPT-5.2', [1.75, 14, 0.175], K272),
	row('openai', 'gpt-5.2-codex', 'GPT-5.2-Codex', [1.75, 14, 0.175], K272),
	row('openai', 'gpt-5-mini', 'GPT-5 mini', [0.25, 2, 0.025], K272),
	row('openai', 'gpt-5-nano', 'GPT-5 nano', [0.05, 0.4, 0.005], K272),
	row('google', 'gemini-4-argon', 'Gemini 4 Argon', [2, 10, 0.1], M1),
	{
		...row('google', 'gemini-3.1-pro', 'Gemini 3.1 Pro', [2, 12, null], K200),
		modelgrepId: 'google/gemini-3.1-pro-preview'
	},
	row('google', 'gemini-3.5-flash', 'Gemini 3.5 Flash', [1.5, 9, null], M1),
	{
		...row('google', 'gemini-3-flash', 'Gemini 3 Flash', [0.5, 3, null], M1),
		modelgrepId: 'google/gemini-3-flash-preview'
	}
];

export const ZED_PLAN: StaticPlan = {
	id: 'zed',
	name: 'Zed Pro',
	monthlyPriceUsd: 10,
	includedUsd: 5,
	priceMultiplier: 1.1,
	allowance:
		'$10/mo includes $5 of tokens. Past that you pay per token (default spend cap: $10 more per month).',
	caveat:
		'Zed bills provider list price plus 10%. Every hosted model is included on Pro, including Claude Opus and Fable.',
	sources: [
		{
			label: 'Zed-hosted models',
			url: 'https://zed.dev/docs/account/zed-hosted-models'
		},
		{
			label: 'Zed plans and pricing',
			url: 'https://zed.dev/docs/account/plans-and-pricing'
		}
	],
	verifiedOn: '2026-11-01',
	models: ZED_MODELS
};

/** Copilot Pro subset of https://docs.github.com/en/copilot/reference/ai-models/supported-models */
const COPILOT_PRO_MODELS: StaticModelDef[] = [
	row('anthropic', 'claude-haiku-4.5', 'Claude Haiku 4.5', [1, 5, 0.1]),
	row(
		'anthropic',
		'claude-haiku-5.5',
		'Claude Haiku 5.5',
		[0.1, 0.5, 0.01],
		undefined,
		'Price jumps 5x above 100K input tokens ($0.50 in, $2.50 out).'
	),
	row('anthropic', 'claude-sonnet-5.5', 'Claude Sonnet 5.5', [2, 10, 0.1]),
	row('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', [2, 10, 0.2]),
	row(
		'google',
		'gemini-3.8-flash',
		'Gemini 3.8 Flash',
		[0.75, 3.75, 0.075],
		undefined,
		'Promo price through 2026-12-31.'
	),
	row('openai', 'gpt-5.3-codex', 'GPT-5.3-Codex', [1.75, 14, 0.175]),
	row(
		'openai',
		'gpt-5.6-luna',
		'GPT-5.6 Luna',
		[0.2, 1.2, 0.02],
		undefined,
		'Price doubles above 200K input tokens.'
	),
	row(
		'openai',
		'gpt-5.6-terra',
		'GPT-5.6 Terra',
		[2, 12, 0.2],
		undefined,
		'Price doubles above 272K input tokens.'
	),
	row(
		'openai',
		'gpt-6-luna',
		'GPT-6 Luna',
		[0.1, 0.5, 0.01],
		undefined,
		'Price doubles above 272K input tokens.'
	),
	row(
		'openai',
		'gpt-6.1-terra',
		'GPT-6.1 Terra',
		[1, 5, 0.05],
		undefined,
		'Price doubles above 272K input tokens.'
	),
	row(
		'x-ai',
		'grok-4.5',
		'Grok 4.5',
		[2, 6, 0.5],
		undefined,
		'Price doubles above 200K input tokens.'
	),
	row(
		'x-ai',
		'grok-4.6',
		'Grok 4.6',
		[2, 6, 0.5],
		undefined,
		'Price doubles above 200K input tokens.'
	),
	row(
		'x-ai',
		'grok-4.7',
		'Grok 4.7',
		[2, 6, 0.5],
		undefined,
		'Price doubles above 200K input tokens.'
	),
	row('moonshotai', 'kimi-k3', 'Kimi K3', [3, 15, 0.3]),
	{
		...row('microsoft', 'mai-code-1.1-flash', 'MAI-Code-1.1-Flash', [0.2, 1.2, 0.02]),
		modelgrepId: null
	}
];

export const COPILOT_PLAN: StaticPlan = {
	id: 'copilot',
	name: 'Copilot Pro',
	monthlyPriceUsd: 10,
	includedUsd: 15,
	priceMultiplier: 1,
	allowance:
		'$10/mo includes 1,500 AI credits ($15 of tokens): 1,000 base plus 500 flex that GitHub may change. 1 credit = $0.01. Resets on the 1st (UTC), no rollover.',
	caveat:
		'Pro has no Claude Opus or Fable, no GPT-6 Sol or Astra, no Gemini 4 Argon. Claude Sonnet 4.6 is annual-plan only. The 1M context window is VS Code and Copilot CLI only and burns more credits. Code completions are free and unlimited.',
	sources: [
		{
			label: 'Models and pricing',
			url: 'https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing'
		},
		{
			label: 'Usage-based billing',
			url: 'https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals'
		},
		{
			label: 'Models per plan',
			url: 'https://docs.github.com/en/copilot/reference/ai-models/supported-models'
		}
	],
	verifiedOn: '2026-11-01',
	models: COPILOT_PRO_MODELS
};

/** OpenCode Go is derived live from the Go catalog; only its plan facts live here. */
export const GO_PLAN_META: Omit<StackPlan, 'models'> = {
	id: 'go',
	name: 'OpenCode Go',
	monthlyPriceUsd: 10,
	includedUsd: 60,
	allowance:
		'$10/mo. The usage allowance is worth $60/month at list price, also capped at $12 per 5 hours and $30 per week.',
	caveat:
		'Open and budget models only: Go has no Claude Sonnet or Opus. Costs here are price-based; the model table below shows the request counts OpenCode publishes.',
	sources: [
		{ label: 'OpenCode Go', url: 'https://opencode.ai/go' },
		{ label: 'Go docs', url: 'https://opencode.ai/v2/docs/console/go' }
	],
	verifiedOn: null
};
