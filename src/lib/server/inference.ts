/**
 * Inference engine orchestrator.
 * Glues together pricing, quota, burn, scoring, and tags
 * modules to produce an enriched GoModel from modelgrep and llm-stats data.
 */

import { burnRateFromPrice, isFreePricing, type BurnRate } from '$lib/burn';
import type {
	GoModel,
	ModelgrepModelData,
	MigrationHint,
	ModelPricing,
	ModelSpeed,
	LlmStatsModel,
	UsageLimits,
	FrontierCandidate,
	ModelBenchmarks,
	ModelQuota,
	BurnDetails
} from '$lib/types/models';
import type { ModelsDevEntry } from '$lib/server/models-dev';
import {
	extractCanonicalId,
	extractKnowledgeCutoff,
	extractMaxOutputTokens,
	extractModelsDevStatus,
	extractReasoningEfforts
} from '$lib/server/models-dev';
import { goEndpointType, goEndpointUrl, goIdToName } from './opencode-go';
import { inferPricing } from './pricing';
import { estimateQuota, DEFAULT_QUOTA_INPUTS } from './quota';
import { inferBurnDetails, type BurnScale, DEFAULT_BURN_SCALE } from './burn';
import { computeScenarioScores } from './scoring';
import { computeTags } from './tags';
import { blendBenchmarks } from './blend';
import { buildCapabilities } from '$lib/capabilities';
import { MIGRATION_BAND, MIGRATION_MAX_DEFICIT, MIGRATION_MAX_HINTS } from '$lib/migration';
import { isSameFrontierModel } from '$lib/frontier';

/** One plan tier's inputs: the scraped usage (if any) and the score anchors. */
export interface QuotaTierInput {
	usage: UsageLimits | null;
	scale: BurnScale;
}

/**
 * Per-plan quota context. `go` is mandatory (the default $10 plan); `plus` is
 * present only when the docs publishes a Go Plus usage table.
 */
export interface QuotaContext {
	go: QuotaTierInput;
	plus: QuotaTierInput | null;
}

export const DEFAULT_QUOTA_CONTEXT: QuotaContext = {
	go: { usage: null, scale: DEFAULT_BURN_SCALE },
	plus: null
};

interface QuotaAndBurn {
	quota: ModelQuota;
	burnDetails: BurnDetails;
	burnRate: BurnRate;
}

/** Build a model's quota + burn for ONE plan tier (usage wins over estimate). */
function quotaAndBurn(
	pricing: ModelPricing,
	usage: UsageLimits | null,
	scale: BurnScale
): QuotaAndBurn {
	const burnDetails = inferBurnDetails(pricing, usage, scale);
	const burnRate: BurnRate = isFreePricing(pricing)
		? 'free'
		: burnRateFromPrice((pricing.inputPricePerM ?? 0) + (pricing.outputPricePerM ?? 0));
	const estimated = estimateQuota(
		pricing,
		DEFAULT_QUOTA_INPUTS.inputTokens,
		DEFAULT_QUOTA_INPUTS.outputTokens,
		DEFAULT_QUOTA_INPUTS.cachedInputTokens
	);
	const quota: ModelQuota = usage
		? {
				requestsPer5h: usage.requestsPer5h,
				requestsPerWeek: usage.requestsPerWeek,
				requestsPerMonth: usage.requestsPerMonth,
				unlimited: usage.unlimited
			}
		: {
				requestsPer5h: estimated?.requestsPer5h ?? 0,
				requestsPerWeek: estimated?.requestsPerWeek ?? 0,
				requestsPerMonth: estimated?.requestsPerMonth ?? 0,
				unlimited: false
			};
	return { quota, burnDetails, burnRate };
}

/** Enrich a Go model ID with modelgrep data, llm-stats data, and optional docs pricing. */
export function inferModel(
	goId: string,
	mgModel: ModelgrepModelData | null,
	docsPricing?: Record<string, ModelPricing>,
	lsModel?: LlmStatsModel | null,
	frontierCandidates: FrontierCandidate[] = [],
	quota: QuotaContext = DEFAULT_QUOTA_CONTEXT,
	mdEntry: ModelsDevEntry | null = null
): GoModel {
	// Display name: models.dev publishes the real brand name ("GPT-5.6
	// Luna"); goIdToName() would render "Gpt 5.6 luna". Fall back to the
	// heuristic when models.dev is silent.
	const name = mdEntry?.name ?? (lsModel?.id === goId ? lsModel.name : goIdToName(goId));
	// Open-weight is authoritative from models.dev when present, otherwise
	// triangulated across the other sources — see inferOpenWeight().
	const openWeight = inferOpenWeight(goId, mgModel, lsModel, mdEntry?.open_weights);
	const pricing = inferPricing(goId, mgModel, docsPricing);
	// OpenCode's published usage-limit request counts are the ground truth for
	// how fast a model burns through the Go quota — prefer them over a
	// price-based estimate (which assumes generic token patterns and is
	// systematically off, e.g. Kimi K3 is ~12× slower-burning than it really is).
	// Computed per plan: Go (the default) and Go Plus, whose limits differ.
	const base = quotaAndBurn(pricing, quota.go.usage, quota.go.scale);
	const plus = quota.plus ? quotaAndBurn(pricing, quota.plus.usage, quota.plus.scale) : null;
	const burnDetails = base.burnDetails;
	const burnRate = base.burnRate;

	const { benchmarks, meta } = blendBenchmarks(mgModel, lsModel ?? null);
	benchmarks._meta = meta;

	const speed = extractModelgrepSpeed(mgModel);
	const tags = computeTags(benchmarks, burnDetails, speed, mgModel, lsModel);
	const migrationHints = inferMigrationHints(
		{
			id: goId,
			name,
			modelgrepId: mgModel?.id ?? null,
			llmStatsId: lsModel?.id ?? null
		},
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
		quota: base.quota,
		burnRate,
		burnDetails,
		plus: plus
			? {
					quota: plus.quota,
					burnDetails: plus.burnDetails,
					burnRate: plus.burnRate
				}
			: null,
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
		// models.dev enrichment (advisory); null means "models.dev has no
		// entry for this model".
		displayName: mdEntry?.name ?? null,
		maxOutputTokens: extractMaxOutputTokens(mdEntry),
		reasoningEfforts: extractReasoningEfforts(mdEntry),
		knowledgeCutoff: extractKnowledgeCutoff(mdEntry),
		canonicalId: extractCanonicalId(mdEntry),
		modelsDevStatus: extractModelsDevStatus(mdEntry),
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
 * A single matched category is not enough to call a model a replacement: a
 * budget flash model can land within the band on coding while being far off
 * on math and reasoning. Requiring two categories keeps the claim bounded to
 * "comparable on the metrics both sides publish".
 */
const MIN_MATCHING_CATEGORIES = 2;

/**
 * Data-driven "replaces" hints.
 *
 * For each closed-source candidate we compare its blended benchmarks
 * (modelgrep-primary, outlier-guarded — see blend.ts) against the Go model's,
 * category by category. A candidate must be within MIGRATION_BAND on at least
 * two categories and the Go model may not trail it by more than
 * MIGRATION_MAX_DEFICIT on either, so a single strong metric or a model that
 * is far stronger overall cannot claim a replacement.
 *
 * Candidates come from LLM Stats when it is available, plus the current
 * Zed Pro / Copilot Pro plan pages (see server/frontier.ts), so the hints no
 * longer disappear when the LLM Stats key is missing.
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
export interface MigrationSubject {
	/** Go model id (e.g. "hy3"). */
	id: string;
	/** Display name, used to exclude the same model under another source's spelling. */
	name: string;
	modelgrepId: string | null;
	llmStatsId: string | null;
}

/**
 * Compute "replaces" hints for one Go model.
 * Exported so the content-addressed models cache key (models.remote.ts)
 * covers it — editing the reason text must invalidate cached models.
 */
export function inferMigrationHints(
	subject: MigrationSubject,
	openWeight: boolean,
	goBenchmarks: ModelBenchmarks,
	frontierCandidates: FrontierCandidate[]
): MigrationHint[] {
	// Only open-weight Go models can be "open alternatives" to closed models.
	if (!openWeight || frontierCandidates.length === 0) return [];

	const categories: { key: 'coding' | 'reasoning' | 'math'; label: string }[] = [
		{ key: 'coding', label: 'coding' },
		{ key: 'reasoning', label: 'reasoning' },
		{ key: 'math', label: 'math' }
	];

	// Score every candidate independently. Picking the nearest candidate per
	// category would let one candidate own a category exclusively, which
	// makes a second "two-match" candidate impossible to surface.
	const hints: { name: string; cats: string[]; worstGap: number }[] = [];

	for (const fm of frontierCandidates) {
		// Skip the Go model itself. Plan candidates carry the modelgrep id,
		// LLM Stats candidates carry their own id, and the display name
		// catches the remaining spelling differences.
		if (isSameFrontierModel(fm, subject)) continue;

		const cats: string[] = [];
		let worstGap = 0;
		for (const { key, label } of categories) {
			const ours = goBenchmarks[key];
			const theirs = fm.benchmarks[key];
			if (ours == null || theirs == null) continue;
			const gap = Math.abs(ours - theirs);
			if (gap <= MIGRATION_BAND && ours >= theirs - MIGRATION_MAX_DEFICIT) {
				cats.push(label);
				worstGap = Math.max(worstGap, gap);
			}
		}

		if (cats.length >= MIN_MATCHING_CATEGORIES) {
			hints.push({ name: fm.name, cats, worstGap });
		}
	}

	return hints
		.sort((a, b) => b.cats.length - a.cats.length || a.worstGap - b.worstGap)
		.slice(0, MIGRATION_MAX_HINTS)
		.map((hint) => ({
			model: hint.name,
			reason: `Comparable on ${hint.cats.join(' & ')}`
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
	lsModel: LlmStatsModel | null | undefined,
	mdOpenWeight?: boolean
): boolean {
	// models.dev is FIRST-PARTY OpenCode data and is authoritative about
	// open weights. It wins over the triangulation below.
	//
	// This corrects a real error: the `qwen` family allowlist marks
	// qwen3.8-max, qwen3.8-flash and qwen3.7-plus as open, but models.dev
	// says all three are closed — which matters, because inferMigrationHints()
	// only offers "replaces" hints for open-weight models.
	if (mdOpenWeight !== undefined) return mdOpenWeight;

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

function inferContextWindow(_goId: string): number {
	// No hardcoded model IDs — use a sensible default.
	// modelgrep data (context_length) takes priority in inferModel().
	return 128_000;
}
