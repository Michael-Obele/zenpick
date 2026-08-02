/**
 * Inference engine orchestrator.
 * Glues together pricing, quota, burn, scoring, and tags
 * modules to produce an enriched GoModel from modelgrep and llm-stats data.
 */

import { burnRateFromPrice, type BurnRate } from '$lib/burn';
import type {
	GoModel,
	ModelgrepModelData,
	MigrationHint,
	ModelPricing,
	ModelSpeed,
	LlmStatsModel,
	UsageLimits
} from '$lib/types/models';
import { goEndpointType, goEndpointUrl, goIdToName } from './opencode-go';
import { inferPricing } from './pricing';
import { estimateQuota, DEFAULT_QUOTA_INPUTS } from './quota';
import { inferBurnDetails } from './burn';
import { computeScenarioScores } from './scoring';
import { computeTags } from './tags';
import { blendBenchmarks } from './blend';
import { normalizeTopScore } from './llm-stats';

/** Enrich a Go model ID with modelgrep data, llm-stats data, and optional docs pricing. */
export function inferModel(
	goId: string,
	mgModel: ModelgrepModelData | null,
	docsPricing?: Record<string, ModelPricing>,
	lsModel?: LlmStatsModel | null,
	frontierModels: LlmStatsModel[] = [],
	usageLimits?: Record<string, UsageLimits> | null
): GoModel {
	const name = lsModel && lsModel.id === goId ? lsModel.name : goIdToName(goId);
	// openWeight is data-driven: llm-stats marks closed models (e.g. grok-4.5,
	// gpt-5.6-luna) as open_weight: false, and the Go API now serves them.
	const openWeight = lsModel ? lsModel.open_weight : true;
	const pricing = inferPricing(goId, mgModel, docsPricing);
	// OpenCode's published usage-limit request counts are the ground truth for
	// how fast a model burns through the Go quota — prefer them over a
	// price-based estimate (which assumes generic token patterns and is
	// systematically off, e.g. Kimi K3 is ~12× slower-burning than it really is).
	const usage = usageLimits?.[goId] ?? null;
	const burnDetails = inferBurnDetails(pricing, usage);
	const burnRate = burnRateFromPrice(
		(pricing.inputPricePerM ?? 0) + (pricing.outputPricePerM ?? 0)
	) as BurnRate;

	const quota = usage
		? {
				requestsPer5h: usage.requestsPer5h,
				requestsPerWeek: usage.requestsPerWeek,
				requestsPerMonth: usage.requestsPerMonth
			}
		: estimateQuota(
				pricing,
				DEFAULT_QUOTA_INPUTS.inputTokens,
				DEFAULT_QUOTA_INPUTS.outputTokens,
				DEFAULT_QUOTA_INPUTS.cachedInputTokens
			);

	const { benchmarks, meta } = blendBenchmarks(mgModel, lsModel ?? null);
	benchmarks._meta = meta;

	const speed = extractModelgrepSpeed(mgModel);
	const tags = computeTags(benchmarks, burnDetails, speed, mgModel, lsModel);
	const migrationHints = inferMigrationHints(lsModel ?? null, frontierModels);
	const scenarioScores = computeScenarioScores({
		goId,
		pricing,
		benchmarks,
		burnDetails,
		speed,
		mgModel
	});

	return {
		id: goId,
		name,
		provider: mgModel?.maker ?? lsModel?.organization?.name ?? inferProvider(goId),
		description: mgModel?.description ?? lsModel?.description ?? '',
		openWeight,
		contextWindow: mgModel?.context_length ?? lsModel?.context_window ?? inferContextWindow(goId),
		releaseDate: lsModel?.release_date ?? null,
		pricing,
		quota: {
			requestsPer5h: quota?.requestsPer5h ?? 0,
			requestsPerWeek: quota?.requestsPerWeek ?? 0,
			requestsPerMonth: quota?.requestsPerMonth ?? 0
		},
		burnRate,
		burnDetails,
		tags,
		benchmarks,
		speed,
		migrationHints,
		scenarioScores,
		endpoint: goEndpointType(goId),
		endpointUrl: goEndpointUrl(goId),
		modelgrepId: mgModel?.id ?? null,
		llmStatsId: lsModel?.id ?? null,
		fetchedAt: Date.now()
	};
}

// ─── Extract modelgrep data ─────────────────────────────────────────────

function extractModelgrepSpeed(mgModel: ModelgrepModelData | null): ModelSpeed | null {
	if (!mgModel?.performance) return null;
	return {
		tokensPerSecond: mgModel.performance.throughput_tps ?? 0,
		timeToFirstToken: mgModel.performance.latency_ms ?? null
	};
}

// ─── Migration Hints ─────────────────────────────────────────────────────

/**
 * Data-driven "replaces" hints.
 *
 * For each capability category we compare the Go model's llm-stats score
 * (via its matched `llmStatsId`) against every closed-source frontier model,
 * finding the nearest neighbor. A model is only claimed as a "replacement"
 * when the normalized gap is within MIGRATION_BAND — so we never assert a
 * match that isn't backed by the live data. Hints are grouped by the frontier
 * model they replace and the categories they match on.
 */
const MIGRATION_BAND = 12; // max normalized (0–100) gap to claim a "replaces"

function inferMigrationHints(
	lsModel: LlmStatsModel | null,
	frontierModels: LlmStatsModel[]
): MigrationHint[] {
	if (!lsModel || frontierModels.length === 0) return [];

	const cats: { key: string; label: string }[] = [
		{ key: 'code', label: 'coding' },
		{ key: 'reasoning', label: 'reasoning' },
		{ key: 'math', label: 'math' }
	];

	// Group by the frontier model we'd replace, combining the categories it matches on.
	const byModel = new Map<string, { name: string; cats: string[]; worstGap: number }>();

	for (const { key, label } of cats) {
		const ours = normalizeTopScore(lsModel.top_scores?.[key]);
		if (ours == null) continue;

		let best: { name: string; gap: number } | null = null;
		for (const fm of frontierModels) {
			// Skip the Go model itself — a closed model served by the Go API
			// (e.g. grok-4.5) is also a frontier candidate, and comparing it to
			// itself would claim "replaces grok-4.5".
			if (fm.id === lsModel.id) continue;
			const theirs = normalizeTopScore(fm.top_scores?.[key]);
			if (theirs == null) continue;
			const gap = Math.abs(ours - theirs);
			if (best == null || gap < best.gap) best = { name: fm.name, gap };
		}

		if (best && best.gap <= MIGRATION_BAND) {
			const entry = byModel.get(best.name) ?? { name: best.name, cats: [], worstGap: 0 };
			entry.cats.push(label);
			entry.worstGap = Math.max(entry.worstGap, best.gap);
			byModel.set(best.name, entry);
		}
	}

	return [...byModel.values()].map((e) => ({
		model: e.name,
		reason: `Comparable on ${e.cats.join(' & ')} (per llm-stats)`
	}));
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const PROVIDER_BY_PREFIX: Record<string, string> = {
	deepseek: 'DeepSeek',
	qwen: 'Alibaba / Qwen Team',
	glm: 'Zhipu AI',
	kimi: 'Moonshot AI',
	minimax: 'MiniMax',
	mimo: 'Xiaomi',
	grok: 'xAI',
	gpt: 'OpenAI',
	hy3: 'Hy3'
};

function inferProvider(goId: string): string {
	const prefix = Object.keys(PROVIDER_BY_PREFIX).find((p) => goId.startsWith(p));
	return prefix ? PROVIDER_BY_PREFIX[prefix] : 'Unknown';
}

function inferContextWindow(goId: string): number {
	// No hardcoded model IDs — use a sensible default.
	// modelgrep data (context_length) takes priority in inferModel().
	return 128_000;
}
