<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import BurnBadge from './BurnBadge.svelte';
	import CompareRow from './CompareRow.svelte';
	import {
		X,
		Scale,
		Crown,
		Check,
		Minus,
		ExternalLink,
		Replace,
		Trophy,
		Wallet
	} from '@lucide/svelte';
	import { llmStatsModelUrl } from '$lib/utils/llm-stats-url';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { benchmarkToPercent } from '$lib/compare-defaults';
	import { recommendModel, REFERENCE_TOKENS, REFERENCE_CACHED_PCT } from '$lib/recommendation';
	import type { RecommendationScenario } from '$lib/recommendation';
	import { tieRound } from '$lib/utils';

	/** Catalog-wide anchor roles for model columns (from compare smart defaults). */
	type AnchorRole = 'quality' | 'value';

	const ANCHOR_META: Record<AnchorRole, { label: string; icon: typeof Trophy }> = {
		quality: { label: 'Top quality', icon: Trophy },
		value: { label: 'Best value', icon: Wallet }
	};

	interface Props {
		models: GoModel[];
		onRemove?: (id: string) => void;
		/** Model id → anchor role, used to render a data-derived chip in the column header. */
		anchors?: Record<string, AnchorRole>;
		/**
		 * Optional task focus ("scenario crown"): crowns the best model of the
		 * comparison for this task using the recommendation funnel's blend of
		 * fit, capacity, and quality at the reference workload. Empty means
		 * the plain benchmark verdict.
		 */
		scenario?: RecommendationScenario | '';
	}

	let { models, onRemove, anchors = {}, scenario = '' }: Props = $props();

	const cols = $derived(`160px repeat(${models.length}, minmax(190px, 1fr))`);

	function fmtPrice(n: number | null): string {
		return n == null ? '—' : `$${n.toFixed(2)}`;
	}
	function fmtTokens(n: number | null): string {
		if (!n) return '—';
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
		return `${n}`;
	}

	// ─── Verdict ────────────────────────────────────────────────────────────
	const benchKeys: (keyof GoModel['benchmarks'])[] = [
		'coding',
		'reasoning',
		'math',
		'sweBenchVerified'
	];
	/** Tie precision per benchmark: sweBenchVerified is stored 0–1 (SciCode
	 *  fraction), so 3 decimals there ≈ 1 display decimal on the 0–100 scale. */
	const benchTieDecimals: Partial<Record<keyof GoModel['benchmarks'], number>> = {
		sweBenchVerified: 3
	};

	let verdict = $derived(buildVerdict(models));

	/** Wins per model id across the benchmark categories (draws count for nobody). */
	function countBenchWins(ms: GoModel[]): Record<string, number> {
		const wins: Record<string, number> = {};
		ms.forEach((m) => (wins[m.id] = 0));
		for (const k of benchKeys) {
			const decimals = benchTieDecimals[k] ?? 1;
			const nums = ms
				.map((m) => ({ id: m.id, v: m.benchmarks[k] as number | null }))
				.filter((x) => x.v != null)
				.map((x) => ({ id: x.id, v: tieRound(x.v as number, decimals) }));
			if (!nums.length) continue;
			const max = Math.max(...nums.map((x) => x.v));
			const leaders = nums.filter((x) => x.v === max);
			// Draws count for nobody.
			if (leaders.length === 1) wins[leaders[0].id]++;
		}
		return wins;
	}

	/** "X leads on N of 4…" — names every leader when the verdict is a draw. */
	function leaderSentence(ms: GoModel[], wins: Record<string, number>): string {
		const ranked = [...ms].sort((a, b) => wins[b.id] - wins[a.id] || a.name.localeCompare(b.name));
		const maxWins = wins[ranked[0].id];
		const leaders = ranked.filter((m) => wins[m.id] === maxWins);
		if (leaders.length === 1) {
			return `${leaders[0].name} leads on ${maxWins} of ${benchKeys.length} benchmark categories.`;
		}
		if (maxWins === 0) {
			return `No clear leader across the ${benchKeys.length} benchmark categories — every category is tied.`;
		}
		return `${leaders.map((m) => m.name).join(' and ')} are tied, leading on ${maxWins} of ${benchKeys.length} benchmark categories.`;
	}

	/** Cheapest on input pricing, acknowledging price ties instead of breaking them. */
	function priceSentence(ms: GoModel[]): string | null {
		const priced = ms.filter((m) => m.pricing.inputPricePerM != null);
		if (!priced.length) return null;
		const cheapestPrice = Math.min(...priced.map((m) => m.pricing.inputPricePerM as number));
		const cheapest = priced.filter(
			(m) => tieRound(m.pricing.inputPricePerM as number, 2) === tieRound(cheapestPrice, 2)
		);
		const who =
			cheapest.length > 1
				? `${cheapest.map((m) => m.name).join(' and ')} are tied cheapest on input pricing`
				: `${cheapest[0].name} is cheapest on input pricing`;
		return `${who} (${fmtPrice(cheapestPrice)}/1M).`;
	}

	/** Largest context window, acknowledging size ties instead of breaking them. */
	function contextSentence(ms: GoModel[]): string | null {
		const withCtx = ms.filter((m) => m.contextWindow);
		if (!withCtx.length) return null;
		const largestCtx = Math.max(...withCtx.map((m) => m.contextWindow as number));
		const largest = withCtx.filter(
			(m) => tieRound(m.contextWindow as number, 0) === tieRound(largestCtx, 0)
		);
		const who =
			largest.length > 1
				? `${largest.map((m) => m.name).join(' and ')} are tied for the largest context window`
				: `${largest[0].name} offers the largest context window`;
		return `${who} (${fmtTokens(largestCtx)} tokens).`;
	}

	function buildVerdict(ms: GoModel[]): string {
		if (ms.length < 2) return '';
		const wins = countBenchWins(ms);
		return [leaderSentence(ms, wins), priceSentence(ms), contextSentence(ms)]
			.filter((s): s is string => s != null)
			.join(' ');
	}

	// ─── Scenario crown ───────────────────────────────────────────────────
	// When a task focus is active, the verdict row crowns the best model of
	// the comparison using the same blend as the homepage funnel (45% fit,
	// 30% capacity, 25% quality at the reference workload).
	let crown = $derived(
		scenario
			? recommendModel(models, {
					tokens: REFERENCE_TOKENS,
					cachedPct: REFERENCE_CACHED_PCT,
					scenario
				})
			: null
	);

	let crownWinnerId = $derived(crown?.winner.model.id);

	function scenarioLabelOf(key: RecommendationScenario): string {
		return scenarioKeys.find(([k]) => k === key)?.[1] ?? key;
	}

	let scenarioVerdict = $derived.by(() => {
		if (!scenario || !crown) return '';
		const winner = crown.winner;
		const runnerUp = crown.top[1]?.model;
		const label = scenarioLabelOf(scenario);
		const base = `${winner.model.name} is crowned best for ${label} — the strongest blend of fit, capacity, and quality among these models (blend ${winner.score}).`;
		return runnerUp ? `${base} Runner-up: ${runnerUp.name}.` : base;
	});

	// ─── Scenario fit rows ─────────────────────────────────────────────────
	const scenarioKeys: [keyof GoModel['scenarioScores'], string][] = [
		['coding', 'Coding'],
		['agentic', 'Agentic'],
		['brainstorming', 'Brainstorm'],
		['budget', 'Budget'],
		['frontend', 'Frontend']
	];

	// ─── Open weights helper ───────────────────────────────────────────────
	let openYes = $derived(models.map((m) => m.openWeight));
</script>

<div class="overflow-x-auto rounded-xl border border-border bg-card">
	<div class="grid" style="grid-template-columns: {cols}">
		<!-- Header row -->
		<div
			class="border-b border-border bg-muted/40 px-3 py-3 text-sm font-semibold text-muted-foreground"
		>
			Model
		</div>
		{#each models as m, i (m.id)}
			<div
				class="relative border-b border-l border-border bg-muted/40 px-3 py-3 {crownWinnerId ===
				m.id
					? 'ring-1 ring-inset ring-amber-500/40'
					: ''}"
			>
				{#if onRemove}
					<button
						type="button"
						onclick={() => onRemove(m.id)}
						class="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
						aria-label={`Remove ${m.name} from comparison`}
					>
						<X class="size-3.5" />
					</button>
				{/if}
				<div class="pr-5 text-sm font-semibold text-foreground">{m.name}</div>
				<div class="text-xs text-muted-foreground">{m.provider}</div>
				{#if anchors[m.id]}
					{@const a = ANCHOR_META[anchors[m.id]]}
					{@const Icon = a.icon}
					<Badge variant="outline" class="mt-1.5 border-primary/20 bg-primary/10 text-primary">
						<Icon class="size-3" />
						{a.label}
					</Badge>
				{/if}
				{#if scenario}
					{#if crownWinnerId === m.id}
						<Badge
							variant="outline"
							class="mt-1.5 border-amber-500/40 bg-amber-500/10 text-amber-500"
						>
							<Crown class="size-3" />
							Best for {scenarioLabelOf(scenario)}
						</Badge>
					{:else}
						<span class="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
							Fit <span class="font-semibold text-foreground">{m.scenarioScores[scenario]}</span>
						</span>
					{/if}
				{/if}
				<div class="mt-2">
					<BurnBadge burnDetails={m.burnDetails} />
				</div>
			</div>
		{/each}

		<!-- Verdict -->
		<div
			class="flex items-center gap-2 border-t border-border bg-primary/5 px-3 py-3 text-sm font-medium text-muted-foreground"
		>
			{#if scenario}
				<Crown class="size-4 text-amber-500" />
				Crown
			{:else}
				<Scale class="size-4 text-primary" />
				Verdict
			{/if}
		</div>
		<div
			class="border-t border-l border-border bg-primary/5 px-3 py-3 text-sm leading-relaxed text-foreground/80"
			style="grid-column: 2 / -1;"
		>
			{scenario ? scenarioVerdict : verdict}
		</div>

		<!-- Benchmarks -->
		<CompareRow label="Coding" {models} getValue={(m) => m.benchmarks.coding} hint="0-100">
			{#snippet format(value, isBest)}
				{@const pct = value == null ? 0 : Math.min(100, value)}
				<div class="flex items-center gap-2">
					<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
						<div class="h-full rounded-full bg-violet-500" style="width: {pct}%"></div>
					</div>
					<span
						class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
						>{value == null ? '—' : value.toFixed(1)}</span
					>
				</div>
			{/snippet}
		</CompareRow>

		<CompareRow label="Reasoning" {models} getValue={(m) => m.benchmarks.reasoning} hint="0-100">
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toFixed(1)}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow label="Math" {models} getValue={(m) => m.benchmarks.math} hint="0-100">
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toFixed(1)}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow
			label="SWE-Bench"
			{models}
			getValue={(m) => benchmarkToPercent(m.benchmarks.sweBenchVerified, 'sweBenchVerified')}
			hint="0-100"
		>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toFixed(1)}</span
				>
			{/snippet}
		</CompareRow>

		<!-- Pricing -->
		<CompareRow
			label="Input $/1M"
			{models}
			getValue={(m) => m.pricing.inputPricePerM}
			higherIsBetter={false}
			tieDecimals={2}
		>
			{#snippet format(value, isBest)}
				<span
					class="tabular-nums {isBest ? 'font-semibold text-emerald-600' : 'text-foreground/80'}"
					>{fmtPrice(value)}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow
			label="Output $/1M"
			{models}
			getValue={(m) => m.pricing.outputPricePerM}
			higherIsBetter={false}
			tieDecimals={2}
		>
			{#snippet format(value, isBest)}
				<span
					class="tabular-nums {isBest ? 'font-semibold text-emerald-600' : 'text-foreground/80'}"
					>{fmtPrice(value)}</span
				>
			{/snippet}
		</CompareRow>

		<!-- Context & quota -->
		<CompareRow
			label="Context"
			{models}
			getValue={(m) => m.contextWindow}
			hint="tokens"
			tieDecimals={0}
		>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{fmtTokens(value)}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow label="Req / 5h" {models} getValue={(m) => m.quota.requestsPer5h} tieDecimals={0}>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toLocaleString()}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow
			label="Req / week"
			{models}
			getValue={(m) => m.quota.requestsPerWeek}
			tieDecimals={0}
		>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toLocaleString()}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow
			label="Req / month"
			{models}
			getValue={(m) => m.quota.requestsPerMonth}
			tieDecimals={0}
		>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toLocaleString()}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow
			label="Burn"
			{models}
			getValue={(m) => (m.burnDetails.score == null ? null : 100 - m.burnDetails.score)}
			higherIsBetter={false}
			hint="lower better"
			tieDecimals={0}
		>
			{#snippet format(value, isBest)}
				<span
					class="tabular-nums {isBest ? 'font-semibold text-emerald-600' : 'text-foreground/80'}"
					>{value == null ? '—' : value}</span
				>
			{/snippet}
		</CompareRow>

		<!-- Scenario fit -->
		<div
			class="border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground"
		>
			Scenario fit
		</div>
		{#each models as m, i (m.id)}
			<div class="border-t border-l border-border/60 px-3 py-2.5 text-sm">
				<div class="space-y-1">
					{#each scenarioKeys as [key, label] (key)}
						{@const active = key === scenario}
						<div class="flex items-center justify-between gap-2 text-xs">
							<span class={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}
								>{label}</span
							>
							<span
								class={active ? 'font-semibold text-primary' : 'tabular-nums text-foreground/80'}
								>{m.scenarioScores[key]}</span
							>
						</div>
					{/each}
				</div>
			</div>
		{/each}

		<!-- Open weights -->
		<div
			class="border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground"
		>
			Open weights
		</div>
		{#each models as m, i (m.id)}
			<div
				class="border-t border-l border-border/60 px-3 py-2.5 text-sm {openYes[i]
					? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
					: ''}"
			>
				{#if m.openWeight}
					<span class="inline-flex items-center gap-1 font-medium text-emerald-600">
						<Check class="size-3.5" /> Yes
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 text-muted-foreground">
						<Minus class="size-3.5" /> No
					</span>
				{/if}
			</div>
		{/each}

		<!-- Tags -->
		<div
			class="border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground"
		>
			Tags
		</div>
		{#each models as m, i (m.id)}
			<div class="border-t border-l border-border/60 px-3 py-2.5">
				<div class="flex flex-wrap gap-1">
					{#each m.tags as tag (tag.label)}
						<span
							class="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
						>
							{tag.label}
						</span>
					{/each}
					{#if m.tags.length === 0}
						<span class="text-xs text-muted-foreground/40">—</span>
					{/if}
				</div>
			</div>
		{/each}

		<!-- Migration hints -->
		<div
			class="border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground"
			title="Open-weight alternatives to these closed-source models"
		>
			Replaces
		</div>
		{#each models as m, i (m.id)}
			<div class="border-t border-l border-border/60 px-3 py-2.5 text-sm">
				{#if m.migrationHints.length}
					<ul class="space-y-1.5">
						{#each m.migrationHints as hint (hint.model)}
							<li class="flex items-start gap-1.5 text-xs">
								<Replace class="mt-0.5 size-3 shrink-0 text-muted-foreground/60" />
								<span class="leading-snug">
									<span class="font-medium text-foreground">{hint.model}</span>
									<span class="text-muted-foreground"> — {hint.reason}</span>
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<span class="text-xs text-muted-foreground/40">—</span>
				{/if}
			</div>
		{/each}

		<!-- Links -->
		<div
			class="border-t border-border/60 bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground"
		>
			Sources
		</div>
		{#each models as m, i (m.id)}
			<div class="flex flex-wrap gap-2 border-t border-l border-border/60 px-3 py-2.5">
				{#if m.modelgrepId}
					<a
						href={'https://modelgrep.com/models/' + m.modelgrepId}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1 text-xs hover:underline"
					>
						<ExternalLink class="size-3" /> modelgrep
					</a>
				{/if}
				<a
					href={llmStatsModelUrl(m)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-xs hover:underline"
				>
					<ExternalLink class="size-3" /> llm-stats
				</a>
			</div>
		{/each}
	</div>
</div>
