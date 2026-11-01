<script lang="ts">
	import type { GoModel } from '$lib/types/models';

	/** Scenario fit is Go-only: the static plans carry no scenario scores. */
	let { go, scenario }: { go: GoModel | null; scenario: string } = $props();

	let score = $derived(
		go ? (go.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0) : null
	);
</script>

{#if score != null}
	<div class="flex items-center gap-1.5">
		<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
			<div
				class="h-full rounded-full {score >= 60
					? 'bg-violet-500'
					: score >= 40
						? 'bg-amber-500'
						: 'bg-red-500'}"
				style="width: {score}%"
			></div>
		</div>
		<span class="text-xs text-muted-foreground tabular-nums">{score}</span>
	</div>
{:else}
	<span class="text-muted-foreground/40">—</span>
{/if}
