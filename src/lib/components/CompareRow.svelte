<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import { Crown, Equal } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { tieRound } from '$lib/utils';
	import Badge from '$lib/components/ui/badge/badge.svelte';

	interface Props {
		label: string;
		models: GoModel[];
		/** Returns the numeric value used to detect the "best" cell. */
		getValue: (m: GoModel) => number | null;
		/** When true, the highest value wins; when false, the lowest wins. */
		higherIsBetter?: boolean;
		/**
		 * Values are compared after rounding to this many decimals, so
		 * display-equal values always resolve to a tie — binary float
		 * artifacts can never crown a single model.
		 */
		tieDecimals?: number;
		/** Small helper text under the label. */
		hint?: string;
		/** Custom cell renderer. Receives the value and whether this cell is the winner. */
		format?: Snippet<[number | null, boolean]>;
	}

	let {
		label,
		models,
		getValue,
		higherIsBetter = true,
		tieDecimals = 1,
		hint,
		format
	}: Props = $props();

	let values = $derived(models.map(getValue));

	/** Single unambiguous winner, or a tie among ≥2 display-equal values. */
	let analysis = $derived(analyzeRow(values, higherIsBetter, tieDecimals));
	let best = $derived(analysis.bestIndex);
	let isTie = $derived(analysis.tie);

	function analyzeRow(
		vals: (number | null)[],
		higher: boolean,
		decimals: number
	): { bestIndex: number; tie: boolean } {
		const nums = vals
			.map((v, i) => ({ v: v == null ? null : tieRound(v, decimals), i }))
			.filter((x) => x.v != null) as { v: number; i: number }[];
		if (nums.length === 0) return { bestIndex: -1, tie: false };
		const extreme = higher ? Math.max(...nums.map((x) => x.v)) : Math.min(...nums.map((x) => x.v));
		const winners = nums.filter((x) => x.v === extreme);
		// Only highlight a single, unambiguous winner (ties get no highlight).
		return winners.length === 1
			? { bestIndex: winners[0].i, tie: false }
			: { bestIndex: -1, tie: true };
	}
</script>

<div class="contents">
	<div
		class="sticky left-0 z-10 flex text-wrap items-center gap-1.5 border-t border-border/60 bg-muted px-3 py-2.5 text-sm font-medium text-muted-foreground"
	>
		{label}
		{#if isTie}
			<Badge
				variant="outline"
				class="gap-1 border-border/60 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
			>
				<Equal class="size-2.5" aria-hidden="true" />
				Tie
			</Badge>
		{/if}
		{#if hint}
			<span class="text-[10px] font-normal text-muted-foreground">{hint}</span>
		{/if}
	</div>
	{#each models as m, i (m.id)}
		<div
			class="relative border-t border-l border-border/60 px-3 py-2.5 text-sm {best === i
				? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
				: ''}"
		>
			{#if best === i}
				<Crown
					class="absolute right-2 top-2 size-3.5 text-amber-800 dark:text-amber-300"
					aria-hidden="true"
				/>
			{/if}
			{@render format?.(values[i], best === i)}
		</div>
	{/each}
</div>
