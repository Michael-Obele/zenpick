<script lang="ts">
	import { isFreePlanEntry, rowPlanEntry, type CatalogRow, type PlanFilter } from '$lib/catalog';
	import FallbackBadge from './FallbackBadge.svelte';

	/**
	 * The plan-aware price cell: the filtered plan's own rate, the cheapest
	 * plan's rate for "All plans" (prefixed `from`), or free. The fallback
	 * badge is Go-only and appears only when the Go entry is the one shown,
	 * because `pricing.source` is a Go field.
	 */
	let { row, planFilter }: { row: CatalogRow; planFilter: PlanFilter } = $props();

	let entry = $derived(rowPlanEntry(row, planFilter));
</script>

{#if entry && isFreePlanEntry(entry)}
	<div class="font-medium text-teal-600 dark:text-teal-300">Free</div>
{:else if entry?.pricing.inputPricePerM != null}
	<div class="text-foreground/80">
		{#if planFilter === ''}
			<span class="text-muted-foreground">from </span>
		{/if}
		${entry.pricing.inputPricePerM.toFixed(2)} /
		<span class="text-muted-foreground">${entry.pricing.outputPricePerM?.toFixed(2) ?? '—'}</span>
	</div>
{:else}
	<span class="text-muted-foreground/40">—</span>
{/if}
{#if row.go && entry?.plan === 'go'}
	<div class="flex items-center gap-1">
		<FallbackBadge source={row.go.pricing.source} />
	</div>
{/if}
