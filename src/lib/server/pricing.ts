import type { LLMStatsModel, LLMStatsRanking, ModelPricing } from '$lib/types/models';
import { getFallbackPricingMap } from './opencode-go';

export function inferPricing(
	goId: string,
	model: LLMStatsModel | null,
	codingRankings?: LLMStatsRanking[]
): ModelPricing {
	// 1. Try LLM Stats provider data first
	// available=null means "unknown", not "unavailable" — treat as usable
	if (model?.providers?.length) {
		const bestProvider = model.providers.find(
			(p) => p.available !== false && p.input_price_per_m != null
		);
		if (bestProvider) {
			return {
				inputPricePerM: bestProvider.input_price_per_m!,
				outputPricePerM: bestProvider.output_price_per_m ?? bestProvider.input_price_per_m! * 3,
				cachedReadPerM: null,
				source: 'llm-stats'
			};
		}
	}

	// 2. Try min_input_price from rankings (still API data, not hardcoded)
	if (codingRankings?.length) {
		const match = codingRankings.find(
			(r) =>
				r.model_id === goId ||
				(model &&
					(r.model_id === model.id || r.model_name.toLowerCase() === model.name.toLowerCase()))
		);
		if (match?.min_input_price != null) {
			return {
				inputPricePerM: match.min_input_price,
				outputPricePerM: match.min_input_price * 3,
				cachedReadPerM: null,
				source: 'llm-stats'
			};
		}
	}

	// 3. Fallback to known pricing from OpenCode docs
	const map = getFallbackPricingMap();
	const known = map[goId];
	if (known) {
		return { ...known };
	}

	// 4. No pricing available — return nulls
	return {
		inputPricePerM: null,
		outputPricePerM: null,
		cachedReadPerM: null,
		source: 'unknown'
	};
}
