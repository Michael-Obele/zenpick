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
	import { getModels } from '$lib/remote/models.remote';
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
	onMount(() => {
		mounted = true;
	});

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
		content="Why I built ZenPick: a free tool that lines up every model in your plan so you stop wasting your AI budget on the wrong one. Live benchmarks, price, and quota burn."
	/>
</svelte:head>

<LightRays class="rays-quiet" count={3} blur={26} speed={46} length="55%" />

<main class="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
	<!-- subtle receipt paper texture background -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-linear-to-b from-primary/3 to-transparent"
		aria-hidden="true"
	></div>

	<!-- Document header -->
	<header
		class="relative mb-16 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-center lg:gap-16"
	>
		<div>
			{#if mounted}
				<div in:fly={{ y: 12, duration: 500 }}>
					<p
						class="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary dark:text-primary-strong"
					>
						Why ZenPick exists
					</p>
				</div>
			{/if}

			<h1
				class="mb-6 text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
			>
				I was not paying too much for AI.
				<span class="block text-muted-foreground">I was paying for the wrong model.</span>
			</h1>

			<p class="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
				The price was never the problem. I pay a fixed amount each month and then spend it model by
				model, often on the wrong one. A cheap model can carry a full day of work; an expensive one
				empties the same window in an afternoon. ZenPick lines the models up against the task you
				actually have, so the budget you already pay for goes further.
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
								class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary dark:text-primary-strong"
							>
								ZenPick receipt
							</p>
							<p class="mt-1 text-sm text-muted-foreground">See the cost before you commit.</p>
						</div>
						<Thermometer class="size-5 text-primary dark:text-primary-strong" />
					</div>
					<ReceiptBlock />
					<p class="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
						Check cost and burn before the session starts, not after the quota is gone.
					</p>
				</div>
			</div>
		{/if}
	</header>

	<!-- 01 THE PRODUCT -->
	<section class="mb-20" aria-labelledby="product">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="product" class="text-2xl font-semibold tracking-tight text-foreground">
				What ZenPick does
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground">
			<p>
				Three things on one page: a sortable table of every model with live benchmark scores, a
				quota calculator that turns a token estimate into requests per window, and a detail drawer
				that names the closed-source model each one replaces. Together they answer one question:
				which model gives you the most for the budget you already have.
			</p>
			<p>
				Everything runs on a stale-while-revalidate cache, so revisits are instant and the page
				never fetches the same data twice within six hours.
			</p>
		</div>

		<Schematic />
	</section>

	<!-- 02 THE NUMBERS -->
	<section class="mb-20" aria-labelledby="numbers">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="numbers" class="text-2xl font-semibold tracking-tight text-foreground">
				The numbers
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
			<StatCard
				figure="10"
				unit="/mo"
				label="subscription"
				footnote="The budget you are already spending."
			/>
			<StatCard figure="13" unit="+" label="models tracked" footnote="Across 6 providers." />
			<StatCard figure="6" unit="h" label="cache TTL" footnote="Stale-while-revalidate." />
			<StatCard
				figure="324"
				label="upstream models"
				footnote="Cross-referenced via modelgrep + LLM Stats."
			/>
			<StatCard figure="Free" label="to use" footnote="No account, no paywall, open source." />
		</div>

		<div class="mt-10">
			{#if mounted}
				<div in:fade={{ duration: 500, delay: 200 }}>
					<ModelBurnChart />
				</div>
			{/if}
		</div>

		<div class="mt-10">
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

		<div class="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
			<span>Live price-vs-performance from upstream data.</span>
			<a
				href="/#compare-models"
				class="text-primary underline-offset-4 hover:underline dark:text-primary-strong"
			>
				Interact with it — filter by task
			</a>
		</div>

		<Callout variant="cyan" label="methodology note">
			"Upstream" refers to the data aggregated at modelgrep.com (OpenRouter pricing + Artificial
			Analysis benchmarks) and llm-stats.com (benchmark scores, rankings, and pricing), which tracks
			every model we cross-check against.
		</Callout>

		<div class="mt-8 text-center">
			<a
				href="/#compare-models"
				class="inline-flex items-center rounded-full border border-border/60 bg-background px-4 py-2 text-sm text-foreground hover:underline underline-offset-12"
			>
				See all 13+ models ranked
			</a>
		</div>
	</section>

	<!-- 03 METHODOLOGY -->
	<section class="mb-20" aria-labelledby="methodology">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="methodology" class="text-2xl font-semibold tracking-tight text-foreground">
				Methodology
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground">
			<p>
				Every model gets a 0 to 100 fit score for five scenarios:
				<em>Brainstorming</em>, <em>Coding</em>, <em>Agentic</em>, <em>Budget</em>, and
				<em>Frontend</em>. Scores are normalized across the current model population, so the
				ordering is always meaningful and always non-empty. The table sorts by the active scenario;
				with none active, it sorts by raw coding benchmark.
			</p>
			<p>
				Tags, migration hints, and thermal burn rates are inferred. Nothing on the page is
				hand-curated. If the upstream data changes, the page changes.
			</p>
		</div>

		<!-- Radar visualization -->
		<div class="my-6">
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

	<!-- 04 DATA & ATTRIBUTION -->
	<section class="mb-20" aria-labelledby="attribution">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="attribution" class="text-2xl font-semibold tracking-tight text-foreground">
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
				(benchmark scores, rankings, and pricing), and used with attribution. The model list, endpoint
				types, and quota windows come from the
				<a
					href="https://opencode.ai/docs/go/"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline dark:text-primary-strong"
				>
					OpenCode Go documentation
					<ExternalLink class="size-3" />
				</a>.
			</p>
			<p class="text-muted-foreground">
				Everything ZenPick computes on top (scenario fit scores, burn rate tiers, migration hints)
				is derived from those sources, in the schematic above. The data and the attribution are kept
				close on purpose.
			</p>
		</div>

		<SourceTable />

		<Callout variant="amber" label="freshness">
			The 6-hour cache is the longest ZenPick will let any number go without re-fetching. A red
			indicator appears on the comparison page if upstream data is unreachable.
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

	<!-- 05 THERMAL KEY -->
	<section class="mb-16" aria-labelledby="key">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary dark:text-primary-strong"
				aria-hidden="true"
			></span>
			<h2 id="key" class="text-2xl font-semibold tracking-tight text-foreground">Thermal key</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<p class="mb-6 text-base leading-relaxed text-muted-foreground">
			Every model gets a thermal burn band, built from OpenCode's published request counts per $12
			window. It tells you how fast that model drains your quota: a cold band lasts the window, a
			hot one empties it in an afternoon.
		</p>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each burnTiers as tier (tier.name)}
				{@const color = burnTierColor[tier.color] ?? burnTierColor.red}
				<div class="rounded-lg border p-4 {color}">
					<div class="mb-2 flex items-center gap-2">
						<span class="inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true"></span>
						<span class="font-mono text-[10px] uppercase tracking-[0.2em]">{tier.name}</span>
					</div>
					<div class="font-mono text-2xl tabular-nums text-foreground">{tier.range}</div>
					<div class="mt-1 text-xs text-muted-foreground">{tier.description}</div>
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

	<!-- 06 TRY IT -->
	<section class="mb-16" aria-labelledby="try-it">
		<div class="rounded-2xl border border-border bg-card/40 p-6 sm:p-10">
			<div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 id="try-it" class="mb-2 text-2xl font-semibold tracking-tight text-foreground">
						Your $12 quota window is ticking.
					</h2>
					<p class="max-w-xl text-muted-foreground">
						Every model burns quota at a different rate. Pick the right one and the window lasts.
						Pick the wrong one and it empties in minutes.
					</p>
					<p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1.5">
							<CircleCheck class="size-3.5 text-emerald-700 dark:text-emerald-300" />
							Free, no account
						</span>
						<span class="inline-flex items-center gap-1.5">
							<CircleCheck class="size-3.5 text-emerald-700 dark:text-emerald-300" />
							Live data from 3 upstream sources
						</span>
					</p>
				</div>
				<a
					href="/#compare-models"
					class="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:bg-primary-strong dark:text-background dark:hover:bg-primary-strong/90"
				>
					<Timer class="size-4" />
					Find my model before my next session
				</a>
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
	 * "01"–"05" prefixes never need manual renumbering — add or remove a
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
