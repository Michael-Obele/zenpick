<script lang="ts">
	import type { BurnDetails } from '$lib/types/models';
	import { Flame, Snowflake, Thermometer } from '@lucide/svelte';

	interface Props {
		burnDetails: BurnDetails | null;
	}

	let { burnDetails }: Props = $props();

	let bandLabel = $derived.by(() => {
		if (!burnDetails?.band) return 'Unknown';
		switch (burnDetails.band) {
			case 'excellent':
				return 'Excellent';
			case 'good':
				return 'Good';
			case 'moderate':
				return 'Moderate';
			case 'high':
				return 'High';
			case 'extreme':
				return 'Extreme';
		}
	});

	let bandColor = $derived.by(() => {
		if (!burnDetails?.band) return 'bg-muted text-muted-foreground border-border';
		switch (burnDetails.band) {
			// 900-level text on light tints and 100-level text on dark tints
			// both exceed WCAG AAA 7:1 — the old 500-level text was ~2:1.
			case 'excellent':
				return 'bg-cyan-500/10 text-cyan-900 border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100 dark:border-cyan-400/30';
			case 'good':
				return 'bg-emerald-500/10 text-emerald-900 border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-400/30';
			case 'moderate':
				return 'bg-amber-500/10 text-amber-900 border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-400/30';
			case 'high':
				return 'bg-orange-500/10 text-orange-900 border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-100 dark:border-orange-400/30';
			case 'extreme':
				return 'bg-red-500/10 text-red-900 border-red-500/20 dark:bg-red-500/10 dark:text-red-100 dark:border-red-400/30';
		}
	});
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium {bandColor}"
	title={burnDetails?.requestsPer12 != null
		? `${burnDetails.requestsPer12.toLocaleString()} requests per $12 window`
		: 'Pricing data unavailable'}
>
	{#if burnDetails?.band === 'extreme'}
		<Flame class="size-3" />
	{:else if burnDetails?.band === 'excellent' || burnDetails?.band === 'good'}
		<Snowflake class="size-3" />
	{:else}
		<Thermometer class="size-3" />
	{/if}
	{bandLabel}
</span>
