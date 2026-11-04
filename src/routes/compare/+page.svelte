<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { useSearchParams } from 'runed/kit';
	import { cn } from '$lib/utils';
	import { getStackPlans } from '$lib/remote/models.remote';
	import ModelCompare from '$lib/components/ModelCompare.svelte';
	import AgentPairBuilder from '$lib/components/AgentStack/AgentPairBuilder.svelte';
	import AskAiMenu from '$lib/components/AskAiMenu.svelte';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import {
		catalogCompareEntries,
		compareKey,
		filterEntriesByPlan,
		resolveCompareEntries,
		type CompareEntry
	} from '$lib/compare-selection';
	import {
		PLAN_FILTER_OPTIONS,
		PLAN_LABEL,
		PLAN_ORDER,
		PLAN_SHORT_LABEL,
		type PlanFilter
	} from '$lib/catalog';
	import type { PlanId } from '$lib/stack/plans';
	import { modelKey } from '$lib/stack/logic';
	import { formatIntelligence } from '$lib/stack/format';
	import { buildLlmStatsCompareUrl } from '$lib/utils/llm-stats-url';
	import { compareSearchSchema, COMPARE_SCENARIO_VALUES } from '$lib/compare-search';
	import { toCompareModels } from '$lib/compare-model';
	import { recommendModel, REFERENCE_TOKENS, REFERENCE_CACHED_PCT } from '$lib/recommendation';
	import { plan } from '$lib/stores/plan.svelte';
	import {
		catalogQualityAnchor,
		catalogValueAnchor,
		randomSuggestedPair
	} from '$lib/compare-defaults';
	import { tick } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import {
		ArrowLeft,
		ArrowLeftRight,
		Check,
		ChevronLeft,
		ChevronRight,
		Copy,
		Crown,
		Dices,
		ExternalLink,
		GitCompare,
		GripVertical,
		Plus,
		X
	} from '@lucide/svelte';
	import { LightRays } from '$lib/components/magic/light-rays';
	import type { PageProps } from './$types';

	/** Task focus options for the scenario crown — same vocabulary as the funnel. */
	const SCENARIO_OPTIONS: Array<{ value: string; label: string }> = [
		{ value: '', label: 'Any task' },
		...COMPARE_SCENARIO_VALUES.map((value) => ({
			value,
			label:
				value === 'coding'
					? 'Coding'
					: value === 'agentic'
						? 'Agentic'
						: value === 'brainstorming'
							? 'Brainstorming'
							: value === 'budget'
								? 'Budget'
								: 'Frontend'
		}))
	];

	let { data }: PageProps = $props();
	// Re-declared via $derived so a re-navigation with a fresh catalog
	// (different array identity) stays reactive in deriveds.
	let rows = $derived(data.rows);
	let goModels = $derived(rows.flatMap((row) => (row.go ? [row.go] : [])));
	const stackPlansPromise = getStackPlans();

	// ── URL is the single source of truth for DISPLAY ─────────────────────
	// `params` is runed's live, schema-validated URL state — it syncs from
	// back/forward and tabs internally, so all display below is derived
	// with zero effects. Mutations are plain functions that write BOTH the
	// store (homepage bridge + dismissal flag) and `params` (URL).
	const params = useSearchParams(compareSearchSchema, {
		pushHistory: false,
		noScroll: true
	});

	/** Compare keys from the URL: `plan:id`, or a legacy bare Go id (reactive). */
	let urlKeys = $derived(
		params.models
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);

	// One entry per resolved key, in URL order. Unknown keys are skipped here,
	// so the page never renders a model the catalog no longer carries.
	let entries = $derived(resolveCompareEntries(rows, urlKeys));
	/** Full-grid columns: plan-agnostic, so Zed and Copilot get the same table as Go. */
	let compareModels = $derived(toCompareModels(entries));
	let selectedModels = $derived(
		entries.flatMap((entry) => (entry.plan.plan === 'go' && entry.row.go ? [entry.row.go] : []))
	);

	/**
	 * The full grid renders for every plan. `allGo` only gates the Go-specific
	 * extras that need the recommendation engine (the scenario crown and the
	 * task-focus row), because fit/capacity are not published for Zed/Copilot.
	 */
	let allGo = $derived(
		entries.length > 0 &&
			entries.every((entry) => entry.plan.plan === 'go' && entry.row.go !== null)
	);

	let atMax = $derived(entries.length >= MAX_COMPARE);
	// LLM Stats accepts 2–4 models. The URL resolver prefers each entry's
	// verified llm-stats slug, so plan-only models link to the right page too.
	let llmStatsCompareUrl = $derived(buildLlmStatsCompareUrl(compareModels));

	// Catalog-wide anchor roles — computed from ALL Go models so the chips stay
	// truthful even when the user swaps models in or out of the comparison.
	// Anchors are a Go-only signal; they are keyed by the Go compare key, so a
	// Zed/Copilot column simply has no anchor chip.
	let anchors = $derived.by(() => {
		const map: Record<string, 'quality' | 'value'> = {};
		const quality = catalogQualityAnchor(goModels);
		const value = catalogValueAnchor(goModels);
		if (quality) map[compareKey('go', quality.id)] = 'quality';
		if (value) map[compareKey('go', value.id)] = 'value';
		return map;
	});

	// ── Scenario crown ────────────────────────────────────────────────────
	// Optional task focus (`?scenario=coding`): crowns the best model of the
	// current comparison for that task using the same fit/capacity/quality
	// blend as the homepage recommendation funnel, evaluated at the funnel's
	// reference workload. Pure deriveds — changing the dropdown or the model
	// selection re-crowns automatically.
	let scenarioValue = $derived(params.scenario);

	let crown = $derived(
		allGo && scenarioValue
			? recommendModel(selectedModels, {
					tokens: REFERENCE_TOKENS,
					cachedPct: REFERENCE_CACHED_PCT,
					scenario: scenarioValue,
					plan: plan.tier
				})
			: null
	);

	// ── Mutations: functions, no effects ──────────────────────────────────
	// Every mutation goes through the store (guards + dismissedDefaults)
	// and then mirrors the result into the URL — one write, both sides.

	function syncUrl() {
		params.models = compare.selection.join(',');
	}

	function handlePick(key: string) {
		compare.add(key);
		syncUrl();
	}

	function removeModel(key: string) {
		compare.remove(key);
		syncUrl();
	}

	// ── Order ─────────────────────────────────────────────────────────────
	// Column order IS the selection order (`?models=a,b,c` is positional), so
	// reordering the list is the whole feature: park a model next to the one
	// you want to read it against and the grid follows. Every path — the
	// arrows here, the arrows in the grid header, and drag-and-drop — funnels
	// through `applyMove` so pointer and keyboard can never drift apart.

	/** Politely announced result of the last move (WCAG SC 2.5.7 / 4.1.3). */
	let orderStatus = $state('');

	/** Nothing to order with a single column — hide the controls entirely. */
	let reorderable = $derived(entries.length > 1);

	/** Skip the reorder animation when the OS asks for less motion. */
	let flipMs = $derived(prefersReducedMotion.current ? 0 : 220);

	/**
	 * Arrows at either end use `aria-disabled`, not the native `disabled`
	 * attribute: a button that disables itself under the user's own press drops
	 * focus to `<body>`, stranding keyboard users mid-reorder. Staying focusable
	 * is safe because `compare.move` clamps and reports `-1`, so a press at the
	 * boundary is already a silent no-op.
	 */
	const moveBtn =
		'cursor-pointer text-muted-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40';

	function applyMove(key: string, to: number) {
		if (to === -1) return; // clamped at an end, or unknown key — nothing moved
		syncUrl();
		// `ModelCompare` still reports a bare Go id; the `row.go.id` branch keeps
		// the announcement naming the right model for those legacy handlers.
		const name =
			entries.find((entry) => entry.key === key || entry.row.go?.id === key)?.row.name ?? 'Model';
		orderStatus = `${name} moved to position ${to + 1} of ${entries.length}.`;
	}

	/** Nudge one slot earlier (-1) or later (+1). */
	function moveModel(key: string, delta: number) {
		applyMove(key, compare.move(key, delta));
	}

	// Native drag-and-drop is the accelerator, never the only way in: the
	// arrow buttons cover keyboard and single-pointer users, so dragging
	// stays strictly optional.
	let dragId = $state<string | null>(null);
	let dragOverId = $state<string | null>(null);

	function handleDragStart(event: DragEvent, key: string) {
		dragId = key;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', key);
		}
	}

	function handleDragOver(event: DragEvent, key: string) {
		if (!dragId || dragId === key) return;
		event.preventDefault(); // opt in as a drop target
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dragOverId = key;
	}

	function handleDragLeave(key: string) {
		if (dragOverId === key) dragOverId = null;
	}

	function handleDrop(event: DragEvent, targetKey: string) {
		event.preventDefault();
		const sourceKey = dragId ?? event.dataTransfer?.getData('text/plain') ?? '';
		dragId = null;
		dragOverId = null;
		if (sourceKey) applyMove(sourceKey, compare.moveToward(sourceKey, targetKey));
	}

	/** Card state classes: drop-target ring, and the dragged source faded out. */
	function cardClass(entry: CompareEntry): Array<string | false> {
		const isOver = dragOverId === entry.key && dragId !== entry.key;
		return [
			'rounded-lg border bg-background px-3 py-2.5 transition-[border-color,box-shadow,opacity]',
			reorderable && 'cursor-grab active:cursor-grabbing',
			isOver ? 'border-primary ring-2 ring-primary/25' : 'border-border',
			dragId === entry.key && 'opacity-40'
		];
	}

	function handleDragEnd() {
		dragId = null;
		dragOverId = null;
	}

	function clearAll() {
		compare.clear(); // also sets dismissedDefaults
		syncUrl(); // params.models = '' → clean URL
	}

	function loadSuggested() {
		if (!goModels.length) return;
		compare.seedDefaults(
			randomSuggestedPair(goModels).map((m) => compareKey('go', m.id)),
			true
		);
		syncUrl();
	}

	type ScenarioValue = (typeof COMPARE_SCENARIO_VALUES)[number] | '';

	function handleScenarioChange(value: string | undefined) {
		if (!value) {
			params.scenario = '';
			return;
		}
		const allowed = new Set<string>(COMPARE_SCENARIO_VALUES);
		const next: ScenarioValue = (allowed.has(value) ? value : '') as ScenarioValue;
		params.scenario = next;
	}

	/** Swap the comparison to the crowned winner + its runner-up (the best mix). */
	function applyMix() {
		if (!crown || crown.top.length < 2) return;
		compare.set([compareKey('go', crown.winner.model.id), compareKey('go', crown.top[1].model.id)]);
		syncUrl();
	}

	/** Replace the comparison with the pair the builder produced (explicit click only). */
	function usePair(keys: string[]) {
		if (!keys.length) return;
		compare.set(keys);
		syncUrl();
	}

	// ── One-time seed (initial mount only) ────────────────────────────────
	// Client navigations back to this route re-run `load`, which syncs the
	// store from the URL — so only the very first mount needs this.
	// Precedence: explicit ?models= share link → homepage store bridge →
	// fresh random pair (unless dismissed with "Clear all").
	onMount(() => {
		if (urlKeys.length) {
			// Share link: the URL is already displayed; mirror it to the
			// store so the homepage tray stays truthful.
			compare.set(urlKeys);
		} else if (compare.selection.length) {
			// Homepage → compare: carry the tray selection into the URL.
			params.models = compare.selection.join(',');
		} else if (!compare.dismissedDefaults) {
			compare.seedDefaults(randomSuggestedPair(goModels).map((m) => compareKey('go', m.id)));
			params.models = compare.selection.join(',');
		}
	});

	// Combobox state (ephemeral UI, event-driven — not URL state)
	let comboboxOpen = $state(false);

	/** Picker-only plan filter. Local UI state, so it never reaches the URL. */
	let pickerPlan = $state<PlanFilter>('');
	let triggerRef = $state<HTMLButtonElement>(null!);

	/** Identity of an entry — `plan` + the same folded key the resolver dedupes on. */
	function entryIdentity(entry: CompareEntry): string {
		return `${entry.plan.plan}:${modelKey(entry.plan.id)}`;
	}

	let selectedIdentity = $derived(new Set(entries.map(entryIdentity)));

	/** Every plan offer not already in the selection — the picker's pool. */
	let availableEntries = $derived(
		filterEntriesByPlan(
			catalogCompareEntries(rows).filter((entry) => !selectedIdentity.has(entryIdentity(entry))),
			pickerPlan
		)
	);

	/**
	 * Picker groups in catalog display order (`go`, `zed`, `copilot`), models
	 * alphabetical. Unknown plans sort last, never first.
	 */
	function planRank(plan: PlanId): number {
		return plan in PLAN_ORDER ? PLAN_ORDER[plan] : Number.MAX_SAFE_INTEGER;
	}

	let groupedAvailable = $derived.by(() => {
		const groups = new Map<PlanId, CompareEntry[]>();
		for (const entry of availableEntries) {
			const list = groups.get(entry.plan.plan) ?? [];
			list.push(entry);
			groups.set(entry.plan.plan, list);
		}
		return [...groups.entries()]
			.sort(([a], [b]) => planRank(a) - planRank(b))
			.map(
				([planId, list]) =>
					[PLAN_LABEL[planId], list.sort((a, b) => a.row.name.localeCompare(b.row.name))] as const
			);
	});

	function closeAndFocusTrigger() {
		comboboxOpen = false;
		tick().then(() => {
			triggerRef.focus();
		});
	}

	let copied = $state(false);
	async function copyLlmStats() {
		if (!llmStatsCompareUrl) return;
		try {
			await navigator.clipboard.writeText(llmStatsCompareUrl);
		} catch {
			// href is present for right-click → copy link address
		}
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<svelte:head>
	<title>Compare Models — ZenPick</title>
	<meta
		name="description"
		content="Compare models across OpenCode Go, Zed Pro and Copilot Pro side by side on benchmarks, pricing, context, and fit — then ask Grok or ChatGPT with the full context."
	/>
</svelte:head>

{#snippet headerActions()}
	<div class="flex flex-wrap items-center gap-2 lg:max-w-xs lg:justify-end">
		{#if entries.length > 0}
			{#if llmStatsCompareUrl}
				<a
					href={llmStatsCompareUrl}
					target="_blank"
					rel="noopener noreferrer"
					class={buttonVariants({
						variant: 'outline',
						size: 'default'
					})}
				>
					<ExternalLink class="size-4" />
					Compare on LLM Stats
				</a>
				<button
					type="button"
					onclick={copyLlmStats}
					aria-label="Copy LLM Stats compare link"
					class={buttonVariants({ variant: 'outline', size: 'icon' })}
				>
					{#if copied}
						<Check class="size-4 text-emerald-700 dark:text-emerald-300" />
					{:else}
						<Copy class="size-4" />
					{/if}
				</button>
			{:else}
				<span
					class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
					title="LLM Stats compare needs 2–4 models"
				>
					<ExternalLink class="size-3.5" />
					LLM Stats: select 2–4 models
				</span>
			{/if}
			<AskAiMenu models={compareModels} />
			<button class={buttonVariants({ variant: 'ghost', size: 'default' })} onclick={clearAll}>
				<X class="size-4" />
				Clear all
			</button>
		{/if}
	</div>
{/snippet}

{#snippet pickerPanel()}
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<label for="compare-model-picker" class="text-sm font-semibold text-foreground"
				>Choose models to compare</label
			>
			<p class="mt-1 text-xs text-muted-foreground">
				Start with the models closest to your actual work.
			</p>
		</div>
		<span class="text-xs text-muted-foreground">{entries.length}/{MAX_COMPARE} selected</span>
	</div>
	<div class="mt-4 flex flex-wrap items-center gap-3">
		<Popover.Root bind:open={comboboxOpen}>
			<Popover.Trigger bind:ref={triggerRef}>
				{#snippet child({ props })}
					<button
						{...props}
						id="compare-model-picker"
						class={buttonVariants({
							variant: 'default',
							size: 'default',
							class: 'w-55 justify-between gap-2 focus-visible:ring-ring'
						})}
						aria-label="Add a model to compare"
						disabled={atMax}
					>
						<Plus class="size-4 shrink-0 transition-all {comboboxOpen ? 'rotate-45' : ''}" />
						<span class="truncate">{atMax ? `Max ${MAX_COMPARE} models` : 'Add model…'}</span>
						<div>
							<!-- Just an empty space to center the text -->
						</div>
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-80 p-0">
				<!-- Plan filter: plain aria-pressed buttons (the home FilterBar pattern) so
				     re-pressing a plan never clears the filter. UI-only, not URL state. -->
				<div
					role="group"
					aria-label="Filter models by plan"
					class="flex flex-wrap gap-1.5 border-b border-border px-2.5 py-2"
				>
					{#each PLAN_FILTER_OPTIONS as option (option.value || 'all')}
						<button
							type="button"
							aria-pressed={pickerPlan === option.value}
							class={cn(
								'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
								pickerPlan === option.value
									? 'border-primary/70 bg-primary/10 text-primary'
									: 'border-border bg-card text-muted-foreground hover:text-foreground'
							)}
							onclick={() => (pickerPlan = option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
				<Command.Root>
					<Command.Input placeholder="Search models…" />
					<Command.List>
						<Command.Empty>No model found.</Command.Empty>
						{#each groupedAvailable as [planLabel, planEntries] (planLabel)}
							<Command.Group heading={planLabel}>
								{#each planEntries as entry (entry.key)}
									<Command.Item
										value={entry.key}
										keywords={[entry.row.name, entry.row.provider, PLAN_LABEL[entry.plan.plan]]}
										onSelect={() => {
											handlePick(entry.key);
											closeAndFocusTrigger();
										}}
									>
										<span class="truncate">{entry.row.name}</span>
										<span class="ml-auto truncate text-xs text-muted-foreground"
											>{entry.row.provider}</span
										>
									</Command.Item>
								{/each}
							</Command.Group>
						{/each}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
		{#if allGo && selectedModels.length >= 2}
			<span class="text-xs text-muted-foreground">
				Tip: use <span class="font-medium text-foreground">Ask AI</span> to dig deeper.
			</span>
		{/if}
	</div>
{/snippet}

{#snippet cardFooter(entry: CompareEntry, i: number)}
	<div class="mt-2 flex items-end justify-between gap-2">
		<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
			{#if entry.row.intelligence != null}
				<span>Intelligence {formatIntelligence(entry.row.intelligence)}</span>
			{/if}
			{#if entry.row.coding != null}
				<span>Coding {entry.row.coding.toFixed(1)}</span>
			{/if}
			{#if entry.plan.plan === 'go' && entry.row.go?.burnDetails?.band != null}
				<span>Burn {entry.row.go.burnDetails.band}</span>
			{/if}
		</div>
		{#if reorderable}
			<!-- Single-pointer + keyboard path to reordering (WCAG SC 2.5.7),
			     so dragging never becomes the only way in. -->
			<div class="-mr-1 -mb-1 flex shrink-0 items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon-xs"
					class={moveBtn}
					onclick={() => moveModel(entry.key, -1)}
					aria-disabled={i === 0}
					aria-label={`Move ${entry.row.name} (${PLAN_LABEL[entry.plan.plan]}) earlier`}
					title="Move earlier"
				>
					<ChevronLeft class="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					class={moveBtn}
					onclick={() => moveModel(entry.key, 1)}
					aria-disabled={i === entries.length - 1}
					aria-label={`Move ${entry.row.name} (${PLAN_LABEL[entry.plan.plan]}) later`}
					title="Move later"
				>
					<ChevronRight class="size-3.5" />
				</Button>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet selectedCards()}
	{#if entries.length > 0}
		<!-- Order strip: the grid below renders one column per card, in this
		     order — so reordering here is how you park two models side by
		     side instead of reading across the whole table. -->
		<div
			class="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-4"
		>
			<p class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
				<ArrowLeftRight class="size-3.5 text-primary dark:text-primary-strong" />
				Column order
			</p>
			<p class="text-xs text-muted-foreground">
				{reorderable
					? 'Drag a card, or use the arrows, to sit two models next to each other.'
					: 'Add a second model to start ordering columns.'}
			</p>
		</div>
		<ul class="mt-3 grid list-none gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
			{#each entries as entry, i (entry.key)}
				<li
					class={cardClass(entry)}
					draggable={reorderable}
					ondragstart={(e) => handleDragStart(e, entry.key)}
					ondragover={(e) => handleDragOver(e, entry.key)}
					ondragleave={() => handleDragLeave(entry.key)}
					ondrop={(e) => handleDrop(e, entry.key)}
					ondragend={handleDragEnd}
					animate:flip={{ duration: flipMs, easing: cubicOut }}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="flex min-w-0 items-start gap-1.5">
							<GripVertical
								aria-hidden="true"
								class={[
									'mt-0.5 size-3.5 shrink-0 text-muted-foreground/60',
									!reorderable && 'invisible'
								]}
							/>
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-foreground">
									<span class="font-mono text-xs font-normal text-muted-foreground">{i + 1}.</span>
									{entry.row.name}
								</p>
								<div class="mt-1 flex min-w-0 items-center gap-1.5">
									<p class="truncate text-xs text-muted-foreground">
										{entry.row.provider}
									</p>
									<Badge variant="outline" aria-label={PLAN_LABEL[entry.plan.plan]}
										>{PLAN_SHORT_LABEL[entry.plan.plan]}</Badge
									>
								</div>
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon-xs"
							class="-mr-1 cursor-pointer text-muted-foreground"
							onclick={() => removeModel(entry.key)}
							aria-label={`Remove ${entry.row.name} (${PLAN_LABEL[entry.plan.plan]})`}
						>
							<X class="size-3.5" />
						</Button>
					</div>
					{@render cardFooter(entry, i)}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet taskFocusRow()}
	{#if entries.length > 0 && allGo}
		<div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
			<label for="compare-scenario" class="text-sm font-medium text-foreground"
				>Focus on a task</label
			>
			<Select.Root type="single" value={scenarioValue} onValueChange={handleScenarioChange}>
				<Select.Trigger id="compare-scenario" size="sm" class="focus-visible:ring-ring sm:w-52">
					{SCENARIO_OPTIONS.find((o) => o.value === scenarioValue)?.label ?? 'Any task'}
				</Select.Trigger>
				<Select.Content class="max-h-[min(30vh,80vh)]">
					<Select.Group>
						{#each SCENARIO_OPTIONS as option (option.value || 'any')}
							<Select.Item value={option.value} label={option.label}>
								{option.label}
							</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>

			{#if scenarioValue && crown && crown.top.length >= 2}
				{@const winner = crown.winner.model}
				{@const runnerUp = crown.top[1].model}
				<div class="ml-auto flex min-w-0 flex-wrap items-center gap-2">
					<span class="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
						<Crown class="size-4 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
						<span class="truncate">
							<span class="font-semibold text-foreground">{winner.name}</span>
							+ {runnerUp.name}
						</span>
					</span>
					<Button
						variant="outline"
						size="sm"
						onclick={applyMix}
						title="Swap the comparison to the crowned winner and its runner-up"
					>
						Use this pair
					</Button>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="relative">
	<LightRays class="rays-quiet" count={5} blur={16} speed={26} length="45%" />

	<div class="relative mx-auto max-w-6xl px-4 pb-24">
		<!-- Reorder announcements: sighted users see the columns move, so screen
		     reader users get the same feedback here. -->
		<div role="status" aria-live="polite" class="sr-only">{orderStatus}</div>

		<!-- Decision-surface header: orient the page around choosing the right model for the work. -->
		<div class="relative -mx-4 -mt-10 mb-6 px-4 pt-10">
			<div class="relative mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
				<div>
					<a
						href="/"
						class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft class="size-3.5" />
						Back to all models
					</a>
					<p
						class="mb-2 font-mono text-xs font-medium tracking-[0.18em] text-primary dark:text-primary-strong"
					>
						MODEL DECISION SURFACE
					</p>
					<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
						<GitCompare class="size-7 text-primary dark:text-primary-strong" aria-hidden="true" />
						Find the model that fits the work
					</h1>
					<p class="mt-2 max-w-xl text-sm text-muted-foreground">
						Put models head-to-head on benchmarks, pricing, context, and fit. Compare the signals
						that matter for your task, then ask an AI assistant with the full context baked in.
					</p>
				</div>
				{@render headerActions()}
			</div>

			<!-- Model picker -->
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
				{@render pickerPanel()}

				{@render selectedCards()}

				<!-- Optional compact pair builder: the pair only joins the comparison when
			     the user presses "Use this pair". -->
				<div class="mt-4 rounded-xl border border-border p-4">
					{#await stackPlansPromise}
						<div role="status" aria-busy="true" class="h-8 w-48 animate-pulse rounded-lg bg-muted">
							<span class="sr-only">Loading plan data</span>
						</div>
					{:then plans}
						{#if plans.length}
							<AgentPairBuilder
								{plans}
								{params}
								selectedKeys={entries.map((e) => e.key)}
								onUse={usePair}
							/>
						{:else}
							<p class="text-xs text-muted-foreground">Plan data is unavailable right now.</p>
						{/if}
					{:catch}
						<p class="text-xs text-muted-foreground">Plan data is unavailable right now.</p>
					{/await}
				</div>

				{@render taskFocusRow()}
			</div>
		</div>

		<!-- Comparison grid or empty state -->
		<div class="relative">
			{#if entries.length === 0}
				<div
					class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
				>
					<GitCompare class="size-10 text-muted-foreground" aria-hidden="true" />
					<p class="text-sm font-medium text-foreground">No models selected yet</p>
					<p class="max-w-sm text-sm text-muted-foreground">
						Start with a fresh suggested pair from the top of the OpenCode Go catalog — randomized
						each visit — or choose your own from the <span class="font-medium">Add model…</span> menu
						above.
					</p>
					{#if goModels.length}
						<button
							type="button"
							class={buttonVariants({ variant: 'outline', size: 'default' })}
							onclick={loadSuggested}
						>
							<Dices class="size-4" />
							Load suggested models
						</button>
					{/if}
				</div>
			{:else}
				<ModelCompare
					models={compareModels}
					onRemove={removeModel}
					onMove={reorderable ? moveModel : undefined}
					{anchors}
					scenario={allGo ? scenarioValue : ''}
				/>
			{/if}
		</div>
	</div>
</div>
