<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import BurnBadge from './BurnBadge.svelte';
	import CompareRow from './CompareRow.svelte';
	import { X, Scale, Check, Minus, ExternalLink, Replace } from '@lucide/svelte';
	import { llmStatsModelUrl } from '$lib/utils/llm-stats-url';

	interface Props {
		models: GoModel[];
		onRemove?: (id: string) => void;
	}

	let { models, onRemove }: Props = $props();

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
	let verdict = $derived(buildVerdict(models));

	function buildVerdict(ms: GoModel[]): string {
		if (ms.length < 2) return '';
		const benchKeys: (keyof GoModel['benchmarks'])[] = [
			'coding',
			'reasoning',
			'math',
			'sweBenchVerified'
		];
		const wins: Record<string, number> = {};
		ms.forEach((m) => (wins[m.id] = 0));
		for (const k of benchKeys) {
			const nums = ms
				.map((m) => ({ id: m.id, v: m.benchmarks[k] as number | null }))
				.filter((x) => x.v != null) as { id: string; v: number }[];
			if (!nums.length) continue;
			const max = Math.max(...nums.map((x) => x.v));
			const leaders = nums.filter((x) => x.v === max);
			if (leaders.length === 1) wins[leaders[0].id]++;
		}
		const top = [...ms].sort((a, b) => wins[b.id] - wins[a.id])[0];
		const priced = ms.filter((m) => m.pricing.inputPricePerM != null);
		const cheapest = priced.length
			? [...priced].sort(
					(a, b) => (a.pricing.inputPricePerM ?? 0) - (b.pricing.inputPricePerM ?? 0)
				)[0]
			: null;
		const longest = ms.filter((m) => m.contextWindow).length
			? [...ms].sort((a, b) => (b.contextWindow ?? 0) - (a.contextWindow ?? 0))[0]
			: null;
		const parts: string[] = [];
		parts.push(`${top.name} leads on ${wins[top.id]} of ${benchKeys.length} benchmark categories.`);
		if (cheapest)
			parts.push(
				`${cheapest.name} is cheapest on input pricing (${fmtPrice(cheapest.pricing.inputPricePerM)}/1M).`
			);
		if (longest)
			parts.push(
				`${longest.name} offers the largest context window (${fmtTokens(longest.contextWindow)} tokens).`
			);
		return parts.join(' ');
	}

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
			<div class="relative border-b border-l border-border bg-muted/40 px-3 py-3">
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
				<div class="mt-2">
					<BurnBadge burnDetails={m.burnDetails} />
				</div>
			</div>
		{/each}

		<!-- Verdict -->
		<div
			class="flex items-center gap-2 border-t border-border bg-primary/5 px-3 py-3 text-sm font-medium text-muted-foreground"
		>
			<Scale class="size-4 text-primary" />
			Verdict
		</div>
		<div
			class="border-t border-l border-border bg-primary/5 px-3 py-3 text-sm leading-relaxed text-foreground/80"
			style="grid-column: 2 / -1;"
		>
			{verdict}
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
			getValue={(m) => m.benchmarks.sweBenchVerified}
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
		>
			{#snippet format(value, isBest)}
				<span
					class="tabular-nums {isBest ? 'font-semibold text-emerald-600' : 'text-foreground/80'}"
					>{fmtPrice(value)}</span
				>
			{/snippet}
		</CompareRow>

		<!-- Context & quota -->
		<CompareRow label="Context" {models} getValue={(m) => m.contextWindow} hint="tokens">
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{fmtTokens(value)}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow label="Req / 5h" {models} getValue={(m) => m.quota.requestsPer5h}>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toLocaleString()}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow label="Req / week" {models} getValue={(m) => m.quota.requestsPerWeek}>
			{#snippet format(value, isBest)}
				<span class="tabular-nums {isBest ? 'font-semibold text-foreground' : 'text-foreground/80'}"
					>{value == null ? '—' : value.toLocaleString()}</span
				>
			{/snippet}
		</CompareRow>

		<CompareRow label="Req / month" {models} getValue={(m) => m.quota.requestsPerMonth}>
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
						<div class="flex items-center justify-between gap-2 text-xs">
							<span class="text-muted-foreground">{label}</span>
							<span class="tabular-nums text-foreground/80">{m.scenarioScores[key]}</span>
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
						class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
					>
						<ExternalLink class="size-3" /> modelgrep
					</a>
				{/if}
				<a
					href={llmStatsModelUrl(m)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					<ExternalLink class="size-3" /> llm-stats
				</a>
			</div>
		{/each}
	</div>
</div>
