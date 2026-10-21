import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
/**
 * Format large numbers compactly: 26000 → "26K", 1500000 → "1.5M".
 * Returns "—" for null/undefined, and uses toLocaleString for small numbers.
 */
export function formatCompact(n: number | null | undefined): string {
	if (n == null) return '—';
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (n >= 10_000) return `${Math.round(n / 1000)}K`;
	return n.toLocaleString();
}
/**
 * Round a value to a fixed number of decimals for tie detection.
 * Values that render identically at the display precision (e.g. after
 * `toFixed(1)`) always resolve to a tie — this also absorbs binary float
 * artifacts (0.525 vs 0.5250000000000001).
 */
export function tieRound(value: number, decimals: number): number {
	const f = 10 ** decimals;
	return Math.round(value * f) / f;
}

/** A token count as a short human label: 200000 → "200K", 1000000 → "1.0M". */
export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	return `${Math.round(n / 1_000)}K`;
}

/** The subset of a model the Details panel can render. */
export interface DetailRowSource {
	contextWindow: number | null;
	/** `GoModel` types this as a non-nullable union; `null` is the absent case. */
	endpoint: string | null;
	speed: { tokensPerSecond: number } | null;
	maxOutputTokens: number | null;
	reasoningEfforts: string[] | null;
	knowledgeCutoff: string | null;
}

/** One rendered Details row. */
export interface DetailRow {
	label: string;
	value: string;
}

/**
 * The Details rows for a model, most model-specific first.
 *
 * ONE contract for every row: `value` is `''` when there is nothing to show,
 * and such a row is DROPPED rather than rendered with a placeholder. Never
 * format a missing value into `—` here — it is truthy, so the row would render
 * anyway (the "Context window —" regression).
 *
 * `!= null` rather than truthiness: `0` is already normalised to `null` by the
 * adapters (`extractMaxOutputTokens`), so a second falsy check would duplicate
 * that rule rather than reinforce it.
 *
 * A `null` model yields zero rows, so no row depends on a caller-side
 * `{#if model}` for correctness.
 */
export function detailRowsFor(model: DetailRowSource | null): DetailRow[] {
	const rows: DetailRow[] = [
		{
			label: 'Context window',
			value: model?.contextWindow != null ? formatTokens(model.contextWindow) : ''
		},
		{ label: 'Endpoint', value: model?.endpoint ?? '' },
		{
			label: 'Speed',
			value: model?.speed != null ? `${model.speed.tokensPerSecond} tok/s` : ''
		},
		{
			label: 'Output cap',
			value: model?.maxOutputTokens != null ? formatTokens(model.maxOutputTokens) : ''
		},
		{ label: 'Reasoning efforts', value: model?.reasoningEfforts?.join(', ') ?? '' },
		{ label: 'Knowledge cutoff', value: model?.knowledgeCutoff ?? '' }
	];
	return rows.filter((row) => row.value !== '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
