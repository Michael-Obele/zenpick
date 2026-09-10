// OpenCode Go model with enriched metadata

export interface GoModel {
	/** Model ID for OpenCode config (e.g. "opencode-go/deepseek-v4-pro") */
	id: string;
	/** Display name (e.g. "DeepSeek V4 Pro") */
	name: string;
	/** Provider (e.g. "DeepSeek", "Alibaba", "Zhipu AI") */
	provider: string;
	/** Description from modelgrep */
	description: string;
	/** Open-weight or proprietary */
	openWeight: boolean;
	/** Context window in tokens */
	contextWindow: number | null;
	/** Release date */
	releaseDate: string | null;

	/** Pricing per 1M tokens */
	pricing: ModelPricing;

	/** Burn efficiency details */
	burnDetails: BurnDetails;

	/** Estimated requests per Go quota window */
	quota: {
		requestsPer5h: number;
		requestsPerWeek: number;
		requestsPerMonth: number;
	};

	/** Burn rate tier based on pricing */
	burnRate: BurnRate;

	/** Per-scenario fit scores (0-100) */
	scenarioScores: ScenarioScores;

	/** Algorithmically inferred tags */
	tags: ModelTag[];

	/** Benchmark scores from modelgrep */
	benchmarks: ModelBenchmarks;

	/** Speed metrics from modelgrep */
	speed: ModelSpeed | null;

	/** What the model accepts and produces, plus feature flags (null when no source matched) */
	capabilities: ModelCapabilities | null;

	/** Migration hints: closed-source models this replaces */
	migrationHints: MigrationHint[];

	/** OpenCode endpoint type */
	endpoint: 'openai-compatible' | 'anthropic-compatible';

	/** API endpoint URL */
	endpointUrl: string;

	/** Modelgrep model ID (e.g. "deepseek/deepseek-v4-pro"), null if unmatched */
	modelgrepId: string | null;

	/** LLM Stats model ID (slug used in llm-stats.com URLs), null if unmatched */
	llmStatsId: string | null;

	/** Last time this data was fetched */
	fetchedAt: number;
}

import type { BurnRate } from '$lib/burn';
export type { BurnRate };

/** Where model pricing data came from */
export type PricingSource = 'go-docs' | 'go-api' | 'modelgrep' | 'unknown';

/** Named burn efficiency band */
export type BurnBand = 'excellent' | 'good' | 'moderate' | 'high' | 'extreme';

/** Shared pricing interface */
export interface ModelPricing {
	inputPricePerM: number | null;
	outputPricePerM: number | null;
	cachedReadPerM: number | null;
	source: PricingSource;
}

/**
 * OpenCode Go usage-limit request counts, scraped from the docs/go/
 * "Usage limits" table. These are the ground-truth estimate of how many
 * requests a model allows per Go quota window ($12 / 5h, $30 / week,
 * $60 / month) — far more accurate than deriving requests from price.
 */
export interface UsageLimits {
	requestsPer5h: number;
	requestsPerWeek: number;
	requestsPerMonth: number;
}

/** Detailed burn efficiency */
export interface BurnDetails {
	score: number;
	requestsPer12: number | null;
	band: BurnBand | null;
}

/** TrueSkill-aware benchmark display info */
export interface BenchmarkDisplay {
	rawValue: number | null;
	percentile: number | null;
	barWidth: number;
	barMax: number;
}

export interface ScenarioScores {
	brainstorming: number;
	coding: number;
	agentic: number;
	budget: number;
	frontend: number;
}

export interface ModelTag {
	label: string;
	/** Lucide icon name (e.g. "code", "brain", "zap") */
	icon: string;
	/** How this tag was derived */
	source: 'ranking' | 'context' | 'pricing' | 'computed';
}

/**
 * Modality vocabulary, taken verbatim from the modelgrep `modality` field —
 * which is the same set OpenRouter publishes as `input_modalities`. Kept as a
 * string union (not a boolean bag) so unknown future tokens are simply dropped
 * instead of silently mis-typing the data.
 */
export type InputModality = 'text' | 'image' | 'audio' | 'video' | 'file';
export type OutputModality = 'text' | 'image' | 'audio';

/**
 * Everything we know about what a model can *do*, resolved from modelgrep's
 * `modality` + `capabilities` fields, with llm-stats `modalities` as the
 * fallback when a model has no modelgrep counterpart.
 *
 * `vision` / `reasoning` are retained as booleans because the ranking and
 * scoring layers filter on them; `input` / `output` are the richer, displayable
 * form of the same underlying facts.
 */
export interface ModelCapabilities {
	/** Accepted input modalities, canonical order, unknown tokens dropped. */
	input: InputModality[];
	/** Produced output modalities, canonical order. */
	output: OutputModality[];
	/**
	 * Accepts images as input. Retained as a boolean because the ranking,
	 * scoring and filter layers test it directly; it is derived from `input`
	 * so the two can never disagree.
	 */
	vision: boolean;
	/** Supports tool / function calling. */
	tools: boolean;
	/** Supports structured (schema-constrained) output. */
	structured: boolean;
	/** Exposes reasoning / extended thinking. */
	reasoning: boolean;
}

export interface ModelBenchmarks {
	coding: number | null;
	reasoning: number | null;
	math: number | null;
	sweBenchVerified: number | null;
	/** Design Arena Elo — human-preference votes for UI generation (modelgrep) */
	designElo: number | null;
	codeArena: number | null;
	/** All raw scores keyed by benchmark name */
	allScores: Record<string, number>;
	/** Per-field source tracking for multi-source blending */
	_meta?: BenchmarkMeta;
}

/** Tracks which source each benchmark field was derived from. */
export interface BenchmarkMeta {
	coding: { source: BenchmarkSource };
	reasoning: { source: BenchmarkSource };
	math: { source: BenchmarkSource };
	sweBenchVerified: { source: BenchmarkSource };
}

/** Possible sources for a benchmark value. */
export type BenchmarkSource = 'modelgrep' | 'llm-stats' | 'blended' | null;

export interface ModelSpeed {
	tokensPerSecond: number;
	timeToFirstToken: number | null;
}

export interface MigrationHint {
	/** Closed-source model name (e.g. "Claude Sonnet 4.6") */
	model: string;
	/** Why this is a replacement */
	reason: string;
}

/**
 * A closed-source frontier model prepared for "replaces" comparison.
 * Benchmarks are blended with the same modelgrep-primary pipeline used for
 * Go models, so both sides of the comparison live on the same scale.
 */
export interface FrontierCandidate {
	/** llm-stats model ID (e.g. "claude-opus-5") */
	id: string;
	/** Display name (e.g. "Claude Opus 5") */
	name: string;
	/** Organization (used to dedupe same-lab candidates) */
	organization: { id: string; name: string } | null;
	/** Release date (ISO) — null when llm-stats doesn't publish one */
	releaseDate: string | null;
	/** Blended benchmark scores */
	benchmarks: ModelBenchmarks;
}

/**
 * Snapshot of the frontier comparison universe, as seen by the
 * migration-hint algorithm.
 */
export interface FrontierSnapshot {
	/** Closed-source candidates (already recency-filtered) */
	frontier: FrontierCandidate[];
	/**
	 * Unix ms cutoff — candidates released before this are excluded from
	 * "replaces" claims (see FRONTIER_MAX_AGE_DAYS in llm-stats.ts).
	 */
	cutoff: number;
}

// modelgrep.com API response types (aggregates OpenRouter + Artificial Analysis)

export interface ModelgrepModelData {
	/** modelgrep model ID, e.g. "deepseek/deepseek-v4-pro" */
	id: string;
	/** Display name, e.g. "DeepSeek: DeepSeek V4 Pro" */
	name: string;
	/** Maker slug, e.g. "deepseek", "z-ai" */
	maker: string;
	description: string;
	context_length: number;
	max_output: number | null;
	pricing: {
		input: number;
		output: number;
		cache_read: number | null;
		unit: 'usd_per_million_tokens';
	} | null;
	performance: {
		throughput_tps: number | null;
		latency_ms: number | null;
		uptime: number | null;
	};
	capabilities: {
		tools: boolean;
		reasoning: boolean;
		structured: boolean;
		vision: boolean;
		/** Accepts audio input (present since modelgrep added modality flags). */
		audio_in?: boolean;
		/** Emits images. */
		image_out?: boolean;
	};
	/**
	 * Input/output modality lists — same vocabulary OpenRouter publishes as
	 * `input_modalities` (`text | image | audio | video | file`).
	 */
	modality?: {
		input: string[];
		output: string[];
	} | null;
	/**
	 * Open-weight evidence. The KEY IS ALWAYS PRESENT (even for closed models,
	 * where every field is null), so never test for the object's existence —
	 * test whether `license` / `params_b` / `hf_downloads` actually carry a
	 * value. Used to corroborate llm-stats' `open_weight`, which mislabels
	 * some variants.
	 */
	open_weights?: {
		params_b: number | null;
		license: string | null;
		hf_downloads: number | null;
	} | null;
	benchmarks: {
		artificial_analysis: {
			intelligence: number | null;
			coding: number | null;
			agentic: number | null;
			gpqa: number | null;
			hle: number | null;
			scicode: number | null;
			tau2: number | null;
			intelligence_pct: number | null;
			coding_pct: number | null;
			agentic_pct: number | null;
		} | null;
		design_arena: {
			elo: number;
			win_rate: number;
			elo_pct: number;
		} | null;
	};
	url: string;
}

// OpenCode Go API response

export interface GoModelEntry {
	id: string;
	object: 'model';
	created: number;
	owned_by: 'opencode';
}

// llm-stats.com API response types

export interface LlmStatsModel {
	id: string;
	name: string;
	description: string;
	organization: {
		id: string;
		name: string;
	} | null;
	family: string | null;
	open_weight: boolean;
	model_type: string;
	modalities: string[];
	context_window: number | null;
	param_count: number | null;
	training_tokens: number | null;
	knowledge_cutoff: string | null;
	release_date: string | null;
	/** Benchmark scores keyed by benchmark name (0-1 scale). */
	top_scores: Record<string, number>;
	source: string;
	url: string;
}
