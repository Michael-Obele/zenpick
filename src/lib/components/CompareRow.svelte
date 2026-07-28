<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import { Crown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		models: GoModel[];
		/** Returns the numeric value used to detect the "best" cell. */
		getValue: (m: GoModel) => number | null;
		/** When true, the highest value wins; when false, the lowest wins. */
		higherIsBetter?: boolean;
		/** Small helper text under the label. */
		hint?: string;
		/** Custom cell renderer. Receives the value and whether this cell is the winner. */
		format?: Snippet<[number | null, boolean]>;
	}

	let { label, models, getValue, higherIsBetter = true, hint, format }: Props = $props();

	let values = $derived(models.map(getValue));
	let best = $derived(bestIndex(values, higherIsBetter));

	function bestIndex(vals: (number | null)[], higher: boolean): number {
		const nums = vals
			.map((v, i) => ({ v, i }))
			.filter((x) => x.v != null) as { v: number; i: number }[];
		if (nums.length === 0) return -1;
		const extreme = higher
			? Math.max(...nums.map((x) => x.v))
			: Math.min(...nums.map((x) => x.v));
		const winners = nums.filter((x) => x.v === extreme);
		// Only highlight a single, unambiguous winner (ties get no highlight).
		return winners.length === 1 ? winners[0].i : -1;
	}
</script>

<div class="contents">
	<div
		class="flex items-center gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground"
	>
		{label}
		{#if hint}
			<span class="text-[10px] font-normal text-muted-foreground/60">{hint}</span>
		{/if}
	</div>
	{#each models as m, i (m.id)}
		<div
			class="relative border-t border-l border-border/60 px-3 py-2.5 text-sm {best === i
				? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
				: ''}"
		>
			{#if best === i}
				<Crown class="absolute right-2 top-2 size-3.5 text-amber-500" aria-hidden="true" />
			{/if}
			{@render format?.(values[i], best === i)}
		</div>
	{/each}
</div>
