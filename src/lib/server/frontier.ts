import { blendBenchmarks } from '$lib/server/blend';
import { frontierNameKey } from '$lib/frontier';
import type { FrontierCandidate, ModelgrepModelData } from '$lib/types/models';
import type { StaticPlan } from '$lib/stack/plans';

/**
 * Keyless frontier candidates from the plan pages
 * -----------------------------------------------
 * The "replaces" hints used to depend entirely on LLM Stats. That API now
 * requires a key, and a missing or rate-limited key left the frontier list
 * empty, so every open-weight Go model rendered dashes in the compare view.
 *
 * The current Zed Pro and Copilot Pro pages already enumerate the closed
 * models a Go user is choosing between, and modelgrep publishes their
 * blended benchmarks on the same scale as the Go models. Those two sources
 * are enough to build the candidate set with no key and no extra fetch.
 *
 * Candidates are deliberately restricted to closed-weight models: an open
 * model (e.g. Kimi K3 on Copilot) is a peer of the Go model, not a frontier
 * target.
 */

/** modelgrep reports open weights as an object whose fields are all null for closed models. */
export function isClosedWeight(model: ModelgrepModelData): boolean {
	const open = model.open_weights;
	return !open || (open.license == null && open.params_b == null && open.hf_downloads == null);
}

/**
 * Build frontier candidates from the hand-verified plan models.
 *
 * Each plan model resolves through its `modelgrepId`; a model with no
 * modelgrep row, no usable benchmark, or open-weight evidence is skipped.
 * Results are deduped by folded display name, because the same closed model
 * can appear on both plans.
 */
export function buildPlanFrontierCandidates(
	plans: StaticPlan[],
	byId: Map<string, ModelgrepModelData>
): FrontierCandidate[] {
	const seen = new Set<string>();
	const out: FrontierCandidate[] = [];

	for (const plan of plans) {
		for (const definition of plan.models) {
			if (!definition.modelgrepId) continue;
			const modelgrep = byId.get(definition.modelgrepId);
			if (!modelgrep || !isClosedWeight(modelgrep)) continue;

			const { benchmarks } = blendBenchmarks(modelgrep, null);
			if (benchmarks.coding == null && benchmarks.reasoning == null && benchmarks.math == null) {
				continue;
			}

			const key = frontierNameKey(definition.name);
			if (!key || seen.has(key)) continue;
			seen.add(key);

			out.push({
				id: modelgrep.id,
				name: definition.name,
				organization: { id: modelgrep.maker, name: definition.provider },
				releaseDate: null,
				benchmarks
			});
		}
	}

	return out;
}
