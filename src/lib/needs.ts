/**
 * Browse-by-need rankings — the modelgrep.com /best/{collection} pattern,
 * computed locally from enriched GoModel data.
 *
 * Why local and not the /api/v1/rankings endpoint: the enrichment pipeline
 * already fuzzy-matches the full modelgrep catalog into every GoModel
 * (benchmarks, pricing, context, capabilities). Ranking is a pure function
 * of that data — zero extra requests, zero rate-limit pressure, and always
 * consistent with what the table shows. The same collections modelgrep
 * serves (coding, design, smartest, ...) are ranked *only among the models
 * OpenCode Go actually serves*.
 *
 * Only collections with live data are included: modelgrep's `fastest`,
 * `lowest-latency`, `agents` and `small` rankings are empty today (the
 * underlying throughput/latency/agentic metrics are null for every model),
 * and no opencode model is free — so those needs would show dead leaderboards.
 */

import type { Component } from 'svelte';
import Brain from '@lucide/svelte/icons/brain';
import Code from '@lucide/svelte/icons/code';
import Palette from '@lucide/svelte/icons/palette';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import Eye from '@lucide/svelte/icons/eye';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import PiggyBank from '@lucide/svelte/icons/piggy-bank';
import Github from '$lib/assets/github.svelte';
import type { GoModel } from '$lib/types/models';

/** One model's position in a need's ranking. */
export interface RankedEntry {
	model: GoModel;
	/** Metric value — always present; models without data are excluded. */
	value: number;
	/** Scenario fit score (0-100) when the ranking is fit-weighted, else null. */
	fit: number | null;
	/**
	 * The score the ranking is ordered by: the raw metric in pure mode, or
	 * `normalized metric × (fit/100)` when a task weights the need.
	 */
	composite: number;
	rank: number;
}

/** How to phrase the answer sentence for a need. */
export type AnswerStyle = 'score' | 'price' | 'context';

export interface NeedSpec {
	/** Stable id, also used as the key for the icon map. */
	slug: string;
	/** Leaderboard heading, e.g. "Best Go models for Design & Frontend". */
	title: string;
	/** Grid card heading, e.g. "Design & Frontend". */
	cardTitle: string;
	/** Grid card blurb. */
	description: string;
	icon: Component;
	/** Icon / metric value text color (Tailwind class). */
	accent: string;
	/** Icon bubble background (Tailwind class). */
	bg: string;
	/** Metric bar fill color (Tailwind class). */
	bar: string;
	/** What the metric measures, e.g. "Design Arena Elo". */
	metricLabel: string;
	/** Format a metric value for display. */
	format: (value: number) => string;
	/** Pull the metric out of an enriched model (null = no data). */
	extract: (model: GoModel) => number | null;
	/** Sort direction; ascending for metrics where lower is better. */
	direction: 'asc' | 'desc';
	/** Narrow the pool before ranking (e.g. vision-capable only). */
	filter?: (model: GoModel) => boolean;
	/** Bar scale: linear fills toward the top value; inverse fills toward the best (cheapest). */
	barScale: 'linear' | 'inverse';
	answerStyle: AnswerStyle;
	/** Natural-language task phrase used in the answer sentence. */
	answerPhrase: string;
	/**
	 * Scenario value this need duplicates (e.g. the Coding need and the
	 * Coding scenario measure the same thing). Selecting one clears the
	 * other so the two filter rows can't double-apply the same dimension.
	 */
	scenarioAlias?: string;
}

// ─── Metric extractors ────────────────────────────────────────────────

/** Blended AA Intelligence Index (modelgrep primary, llm-stats fallback). */
const intelligence = (m: GoModel) => m.benchmarks.reasoning;

const coding = (m: GoModel) => m.benchmarks.coding;
const designElo = (m: GoModel) => m.benchmarks.designElo;
const context = (m: GoModel) => m.contextWindow;
const inputPrice = (m: GoModel) => m.pricing.inputPricePerM;

// ─── Formatters ───────────────────────────────────────────────────────

const fmtIndex = (v: number) => v.toFixed(1);
const fmtElo = (v: number) => String(Math.round(v));

const compactFormat = new Intl.NumberFormat('en', {
	notation: 'compact',
	maximumFractionDigits: 2
});
const fmtContext = (v: number) => compactFormat.format(v);
const fmtPrice = (v: number) => `$${v.toFixed(2)}`;

/**
 * The "Browse by need" registry. Ordered by prominence: coding and design
 * first — the two collections zenpick is built to answer.
 */
export const NEEDS: NeedSpec[] = [
	{
		slug: 'coding',
		title: 'Best Go models for Coding',
		cardTitle: 'Coding',
		description: 'Best at real software tasks',
		icon: Code,
		accent: 'text-sky-500',
		bg: 'bg-sky-500/10',
		bar: 'bg-sky-500',
		metricLabel: 'Coding Index',
		format: fmtIndex,
		extract: coding,
		direction: 'desc',
		barScale: 'linear',
		answerStyle: 'score',
		answerPhrase: 'coding',
		scenarioAlias: 'coding'
	},
	{
		slug: 'design',
		title: 'Best Go models for Design & Frontend',
		cardTitle: 'Design & Frontend',
		description: 'Best UI & frontend output',
		icon: Palette,
		accent: 'text-fuchsia-500',
		bg: 'bg-fuchsia-500/10',
		bar: 'bg-fuchsia-500',
		metricLabel: 'Design Arena Elo',
		format: fmtElo,
		extract: designElo,
		direction: 'desc',
		barScale: 'linear',
		answerStyle: 'score',
		answerPhrase: 'design & frontend work',
		scenarioAlias: 'frontend'
	},
	{
		slug: 'smartest',
		title: 'Best Go models for Intelligence',
		cardTitle: 'Smartest',
		description: 'Highest intelligence index',
		icon: Brain,
		accent: 'text-violet-500',
		bg: 'bg-violet-500/10',
		bar: 'bg-violet-500',
		metricLabel: 'Intelligence Index',
		format: fmtIndex,
		extract: intelligence,
		direction: 'desc',
		barScale: 'linear',
		answerStyle: 'score',
		answerPhrase: 'general intelligence'
	},
	{
		slug: 'reasoning',
		title: 'Best Go models for Reasoning',
		cardTitle: 'Reasoning',
		description: 'Deepest step-by-step thinking',
		icon: Lightbulb,
		accent: 'text-amber-500',
		bg: 'bg-amber-500/10',
		bar: 'bg-amber-500',
		metricLabel: 'Intelligence Index',
		format: fmtIndex,
		extract: intelligence,
		direction: 'desc',
		filter: (m) => m.capabilities?.reasoning === true,
		barScale: 'linear',
		answerStyle: 'score',
		answerPhrase: 'step-by-step reasoning'
	},
	{
		slug: 'vision',
		title: 'Best Go models for Vision',
		cardTitle: 'Vision',
		description: 'Reads images & documents',
		icon: Eye,
		accent: 'text-emerald-500',
		bg: 'bg-emerald-500/10',
		bar: 'bg-emerald-500',
		metricLabel: 'Intelligence Index',
		format: fmtIndex,
		extract: intelligence,
		direction: 'desc',
		filter: (m) => m.capabilities?.vision === true,
		barScale: 'linear',
		answerStyle: 'score',
		answerPhrase: 'vision & document understanding'
	},
	{
		slug: 'open-source',
		title: 'Best Open-Source Go models',
		cardTitle: 'Open Source',
		description: 'Self-hostable open weights',
		icon: Github,
		accent: 'text-slate-500',
		bg: 'bg-slate-500/10',
		bar: 'bg-slate-500',
		metricLabel: 'Intelligence Index',
		format: fmtIndex,
		extract: intelligence,
		direction: 'desc',
		filter: (m) => m.openWeight,
		barScale: 'linear',
		answerStyle: 'score',
		answerPhrase: 'self-hosted deployment'
	},
	{
		slug: 'long-context',
		title: 'Best Go models for Long Context',
		cardTitle: 'Long Context',
		description: 'Largest context window',
		icon: ScrollText,
		accent: 'text-teal-500',
		bg: 'bg-teal-500/10',
		bar: 'bg-teal-500',
		metricLabel: 'Context Window',
		format: fmtContext,
		extract: context,
		direction: 'desc',
		barScale: 'linear',
		answerStyle: 'context',
		answerPhrase: 'long-context work'
	},
	{
		slug: 'cheapest',
		title: 'Cheapest Go models',
		cardTitle: 'Cheapest',
		description: 'Lowest price per token',
		icon: PiggyBank,
		accent: 'text-lime-600',
		bg: 'bg-lime-600/10',
		bar: 'bg-lime-500',
		metricLabel: 'Input Price / 1M',
		format: fmtPrice,
		extract: inputPrice,
		direction: 'asc',
		barScale: 'inverse',
		answerStyle: 'price',
		answerPhrase: 'budget work'
	}
];

export function findNeed(slug: string): NeedSpec | null {
	return NEEDS.find((n) => n.slug === slug) ?? null;
}

/**
 * Rank models for a need, best first. Models without metric data are
 * excluded — a leaderboard only lists models that can be scored.
 *
 * Pass `opts.fitOf` to weight the ranking by a task's fit score — the
 * "Task × Need" blend. The composite is `normalized metric × fit`, so a
 * model ranks high only when it is strong on BOTH axes. Picking Long
 * Context + Coding fit demotes a context king with weak coding (e.g.
 * mimo-v2.5-pro at 60.2 Coding vs deepseek-v4-flash at 69.1) below
 * models with comparable context and stronger coding — the two controls
 * jointly determine the output.
 *
 * Ties are SHARED, competition-style: every model that matches the
 * leader's score ranks #1 (1, 1, 1, 4, …). The tie key is what the user
 * sees — the displayed metric in pure mode (two models both showing
 * "1.05M" or "$0.14" share the top spot), the composite score in
 * blended mode. Secondary signals (fit, intelligence, name) only keep
 * the display order deterministic; they never split a tie into ranks.
 */
export function rankNeed(
	spec: NeedSpec,
	models: GoModel[],
	opts?: { fitOf?: (model: GoModel) => number | null }
): RankedEntry[] {
	const pool = spec.filter ? models.filter(spec.filter) : models;
	const blended = opts?.fitOf != null;
	const scored = pool
		.map((model) => ({
			model,
			value: spec.extract(model),
			fit: blended ? opts.fitOf!(model) : null
		}))
		.filter((e): e is { model: GoModel; value: number; fit: number | null } => e.value != null);
	if (scored.length === 0) return [];

	const maxValue = Math.max(...scored.map((e) => e.value));
	const ranked = scored.map((e) => ({
		...e,
		composite: blended
			? normalized(e.value, maxValue, spec.direction) * ((e.fit ?? 100) / 100)
			: e.value,
		display: spec.format(e.value)
	}));

	ranked.sort((a, b) => {
		if (blended) {
			if (b.composite !== a.composite) return b.composite - a.composite;
			const fa = a.fit ?? -1;
			const fb = b.fit ?? -1;
			if (fb !== fa) return fb - fa;
		} else {
			const cmp = spec.direction === 'asc' ? a.value - b.value : b.value - a.value;
			if (cmp !== 0) return cmp;
		}
		// Display-order tie-breaks: intelligence, then alphabetical. These
		// stabilize the list — they never split a tie into distinct ranks.
		const ia = a.model.benchmarks.reasoning ?? -1;
		const ib = b.model.benchmarks.reasoning ?? -1;
		if (ib !== ia) return ib - ia;
		return a.model.name.localeCompare(b.model.name);
	});

	// Competition-style shared ranks: models that tie on the primary
	// score (the displayed metric in pure mode, the composite in blended
	// mode) all receive the same rank; the next group starts after the
	// tie — 1, 1, 1, 4, 5, …
	let prevRank = 0;
	return ranked.map((e, i) => {
		const prev = i > 0 ? ranked[i - 1] : null;
		const tied =
			prev != null && (blended ? e.composite === prev.composite : e.display === prev.display);
		prevRank = tied ? prevRank : i + 1;
		return {
			model: e.model,
			value: e.value,
			fit: e.fit,
			composite: e.composite,
			rank: prevRank
		};
	});
}

/** Normalize a metric to 0..1; ascending metrics invert so "best" is always 1. */
function normalized(value: number, max: number, direction: 'asc' | 'desc'): number {
	if (max <= 0) return 1;
	return direction === 'asc' ? 1 - value / max : value / max;
}

/** The #1 pick for a need (null when no opencode model has data). */
export function topPick(spec: NeedSpec, models: GoModel[]): RankedEntry | null {
	return rankNeed(spec, models)[0] ?? null;
}

/**
 * Answer-first sentence in zenpick's voice, mirroring modelgrep's /best
 * pages: "Kimi K3 is the best Go model for design & frontend work — 1456
 * Design Arena Elo. GLM 5.2 (1366) and Kimi K2.6 (1331) round out the top
 * three."
 *
 * Pass `opts.weightLabel` (e.g. "Coding") when the ranking is fit-weighted
 * so the answer states the blend: "… weighted by Coding fit — 1.05M
 * tokens (fit 62)." When several models share the #1 rank, the sentence
 * names the tied leaders: "… are tied for the largest context window…".
 */
export function needAnswer(
	spec: NeedSpec,
	entries: RankedEntry[],
	opts?: { weightLabel?: string }
): string {
	if (entries.length === 0) {
		return `No opencode model has ${spec.metricLabel.toLowerCase()} data yet.`;
	}
	const w = opts?.weightLabel;
	const weight = w ? `, weighted by ${w} fit` : '';
	const top = entries[0];
	const topValue = spec.format(top.value);

	// Shared top spot: several models tie for #1 — name them all.
	const leaders = entries.filter((e) => e.rank === 1);
	if (leaders.length > 1) {
		const names = leaders.map((e) => e.model.name);
		const list =
			names.length === 2
				? `${names[0]} and ${names[1]}`
				: names.length === 3
					? `${names[0]}, ${names[1]}, and ${names[2]}`
					: `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`;
		switch (spec.answerStyle) {
			case 'price':
				return `${list} are tied as the cheapest opencode models at ${topValue} per million input tokens${weight}.`;
			case 'context':
				return `${list} are tied for the largest context window at ${topValue} tokens${weight}.`;
			default:
				return `${list} are tied as the best opencode models for ${spec.answerPhrase} — ${topValue} ${spec.metricLabel}${weight}.`;
		}
	}

	const note = (e: RankedEntry) =>
		`(${spec.format(e.value)}${e.fit != null ? `, fit ${e.fit}` : ''})`;

	switch (spec.answerStyle) {
		case 'price':
			return w
				? `${top.model.name} is the cheapest opencode model at ${topValue} per million input tokens, weighted by ${w} fit${top.fit != null ? ` (fit ${top.fit})` : ''}.`
				: `${top.model.name} is the cheapest opencode model at ${topValue} per million input tokens.`;
		case 'context':
			return w
				? `${top.model.name} leads long-context work weighted by ${w} fit — ${topValue} tokens${top.fit != null ? ` (fit ${top.fit})` : ''}.`
				: `${top.model.name} has the largest context window at ${topValue} tokens.`;
		default: {
			let sentence = w
				? `${top.model.name} is the best opencode model for ${spec.answerPhrase}, weighted by ${w} fit — ${topValue} ${spec.metricLabel}${top.fit != null ? ` (fit ${top.fit})` : ''}.`
				: `${top.model.name} is the best opencode model for ${spec.answerPhrase} — ${topValue} ${spec.metricLabel}.`;
			const second = entries[1];
			const third = entries[2];
			if (second && third) {
				sentence += ` ${second.model.name} ${note(second)} and ${third.model.name} ${note(third)} round out the top three.`;
			} else if (second) {
				sentence += ` ${second.model.name} ${note(second)} follows.`;
			}
			return sentence;
		}
	}
}
