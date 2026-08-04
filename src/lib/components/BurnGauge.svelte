<script lang="ts">
	import type { BurnBand } from '$lib/types/models';
	import BurnGaugeChart from './BurnGaugeChart.svelte';

	interface Props {
		score: number;
		band: BurnBand | null;
		requestsPerWindow: number;
	}

	let { score, band, requestsPerWindow }: Props = $props();

	// Burn score is efficiency (higher = cheaper/slower).
	// Invert it so the gauge shows burn speed (higher = burns faster).
	const burnSpeed = $derived(Math.max(0, 100 - score));
</script>

<div class="flex flex-col items-center">
	{#key burnSpeed}
		<!-- Remount on burn-speed change so BurnGaugeChart replays its 0 → value sweep -->
		<BurnGaugeChart value={burnSpeed} {band} />
	{/key}
	<div class="mt-1 text-center text-xs text-muted-foreground">
		~{requestsPerWindow.toLocaleString()} requests per $12 window
	</div>
</div>
