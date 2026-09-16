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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
