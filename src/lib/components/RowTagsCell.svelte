<script lang="ts">
	import { rowPlanEntry, type CatalogRow, type PlanFilter } from '$lib/catalog';

	/**
	 * Go rows keep their inferred tags; a static-plan row shows the plan's own
	 * note instead (there are no Go tags to show).
	 */
	let { row, planFilter }: { row: CatalogRow; planFilter: PlanFilter } = $props();

	let entry = $derived(rowPlanEntry(row, planFilter));
</script>

{#if row.go}
	<div class="flex flex-wrap gap-1">
		{#each row.go.tags.slice(0, 2) as tag (tag.label)}
			<span
				class="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
			>
				{tag.label}
			</span>
		{/each}
		{#if row.go.tags.length > 2}
			<span class="text-xs text-muted-foreground/40">+{row.go.tags.length - 2}</span>
		{/if}
	</div>
{:else if entry?.note}
	<span class="block max-w-40 truncate text-xs text-muted-foreground" title={entry.note}>
		{entry.note}
	</span>
{:else}
	<span class="text-muted-foreground/40">—</span>
{/if}
