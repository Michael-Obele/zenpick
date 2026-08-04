<script lang="ts">
	import { getModels } from '$lib/remote/models.remote';
	import type { GoModel } from '$lib/types/models';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import QuotaCalculator from '$lib/components/QuotaCalculator.svelte';
	import ModelTable from '$lib/components/ModelTable.svelte';
	import ModelDrawer from '$lib/components/ModelDrawer.svelte';
	import ScenarioHelpDialog from '$lib/components/ScenarioHelpDialog.svelte';
	import CompareTray from '$lib/components/CompareTray.svelte';
	import { LightRays } from '$lib/components/magic/light-rays';
	import { findNeed, needAnswer, rankNeed } from '$lib/needs';
	import { scenarioLabel } from '$lib/scenarios';
	import { compare } from '$lib/stores/compare.svelte';
	import { ArrowRight, Brain, Wallet, Server, X } from '@lucide/svelte';

	let filter = $state('');
	let scenario = $state('');
	let selectedModel = $state<GoModel | null>(null);
	let drawerOpen = $state(false);
	/** Active "browse by need" slug ('' = plain table). */
	let need = $state('');

	function openDrawer(model: GoModel) {
		selectedModel = model;
		drawerOpen = true;
	}

	const modelsPromise = getModels();

	let needSpec = $derived(findNeed(need) ?? null);
	/** Task label when both a need and a scenario are active (blended ranking). */
	let weightLabel = $derived(needSpec && scenario ? scenarioLabel(scenario) : null);
	/** Blend options for the banner ranking — same shape the table uses. */
	let blendOpts = $derived<{ fitOf: (m: GoModel) => number | null } | undefined>(
		scenario
			? {
					fitOf: (m) => m.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? null
				}
			: undefined
	);
</script>

<svelte:head>
	<title>ZenPick — Find the right Go model</title>
	<meta
		name="description"
		content="Compare OpenCode Go models with live benchmarks, pricing, and quota estimates. ZenPick helps you find which model fits your task — and how fast it burns your quota."
	/>
</svelte:head>

<section class="relative">
	<!-- Animated light rays washing down over the whole homepage -->
	<LightRays
		class="hero-rays"
		color="var(--ray-color)"
		count={4}
		blur={10}
		speed={42}
		length="40%"
	/>

	<!-- Hero with decorative background -->
	<div class="relative overflow-hidden">
		<div class="relative mx-auto max-w-6xl px-4 pb-6 pt-16 sm:pt-20">
			<section class="mb-16 text-center">
				<!-- Headline -->
				<h1
					class="signal-board-enter mb-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
				>
					Choose a model by
					<br class="hidden sm:inline" />
					<span class="text-primary text-stroke-bg">task and quota</span>
				</h1>

				<!-- Supporting copy -->
				<p
					class="signal-board-enter motion-delay-200 mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground"
				>
					Live benchmarks, algorithmic recommendations, and quota burn estimates — so you make
					<span class="text-foreground/80">economically informed</span> decisions, not guesses.
				</p>

				<!-- CTAs -->
				<div
					class="signal-board-enter motion-delay-300 mb-10 flex flex-wrap items-center justify-center gap-3"
				>
					<a
						href="#compare-models"
						class="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						Compare models
						<ArrowRight class="size-4" />
					</a>
					<a
						href="#quota-calculator"
						class="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						Estimate quota
						<ArrowRight class="size-4" />
					</a>
				</div>

				<!-- Status strip -->
				<div
					class="signal-board-enter motion-delay-300 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground"
				>
					<span class="inline-flex items-center gap-1.5">
						<Server class="size-3" />
						{#await modelsPromise then models}
							{models.length} models
						{/await}
					</span>
					<span class="inline-flex items-center gap-1.5">
						<Brain class="size-3" />
						Benchmarks from modelgrep + LLM Stats
					</span>
					<span class="inline-flex items-center gap-1.5">
						<Wallet class="size-3" />
						$10/month subscription tier
					</span>
				</div>
			</section>
		</div>
	</div>

	<!-- Main content -->
	<div class="mx-auto max-w-6xl px-4 pb-16">
		<!-- Calculator -->
		<section id="quota-calculator" class="signal-board-enter motion-delay-100 mb-12 scroll-mt-24">
			{#await modelsPromise then models}
				<QuotaCalculator {models} />
			{/await}
		</section>

		<!-- Model Table -->
		<section id="compare-models" class="signal-board-enter motion-delay-200 scroll-mt-24">
			{#await modelsPromise}
				<div class="space-y-3">
					<div class="h-10 animate-pulse rounded-lg bg-muted"></div>
					<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
				</div>
			{:then models}
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<h2 class="text-lg font-semibold text-foreground">Compare Models</h2>
						<span
							class="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{models.length} models
						</span>
						<ScenarioHelpDialog />
					</div>
				</div>
				{#if needSpec}
					{@const entries = rankNeed(needSpec, models, blendOpts)}
					{@const Icon = needSpec.icon}
					<div
						class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
					>
						<div class="flex size-9 shrink-0 items-center justify-center rounded-lg {needSpec.bg}">
							<Icon class="size-4 {needSpec.accent}" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="text-sm font-semibold text-foreground">{needSpec.title}</h3>
								{#if weightLabel}
									<span
										class="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground"
									>
										weighted by {weightLabel} fit
									</span>
								{/if}
							</div>
							<p class="text-xs leading-relaxed text-muted-foreground">
								{needAnswer(needSpec, entries, { weightLabel: weightLabel ?? undefined })}
							</p>
						</div>
						<button
							class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
							onclick={() => (need = '')}
						>
							<X class="size-4" />
							All models
						</button>
					</div>
				{/if}
				<div class="mb-4">
					<FilterBar bind:filter bind:scenario bind:need />
				</div>
				<ModelTable
					{models}
					{filter}
					{scenario}
					need={needSpec}
					onExitNeed={() => (need = '')}
					selectedModelId={selectedModel?.id}
					onSelectModel={openDrawer}
					selectedIds={compare.selection}
					onToggleCompare={compare.toggle}
				/>
			{:catch err}
				<div class="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
					<div class="text-red-400">Failed to load model data</div>
					<div class="mt-1 text-sm text-red-400/60">{(err as Error).message}</div>
				</div>
			{/await}
		</section>

		{#await modelsPromise then models}
			<ModelDrawer {models} model={selectedModel} bind:open={drawerOpen} />
			<CompareTray {models} />
		{/await}

		<!-- Footer (in-page attribution & tagline) -->
		<div class="mt-20 text-center text-sm text-muted-foreground/60">
			<p>
				Made to help developers make
				<span class="text-muted-foreground/70">economically informed</span>
				model choices.
			</p>
		</div>
	</div>
</section>
