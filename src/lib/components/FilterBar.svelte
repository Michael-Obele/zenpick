<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { SCENARIOS, scenarioLabel } from '$lib/scenarios';
	import { NEEDS } from '$lib/needs';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Switch } from '$lib/components/ui/switch';
	import { plan as planState } from '$lib/stores/plan.svelte';
	import { PLAN_FILTER_OPTIONS, type PlanFilter } from '$lib/catalog';

	interface Props {
		filter: string;
		scenario: string;
		need: string;
		plan?: PlanFilter;
	}

	let {
		filter = $bindable(''),
		scenario = $bindable(''),
		need = $bindable(''),
		plan = $bindable<PlanFilter>('')
	}: Props = $props();

	// A shared link can arrive with ?q= already set — open the box filled in, or
	// the table looks filtered for no visible reason.
	let searchOpen = $state(Boolean(filter));

	/**
	 * Three bands, top to bottom, sharing one label gutter:
	 *  - "Plan"       (scope): which plan's rows exist at all.
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

	/**
	 * Fixed-width label gutter. Every band uses the same grid track, so the three
	 * chip runs start on one vertical line and a label can never be pushed onto a
	 * line of its own by chips that happen to fill the row. `sm:pt-1.5` matches the
	 * chips' own top padding, so the label's cap line sits on their text line.
	 */
	const LABEL = 'text-xs font-medium tracking-wider text-muted-foreground/60 uppercase sm:pt-1.5';
	const ROW = 'grid gap-1.5 sm:grid-cols-[5rem_1fr] sm:items-start sm:gap-x-3';

	/** Go rows are the only ones with quotas, burn and task fit. */
	let isGoPlan = $derived(plan === '' || plan === 'go');

	function clearAll() {
		need = '';
		scenario = '';
	}

	function clearFilter() {
		filter = '';
		searchOpen = false;
	}
</script>

<!--
	Every band is its own top-level snippet so fallow scores it as its own unit:
	the plan filter, Go-only quota switch, search and both ranking rows stay inline
	without inflating this component's template complexity.
-->
{#snippet quotaToggle()}
	<!-- Quota-limit plan: defaults to the $10 Go plan; Go Plus users flip it
	     to read their own higher allowances. It only changes Go quotas, so it
	     is hidden while a static plan is being read. -->
	<div class="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
		<Switch
			checked={planState.tier === 'plus'}
			onCheckedChange={(v) => planState.set(v ? 'plus' : 'go')}
			size="sm"
			aria-label="Show Go Plus quota limits"
		/>
		<button
			type="button"
			class="text-xs font-medium transition-colors"
			onclick={() => planState.toggle()}
			title="Show quota limits for a different OpenCode Go plan"
		>
			{#if planState.tier === 'plus'}
				<span class="text-amber-600 dark:text-amber-400">Go Plus limits</span>
			{:else}
				<span class="text-muted-foreground">Go limits</span>
			{/if}
		</button>
	</div>
{/snippet}

{#snippet searchControl()}
	{#if !searchOpen}
		<button
			class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
			onclick={() => (searchOpen = true)}
		>
			<Search class="size-4" />
			Search
		</button>
	{:else}
		<div
			class="relative inline-flex h-8 items-center rounded-lg border border-primary/40 bg-card px-3 transition-colors focus-within:border-primary/70"
		>
			<Search class="mr-2 size-3.5 shrink-0 text-muted-foreground" />
			<!-- `border-0 p-0 ring-0` strips @tailwindcss/forms' own input chrome, which
			     otherwise draws a box (and a blue focus ring) inside this pill. -->
			<input
				type="text"
				bind:value={filter}
				placeholder="Search models..."
				class="h-5 w-44 border-0 bg-transparent p-0 text-sm text-foreground ring-0 placeholder:text-muted-foreground focus:outline-none"
			/>
			<button
				class="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
				onclick={clearFilter}
			>
				<X class="size-3.5" />
			</button>
		</div>
	{/if}
{/snippet}

{#snippet planRow()}
	<div class={ROW}>
		<span class={LABEL}>Plan</span>
		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<!-- Plan filter: all plans, or the rows one plan carries. A plain button
				     group (not Bits' ToggleGroup) so the pressed state always mirrors
				     `plan`; a single ToggleGroup writes `''` on re-press, which left
				     "All plans" unselected. -->
				<div role="group" aria-label="Filter models by plan" class="flex flex-wrap gap-1.5">
					{#each PLAN_FILTER_OPTIONS as option (option.value || 'all')}
						<button
							type="button"
							aria-pressed={plan === option.value}
							class="{ITEM_BASE} {plan === option.value
								? 'border-primary/70 bg-primary/10 text-primary'
								: ''}"
							onclick={() => (plan = option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>

				{#if isGoPlan}
					{@render quotaToggle()}
				{/if}
			</div>

			{@render searchControl()}
		</div>
	</div>
{/snippet}

{#snippet rankRow()}
	<div class={ROW}>
		<span class={LABEL}>Rank by</span>
		<ToggleGroup.Root
			type="single"
			bind:value={need}
			variant="outline"
			size="sm"
			class="flex flex-wrap gap-1.5"
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
{/snippet}

{#snippet weightRow()}
	<div class={ROW}>
		<span class={LABEL}>Weight by</span>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-2">
			<ToggleGroup.Root
				type="single"
				bind:value={scenario}
				variant="outline"
				size="sm"
				class="flex flex-wrap gap-1.5"
				spacing={2}
				aria-label="Weight ranking by task"
			>
				{#each SCENARIOS as s (s.value)}
					{@const Icon = s.icon}
					<ToggleGroup.Item
						value={s.value}
						class="{ITEM_BASE} data-[state=on]:border-primary/70 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
						title="Weighs the ranking by how well each model fits this task"
					>
						<Icon class="size-3" />
						{s.label}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>

			{#if need && scenario}
				<span
					class="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground"
				>
					weighted by {scenarioLabel(scenario)} fit
				</span>
			{/if}

			<!-- Hidden with the controls it clears: a static-plan deep link can still
			     carry ?need=, and a Clear chip would then target hidden state. -->
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
	</div>
{/snippet}

<div class="flex flex-col gap-3">
	{@render planRow()}

	<!-- Go-only rankings: static plans carry no scenario scores, so the
	     need/scenario controls would rank rows by data those plans lack. -->
	{#if isGoPlan}
		{@render rankRow()}
		{@render weightRow()}
	{:else}
		<p class="max-w-xl text-xs leading-relaxed text-muted-foreground sm:pl-[5.75rem]">
			Burn, quotas and task fit are OpenCode Go data; plan rows without them show —.
		</p>
	{/if}
</div>
