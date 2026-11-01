import type { FrontierCandidate } from '$lib/types/models';

/**
 * Frontier identity helpers (client-safe)
 * ---------------------------------------
 * A "replaces" hint compares a Go model against closed-source candidates that
 * may come from two sources: LLM Stats (recency-filtered) and the current Zed
 * Pro / Copilot Pro plan pages (modelgrep-enriched). The same model can appear
 * in both with different ids (`claude-opus-5` vs `anthropic/claude-opus-5.5`),
 * so matching is by folded display name, not by id string.
 */

/** Fold a display name to its identity key (`"Anthropic: Claude Opus 5.5"` → `claudeopus55`). */
export function frontierNameKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/^[^:]+:\s*/, '')
		.replace(/[^a-z0-9]/g, '');
}

/** The Go model being described, for self-match exclusion. */
export interface FrontierSubject {
	id: string;
	name: string;
	modelgrepId: string | null;
	llmStatsId: string | null;
}

/**
 * True when `candidate` is the same model as `subject` under another source's
 * id or spelling. Comparing a model to itself would claim "replaces itself".
 */
export function isSameFrontierModel(
	candidate: FrontierCandidate,
	subject: FrontierSubject
): boolean {
	if (subject.llmStatsId && candidate.id === subject.llmStatsId) return true;
	if (subject.modelgrepId && candidate.id === subject.modelgrepId) return true;
	const candidateKey = frontierNameKey(candidate.name);
	if (!candidateKey) return false;
	return (
		candidateKey === frontierNameKey(subject.name) || candidateKey === frontierNameKey(subject.id)
	);
}

/**
 * Merge candidate lists, keeping the first occurrence of each folded name.
 * LLM Stats candidates come first: when both sources carry a model, the
 * recency-filtered one with its release date wins over the plan-page copy.
 */
export function mergeFrontierCandidates(
	primary: FrontierCandidate[],
	fallback: FrontierCandidate[]
): FrontierCandidate[] {
	const seen = new Set<string>();
	const out: FrontierCandidate[] = [];
	for (const candidate of [...primary, ...fallback]) {
		const key = frontierNameKey(candidate.name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(candidate);
	}
	return out;
}
