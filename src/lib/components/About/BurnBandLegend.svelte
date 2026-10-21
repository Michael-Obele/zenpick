<script lang="ts">
	import type { BurnBand } from '$lib/types/models';
	import { BURN_BAND_COLOR, BURN_BAND_LABEL, BURN_BAND_ORDER } from '$lib/price-performance';
	import { cn } from '$lib/utils';

	interface Props {
		/** How many models fall in each burn band. */
		counts: Partial<Record<BurnBand, number>>;
		/** The isolated band, or `null` when every band is shown. */
		focus: BurnBand | null;
		/** Called with the band to isolate, or `null` to show them all. */
		onfocus: (band: BurnBand | null) => void;
	}

	let { counts, focus, onfocus }: Props = $props();
</script>

<!--
	The legend doubles as a filter: one click isolates a burn band, which is
	the fastest way to see whether a cheap band is also a strong one.
-->
<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
	<span class="font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
		Burn band
	</span>
	<div class="flex flex-wrap items-center gap-1.5">
		{#each BURN_BAND_ORDER as band (band)}
			{@const count = counts[band] ?? 0}
			{#if count > 0}
				<button
					type="button"
					title="Show only {BURN_BAND_LABEL[band]} models"
					aria-pressed={focus === band}
					onclick={() => onfocus(focus === band ? null : band)}
					class={cn(
						'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
						focus === band
							? 'border-primary/50 bg-primary/10 text-foreground'
							: 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
						focus !== null && focus !== band && 'opacity-50'
					)}
				>
					<span
						class="size-2 shrink-0 rounded-full"
						style="background-color: {BURN_BAND_COLOR[band]}"
						aria-hidden="true"
					></span>
					{BURN_BAND_LABEL[band]}
					<span class="font-mono tabular-nums opacity-70">{count}</span>
				</button>
			{/if}
		{/each}
	</div>
	{#if focus}
		<button
			type="button"
			class="text-xs text-primary underline-offset-4 hover:underline dark:text-primary-strong"
			onclick={() => onfocus(null)}
		>
			Show all
		</button>
	{/if}
</div>
