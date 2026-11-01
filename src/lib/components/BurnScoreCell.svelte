<script lang="ts">
	import type { BurnDetails } from '$lib/types/models';

	/** The 0-100 burn score bar; non-Go rows have no burn details at all. */
	let { burn }: { burn: BurnDetails | null } = $props();
</script>

{#if burn?.band != null}
	<div class="flex items-center gap-1.5">
		<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
			<div
				class="h-full rounded-full {burn.score >= 60
					? 'bg-emerald-500'
					: burn.score >= 40
						? 'bg-amber-500'
						: 'bg-red-500'}"
				style="width: {burn.score}%"
			></div>
		</div>
		<span class="text-xs text-muted-foreground">{burn.score}</span>
	</div>
{:else}
	<span class="text-muted-foreground/40">—</span>
{/if}
