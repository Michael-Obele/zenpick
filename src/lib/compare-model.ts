import type { CompareEntry } from '$lib/compare-selection';
import type { PlanId, StackModel, StackPricing } from '$lib/stack/plans';
import { burnFor } from '$lib/plan';
import type { PlanTier } from '$lib/types/models';
import type {
	GoModel,
	ModelBenchmarks,
	ModelCapabilities,
	ModelSpeed,
	ModelTag
} from '$lib/types/models';

/**
 * Plan-agnostic comparison column
 * ------------------------------
 * `ModelCompare` used to take `GoModel[]`, which forced the compare page to
 * fall back to a second, thinner table whenever a Zed Pro or Copilot Pro model
 * was selected. This view model flattens one `CompareEntry` (catalog row +
 * plan offer) into everything the full grid needs, so every plan renders the
 * same table.
 *
 * Go-only facts stay behind the nullable `go` field: burn, quota, scenario fit,
 * tags and migration hints are read from it, and a plan row simply renders a
 * dash for those rows. The shared facts — benchmarks, pricing, context,
 * capabilities and open-weight evidence — are resolved at the top level so the
 * static-plan builder can fill them from modelgrep/llm-stats too.
 */
export interface CompareModel {
	/** Stable `plan:id` key; the grid keys its columns on this. */
	key: string;
	plan: PlanId;
	/** Plan-local model id (links, prompt, copy). */
	id: string;
	name: string;
	provider: string;
	description: string | null;
	/** Plan-specific gotcha (e.g. Copilot's long-context price jump). */
	note: string | null;
	modelgrepId: string | null;
	/** llm-stats slug for the side-by-side URL and the single-model link. */
	llmStatsId: string | null;
	pricing: StackPricing;
	contextWindow: number | null;
	/** Plan's included monthly token budget (Go $60, Zed $5, Copilot $15). */
	includedUsd?: number | null;
	/** Plan's monthly subscription price. */
	monthlyPriceUsd?: number | null;
	benchmarks: ModelBenchmarks;
	capabilities: ModelCapabilities | null;
	/** True/false when a source proves it; null when no source can tell. */
	openWeight: boolean | null;
	speed: ModelSpeed | null;
	tags: ModelTag[];
	/** The Go record for Go rows; null for Zed Pro / Copilot Pro rows. */
	go: GoModel | null;
}

/** Benchmark-shaped zero value, so the grid can read fields without null guards. */
export const EMPTY_BENCHMARKS: ModelBenchmarks = {
	coding: null,
	reasoning: null,
	math: null,
	sweBenchVerified: null,
	designElo: null,
	codeArena: null,
	allScores: {}
};

/** First value that is neither null nor undefined. */
function firstDefined<T>(...values: (T | null | undefined)[]): T | null {
	for (const value of values) {
		if (value != null) return value;
	}
	return null;
}

/** Flatten one resolved compare entry into a full-grid column. */
export function toCompareModel(entry: CompareEntry): CompareModel {
	const { row, plan } = entry;
	const go = row.go;

	return {
		key: entry.key,
		plan: plan.plan,
		id: plan.id,
		name: row.name,
		provider: row.provider,
		description: row.description,
		note: plan.note ?? null,
		modelgrepId: firstDefined(plan.modelgrepId, row.modelgrepId),
		llmStatsId: firstDefined(go?.llmStatsId, row.llmStatsId),
		pricing: plan.pricing,
		contextWindow: row.contextWindow,
		includedUsd: plan.includedUsd ?? null,
		monthlyPriceUsd: plan.monthlyPriceUsd ?? null,
		benchmarks: firstDefined(row.benchmarks, go?.benchmarks) ?? EMPTY_BENCHMARKS,
		capabilities: firstDefined(go?.capabilities, row.capabilities),
		openWeight: firstDefined(go?.openWeight, row.openWeight),
		speed: firstDefined(go?.speed, row.speed),
		tags: firstDefined(go?.tags, row.tags) ?? [],
		go
	};
}

/** Flatten an ordered selection; keeps URL order and plan identity. */
export function toCompareModels(entries: CompareEntry[]): CompareModel[] {
	return entries.map(toCompareModel);
}

/**
 * Project a compare column back to the plan-local model shape the stack tools
 * (`resolveStack`, `stackEconomics`, the pair builder) already speak. Pricing
 * is the plan's own rate, so the economics stay plan-correct, and Go burn
 * details ride along (resolved for the selected plan tier) so pair cost
 * judgements can use the docs request windows instead of list price.
 */
export function toStackModel(m: CompareModel, tier: PlanTier = 'go'): StackModel {
	return {
		id: m.id,
		name: m.name,
		provider: m.provider,
		pricing: m.pricing,
		contextWindow: m.contextWindow,
		intelligence: m.benchmarks.reasoning,
		coding: m.benchmarks.coding,
		note: m.note ?? undefined,
		description: m.description ?? undefined,
		modelgrepId: m.modelgrepId,
		benchmarks: m.benchmarks,
		capabilities: m.capabilities,
		openWeight: m.openWeight,
		speed: m.speed,
		tags: m.tags,
		llmStatsId: m.llmStatsId,
		burn: m.go ? burnFor(m.go, tier) : null
	};
}
