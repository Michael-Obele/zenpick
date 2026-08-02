<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { SCENARIOS, scenarioLabel } from '$lib/scenarios';
	import { findNeed, NEEDS } from '$lib/needs';

	interface Props {
		filter: string;
		scenario: string;
		need: string;
	}

	let { filter = $bindable(''), scenario = $bindable(''), need = $bindable('') }: Props = $props();

	let searchOpen = $state(false);

	/**
	 * The two rows are complementary dimensions: a Task (scenario) weights
	 * the ranking, a Need (browse) supplies the metric. But the Coding need
	 * and the Coding scenario measure the same thing — selecting one clears
	 * the other so the same dimension never double-applies.
	 */
	function applyScenario(value: string) {
		if (value) {
			const alias = findNeed(need)?.scenarioAlias;
			if (alias && alias === value) need = '';
		}
		scenario = value;
	}

	function applyNeed(slug: string) {
		const activating = need !== slug;
		need = activating ? slug : '';
		if (activating) {
			const alias = findNeed(slug)?.scenarioAlias;
			if (alias && alias === scenario) scenario = '';
		}
	}

	function clearFilter() {
		filter = '';
		searchOpen = false;
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<!-- Task row: what you're doing — produces a fit score per model -->
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
				Task
			</span>
			{#each SCENARIOS as s (s.value)}
				{@const Icon = s.icon}
				<button
					class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all {scenario ===
					s.value
						? 'border-primary/70 bg-primary/60 text-white/80'
						: 'border-border bg-card text-muted-foreground hover:border-border hover:text-foreground'}"
					onclick={() => applyScenario(s.value)}
					title="Weighs the ranking by how well each model fits this task"
				>
					<Icon class="size-3" />
					{s.label}
				</button>
			{/each}
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

	<!-- Browse-by-need pills: one tap turns the table into a modelgrep-style ranked list -->
	<div class="flex flex-wrap items-center gap-1.5">
		<span class="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
			Browse by need
		</span>
		{#each NEEDS as n (n.slug)}
			{@const active = need === n.slug}
			{@const Icon = n.icon}
			<button
				class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all {active
					? 'border-transparent ' + n.bg + ' ' + n.accent
					: 'border-border bg-card text-muted-foreground hover:border-border hover:text-foreground'}"
				onclick={() => applyNeed(n.slug)}
				title={n.description}
				aria-pressed={active}
			>
				<Icon class="size-3" />
				{n.cardTitle}
			</button>
		{/each}
		{#if scenario && need}
			<span
				class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground"
			>
				weighted by {scenarioLabel(scenario)} fit
			</span>
		{/if}
	</div>
</div>
