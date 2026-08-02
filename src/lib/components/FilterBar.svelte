<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { SCENARIOS, scenarioLabel } from '$lib/scenarios';
	import { NEEDS } from '$lib/needs';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface Props {
		filter: string;
		scenario: string;
		need: string;
	}

	let { filter = $bindable(''), scenario = $bindable(''), need = $bindable('') }: Props = $props();

	let searchOpen = $state(false);

	/**
	 * One row, two dimensions — combined with AND semantics:
	 *  - "Rank by"    (needs): the metric the table is ordered by (single-select).
	 *  - "Weight by"  (scenarios): a task mode that weights that metric by fit
	 *    (single-select). Selecting one from each merges the two filters into
	 *    a fit-weighted ranking.
	 * Single-select per group means the two controls can never conflict; the
	 * merge is always exactly one need + one scenario.
	 */

	/** Static Tailwind-safe active classes per need (data-state selectors must be literal). */
	const NEED_ACTIVE: Record<string, string> = {
		coding:
			'data-[state=on]:border-transparent data-[state=on]:bg-sky-500/10 data-[state=on]:text-sky-500',
		design:
			'data-[state=on]:border-transparent data-[state=on]:bg-fuchsia-500/10 data-[state=on]:text-fuchsia-500',
		smartest:
			'data-[state=on]:border-transparent data-[state=on]:bg-violet-500/10 data-[state=on]:text-violet-500',
		reasoning:
			'data-[state=on]:border-transparent data-[state=on]:bg-amber-500/10 data-[state=on]:text-amber-500',
		vision:
			'data-[state=on]:border-transparent data-[state=on]:bg-emerald-500/10 data-[state=on]:text-emerald-500',
		'open-source':
			'data-[state=on]:border-transparent data-[state=on]:bg-slate-500/10 data-[state=on]:text-slate-500',
		'long-context':
			'data-[state=on]:border-transparent data-[state=on]:bg-teal-500/10 data-[state=on]:text-teal-500',
		cheapest:
			'data-[state=on]:border-transparent data-[state=on]:bg-orange-500/10 data-[state=on]:text-orange-500'
	};

	const ITEM_BASE =
		'rounded-full border px-3 py-1.5 text-xs font-medium transition-all data-[state=off]:border-border data-[state=off]:bg-card data-[state=off]:text-muted-foreground hover:border-border hover:text-foreground';

	function clearAll() {
		need = '';
		scenario = '';
	}

	function clearFilter() {
		filter = '';
		searchOpen = false;
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
		<!-- One row: Rank by need + Weight by task (AND merge), then status -->
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<!-- Rank by: browse-by-need metrics -->
			<div class="flex items-center gap-1.5">
				<span class="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
					Rank by
				</span>
				<ToggleGroup.Root
					type="single"
					bind:value={need}
					variant="outline"
					size="sm"
					spacing={2}
					aria-label="Rank models by need"
				>
					{#each NEEDS as n (n.slug)}
						{@const Icon = n.icon}
						<ToggleGroup.Item
							value={n.slug}
							class="{ITEM_BASE} {NEED_ACTIVE[n.slug] ?? ''}"
							title={n.description}
						>
							<Icon class="size-3" />
							{n.cardTitle}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>

			<!-- Dimension divider -->
			<span class="hidden h-6 w-px bg-border sm:block" aria-hidden="true"></span>

			<!-- Weight by: task scenarios -->
			<div class="flex items-center gap-1.5">
				<span class="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
					Weight by
				</span>
				<ToggleGroup.Root
					type="single"
					bind:value={scenario}
					variant="outline"
					size="sm"
					spacing={2}
					aria-label="Weight ranking by task"
				>
					{#each SCENARIOS as s (s.value)}
						{@const Icon = s.icon}
						<ToggleGroup.Item
							value={s.value}
							class="{ITEM_BASE} data-[state=on]:border-primary/70 data-[state=on]:bg-primary/60 data-[state=on]:text-white/80"
							title="Weighs the ranking by how well each model fits this task"
						>
							<Icon class="size-3" />
							{s.label}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>

			{#if need && scenario}
				<span
					class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground"
				>
					weighted by {scenarioLabel(scenario)} fit
				</span>
			{/if}

			{#if need || scenario}
				<button
					class="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
					onclick={clearAll}
				>
					<X class="size-3" />
					Clear
				</button>
			{/if}
		</div>

		<!-- Search -->
		<div class="flex items-center gap-2">
			{#if !searchOpen}
				<button
					class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
					onclick={() => (searchOpen = true)}
				>
					<Search class="size-4" />
					Search
				</button>
			{:else}
				<div
					class="relative inline-flex items-center rounded-lg border border-primary/40 bg-card px-3 py-2"
				>
					<Search class="mr-2 size-3.5 shrink-0 text-muted-foreground" />
					<input
						type="text"
						bind:value={filter}
						placeholder="Search models..."
						class="w-44 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
					<button
						class="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
						onclick={clearFilter}
					>
						<X class="size-3.5" />
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
