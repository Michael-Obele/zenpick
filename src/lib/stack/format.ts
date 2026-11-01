/**
 * Exact-string formatters for the agent-stack UI. Pure functions (no Svelte) so
 * the rendered output can be asserted verbatim in tests.
 */

/** Per-1M-token price, e.g. `$2.20`, `$0.011`, or an en dash when unpublished. */
export function formatPricePerM(n: number | null): string {
	if (n == null) return '—';
	return `$${n.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 3
	})}`;
}

/** A request-level cost, e.g. `$0.04`, `<$0.01`, or `$0.00`. */
export function formatCost(n: number): string {
	if (n === 0) return '$0.00';
	if (n > 0 && n < 0.01) return '<$0.01';
	return `$${n.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;
}

/** Artificial Analysis intelligence index to one decimal, or an en dash. */
export function formatIntelligence(n: number | null): string {
	return n == null ? '—' : n.toFixed(1);
}
