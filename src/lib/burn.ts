export type BurnRate = 'slow' | 'medium' | 'fast';

/** Tailwind classes for a thermal-burn badge. */
export function burnClasses(rate: BurnRate | string): string {
	switch (rate) {
		case 'slow':
			return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
		case 'medium':
			return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
		case 'fast':
			return 'bg-red-500/10 text-red-500 border-red-500/20';
		default:
			return 'bg-muted text-muted-foreground border-border';
	}
}

/** Human-readable burn label. */
export function burnLabel(rate: BurnRate | string): string {
	switch (rate) {
		case 'slow':
			return 'Slow burn';
		case 'fast':
			return 'Fast burn';
		case 'medium':
			return 'Moderate';
		default:
			return 'Unknown';
	}
}

/** Compute a burn rate from combined price per 1M tokens. */
export function burnRateFromPrice(totalPricePerM: number): BurnRate {
	if (totalPricePerM < 1.5) return 'slow';
	if (totalPricePerM < 6) return 'medium';
	return 'fast';
}
