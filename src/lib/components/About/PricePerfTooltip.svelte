<script lang="ts">
	import type { PricePerfPoint } from '$lib/price-performance';
	import { BURN_BAND_COLOR, BURN_BAND_LABEL } from '$lib/price-performance';

	interface Props {
		/** The model under the cursor, if any. */
		point: PricePerfPoint | undefined;
	}

	let { point }: Props = $props();
</script>

<div class="grid w-full gap-1">
	{#if point}
		<div class="flex items-center gap-1.5">
			<span
				class="size-2.5 shrink-0 rounded-xs"
				style="background-color: {BURN_BAND_COLOR[point.band]}"
				aria-hidden="true"
			></span>
			<span class="text-muted-foreground">{BURN_BAND_LABEL[point.band]} burn</span>
		</div>
	{/if}
	<div class="flex items-center justify-between gap-x-4 leading-none">
		<span class="text-muted-foreground">Coding score</span>
		<span class="font-mono font-medium text-foreground tabular-nums">
			{point ? point.codingScore.toLocaleString() : ''}
		</span>
	</div>
	<div class="flex items-center justify-between gap-x-4 leading-none">
		<span class="text-muted-foreground">Price / 1M</span>
		<span class="font-mono font-medium text-foreground tabular-nums">
			{point ? `$${point.totalPrice.toFixed(2)}` : ''}
		</span>
	</div>
</div>
