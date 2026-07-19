import type { ModelgrepModelData, ModelPricing } from '$lib/types/models';

/**
 * TEMPORARY: Hardcoded pricing for Go API models that have no pricing data
 * from the docs page or modelgrep. These models are still returned by the
 * Go API but haven't been published on the docs pricing page yet.
 *
 * Remove each entry once the model appears on https://opencode.ai/docs/go/
 * pricing table (the scraper in go-docs.ts will pick it up automatically).
 *
 * Last reviewed: 2026-07-17 — both mimo-v2-pro and mimo-v2-omni absent from docs.
 */
const TEMPORARY_FALLBACK: Record<string, ModelPricing> = {
	'mimo-v2-pro': {
		inputPricePerM: 1.0,
		outputPricePerM: 3.0,
		cachedReadPerM: null,
		source: 'go-api'
	},
	'mimo-v2-omni': {
		inputPricePerM: 0.4,
		outputPricePerM: 2.0,
		cachedReadPerM: null,
		source: 'go-api'
	}
};

/**
 * Infer pricing for a Go model.
 * Priority: 1) scraped Go docs pricing, 2) modelgrep/OpenRouter pricing,
 *           3) temporary fallback (documented above), 4) unknown.
 */
export function inferPricing(
	goId: string,
	modelgrepModel: ModelgrepModelData | null,
	docsPricing?: Record<string, ModelPricing>
): ModelPricing {
	// 1. Scraped from OpenCode Go docs page (source of truth for Go subscription pricing)
	if (docsPricing?.[goId]) {
		return { ...docsPricing[goId], source: 'go-docs' };
	}

	// 2. modelgrep / OpenRouter pricing (for comparison)
	if (modelgrepModel?.pricing) {
		return {
			inputPricePerM: modelgrepModel.pricing.input,
			outputPricePerM: modelgrepModel.pricing.output,
			cachedReadPerM: modelgrepModel.pricing.cache_read ?? null,
			source: 'modelgrep'
		};
	}

	// 3. TEMPORARY fallback for models in the Go API that aren't yet on the
	//    docs page or modelgrep. These are actively tracked — remove when
	//    the docs page starts listing them.
	if (TEMPORARY_FALLBACK[goId]) {
		return { ...TEMPORARY_FALLBACK[goId] };
	}

	// 4. No pricing available
	return {
		inputPricePerM: null,
		outputPricePerM: null,
		cachedReadPerM: null,
		source: 'unknown'
	};
}
