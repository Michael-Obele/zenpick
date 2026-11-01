<script lang="ts">
	import { getCatalogRows, getModels, getStackPlans } from '$lib/remote/models.remote';
	import { matchesCatalogPlan, PLAN_LABEL, type CatalogRow, type PlanFilter } from '$lib/catalog';
	import type { GoModel } from '$lib/types/models';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import QuotaCalculator from '$lib/components/QuotaCalculator.svelte';
	import AgentStack from '$lib/components/AgentStack/AgentStack.svelte';
	import ModelTable from '$lib/components/ModelTable.svelte';
	import ModelDrawer from '$lib/components/ModelDrawer.svelte';
	import PlanModelDrawer from '$lib/components/PlanModelDrawer.svelte';
	import ScenarioHelpDialog from '$lib/components/ScenarioHelpDialog.svelte';
	import CompareTray from '$lib/components/CompareTray.svelte';
	import { LightRays } from '$lib/components/magic/light-rays';
	import { findNeed, needAnswer, rankNeed } from '$lib/needs';
	import { scenarioLabel } from '$lib/scenarios';
	import { compare } from '$lib/stores/compare.svelte';
	import { homeSearchSchema } from '$lib/table-search';
	import { useSearchParams } from 'runed/kit';
	import { ArrowRight, Brain, Wallet, Server, X } from '@lucide/svelte';

	// The URL is the source of truth for the table's search + leaderboard, so a
	// link carries the whole question: /?need=cheapest, /?q=vision (see
	// table-search.ts). ONE instance per page — the calculator shares this object,
	// because a second hook would rewrite the query string from its own keys alone
	// and drop the table's params (and vice versa).
	const params = useSearchParams(homeSearchSchema, {
		pushHistory: false,
		noScroll: true,
		debounce: 250
	});

	let scenario = $state('');
	let selectedRow = $state<CatalogRow | null>(null);
	let drawerOpen = $state(false);

	/** Every row opens a drawer; Go rows use the full model panel, the rest share one. */
	function openDrawer(row: CatalogRow) {
		selectedRow = row;
		drawerOpen = true;
	}

	/**
	 * The row the Go drawer shows. That panel carries burn, quota windows and the
	 * scatter graph, which only exist on OpenCode Go, so a shared row uses it only
	 * while the table is on the Go view. Under a Zed/Copilot filter the plan drawer
	 * shows that plan's prices instead.
	 */
	let goDrawerRow = $derived(
		selectedRow?.go && (params.plan === '' || params.plan === 'go') ? selectedRow.go : null
	);

	/** Switching to a static plan clears the Go-only need/scenario ranking. */
	function setPlan(value: PlanFilter) {
		params.plan = value;
		if (value === 'zed' || value === 'copilot') {
			params.need = '';
			scenario = '';
		}
	}

	/** Rows a plan filter carries — the count badge follows the table's dataset. */
	function planRows(rows: CatalogRow[], plan: PlanFilter): CatalogRow[] {
		return rows.filter((row) => matchesCatalogPlan(row, plan));
	}

	/** "1 model" / "2 models" — the badge pluralises both its counts. */
	function plural(count: number, singular: string): string {
		return `${count} ${singular}${count === 1 ? '' : 's'}`;
	}

	/** How many plans the catalog actually spans, for "across N plans". */
	function distinctPlanCount(rows: CatalogRow[]): number {
		return new Set(rows.flatMap((row) => row.plans.map((entry) => entry.plan))).size;
	}

	/** The Go models a need ranking runs over (rankings never see static plans). */
	function goModelsFromRows(rows: CatalogRow[]): GoModel[] {
		return rows.flatMap((row) => (row.go ? [row.go] : []));
	}

	const modelsPromise = getModels();
	const stackPlansPromise = getStackPlans();
	const catalogPromise = getCatalogRows();

	/**
	 * The calculator only models OpenCode Go's request windows. Zed Pro and
	 * Copilot Pro get a scope panel instead, labelled with the active plan.
	 */
	let calculatorScopeLabel = $derived(
		params.plan === 'zed' || params.plan === 'copilot' ? PLAN_LABEL[params.plan] : null
	);

	// A deep link cannot leave a hidden ranking active for a static plan.
	let needSpec = $derived(
		params.plan === 'zed' || params.plan === 'copilot' ? null : (findNeed(params.need) ?? null)
	);
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
	<title>ZenPick | Spend your AI budget on the right model</title>
	<meta
		name="description"
		content="Stop wasting your AI budget on the wrong model. ZenPick lines up every model in your plan with live benchmarks, price, and quota burn, so you pick the one that fits before the money runs out."
	/>
</svelte:head>

{#snippet calculatorScopePanel(label: string)}
	<div class="rounded-2xl border border-border bg-card p-5 sm:p-6">
		<p
			class="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase dark:text-primary-strong"
		>
			Quota planning
		</p>
		<h2 class="mt-2 text-lg font-semibold tracking-tight text-foreground">
			The quota calculator is OpenCode Go only
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
			{label} includes a monthly token allowance, not OpenCode Go's 5-hour and weekly request windows.
			Use the agent stack panel to estimate the pair's monthly requests, or switch the plan filter to
			OpenCode Go.
		</p>
		<a
			href="#agent-stack"
			class="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			Plan an agent stack
		</a>
	</div>
{/snippet}

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
		<div class="relative mx-auto max-w-6xl px-4 pt-16 pb-6 sm:pt-20">
			<section class="mb-16 text-center">
				<!-- Headline -->
				<h1
					class="signal-board-enter mb-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
				>
					Spend your AI budget
					<br class="hidden sm:inline" />
					<span class="text-stroke-bg text-primary">on the right model</span>
				</h1>

				<!-- Supporting copy -->
				<p
					class="signal-board-enter motion-delay-200 mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground"
				>
					Live benchmarks, quota-burn estimates, and task-fit scores, so you can see
					<span class="text-foreground/80">which model wastes your money</span> before you spend it.
				</p>

				<!-- CTAs -->
				<div
					class="signal-board-enter motion-delay-300 mb-10 flex flex-wrap items-center justify-center gap-3"
				>
					<a
						href="#compare-models"
						class="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						Find my model
						<ArrowRight class="size-4" />
					</a>
					<a
						href="#quota-calculator"
						class="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						Estimate quota
						<ArrowRight class="size-4" />
					</a>
					<a
						href="#agent-stack"
						class="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						Build my agent stack
						<ArrowRight class="size-4" />
					</a>
				</div>

				<!-- Status strip -->
				<div
					class="signal-board-enter motion-delay-300 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground"
				>
					<span class="inline-flex items-center gap-1.5">
						<Server class="size-3" />
						{#await catalogPromise then rows}
							{rows.length} models across plans
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
		<!-- Agent stack -->
		<section id="agent-stack" class="signal-board-enter motion-delay-100 mb-12">
			{#await stackPlansPromise}
				<div class="space-y-3">
					<div class="h-10 animate-pulse rounded-lg bg-muted"></div>
					<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
				</div>
			{:then plans}
				<AgentStack {plans} {params} id="agent-stack-panel" />
			{:catch err}
				<div
					role="alert"
					class="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center"
				>
					<div class="text-destructive">Failed to load plan data</div>
					<div class="mt-1 text-sm text-destructive/70">
						{(err as Error).message}
					</div>
				</div>
			{/await}
		</section>

		<!-- Calculator -->
		<section id="quota-calculator" class="signal-board-enter motion-delay-100 mb-12">
			{#if calculatorScopeLabel}
				{@render calculatorScopePanel(calculatorScopeLabel)}
			{:else}
				{#await modelsPromise then models}
					<QuotaCalculator {models} {params} />
				{/await}
			{/if}
		</section>

		<!-- Model Table -->
		<section id="compare-models" class="signal-board-enter motion-delay-200">
			{#await catalogPromise}
				<div class="space-y-3">
					<div class="h-10 animate-pulse rounded-lg bg-muted"></div>
					<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
				</div>
			{:then rows}
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<h2 class="text-lg font-semibold text-foreground">Compare Models</h2>
						<span
							class="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
						>
							{plural(planRows(rows, params.plan).length, 'model')}
							{#if params.plan === ''}
								across {plural(distinctPlanCount(rows), 'plan')}
							{:else}
								on {PLAN_LABEL[params.plan]}
							{/if}
						</span>
						<ScenarioHelpDialog />
					</div>
				</div>
				{#if needSpec}
					{@const entries = rankNeed(needSpec, goModelsFromRows(rows), blendOpts)}
					{@const Icon = needSpec.icon}
					<div
						class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
					>
						<div class="flex size-9 shrink-0 items-center justify-center rounded-lg {needSpec.bg}">
							<Icon class="size-4 {needSpec.accent}" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="text-sm font-semibold text-foreground">
									{needSpec.title}
								</h3>
								{#if weightLabel}
									<span
										class="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground"
									>
										weighted by {weightLabel} fit
									</span>
								{/if}
							</div>
							<p class="text-xs leading-relaxed text-muted-foreground">
								{needAnswer(needSpec, entries, {
									weightLabel: weightLabel ?? undefined
								})}
							</p>
						</div>
						<button
							class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
							onclick={() => (params.need = '')}
						>
							<X class="size-4" />
							All models
						</button>
					</div>
				{/if}
				<div class="mb-4">
					<!-- Function bindings: the search + leaderboard live in `params`, not
					     in local state (a `$derived` can't be bound directly). -->
					<FilterBar
						bind:filter={() => params.q, (v) => (params.q = v)}
						bind:scenario
						bind:need={() => params.need, (v) => (params.need = v)}
						bind:plan={() => params.plan, setPlan}
					/>
				</div>
				<ModelTable
					{rows}
					filter={params.q}
					{scenario}
					planFilter={params.plan}
					need={needSpec}
					onExitNeed={() => (params.need = '')}
					selectedModelId={selectedRow?.id}
					onSelectModel={openDrawer}
					selectedIds={compare.selection}
					onToggleCompare={compare.toggle}
				/>
			{:catch err}
				<div
					role="alert"
					class="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center"
				>
					<div class="text-destructive">Failed to load model data</div>
					<div class="mt-1 text-sm text-destructive/70">
						{(err as Error).message}
					</div>
				</div>
			{/await}
		</section>

		<!-- Two guards, one drawer: the Go panel only for Go-view rows, the plan
		     drawer for everything else (see `goDrawerRow`). -->
		{#await modelsPromise then models}
			{#if goDrawerRow}
				<ModelDrawer {models} model={goDrawerRow} bind:open={drawerOpen} />
			{/if}
		{/await}

		{#if selectedRow && !goDrawerRow}
			<PlanModelDrawer row={selectedRow} activePlan={params.plan} bind:open={drawerOpen} />
		{/if}

		{#await catalogPromise then rows}
			<CompareTray {rows} />
		{/await}

		<!-- Burn vs Performance — the chart that carries the argument -->
		<section
			class="signal-board-enter motion-delay-300 mt-12 rounded-2xl border border-primary/20 bg-card p-6 sm:p-8"
			aria-labelledby="graph-home"
		>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p
						class="mb-2 font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase dark:text-primary-strong"
					>
						The sweet spot
					</p>
					<h2 id="graph-home" class="mb-2 text-lg font-semibold tracking-tight text-foreground">
						Burn vs. Performance — where every model sits
					</h2>
					<p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
						Every model is one dot. The shaded quadrants show the trade-off: efficient burn vs. raw
						coding score. The sweet spot is top-left — high score without torching your quota.
					</p>
				</div>
				<a
					href="/about#price-performance"
					class="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
				>
					Explore the graph
					<ArrowRight class="size-4" />
				</a>
			</div>
		</section>

		<!-- llms.txt for AI agents & scripts -->
		<section
			class="signal-board-enter motion-delay-300 mt-12 rounded-2xl border border-border bg-card/40 p-6 sm:p-8"
			aria-labelledby="llms-txt-home"
		>
			<div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
				<div class="max-w-xl">
					<p
						class="mb-2 font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase dark:text-primary-strong"
					>
						For AI agents & scripts
					</p>
					<h2 id="llms-txt-home" class="mb-3 text-lg font-semibold tracking-tight text-foreground">
						Every model as plain text — <code
							class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">/llms.txt</code
						>
					</h2>
					<p class="text-sm leading-relaxed text-muted-foreground">
						Same live catalog the table reads, rendered as markdown so an LLM, curl, or script gets
						current pricing, benchmarks, burn bands, and rankings without running JavaScript.
						Regenerated on every request (≤6h stale).
					</p>
					<ul class="mt-4 space-y-1.5 font-mono text-xs leading-relaxed">
						<li>
							<span class="text-muted-foreground">Ranked</span>
							<code class="text-foreground">/llms.txt?need=cheapest</code>
							<span class="text-muted-foreground">— cheapest-first</span>
						</li>
						<li>
							<span class="text-muted-foreground">Filtered</span>
							<code class="text-foreground">/llms.txt?q=vision</code>
							<span class="text-muted-foreground">— vision models only</span>
						</li>
						<li>
							<span class="text-muted-foreground">Compare</span>
							<code class="text-foreground">/compare?models=id1,id2</code>
							<span class="text-muted-foreground">— side-by-side in browser</span>
						</li>
					</ul>
					<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
						Quote the <code class="font-mono text-foreground">ID</code> column, not the display name
						— IDs are the stable keys for compare URLs. See
						<a
							href="/about#llms-txt"
							class="font-medium text-primary underline-offset-4 hover:underline dark:text-primary-strong"
							>About → llms.txt</a
						> for all query URLs.
					</p>
				</div>
				<div class="shrink-0 lg:w-88">
					<div class="rounded-xl border border-border bg-muted/40 p-4">
						<p
							class="mb-2 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
						>
							Try it
						</p>
						<pre
							class="overflow-x-auto rounded-lg bg-foreground px-3 py-2.5 font-mono text-xs leading-relaxed text-background"><code
								>curl https://zenpick.dev/llms.txt?need=coding | head -n 40</code
							></pre>
						<div class="mt-3 flex flex-wrap gap-2">
							<a
								href="/llms.txt"
								class="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
							>
								Open llms.txt
							</a>
							<a
								href="/about#llms-txt"
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
							>
								How it works
							</a>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Footer (in-page attribution & tagline) -->
		<div class="mt-20 text-center text-sm text-muted-foreground/60">
			<p>
				Made to stop developers wasting money on the
				<span class="text-muted-foreground/70">wrong model.</span>
			</p>
		</div>
	</div>
</section>
