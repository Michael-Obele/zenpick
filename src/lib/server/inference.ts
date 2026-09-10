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
	UsageLimits,
	FrontierCandidate,
	ModelBenchmarks
} from '$lib/types/models';
import { goEndpointType, goEndpointUrl, goIdToName } from './opencode-go';
import { inferPricing } from './pricing';
import { estimateQuota, DEFAULT_QUOTA_INPUTS } from './quota';
import { inferBurnDetails } from './burn';
import { computeScenarioScores } from './scoring';
import { computeTags } from './tags';
import { blendBenchmarks } from './blend';
import { buildCapabilities } from '$lib/capabilities';
import { MIGRATION_BAND } from '$lib/migration';

/** Enrich a Go model ID with modelgrep data, llm-stats data, and optional docs pricing. */
export function inferModel(
	goId: string,
	mgModel: ModelgrepModelData | null,
	docsPricing?: Record<string, ModelPricing>,
	lsModel?: LlmStatsModel | null,
	frontierCandidates: FrontierCandidate[] = [],
	usageLimits?: Record<string, UsageLimits> | null
): GoModel {
	const name = lsModel && lsModel.id === goId ? lsModel.name : goIdToName(goId);
	// Open-weight is triangulated across sources — see inferOpenWeight().
	const openWeight = inferOpenWeight(goId, mgModel, lsModel);
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
	const migrationHints = inferMigrationHints(
		lsModel ?? null,
		openWeight,
		benchmarks,
		frontierCandidates
	);
	const contextWindow =
		mgModel?.context_length ?? lsModel?.context_window ?? inferContextWindow(goId);
	const scenarioScores = computeScenarioScores({
		goId,
		pricing,
		benchmarks,
		burnDetails,
		speed,
		mgModel,
		contextWindow
	});

	return {
		id: goId,
		name,
		provider: mgModel?.maker ?? lsModel?.organization?.name ?? inferProvider(goId),
		description: mgModel?.description ?? lsModel?.description ?? '',
		openWeight,
		contextWindow,
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
		capabilities: buildCapabilities(mgModel, lsModel),
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
 * For each capability category we compare the Go model's BLENDED benchmark
 * score (modelgrep-primary, outlier-guarded — see blend.ts) against every
 * closed-source frontier candidate's blended score, finding the nearest
 * neighbor. A model is only claimed as a "replacement" when the gap is
 * within MIGRATION_BAND — so we never assert a match that isn't backed by
 * the live data. Hints are grouped by the frontier model they replace and
 * the categories they match on.
 *
 * Why blended scores and not raw llm-stats top_scores: the raw values are
 * quantized to tens (60, 70, 80) and sometimes on a broken scale (365.2,
 * 2.5, 17.0), which produced false "gap 0" claims like a budget flash model
 * claiming it replaces Claude Opus 5 on reasoning. The blend smooths and
 * guards those artifacts on BOTH sides, so the comparison is apples-to-apples.
 *
 * Closed-source Go models (e.g. grok-4.5, gpt-5.6-luna) are themselves
 * "replaced" targets, not open alternatives — they get no hints.
 */
/**
 * Compute "replaces" hints for one Go model.
 * Exported so the content-addressed models cache key (models.remote.ts)
 * covers it — editing the reason text must invalidate cached models.
 */
export function inferMigrationHints(
	lsModel: LlmStatsModel | null,
	openWeight: boolean,
	goBenchmarks: ModelBenchmarks,
	frontierCandidates: FrontierCandidate[]
): MigrationHint[] {
	// Only open-weight Go models can be "open alternatives" to closed models.
	if (!lsModel || !openWeight || frontierCandidates.length === 0) return [];

	const cats: { key: 'coding' | 'reasoning' | 'math'; label: string }[] = [
		{ key: 'coding', label: 'coding' },
		{ key: 'reasoning', label: 'reasoning' },
		{ key: 'math', label: 'math' }
	];

	// Group by the frontier model we'd replace, combining the categories it matches on.
	const byModel = new Map<string, { name: string; cats: string[]; worstGap: number }>();

	for (const { key, label } of cats) {
		const ours = goBenchmarks[key];
		if (ours == null) continue;

		let best: { name: string; gap: number } | null = null;
		for (const fm of frontierCandidates) {
			// Skip the Go model itself — a closed model served by the Go API
			// (e.g. grok-4.5) is also a frontier candidate, and comparing it to
			// itself would claim "replaces grok-4.5".
			if (fm.id === lsModel.id) continue;
			const theirs = fm.benchmarks[key];
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
		reason: `Comparable on ${e.cats.join(' & ')}`
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

/**
 * Triangulated open-weight inference — never a single source.
 *
 * llm-stats is the primary signal, but it mislabels individual variants.
 * Verified live (2026-09-10): `deepseek-v4-flash-vision-exp` reports
 * `open_weight: false` while every sibling DeepSeek model reports `true` —
 * and modelgrep carries an MIT license, 304.6B params and ~400k HuggingFace
 * downloads for the very same model. Trusting that lone boolean dropped it
 * into the drawer's "Closed-source model — no open replacement to compare
 * it against" branch and suppressed its migration hints.
 *
 * So open-weight is a UNION of corroborating evidence. A union can only ever
 * ADD an open-weight verdict, never remove llm-stats' — which matters because
 * modelgrep's evidence is incomplete in the other direction too: Llama 3.1 and
 * Gemma 2 are genuinely open-weight yet carry no license row there (6 of the
 * 151 overlapping catalog entries disagree, in both directions).
 */
function inferOpenWeight(
	goId: string,
	mgModel: ModelgrepModelData | null,
	lsModel: LlmStatsModel | null | undefined
): boolean {
	// No llm-stats counterpart → nothing to contradict. The Go API only serves
	// open alternatives in that case, so an unmatched model counts as open.
	if (!lsModel) return true;
	if (lsModel.open_weight) return true;
	if (hasOpenWeightEvidence(mgModel)) return true;
	return isOpenWeightFamily(goId);
}

/**
 * True when modelgrep carries CONCRETE open-weight evidence.
 *
 * The `open_weights` object is present on EVERY catalog entry — closed labs
 * simply get `{ params_b: null, license: null, hf_downloads: null }` — so the
 * object's existence proves nothing. Only a populated field does, which is
 * what distinguishes Anthropic/OpenAI entries from DeepSeek/Qwen ones.
 */
function hasOpenWeightEvidence(mgModel: ModelgrepModelData | null): boolean {
	const ow = mgModel?.open_weights;
	if (!ow) return false;
	return Boolean(ow.license || ow.params_b || ow.hf_downloads);
}

/**
 * Providers whose models are OPEN-WEIGHT FAMILIES — they publish their
 * weights publicly even when the API-served variant is flagged closed by
 * llm-stats. These still count as open alternatives for the Replaces
 * comparison. Provider-level on purpose: no per-model-ID hardcoding, so
 * new family members (qwen3.9, qwen4…) resolve automatically.
 *
 * Last resort only: prefer the concrete evidence in hasOpenWeightEvidence(),
 * which generalizes to every lab instead of naming vendors one at a time.
 */
const OPEN_WEIGHT_FAMILIES = ['qwen'];

function isOpenWeightFamily(goId: string): boolean {
	return OPEN_WEIGHT_FAMILIES.some((prefix) => goId.startsWith(prefix));
}

function inferContextWindow(goId: string): number {
	// No hardcoded model IDs — use a sensible default.
	// modelgrep data (context_length) takes priority in inferModel().
	return 128_000;
}
