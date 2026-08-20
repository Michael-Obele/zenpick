<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { useSearchParams } from 'runed/kit';
	import type { GoModel } from '$lib/types/models';
	import ModelCompare from '$lib/components/ModelCompare.svelte';
	import AskAiMenu from '$lib/components/AskAiMenu.svelte';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import { buildLlmStatsCompareUrl } from '$lib/utils/llm-stats-url';
	import { compareSearchSchema, COMPARE_SCENARIO_VALUES } from '$lib/compare-search';
	import { recommendModel, REFERENCE_TOKENS, REFERENCE_CACHED_PCT } from '$lib/recommendation';
	import {
		catalogQualityAnchor,
		catalogValueAnchor,
		randomSuggestedPair
	} from '$lib/compare-defaults';
	import * as Select from '$lib/components/ui/select/index.js';
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
	let models = $derived(data.models);

	// ── URL is the single source of truth for DISPLAY ─────────────────────
	// `params` is runed's live, schema-validated URL state — it syncs from
	// back/forward and tabs internally, so all display below is derived
	// with zero effects. Mutations are plain functions that write BOTH the
	// store (homepage bridge + dismissal flag) and `params` (URL).
	const params = useSearchParams(compareSearchSchema, {
		pushHistory: false,
		noScroll: true
	});

	/** Validated model IDs from the URL (reactive). */
	let urlIds = $derived(
		params.models
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.filter((id) => models.some((m) => m.id === id))
	);

	let selectedModels = $derived(
		urlIds.map((id) => models.find((m) => m.id === id)).filter((m): m is GoModel => Boolean(m))
	);
	let available = $derived(models.filter((m) => !urlIds.includes(m.id)));
	let atMax = $derived(urlIds.length >= MAX_COMPARE);
	let llmStatsCompareUrl = $derived(buildLlmStatsCompareUrl(selectedModels));

	// Catalog-wide anchor roles — computed from ALL models so the chips stay
	// truthful even when the user swaps models in or out of the comparison.
	let anchors = $derived.by(() => {
		const map: Record<string, 'quality' | 'value'> = {};
		const quality = catalogQualityAnchor(models);
		const value = catalogValueAnchor(models);
		if (quality) map[quality.id] = 'quality';
		if (value) map[value.id] = 'value';
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
		scenarioValue
			? recommendModel(selectedModels, {
					tokens: REFERENCE_TOKENS,
					cachedPct: REFERENCE_CACHED_PCT,
					scenario: scenarioValue
				})
			: null
	);

	let scenarioLabel = $derived(
		SCENARIO_OPTIONS.find((o) => o.value === scenarioValue)?.label ?? 'this task'
	);

	// ── Mutations: functions, no effects ──────────────────────────────────
	// Every mutation goes through the store (guards + dismissedDefaults)
	// and then mirrors the result into the URL — one write, both sides.

	function syncUrl() {
		params.models = compare.selection.join(',');
	}

	function handlePick(v: string | undefined) {
		if (v) {
			compare.add(v);
			syncUrl();
		}
		pick = undefined;
	}

	function removeModel(id: string) {
		compare.remove(id);
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
	let reorderable = $derived(selectedModels.length > 1);

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

	function applyMove(id: string, to: number) {
		if (to === -1) return; // clamped at an end, or unknown id — nothing moved
		syncUrl();
		const name = models.find((m) => m.id === id)?.name ?? 'Model';
		orderStatus = `${name} moved to position ${to + 1} of ${compare.selection.length}.`;
	}

	/** Nudge one slot earlier (-1) or later (+1). */
	function moveModel(id: string, delta: number) {
		applyMove(id, compare.move(id, delta));
	}

	// Native drag-and-drop is the accelerator, never the only way in: the
	// arrow buttons cover keyboard and single-pointer users, so dragging
	// stays strictly optional.
	let dragId = $state<string | null>(null);
	let dragOverId = $state<string | null>(null);

	function handleDragStart(event: DragEvent, id: string) {
		dragId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', id);
		}
	}

	function handleDragOver(event: DragEvent, id: string) {
		if (!dragId || dragId === id) return;
		event.preventDefault(); // opt in as a drop target
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dragOverId = id;
	}

	function handleDragLeave(id: string) {
		if (dragOverId === id) dragOverId = null;
	}

	function handleDrop(event: DragEvent, targetId: string) {
		event.preventDefault();
		const sourceId = dragId ?? event.dataTransfer?.getData('text/plain') ?? '';
		dragId = null;
		dragOverId = null;
		if (sourceId) applyMove(sourceId, compare.moveToward(sourceId, targetId));
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
		if (!models.length) return;
		compare.seedDefaults(
			randomSuggestedPair(models).map((m) => m.id),
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
		compare.selection = [crown.winner.model.id, crown.top[1].model.id];
		syncUrl();
	}

	// ── One-time seed (initial mount only) ────────────────────────────────
	// Client navigations back to this route re-run `load`, which syncs the
	// store from the URL — so only the very first mount needs this.
	// Precedence: explicit ?models= share link → homepage store bridge →
	// fresh random pair (unless dismissed with "Clear all").
	onMount(() => {
		if (urlIds.length) {
			// Share link: the URL is already displayed; mirror it to the
			// store so the homepage tray stays truthful.
			compare.selection = urlIds;
		} else if (compare.selection.length) {
			// Homepage → compare: carry the tray selection into the URL.
			params.models = compare.selection.join(',');
		} else if (!compare.dismissedDefaults) {
			compare.seedDefaults(randomSuggestedPair(models).map((m) => m.id));
			params.models = compare.selection.join(',');
		}
	});

	// Combobox state (ephemeral UI, event-driven — not URL state)
	let pick = $state<string | undefined>(undefined);

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
		content="Compare OpenCode Go models side by side on benchmarks, pricing, context, and fit — then ask Grok or ChatGPT with the full context."
	/>
</svelte:head>

<div class="relative">
	<!-- Ambient backdrop: teal signal glow at the top, quiet warm glow at the page foot -->
	<!-- <div aria-hidden="true" class="pointer-events-none absolute inset-0">
		<div class="bg-hero-glow absolute inset-x-0 top-0 h-80"></div>
		<div class="bg-glow-warm absolute inset-x-0 bottom-0 h-72"></div>
	</div> -->

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
						<GitCompare class="size-7 text-primary dark:text-primary-strong" />
						Find the model that fits the work
					</h1>
					<p class="mt-2 max-w-xl text-sm text-muted-foreground">
						Put models head-to-head on benchmarks, pricing, context, and fit. Compare the signals
						that matter for your task, then ask an AI assistant with the full context baked in.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2 lg:max-w-xs lg:justify-end">
					{#if selectedModels.length > 0}
						{#if llmStatsCompareUrl}
							<a
								href={llmStatsCompareUrl}
								target="_blank"
								rel="noopener noreferrer"
								class={buttonVariants({ variant: 'outline', size: 'default' })}
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
								LLM Stats: add tracked models
							</span>
						{/if}
						<AskAiMenu models={selectedModels} />
						<button
							class={buttonVariants({ variant: 'ghost', size: 'default' })}
							onclick={clearAll}
						>
							<X class="size-4" />
							Clear all
						</button>
					{/if}
				</div>
			</div>

			<!-- Model picker -->
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<label for="compare-model-picker" class="text-sm font-semibold text-foreground"
							>Choose models to compare</label
						>
						<p class="mt-1 text-xs text-muted-foreground">
							Start with the models closest to your actual work.
						</p>
					</div>
					<span class="text-xs text-muted-foreground"
						>{selectedModels.length}/{MAX_COMPARE} selected</span
					>
				</div>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<Select.Root type="single" bind:value={pick} onValueChange={handlePick} disabled={atMax}>
						<Select.Trigger
							id="compare-model-picker"
							class={buttonVariants({
								variant: 'default',
								size: 'default',
								class: 'focus-visible:ring-ring data-placeholder:text-primary-foreground'
							})}
							disabled={atMax}
						>
							<Plus class="size-4" />
							<span>{atMax ? `Max ${MAX_COMPARE} models` : 'Add model…'}</span>
						</Select.Trigger>
						<Select.Content class="max-h-[min(30vh,80vh)]">
							<Select.Group>
								{#each available as m (m.id)}
									<Select.Item value={m.id} label={m.name}>{m.name}</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					{#if selectedModels.length >= 2}
						<span class="text-xs text-muted-foreground">
							Tip: use <span class="font-medium text-foreground">Ask AI</span> to dig deeper.
						</span>
					{/if}
				</div>

				{#if selectedModels.length > 0}
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
						{#each selectedModels as model, i (model.id)}
							<li
								class={[
									'rounded-lg border bg-background px-3 py-2.5 transition-[border-color,box-shadow,opacity]',
									reorderable && 'cursor-grab active:cursor-grabbing',
									dragOverId === model.id && dragId !== model.id
										? 'border-primary ring-2 ring-primary/25'
										: 'border-border',
									dragId === model.id && 'opacity-40'
								]}
								draggable={reorderable}
								ondragstart={(e) => handleDragStart(e, model.id)}
								ondragover={(e) => handleDragOver(e, model.id)}
								ondragleave={() => handleDragLeave(model.id)}
								ondrop={(e) => handleDrop(e, model.id)}
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
												<span class="font-mono text-xs font-normal text-muted-foreground"
													>{i + 1}.</span
												>
												{model.name}
											</p>
											<p class="truncate text-xs text-muted-foreground">{model.provider}</p>
										</div>
									</div>
									<Button
										variant="ghost"
										size="icon-xs"
										class="-mr-1 cursor-pointer text-muted-foreground"
										onclick={() => removeModel(model.id)}
										aria-label={`Remove ${model.name}`}
									>
										<X class="size-3.5" />
									</Button>
								</div>
								<div class="mt-2 flex items-end justify-between gap-2">
									<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
										<span>Fit {model.scenarioScores.coding}/100</span>
										{#if model.benchmarks.coding != null}
											<span>Benchmark {model.benchmarks.coding.toFixed(1)}</span>
										{/if}
										{#if model.burnDetails?.band != null}
											<span>Burn {model.burnDetails.band}</span>
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
												onclick={() => moveModel(model.id, -1)}
												aria-disabled={i === 0}
												aria-label={`Move ${model.name} earlier`}
												title="Move earlier"
											>
												<ChevronLeft class="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-xs"
												class={moveBtn}
												onclick={() => moveModel(model.id, 1)}
												aria-disabled={i === selectedModels.length - 1}
												aria-label={`Move ${model.name} later`}
												title="Move later"
											>
												<ChevronRight class="size-3.5" />
											</Button>
										</div>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Scenario focus: crown the best model for the task at hand -->
			{#if selectedModels.length > 0}
				<div class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<label for="compare-scenario" class="text-sm font-semibold text-foreground"
								>Focus on a task</label
							>
							<p class="text-xs text-muted-foreground">
								Crown the best model in this comparison for the work you're doing.
							</p>
						</div>
						<Select.Root type="single" value={scenarioValue} onValueChange={handleScenarioChange}>
							<Select.Trigger id="compare-scenario" class="w-full focus-visible:ring-ring sm:w-64">
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
					</div>

					{#if scenarioValue && crown && crown.top.length >= 2}
						{@const winner = crown.winner.model}
						{@const runnerUp = crown.top[1].model}
						<div
							class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
						>
							<p class="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
								<Crown
									class="mr-1.5 inline size-4 -translate-y-px text-amber-800 dark:text-amber-300"
								/>
								For <span class="font-medium text-foreground">{scenarioLabel}</span>,
								<span class="font-semibold text-foreground">{winner.name}</span> takes the crown —
								the best blend of fit, capacity, and quality in this comparison
								<span class="text-muted-foreground"
									>(blend {crown.winner.score} · fit {winner.scenarioScores[scenarioValue]})</span
								>.
							</p>
							<button
								type="button"
								class={buttonVariants({ variant: 'outline', size: 'sm' })}
								onclick={applyMix}
								title="Swap the comparison to the crowned winner and its runner-up"
							>
								Best mix: {winner.name} + {runnerUp.name}
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Comparison grid or empty state -->
		<div class="relative">
			{#if selectedModels.length === 0}
				<div
					class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
				>
					<GitCompare class="size-10 text-muted-foreground" />
					<p class="text-sm font-medium text-foreground">No models selected yet</p>
					<p class="max-w-sm text-sm text-muted-foreground">
						Start with a fresh suggested pair — randomized from the top of the catalog each visit —
						or choose your own from the <span class="font-medium">Add model…</span> menu above.
					</p>
					{#if models.length}
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
					models={selectedModels}
					onRemove={removeModel}
					onMove={reorderable ? moveModel : undefined}
					{anchors}
					scenario={scenarioValue}
				/>
			{/if}
		</div>
	</div>
</div>
