<script lang="ts">
	import { fly } from 'svelte/transition';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
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
		if (!selected.length) return undefined;
		return `/compare?models=${selected.join(',')}`;
	}
</script>

{#if selected.length}
	<div
		class="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4 sm:pb-4"
		transition:fly={{ y: 80, duration: 250 }}
	>
		<div
			class="mx-auto flex max-w-5xl flex-col gap-2.5 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
		>
			<!--
				Mobile: status line + one horizontally scrollable chip row that
				never wraps and never pushes the buttons off-screen. sm+: chips
				wrap inline exactly like the old single-row layout.
			-->
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<div class="flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
					<GitCompare class="size-4 text-primary" />
					<span>Compare ({selected.length}/{MAX_COMPARE})</span>
				</div>
				<div
					class="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:overflow-x-visible"
				>
					{#each selectedModels as m (m.id)}
						<span
							class="inline-flex max-w-36 shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1 text-xs text-foreground/80 sm:max-w-48"
						>
							<span class="truncate">{m.name}</span>
							<button
								type="button"
								class="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={() => compare.remove(m.id)}
								aria-label={`Remove ${m.name} from comparison`}
							>
								<X class="size-3" />
							</button>
						</span>
					{/each}
				</div>
			</div>

			<!-- Stacked action row on mobile (Clear compact, Compare fills), inline on sm+ -->
			<div class="grid grid-cols-[auto_1fr] gap-2 sm:flex sm:shrink-0 sm:items-center">
				<button
					class="{buttonVariants({ variant: 'ghost', size: 'sm' })} min-h-10 sm:min-h-0"
					onclick={compare.clear}
				>
					<X class="size-3.5" />
					Clear
				</button>
				<Button
					variant="default"
					size="sm"
					href={goCompare()}
					disabled={!selected.length}
					class="min-h-10 sm:min-h-0"
				>
					Compare
					<ArrowRight class="size-3.5" />
				</Button>
			</div>
		</div>
	</div>
{/if}
