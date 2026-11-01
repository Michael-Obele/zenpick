<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import Callout from '$lib/components/About/Callout.svelte';
	import StatCard from '$lib/components/About/StatCard.svelte';
	import SourceTable from '$lib/components/About/SourceTable.svelte';
	import Schematic from '$lib/components/About/Schematic.svelte';
	import ReceiptBlock from '$lib/components/About/ReceiptBlock.svelte';
	import ModelBurnChart from '$lib/components/About/ModelBurnChart.svelte';
	import ScenarioRadarChart from '$lib/components/About/ScenarioRadarChart.svelte';
	import PricePerformanceScatter from '$lib/components/About/PricePerformanceScatter.svelte';
	import PlanCards from '$lib/components/About/PlanCards.svelte';
	import StackPreview from '$lib/components/About/StackPreview.svelte';
	import { getCatalogRows, getModels, getStackPlans } from '$lib/remote/models.remote';
	import type { CatalogRow } from '$lib/catalog';
	import {
		ArrowRight,
		ChevronLeft,
		CircleCheck,
		ExternalLink,
		Thermometer,
		Timer
	} from '@lucide/svelte';
	import Github from '$lib/assets/github.svelte';
	import { LightRays } from '@/magic/light-rays';

	let mounted = $state(false);
	const modelsPromise = getModels();
	const stackPlansPromise = getStackPlans();
	const catalogPromise = getCatalogRows();
	onMount(() => {
		mounted = true;
	});

	/** Distinct plans that carry at least one model. */
	function planCount(rows: CatalogRow[]): number {
		return new Set(rows.flatMap((row) => row.plans.map((entry) => entry.plan))).size;
	}

	/** Plan listings across all rows: a model on two plans counts twice. */
	function planListingCount(rows: CatalogRow[]): number {
		return rows.reduce((total, row) => total + row.plans.length, 0);
	}

	/**
	 * The jump list under the header.
	 *
	 * The page is nine sections long and the headline chart sat in the
	 * middle of one of them, so nothing pointed a reader at it. The chart
	 * gets its own entry (and its own highlight) because it is the one
	 * visual that carries the whole argument.
	 */
	const pageSections = [
		{ id: 'product', label: 'What it does' },
		{ id: 'plans', label: 'Plans' },
		{ id: 'agent-stacks', label: 'Agent stacks' },
		{ id: 'numbers', label: 'The numbers' },
		{ id: 'price-performance', label: 'Burn vs. performance', featured: true },
		{ id: 'methodology', label: 'Methodology' },
		{ id: 'attribution', label: 'Data & attribution' },
		{ id: 'llms-txt', label: 'llms.txt' },
		{ id: 'key', label: 'Thermal key' }
	];

	const burnTiers = [
		{
			name: 'free',
			range: 'Unlimited',
			description: 'Free preview models. No quota cost at all.',
			color: 'teal'
		},
		{
			name: 'excellent',
			range: '> 11,000',
			description: 'Workhorse models. Use these for volume.',
			color: 'cyan'
		},
		{
			name: 'good',
			range: '3,500 – 11,000',
			description: 'Economical for steady use.',
			color: 'emerald'
		},
		{
			name: 'moderate',
			range: '1,000 – 3,500',
			description: 'Balanced daily drivers.',
			color: 'amber'
		},
		{
			name: 'high',
			range: '500 – 1,000',
			description: 'Premium models for focused, short sessions.',
			color: 'orange'
		},
		{
			name: 'extreme',
			range: '< 500',
			description: 'Burns fastest. A handful of requests empties the $12 window.',
			color: 'red'
		}
	];

	/** Tailwind classes per burn-tier colour. Literal strings so Tailwind emits them. */
	const burnTierColor: Record<string, string> = {
		teal: 'border-teal-500/20 bg-teal-500/5 text-teal-900 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-100',
		cyan: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-100',
		emerald:
			'border-emerald-500/20 bg-emerald-500/5 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100',
		amber:
			'border-amber-500/20 bg-amber-500/5 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100',
		orange:
			'border-orange-500/20 bg-orange-500/5 text-orange-900 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-100',
		red: 'border-red-500/20 bg-red-500/5 text-red-900 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-100'
	};
</script>

<svelte:head>
	<title>About — ZenPick</title>
	<meta
		name="description"
		content="Why I built ZenPick: a free comparison layer for OpenCode Go, Zed Pro and GitHub Copilot Pro. Live benchmarks, plan-scoped prices, burn rates and main/sub agent stacks."
	/>
</svelte:head>

<LightRays class="rays-quiet" count={3} blur={26} speed={46} length="55%" />

<main class="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
	<!-- Document header -->
	<header
		class="relative mb-16 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-center lg:gap-16"
	>
		<div>
			{#if mounted}
				<div in:fly={{ y: 12, duration: 500 }}>
					<p
						class="mb-5 font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase dark:text-primary-strong"
					>
						Why ZenPick exists
					</p>
				</div>
			{/if}

			<h1
				class="mb-6 text-4xl leading-[1.05] font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
			>
				I was not paying too much for AI.
				<span class="block text-muted-foreground">I was paying for the wrong model.</span>
			</h1>

			<p class="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
				The price was never the problem. I pay a fixed amount each month and then spend it model by
				model, often on the wrong one. A cheap model can carry a full day of work; an expensive one
				empties the same window in an afternoon. ZenPick puts OpenCode Go, Zed Pro and GitHub
				Copilot Pro models on one table, shows what each plan charges, and builds a main agent plus
				a cheaper sub-agent, so the budget you already pay for goes further.
			</p>

			<p class="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
				<span class="inline-flex items-center gap-1.5">
					<Github class="size-4" />
					Built by
					<a
						href="https://github.com/Michael-Obele"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
					>
						Michael
					</a>
				</span>
				<span class="text-muted-foreground/50" aria-hidden="true">·</span>
				<span>Open source · Free to use</span>
			</p>

			<div class="mt-8 flex flex-wrap items-center gap-3 text-sm">
				<a
					href="/"
					class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
				>
					<ChevronLeft class="size-4" />
					Back to comparison
				</a>
				<a
					href="https://github.com/Michael-Obele/zenpick"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
				>
					Source on GitHub
					<ExternalLink class="size-3.5" />
				</a>
			</div>
		</div>

		{#if mounted}
			<div
				in:fade={{ duration: 600, delay: 180 }}
				class="rounded-2xl border border-border bg-card p-3 shadow-sm"
			>
				<div class="rounded-xl border border-border/80 bg-muted/40 p-5 sm:p-6">
					<div class="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
						<div>
							<p
								class="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase dark:text-primary-strong"
							>
								ZenPick receipt
							</p>
							<p class="mt-1 text-sm text-muted-foreground">See the cost before you commit.</p>
						</div>
						<Thermometer class="size-5 text-primary dark:text-primary-strong" />
					</div>
					{#await catalogPromise}
						<ReceiptBlock />
					{:then rows}
						<ReceiptBlock modelCount={rows.length} planCount={planCount(rows)} />
					{/await}
					<p class="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
						Check cost and burn before the session starts, not after the quota is gone.
					</p>
				</div>
			</div>
		{/if}
	</header>

	<!-- On this page — sticky so the chart stays findable on a long page. -->
	<nav
		aria-label="On this page"
		class="sticky top-0 z-30 -mx-4 mb-16 border-y border-border/70 bg-background/80 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
	>
		<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5">
			<span
				class="mr-1 font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase"
			>
				On this page
			</span>
			{#each pageSections as section (section.id)}
				<a
					href="#{section.id}"
					class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {section.featured
						? 'border-primary/40 bg-primary/10 font-medium text-primary hover:border-primary/60 dark:text-primary-strong'
						: 'border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground'}"
				>
					{section.label}
				</a>
			{/each}
		</div>
	</nav>

	<!-- 01 THE PRODUCT -->
	<section class="mb-20" aria-labelledby="product">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="product" class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground">
				What ZenPick does
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground">
			<p>
				One table covers OpenCode Go, Zed Pro and GitHub Copilot Pro. Filter to one plan and every
				price is that plan's price. Leave it on all plans and each row shows the cheapest input rate
				plus the plans that carry the model.
			</p>
			<p>
				The agent stack picks a main agent and a cheaper sub-agent. It shows what the pair costs per
				100 requests, how much that saves against sending everything to the main model, and how many
				requests the monthly allowance covers. In <code class="font-mono text-sm">/compare</code>,
				picks are <code class="font-mono text-sm">plan:id</code> keys, so one selection can hold models
				from different plans.
			</p>
			<p>
				OpenCode Go keeps the tools that depend on its request windows: the quota calculator,
				thermal burn bands and the burn chart. Zed Pro and Copilot Pro use monthly token allowances,
				so their rows carry plan prices, intelligence, coding score and context instead.
			</p>
			<p>
				Everything runs on a stale-while-revalidate cache, so revisits are instant and live data is
				not fetched again within six hours. A build that ran without upstream data expires after 15
				minutes instead of holding nulls for six hours.
			</p>
		</div>

		<Schematic />
	</section>

	<!-- 02 PLANS -->
	<section class="mb-20" aria-labelledby="plans">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="plans" class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground">
				Three plans, one table
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<p class="mb-6 max-w-3xl text-base leading-relaxed text-foreground">
			All three plans cost $10 a month. What differs is what the $10 buys: request windows on
			OpenCode Go, a token credit on Zed Pro and GitHub Copilot Pro. The cards read the same plan
			data as the app, so this page cannot drift from the table.
		</p>

		{#await stackPlansPromise}
			<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
		{:then plans}
			<PlanCards {plans} />
		{/await}

		<Callout variant="amber" label="plan data">
			Zed Pro and Copilot Pro facts were checked against the vendor pages on the dates shown on each
			card. Prices and allowances change; open the linked page before you rely on a number. OpenCode
			Go models are live from its catalog; its plan terms come from the Go docs.
		</Callout>
	</section>

	<!-- 03 AGENT STACKS -->
	<section class="mb-20" aria-labelledby="agent-stacks">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2
				id="agent-stacks"
				class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground"
			>
				Main agent, cheaper sub-agent
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<p class="mb-6 max-w-3xl text-base leading-relaxed text-foreground">
			The main agent plans, decides and writes the hard parts. Sub-agents implement, review and fix.
			Send most requests to a cheaper model and the same allowance stretches further.
		</p>

		{#await stackPlansPromise}
			<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
		{:then plans}
			<StackPreview {plans} />
		{/await}

		<p class="mt-6 max-w-3xl text-base leading-relaxed text-foreground">
			Nothing joins your comparison until you press <strong>Compare this pair</strong>. The link
			carries both keys (<code class="font-mono text-sm">?models=plan:id,plan:id</code>), so it
			reopens the pair on the compare page and you can add more models there.
		</p>

		<div class="mt-6">
			<a
				href="/#agent-stack"
				class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
			>
				Build your own pair
			</a>
		</div>
	</section>

	<!-- 04 THE NUMBERS -->
	<section class="mb-20" aria-labelledby="numbers">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="numbers" class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground">
				The numbers
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
			<StatCard
				figure="$10"
				unit="/mo"
				label="per plan"
				footnote="OpenCode Go, Zed Pro and GitHub Copilot Pro each cost the same."
			/>
			{#await catalogPromise}
				<StatCard figure="—" label="models tracked" footnote="Loading…" />
				<StatCard figure="—" label="plan listings" footnote="Loading…" />
			{:then rows}
				<StatCard
					figure={String(rows.length)}
					label="models tracked"
					footnote="One row per model, whichever plans carry it."
				/>
				<StatCard
					figure={String(planListingCount(rows))}
					label="plan listings"
					footnote="A model on two plans counts twice."
				/>
			{/await}
			<StatCard
				figure="6"
				unit="h"
				label="cache TTL"
				footnote="Stale-while-revalidate; 15 minutes when an upstream build is partial."
			/>
			<StatCard figure="Free" label="to use" footnote="No account, no paywall, open source." />
		</div>

		<div class="mt-10">
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
				OpenCode Go only. Burn bands come from its published request windows; Zed Pro and Copilot
				Pro use monthly token credits.
			</p>
			{#if mounted}
				<div in:fade={{ duration: 500, delay: 200 }}>
					<ModelBurnChart />
				</div>
			{/if}
		</div>

		<!-- The headline chart. It carries the whole argument, so it gets an
		     anchor (the jump list links here) and a lead-in that says what to
		     look for. -->
		<div class="mt-10 scroll-mt-24" id="price-performance">
			<div class="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
				<p class="max-w-2xl text-base leading-relaxed text-foreground">
					Every model is one dot. The shaded corner is the sweet spot — scoring above the median
					while costing less than it — and the ringed dot is the strongest model in there. Zed Pro
					and Copilot Pro rows are not plotted because they have no burn band.
				</p>
				<div class="flex items-center gap-3 text-xs text-muted-foreground">
					<span>Live, OpenCode Go only.</span>
					<a
						href="/#compare-models"
						class="text-primary underline-offset-4 hover:underline dark:text-primary-strong"
					>
						Interact with it — filter by task
					</a>
				</div>
			</div>
			{#await modelsPromise}
				<div class="h-48 animate-pulse rounded-xl bg-muted"></div>
			{:then models}
				{#if mounted}
					<div in:fade={{ duration: 500, delay: 300 }}>
						<PricePerformanceScatter {models} />
					</div>
				{/if}
			{/await}
		</div>

		<Callout variant="cyan" label="methodology note">
			"Upstream" refers to the data aggregated at modelgrep.com (OpenRouter pricing + Artificial
			Analysis benchmarks) and llm-stats.com (benchmark scores, rankings, and pricing). Plan facts
			are not upstream: Zed and Copilot prices are checked by hand against their docs.
		</Callout>

		<div class="mt-8 text-center">
			{#await catalogPromise}
				<a
					href="/#compare-models"
					class="inline-flex items-center rounded-full border border-border/60 bg-background px-4 py-2 text-sm text-foreground underline-offset-12 hover:underline"
				>
					See all models ranked
				</a>
			{:then rows}
				<a
					href="/#compare-models"
					class="inline-flex items-center rounded-full border border-border/60 bg-background px-4 py-2 text-sm text-foreground underline-offset-12 hover:underline"
				>
					See all {rows.length} models ranked
				</a>
			{/await}
		</div>
	</section>

	<!-- 05 METHODOLOGY -->
	<section class="mb-20" aria-labelledby="methodology">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2
				id="methodology"
				class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground"
			>
				Methodology
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground">
			<p>
				OpenCode Go models get a 0 to 100 fit score for five scenarios:
				<em>Brainstorming</em>, <em>Coding</em>, <em>Agentic</em>,
				<em>Budget</em>, and
				<em>Frontend</em>. Scores are normalized across the current Go population, so the ordering
				is always meaningful and always non-empty. The table sorts by the active scenario; with none
				active, it sorts by raw coding benchmark.
			</p>
			<p>
				Zed Pro and Copilot Pro rows skip the scenario score. They show the plan's price, Artificial
				Analysis intelligence, coding score and context window instead. Scenario filters clear when
				you switch to those plans, so a ranking never hides models the data cannot score.
			</p>
			<p>
				Go tags, migration hints and thermal burn rates are inferred from upstream data. Plan facts
				are different: prices, allowances, caveats and model lists are hand-checked against the
				vendor pages, and every card carries the date it was checked. If an upstream value changes,
				the page changes; if a vendor page changes, the plan card waits for a code update.
			</p>
		</div>

		<!-- Radar visualization -->
		<div class="my-6">
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
				OpenCode Go only. The radar runs on scenario fit scores, which the static plans do not have.
			</p>
			{#await modelsPromise}
				<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
			{:then models}
				{#if mounted}
					<div in:fade={{ duration: 500, delay: 200 }}>
						<ScenarioRadarChart {models} />
					</div>
				{/if}
			{/await}
		</div>
	</section>

	<!-- 06 DATA & ATTRIBUTION -->
	<section class="mb-20" aria-labelledby="attribution">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2
				id="attribution"
				class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground"
			>
				Data &amp; attribution
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground">
			<p>
				Benchmark scores, pricing, and speed data are aggregated by
				<a
					href="https://modelgrep.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline dark:text-primary-strong"
				>
					modelgrep.com
					<ExternalLink class="size-3" />
				</a>
				(OpenRouter pricing + Artificial Analysis benchmarks) and
				<a
					href="https://llm-stats.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline dark:text-primary-strong"
				>
					llm-stats.com
					<ExternalLink class="size-3" />
				</a>
				(benchmark scores, rankings, and pricing), and used with attribution. The OpenCode Go catalog
				comes from its docs and models.dev. Zed Pro and Copilot Pro plan facts come from the vendor pages
				in the table below.
			</p>
			<p class="text-muted-foreground">
				Everything ZenPick computes on top (scenario fit scores, burn rate tiers, migration hints)
				is derived from those sources, in the schematic above. Plan facts are hand-checked, not
				inferred. The data and the attribution are kept close on purpose.
			</p>
		</div>

		<SourceTable />

		<Callout variant="amber" label="freshness">
			Live numbers are cached for six hours; a partial upstream build expires after 15 minutes
			instead of pinning nulls. Plan facts carry their check date and do not refresh until the code
			is updated.
		</Callout>

		<div class="mt-10 flex justify-center">
			<a
				href="/#compare-models"
				class="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
			>
				Data checks out? Put it to work
				<ArrowRight class="size-4" />
			</a>
		</div>
	</section>

	<!-- 07 LLMS.TXT — MACHINE-READABLE CATALOG -->
	<section class="mb-20 scroll-mt-24" aria-labelledby="llms-txt" id="llms-txt">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="llms-txt-heading" class="text-2xl font-semibold tracking-tight text-foreground">
				For AI agents — <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
					>llms.txt</code
				>
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<p class="mb-4 text-base leading-relaxed text-foreground">
			The homepage is JavaScript-rendered, so fetching its HTML returns a shell. <a
				href="/llms.txt"
				class="font-medium text-primary underline-offset-4 hover:underline dark:text-primary-strong"
				>ZenPick's <code class="font-mono text-sm">/llms.txt</code></a
			> is the same live catalog as plain markdown — regenerated on every request from the server-side
			cache (at most ~6 hours stale), no browser and no API key required.
		</p>
		<p class="mb-4 text-base leading-relaxed text-foreground">
			The file is OpenCode Go only. Zed Pro and Copilot Pro prices live in the app, where each row
			shows that plan's price (and a note when the vendor has one). They are not in
			<code class="font-mono text-sm">llms.txt</code> yet.
		</p>
		<p class="mb-6 text-base leading-relaxed text-muted-foreground">
			One fetch answers "which OpenCode Go model should I use" without running the app. Quick
			answers at the top rank every leaderboard for you; the table below is grep-able and sortable
			in context.
		</p>

		<div class="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
			<div class="rounded-xl border border-border bg-card p-5 sm:p-6">
				<h3 class="mb-3 text-sm font-semibold text-foreground">Query URLs</h3>
				<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
					The same <code class="font-mono text-foreground">?need=</code> and
					<code class="font-mono text-foreground">?q=</code> the interactive table uses — they sort or
					filter the markdown before you read it.
				</p>
				<ul class="space-y-2 font-mono text-xs leading-relaxed">
					<li>
						<span class="text-muted-foreground">Leaderboard</span><br />
						<code class="break-all text-foreground">/llms.txt?need=cheapest</code>
						<span class="text-muted-foreground"
							>— cheapest-first (also: coding, design, smartest, reasoning, vision, open-source,
							long-context)</span
						>
					</li>
					<li>
						<span class="text-muted-foreground">Search</span><br />
						<code class="break-all text-foreground">/llms.txt?q=vision</code>
						<span class="text-muted-foreground">— name, provider, tags, capabilities</span>
					</li>
					<li>
						<span class="text-muted-foreground">Both</span><br />
						<code class="break-all text-foreground">/llms.txt?need=cheapest&q=vision</code>
					</li>
					<li>
						<span class="text-muted-foreground">Compare (browser)</span><br />
						<code class="break-all text-foreground"
							>/compare?models=go:deepseek-v4.1-flash,zed:claude-sonnet-5.5</code
						>
						<span class="text-muted-foreground"
							>— plan:id keys; mixed plans work, and bare Go ids still resolve</span
						>
					</li>
					<li>
						<span class="text-muted-foreground">Raw data</span><br />
						<code class="break-all text-foreground">/debug/export?section=models&format=json</code>
						<span class="text-muted-foreground">— JSON or md, per section</span>
					</li>
				</ul>
				<p class="mt-4 text-xs leading-relaxed text-muted-foreground">
					Quote the <code class="font-mono text-foreground">ID</code> column for models, and the
					<code class="font-mono text-foreground">plan:id</code>
					key for compare URLs. IDs are the stable keys; names are display text and change. Link
					<code class="font-mono text-foreground">/llms.txt</code>
					and the <code class="font-mono text-foreground">Data as of</code> timestamp when citing a number.
				</p>
			</div>

			<div class="space-y-4">
				<div class="rounded-xl border border-border bg-muted/40 p-5">
					<p
						class="mb-2 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
					>
						Try it
					</p>
					<pre
						class="overflow-x-auto rounded-lg bg-foreground px-3 py-2.5 font-mono text-xs leading-relaxed text-background"><code
							>curl https://zp.svelte-apps.me/llms.txt | head -n 40
curl "https://zp.svelte-apps.me/llms.txt?need=coding&q=vision"
curl https://zp.svelte-apps.me/debug/export?section=models&format=json | jq .</code
						></pre>
					<div class="mt-3 flex flex-wrap gap-2">
						<a
							href="/llms.txt"
							class="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
						>
							Open llms.txt
							<ExternalLink class="size-3" />
						</a>
						<a
							href="/llms.txt?need=cheapest"
							class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
						>
							Cheapest ranking
						</a>
					</div>
				</div>
				<Callout variant="cyan" label="what is not in the table">
					Input/output modalities, tool calling, structured output, and reasoning flags are not
					columns in <code class="font-mono">llms.txt</code>. Follow the
					<code class="font-mono">Source</code> link per model (LLM Stats) or fetch the raw slice
					for full
					<code class="font-mono">capabilities</code>. Zed Pro and Copilot Pro prices and plan notes
					are not in the table either; open the plan in the app or fetch the raw model slice.
				</Callout>
			</div>
		</div>
	</section>

	<!-- 08 THERMAL KEY -->
	<section class="mb-16" aria-labelledby="key">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium tracking-wider text-primary uppercase dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="key" class="scroll-mt-24 text-2xl font-semibold tracking-tight text-foreground">
				Thermal key
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<p class="mb-6 text-base leading-relaxed text-muted-foreground">
			On OpenCode Go, every model gets a thermal burn band, built from OpenCode's published request
			counts per $12 window. It tells you how fast that model drains your quota: a cold band lasts
			the window, a hot one empties it in an afternoon. Zed Pro and Copilot Pro are billed against
			monthly token credits, so their rows show a dash for burn and quota.
		</p>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each burnTiers as tier (tier.name)}
				{@const color = burnTierColor[tier.color] ?? burnTierColor.red}
				<div class="rounded-lg border p-4 {color}">
					<div class="mb-2 flex items-center gap-2">
						<span class="inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true"></span>
						<span class="font-mono text-[10px] tracking-[0.2em] uppercase">{tier.name}</span>
					</div>
					<div class="font-mono text-2xl text-foreground tabular-nums">
						{tier.range}
					</div>
					<div class="mt-1 text-xs text-muted-foreground">
						{tier.description}
					</div>
				</div>
			{/each}
		</div>

		<div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
			<Thermometer class="size-3" />
			<span>
				Source function:
				<code class="font-mono text-foreground">computeBurnScore()</code> in
				<code class="font-mono text-foreground">src/lib/server/burn.ts</code>
			</span>
		</div>
	</section>

	<!-- 09 TRY IT -->
	<section class="mb-16" aria-labelledby="try-it">
		<div class="rounded-2xl border border-border bg-card/40 p-6 sm:p-10">
			<div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 id="try-it" class="mb-2 text-2xl font-semibold tracking-tight text-foreground">
						You already pay for a plan. Make it last.
					</h2>
					<p class="max-w-xl text-muted-foreground">
						OpenCode Go, Zed Pro and GitHub Copilot Pro all cost $10 a month. ZenPick shows what
						each plan charges for the models they share, what a main and sub-agent pair costs per
						100 requests, and how fast a Go model drains its window.
					</p>
					<p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1.5">
							<CircleCheck class="size-3.5 text-emerald-700 dark:text-emerald-300" />
							Free, no account
						</span>
						<span class="inline-flex items-center gap-1.5">
							<CircleCheck class="size-3.5 text-emerald-700 dark:text-emerald-300" />
							Live Go data and hand-checked plan pages
						</span>
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<a
						href="/#compare-models"
						class="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
					>
						<Timer class="size-4" />
						Find my model
					</a>
					<a
						href="/#agent-stack"
						class="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
					>
						<ArrowRight class="size-4" />
						Build my agent stack
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-border pt-8">
		<div
			class="flex flex-col items-start gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="flex items-center gap-3">
				<a
					href="/"
					class="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
				>
					<ChevronLeft class="size-4" />
					Back to comparison
				</a>
				<span class="text-muted-foreground/30" aria-hidden="true">·</span>
				<a
					href="https://github.com/Michael-Obele/zenpick"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
				>
					Source
					<ExternalLink class="size-3" />
				</a>
			</div>
		</div>
	</footer>
</main>

<style>
	/*
	 * Section numbers are derived from document order via CSS counters, so the
	 * "01"–"09" prefixes never need manual renumbering — add or remove a
	 * `.section-number` span and the rest reflow automatically.
	 */
	main {
		counter-reset: section;
	}

	.section-number {
		counter-increment: section;
	}

	.section-number::before {
		content: counter(section, decimal-leading-zero);
	}
</style>
