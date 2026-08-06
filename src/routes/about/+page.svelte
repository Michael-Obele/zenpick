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
		ArrowUpRight,
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
</script>

<svelte:head>
	<title>About — ZenPick</title>
	<meta
		name="description"
		content="Why I switched to OpenCode Go and built ZenPick: a thermal-quota compass that compares 13+ open coding models on benchmarks, pricing, and quota burn."
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
					<p class="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
						Why ZenPick exists
					</p>
				</div>
			{/if}

			<h1
				class="mb-6 text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
			>
				I switched because AI got too expensive.
				<span class="block text-muted-foreground">OpenCode Go made it make sense.</span>
			</h1>

			<p class="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
				Like a lot of developers, I watched my AI subscriptions drift upward while the value stayed
				flat. OpenCode Go flipped the model: $10/month, thirteen open coding models, generous quota
				windows. But it does not tell you which model fits which task. That is what ZenPick is for.
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
					class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
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
							<p class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
								ZenPick receipt
							</p>
							<p class="mt-1 text-sm text-muted-foreground">A clearer way to spend your quota.</p>
						</div>
						<Thermometer class="size-5 text-primary" />
					</div>
					<ReceiptBlock />
					<p class="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
						Compare capability, cost, and burn before the next coding session starts.
					</p>
				</div>
			</div>
		{/if}
	</header>

	<!-- 01 THE PRODUCT -->
	<section class="mb-20" aria-labelledby="product">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary"
				aria-hidden="true"
			></span>
			<h2 id="product" class="text-2xl font-semibold tracking-tight text-foreground">
				What ZenPick does
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground/85">
			<p>
				Three things, on one page. A sortable table of every Go model with live benchmark scores. A
				quota calculator that turns a token estimate into a number-of-requests per window. A detail
				drawer that names the closed-source model each Go model replaces, and why.
			</p>
			<p>
				Everything runs on a stale-while-revalidate cache, so the page is fast on revisit and never
				asks the upstream APIs for the same data twice within six hours.
			</p>
		</div>

		<Schematic />
	</section>

	<!-- 02 THE NUMBERS -->
	<section class="mb-20" aria-labelledby="numbers">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary"
				aria-hidden="true"
			></span>
			<h2 id="numbers" class="text-2xl font-semibold tracking-tight text-foreground">
				The numbers
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
			<StatCard figure="10" unit="/mo" label="subscription" footnote="First month $5." />
			<StatCard figure="13" unit="+" label="models tracked" footnote="Across 6 providers." />
			<StatCard figure="6" unit="h" label="cache TTL" footnote="Stale-while-revalidate." />
			<StatCard
				figure="324"
				label="upstream models"
				footnote="Cross-referenced via modelgrep + LLM Stats."
			/>
			<StatCard
				figure="50%"
				label="cheaper"
				footnote="Same features at half the cost of what it replaced."
			/>
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

		<div class="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground/70">
			<span>Live price-vs-performance from upstream data.</span>
			<a
				href="/#compare-models"
				class="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
			>
				Interact with it — filter by task
				<ArrowRight class="size-3" />
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
				class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-4 py-2 text-sm text-foreground hover:underline underline-offset-12"
			>
				See all 13+ models ranked
				<ArrowRight class="size-4" />
			</a>
		</div>
	</section>

	<!-- 03 METHODOLOGY -->
	<section class="mb-20" aria-labelledby="methodology">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary"
				aria-hidden="true"
			></span>
			<h2 id="methodology" class="text-2xl font-semibold tracking-tight text-foreground">
				Methodology
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground/85">
			<p>
				Every model gets a 0–100 fit score for five scenarios — <em>Brainstorming</em>,
				<em>Coding</em>, <em>Agentic</em>, <em>Budget</em>, and
				<em>Frontend</em>. Scores are normalized across the current model population, so the
				ordering is always meaningful and always non-empty. The table sorts by the active scenario;
				if no scenario is active, it sorts by raw coding benchmark.
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
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary"
				aria-hidden="true"
			></span>
			<h2 id="attribution" class="text-2xl font-semibold tracking-tight text-foreground">
				Data &amp; attribution
			</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<div class="space-y-4 text-base leading-relaxed text-foreground/85">
			<p>
				Benchmark scores, pricing, and speed data are aggregated by
				<a
					href="https://modelgrep.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
				>
					modelgrep.com
					<ExternalLink class="size-3" />
				</a>
				(OpenRouter pricing + Artificial Analysis benchmarks) and
				<a
					href="https://llm-stats.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
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
					class="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
				>
					OpenCode Go documentation
					<ExternalLink class="size-3" />
				</a>.
			</p>
			<p class="text-muted-foreground">
				Everything ZenPick computes on top — scenario fit scores, burn rate tiers, migration hints —
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
				class="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
			>
				Data checks out? Try the comparison
				<ArrowRight class="size-4" />
			</a>
		</div>
	</section>

	<!-- 05 THERMAL KEY -->
	<section class="mb-16" aria-labelledby="key">
		<div class="mb-6 flex items-baseline gap-3">
			<span
				class="section-number font-mono text-xs font-medium uppercase tracking-wider text-primary"
				aria-hidden="true"
			></span>
			<h2 id="key" class="text-2xl font-semibold tracking-tight text-foreground">Thermal key</h2>
			<div class="ml-auto hidden h-px flex-1 bg-border sm:block" aria-hidden="true"></div>
		</div>

		<p class="mb-6 text-base leading-relaxed text-muted-foreground">
			Every model in ZenPick carries a thermal burn band. It is derived from OpenCode's published
			usage-limit request counts — requests per $12 / 5h window, scraped from the Go docs — a direct
			measure of how fast the model burns through your quota (not an inference from price).
		</p>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
			{#each burnTiers as tier (tier.name)}
				{@const color =
					tier.color === 'cyan'
						? 'border-cyan-500/20 bg-cyan-500/5 text-cyan-500'
						: tier.color === 'emerald'
							? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500'
							: tier.color === 'amber'
								? 'border-amber-500/20 bg-amber-500/5 text-amber-500'
								: tier.color === 'orange'
									? 'border-orange-500/20 bg-orange-500/5 text-orange-500'
									: 'border-red-500/20 bg-red-500/5 text-red-500'}
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

		<div class="mt-6 flex items-center gap-2 text-xs text-muted-foreground/70">
			<Thermometer class="size-3" />
			<span>
				Source function:
				<code class="font-mono text-foreground/80">computeBurnScore()</code> in
				<code class="font-mono text-foreground/80">src/lib/server/burn.ts</code>
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
						Every model burns quota at a different rate — pick the right one and the window lasts;
						pick wrong and it empties in minutes.
					</p>
					<p
						class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/70"
					>
						<span class="inline-flex items-center gap-1.5">
							<CircleCheck class="size-3.5 text-emerald-500" />
							Free, no account
						</span>
						<span class="inline-flex items-center gap-1.5">
							<CircleCheck class="size-3.5 text-emerald-500" />
							Live data from 3 upstream sources
						</span>
					</p>
				</div>
				<a
					href="/#compare-models"
					class="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
				>
					<Timer class="size-4" />
					Find my model before my next session
					<ArrowUpRight class="size-4" />
				</a>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-border pt-8">
		<div
			class="flex flex-col items-start gap-3 text-sm text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between"
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
