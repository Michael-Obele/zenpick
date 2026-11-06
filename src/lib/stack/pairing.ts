import { benchmarkToPercent } from '$lib/compare-defaults';
import { costPerRequest } from '$lib/recommendation';
import { formatCompact } from '$lib/utils';
import { formatCost } from './format';
import { stackEconomics, type StackEconomics, type StackWorkload } from './logic';
import type { StackModel, StackPlan } from './plans';

/**
 * Agent-pair recommendation
 * -------------------------
 * The homepage `AgentStack` ranks every model on a plan. The compare route's
 * builder is narrower: it must only use the models already in the comparison,
 * because suggesting a model the user is not looking at (or cannot build the
 * pair with) is noise.
 *
 * Roles:
 *   - Main: plans, decides and edits the hard parts. It should be the stronger
 *     benchmark model in the pair.
 *   - Sub: implements, reviews and fixes. It should be materially cheaper per
 *     request while keeping enough quality to finish delegated work.
 *
 * Scoring balances quality, savings and quality retention. Warnings name the
 * cases where a pair is technically possible but a bad idea: a sub that costs
 * as much as the main, a sub that loses too much quality, a much smaller
 * context window, or a plan-specific price cliff.
 */

export interface PairVerdict {
	main: StackModel;
	sub: StackModel;
	/** Cost, savings and included-requests economics for this pair. */
	economics: StackEconomics;
	/**
	 * The basis this pair's "which is cheaper" verdicts were judged on. On
	 * OpenCode Go the docs request windows (`requestsPer12`) are the ground
	 * truth for how a model burns the allowance, so when both models carry burn
	 * data cost means "share of the $12 window one request consumes"
	 * (1/requestsPer12) — list price often disagrees. The dollar `economics`
	 * above keep describing the price no matter which basis won.
	 */
	costBasis: {
		usingBurn: boolean;
		/** Per-request relative cost: window share (1/requestsPer12) or dollars. */
		mainCost: number;
		subCost: number;
		/** Savings of this blended pair versus putting every request on `main`. */
		savingsPct: number;
	};
	/** Composite benchmark score (0-100), or intelligence when benchmarks are absent. */
	mainQuality: number | null;
	subQuality: number | null;
	/** Sub quality as a percentage of the main's; null when either is unknown. */
	retention: number | null;
	/** Ranking score, 0-100 (higher is better). */
	score: number;
	/** Positive, decision-relevant facts about the pair. */
	strengths: string[];
	/** "Bad idea" checks the user should read before committing. */
	warnings: string[];
}

/** Composite benchmark score across the fields every plan publishes. */
export function stackQuality(model: StackModel): number | null {
	const b = model.benchmarks;
	const values = [
		b?.coding,
		b?.reasoning,
		b?.math,
		benchmarkToPercent(b?.sweBenchVerified, 'sweBenchVerified')
	].filter((value): value is number => value != null && Number.isFinite(value));

	if (values.length) {
		return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
	}
	return model.intelligence;
}

function savingsLabel(pct: number): string {
	if (pct > 0) return `Saves ${pct}% versus keeping every request on the main agent.`;
	if (pct === 0) return 'Costs the same as keeping every request on the main agent.';
	return `Costs ${Math.abs(pct)}% more than keeping every request on the main agent.`;
}

/**
 * Per-request cost of one model in the pair's comparison basis: on Go, the
 * share of the docs' $12 request window one request consumes (the reciprocal
 * of `requestsPer12`, so HIGHER always means MORE expensive); the plan-priced
 * dollar cost otherwise. Note `burn.score` runs the other way — it is an
 * efficiency index where higher is better, so it is never used as a cost
 * directly. Only meaningful when BOTH pair members use the same basis, which
 * `evaluatePair` enforces by treating burn as available only for both.
 */
export function modelCostBasis(model: StackModel, w: StackWorkload): number | null {
	const per12 = model.burn?.requestsPer12;
	if (per12 != null && per12 > 0) return 1 / per12;
	return costPerRequest(model.pricing, w.tokens, w.cachedPct);
}

function qualityWarnings(
	main: StackModel,
	sub: StackModel,
	mainQuality: number | null,
	subQuality: number | null,
	retention: number | null
): string[] {
	const warnings: string[] = [];
	if (mainQuality == null && subQuality == null) {
		warnings.push('Neither model has benchmark data, so this pair is ranked on price alone.');
		return warnings;
	}
	if (mainQuality == null) warnings.push(`${main.name} has no benchmark score to anchor the pair.`);
	if (subQuality == null)
		warnings.push(`${sub.name} has no benchmark score to judge delegated work.`);
	if (mainQuality != null && subQuality != null && subQuality > mainQuality) {
		warnings.push(
			`${sub.name} scores ${subQuality.toFixed(1)} vs ${mainQuality.toFixed(1)} — swap the roles or use it as the main agent.`
		);
	} else if (retention != null && retention < 70) {
		warnings.push(
			`The sub keeps only ${Math.round(retention)}% of the main's benchmark score — keep planning and hard edits on the main agent.`
		);
	}
	return warnings;
}

function contextWarnings(main: StackModel, sub: StackModel): string[] {
	if (
		main.contextWindow == null ||
		sub.contextWindow == null ||
		sub.contextWindow >= main.contextWindow * 0.5
	) {
		return [];
	}
	return [
		`Sub context is ${formatCompact(sub.contextWindow)} vs ${formatCompact(
			main.contextWindow
		)} on the main — long-context work may not fit.`
	];
}

function costWarnings(
	main: StackModel,
	sub: StackModel,
	mainCost: number,
	subCost: number,
	usingBurn: boolean
): string[] {
	const warnings: string[] = [];
	if (subCost >= mainCost) {
		warnings.push(
			usingBurn
				? `${sub.name} does not burn the Go allowance slower than ${main.name} — this pair saves nothing.`
				: `${sub.name} is not cheaper than ${main.name} — this pair saves nothing.`
		);
	}
	// With burn data the docs request window already folds in the output rates,
	// so the per-token output comparison would re-litigate a measured number.
	if (
		!usingBurn &&
		sub.pricing.outputPricePerM != null &&
		main.pricing.outputPricePerM != null &&
		sub.pricing.outputPricePerM > main.pricing.outputPricePerM
	) {
		warnings.push(
			'Sub output tokens cost more than the main’s — long generations may erase the savings.'
		);
	}
	return warnings;
}

/** Plan-specific gotchas, prefixed so the role is obvious. */
function noteWarnings(main: StackModel, sub: StackModel): string[] {
	const warnings: string[] = [];
	if (main.note) warnings.push(`Main plan note: ${main.note}`);
	if (sub.note) warnings.push(`Sub plan note: ${sub.note}`);
	return warnings;
}

function strengthsFor(
	main: StackModel,
	sub: StackModel,
	economics: StackEconomics,
	mainCost: number,
	subCost: number,
	basisSavingsPct: number,
	mainQuality: number | null,
	subQuality: number | null,
	retention: number | null,
	usingBurn: boolean
): string[] {
	const strengths: string[] = [];

	if (mainQuality != null) {
		strengths.push(
			`${main.name} leads the pair on benchmarks (${mainQuality.toFixed(1)} composite).`
		);
	}
	if (subQuality != null) {
		const share = retention == null ? '' : ` — ${Math.round(retention)}% of the main`;
		strengths.push(`${sub.name} holds ${subQuality.toFixed(1)} composite${share}.`);
	}
	if (basisSavingsPct > 0) strengths.push(savingsLabel(basisSavingsPct));
	if (usingBurn) {
		const mainPer12 = main.burn?.requestsPer12;
		const subPer12 = sub.burn?.requestsPer12;
		if (mainPer12 != null && subPer12 != null && subPer12 > mainPer12 * 1.05) {
			strengths.push(
				`${sub.name} fits ${(subPer12 / mainPer12).toFixed(1)}× more requests into the same $12 window.`
			);
		} else if (subCost < mainCost) {
			strengths.push(`${sub.name} burns less of the Go allowance per request.`);
		}
	} else if (mainCost > 0 && subCost > 0) {
		const ratio = mainCost / subCost;
		if (ratio > 1.05) {
			strengths.push(`${sub.name} costs ${ratio.toFixed(1)}× less per request.`);
		}
	} else if (subCost === 0) {
		strengths.push(`${sub.name} is free at this plan's rates.`);
	}
	if (economics.requestsPerMonth != null) {
		strengths.push(
			`≈ ${economics.requestsPerMonth.toLocaleString()} requests/month fit inside the included allowance (${formatCost(economics.costPer100)} per 100).`
		);
	}

	return strengths;
}

/**
 * Score one ordered pair. Returns null when either model lacks a price or both
 * roles point at the same model — there is nothing to evaluate.
 */
export function evaluatePair(
	plan: StackPlan,
	main: StackModel,
	sub: StackModel,
	w: StackWorkload
): PairVerdict | null {
	if (main.id === sub.id) return null;

	const economics = stackEconomics(plan, main, sub, w);
	const mainPrice = costPerRequest(main.pricing, w.tokens, w.cachedPct);
	const subPrice = costPerRequest(sub.pricing, w.tokens, w.cachedPct);
	if (!economics || mainPrice == null || subPrice == null) return null;

	// Burn data is a one-sided record: comparing a burn figure against a price
	// would be nonsense, so burn wins the basis only when BOTH models carry it.
	// The cost is the window share one request consumes — 1/requestsPer12 —
	// taken straight from the docs' published request counts. (`burn.score` is
	// an efficiency index where HIGHER is better, so it is not a cost.)
	const mainPer12 = main.burn?.requestsPer12 ?? null;
	const subPer12 = sub.burn?.requestsPer12 ?? null;
	const usingBurn = mainPer12 != null && mainPer12 > 0 && subPer12 != null && subPer12 > 0;
	const mainCost = usingBurn ? 1 / mainPer12 : mainPrice;
	const subCost = usingBurn ? 1 / subPer12 : subPrice;

	const mainQuality = stackQuality(main);
	const subQuality = stackQuality(sub);
	const retention =
		mainQuality != null && mainQuality > 0 && subQuality != null
			? Math.round((subQuality / mainQuality) * 1000) / 10
			: null;

	const qualityScore = mainQuality ?? 0;

	const share = Math.min(100, Math.max(0, w.subShare)) / 100;
	const blendedBasis = (1 - share) * mainCost + share * subCost;
	const basisSavingsPct = mainCost === 0 ? 0 : Math.round((1 - blendedBasis / mainCost) * 100);
	const savingsScore = Math.max(0, Math.min(100, basisSavingsPct));
	const retentionScore = retention == null ? 40 : Math.max(0, Math.min(100, retention));

	let score = qualityScore * 0.45 + savingsScore * 0.35 + retentionScore * 0.2;
	if (subCost >= mainCost) score -= 20;
	if (retention != null && retention < 60) score -= 10;

	const warnings = [
		...qualityWarnings(main, sub, mainQuality, subQuality, retention),
		...costWarnings(main, sub, mainCost, subCost, usingBurn),
		...contextWarnings(main, sub),
		...noteWarnings(main, sub)
	];

	return {
		main,
		sub,
		economics,
		costBasis: {
			usingBurn,
			mainCost,
			subCost,
			savingsPct: basisSavingsPct
		},
		mainQuality,
		subQuality,
		retention,
		score: Math.max(0, Math.round(score * 10) / 10),
		strengths: strengthsFor(
			main,
			sub,
			economics,
			mainCost,
			subCost,
			basisSavingsPct,
			mainQuality,
			subQuality,
			retention,
			usingBurn
		),
		warnings
	};
}

/**
 * The best pair available in a selected model set.
 *
 * A pair with a cheaper sub always beats one with no savings. If every possible
 * sub costs at least as much as its main, the highest-scoring pair is returned
 * with a warning — "there is no cheaper sub in this comparison" is a useful
 * answer, not a reason to invent a model.
 */
export function suggestPair(
	models: StackModel[],
	plan: StackPlan,
	w: StackWorkload
): PairVerdict | null {
	if (models.length < 2) return null;

	const verdicts: PairVerdict[] = [];
	for (const main of models) {
		for (const sub of models) {
			if (main.id === sub.id) continue;
			const verdict = evaluatePair(plan, main, sub, w);
			if (verdict) verdicts.push(verdict);
		}
	}
	if (!verdicts.length) return null;

	// A sub should not out-score its main: that is a role swap, not a pair.
	// Keep the sensible pairs when any exist, and fall back to all of them so a
	// user who selected only inverted roles still gets an honest verdict.
	const sensible = verdicts.filter(
		(v) => v.mainQuality == null || v.subQuality == null || v.subQuality <= v.mainQuality
	);
	const base = sensible.length ? sensible : verdicts;

	const cheaper = base.filter((verdict) => verdict.costBasis.savingsPct > 0);
	const pool = cheaper.length ? cheaper : base;
	pool.sort(
		(a, b) =>
			b.score - a.score ||
			a.economics.costPer100 - b.economics.costPer100 ||
			a.main.name.localeCompare(b.main.name)
	);

	const best = pool[0];
	if (!cheaper.length) {
		best.warnings.unshift(
			'No cheaper sub-agent in this comparison — every possible sub costs at least as much as its main.'
		);
		const cheapest = [...models].sort(
			(a, b) => (modelCostBasis(a, w) ?? Infinity) - (modelCostBasis(b, w) ?? Infinity)
		);
		if (cheapest[0]?.id === best.main.id) {
			best.warnings.unshift(
				`${best.main.name} is also the cheapest model here — a sub adds cost without adding quality. Using it alone is the better move.`
			);
		}
	}
	return best;
}
