/**
 * Model capability vocabulary, normalization, and description.
 *
 * Owns the single answer to "what can this model take in, and what can it put
 * out?". The token set is CLOSED — verified against the live catalogs of BOTH
 * upstream sources:
 *
 *   modelgrep  input  {text, image, file, video, audio}   (341 models)
 *              output {text, image, audio}
 *   llm-stats  the same set minus `file`
 *
 * Because the vocabulary is closed there are no aliases to translate, and any
 * unrecognized token is dropped rather than guessed at.
 *
 * Deliberately component-free: the server-side enrichment pipeline
 * (`inference.ts`) imports this module, so pulling Lucide icons in here would
 * drag Svelte components into the server bundle. Icon mapping lives in the
 * rendering component (`CapabilityBadges.svelte`) instead.
 */

import type {
	InputModality,
	LlmStatsModel,
	ModelCapabilities,
	ModelgrepModelData,
	OutputModality
} from '$lib/types/models';

/**
 * Display order, chosen for scanning rather than for matching the sources'
 * (inconsistent) order: the universal input first, then visual media, then
 * audio, with documents last.
 */
const INPUT_ORDER: readonly InputModality[] = ['text', 'image', 'video', 'audio', 'file'];
const OUTPUT_ORDER: readonly OutputModality[] = ['text', 'image', 'audio'];

/** Plural noun shown on a modality chip. */
export const MODALITY_LABEL: Record<InputModality, string> = {
	text: 'Text',
	image: 'Images',
	video: 'Video',
	audio: 'Audio',
	file: 'Docs'
};

/** One-line explanation, used in the drawer and as the chip's tooltip. */
export const MODALITY_HINT: Record<InputModality, string> = {
	text: 'Text prompts',
	image: 'Screenshots, photos and diagrams',
	video: 'Screen recordings and clips',
	audio: 'Speech and sound clips',
	file: 'PDFs and documents'
};

/** Feature flags a model may support, in display order. */
export type CapabilityFeature = 'tools' | 'structured' | 'reasoning';

export const FEATURE_ORDER: readonly CapabilityFeature[] = ['tools', 'structured', 'reasoning'];

export const FEATURE_LABEL: Record<CapabilityFeature, string> = {
	tools: 'Tools',
	structured: 'Structured',
	reasoning: 'Reasoning'
};

export const FEATURE_HINT: Record<CapabilityFeature, string> = {
	tools: 'Function calling and agent tool use',
	structured: 'Schema-constrained JSON output',
	reasoning: 'Extended thinking before answering'
};

/**
 * Search synonyms so the table's text filter finds models by what they can do
 * ("vision", "pdf", "function calling") and not just by what they are called.
 * Keyed by modality/feature so the terms stay next to the thing they describe.
 */
const SEARCH_TERMS: Record<InputModality | CapabilityFeature, string[]> = {
	text: ['text'],
	image: ['image', 'images', 'vision', 'visual', 'screenshot', 'multimodal'],
	video: ['video', 'videos'],
	audio: ['audio', 'speech', 'voice', 'sound'],
	file: ['file', 'files', 'docs', 'document', 'documents', 'pdf'],
	tools: ['tools', 'tool', 'function calling', 'function-calling', 'agents'],
	structured: ['structured', 'json', 'schema'],
	reasoning: ['reasoning', 'reason', 'thinking']
};

/** Filter a raw token list down to the known modalities, deduped and ordered. */
function normalize<T extends string>(
	raw: readonly string[] | null | undefined,
	order: readonly T[]
): T[] {
	if (!raw?.length) return [];
	const seen = new Set(raw.map((t) => t.toLowerCase()));
	return order.filter((m) => seen.has(m));
}

/** Fold a modelgrep boolean flag into a modality list (dedup happens in normalize). */
function withFlag(list: readonly string[], flag: boolean | undefined, token: string): string[] {
	return flag ? [...list, token] : [...list];
}

/**
 * Accepted input modalities: modelgrep's list — or llm-stats' when modelgrep
 * has no entry — with modelgrep's boolean flags folded in, so `input` is the
 * one canonical list and every derived boolean necessarily agrees with the
 * chips we render. (Flag and list were verified consistent across the Go
 * catalog; folding them in also covers the case where llm-stats is the only
 * modality source, which never reports `file`.)
 */
function resolveInputs(
	mgModel: ModelgrepModelData | null,
	lsModel: LlmStatsModel | null | undefined
): InputModality[] {
	const flags = mgModel?.capabilities;
	const listed = mgModel?.modality?.input?.length
		? mgModel.modality.input
		: (lsModel?.modalities ?? []);
	return normalize(
		withFlag(withFlag(listed, flags?.vision, 'image'), flags?.audio_in, 'audio'),
		INPUT_ORDER
	);
}

/** Produced output modalities, with the `image_out` flag folded in. */
function resolveOutputs(mgModel: ModelgrepModelData | null): OutputModality[] {
	const listed = mgModel?.modality?.output ?? [];
	return normalize(withFlag(listed, mgModel?.capabilities?.image_out, 'image'), OUTPUT_ORDER);
}

/**
 * Resolve a model's capabilities from modelgrep (primary) and llm-stats
 * (fallback), or null when neither source knows what the model takes in or
 * puts out — we report "unknown" rather than claiming it cannot do things we
 * simply have no data for.
 *
 * modelgrep leads because it is the only source that publishes the FEATURE
 * flags — llm-stats carries just a modality list, so a Go model with no
 * modelgrep counterpart still gets its modalities but reports no tool /
 * structured / reasoning support rather than a guess.
 */
export function buildCapabilities(
	mgModel: ModelgrepModelData | null,
	lsModel: LlmStatsModel | null | undefined
): ModelCapabilities | null {
	const input = resolveInputs(mgModel, lsModel);
	const output = resolveOutputs(mgModel);
	if (!input.length && !output.length) return null;

	const flags = mgModel?.capabilities;
	return {
		input,
		output,
		vision: input.includes('image'),
		tools: Boolean(flags?.tools),
		structured: Boolean(flags?.structured),
		reasoning: Boolean(flags?.reasoning)
	};
}

/** The features a model actually supports (empty when it supports none). */
export function supportedFeatures(caps: ModelCapabilities | null): CapabilityFeature[] {
	if (!caps) return [];
	return FEATURE_ORDER.filter((f) => caps[f]);
}

/**
 * Lowercase terms for the table's text filter — modality words plus their
 * synonyms (see SEARCH_TERMS). Empty for models with unknown capabilities.
 */
export function capabilitySearchTerms(caps: ModelCapabilities | null): string[] {
	if (!caps) return [];
	return [
		...caps.input.flatMap((m) => SEARCH_TERMS[m]),
		...supportedFeatures(caps).flatMap((f) => SEARCH_TERMS[f])
	];
}
