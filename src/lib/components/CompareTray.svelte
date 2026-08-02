<script lang="ts">
	import { fly } from 'svelte/transition';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import { goto } from '$app/navigation';
	import type { GoModel } from '$lib/types/models';
	import { GitCompare, X, ArrowRight } from '@lucide/svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';

	interface Props {
		models: GoModel[];
	}
	let { models }: Props = $props();

	let selected = $derived(compare.selection);
	let selectedModels = $derived(models.filter((m) => selected.includes(m.id)));

	function goCompare() {
		if (!selected.length) return;
		return `/compare?models=${selected.join(',')}`;
	}
</script>

{#if selected.length}
	<div class="fixed inset-x-0 bottom-0 z-40 px-4 pb-4" transition:fly={{ y: 80, duration: 250 }}>
		<div
			class="mx-auto flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur"
		>
			<div class="flex items-center gap-2 text-sm font-medium text-foreground">
				<GitCompare class="size-4 text-primary" />
				<span>Compare ({selected.length}/{MAX_COMPARE})</span>
			</div>
			<div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
				{#each selectedModels as m (m.id)}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground/80"
					>
						{m.name}
					</span>
				{/each}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<button class={buttonVariants({ variant: 'ghost', size: 'sm' })} onclick={compare.clear}>
					<X class="size-3.5" />
					Clear
				</button>
				<Button variant="default" size="sm" href={goCompare()} disabled={!selected.length}>
					Compare
					<ArrowRight class="size-3.5" />
				</Button>
			</div>
		</div>
	</div>
{/if}
