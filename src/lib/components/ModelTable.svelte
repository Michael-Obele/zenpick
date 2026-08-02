<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import * as Table from '$lib/components/ui/table/index.js';
	import {
		ArrowUp,
		ArrowDown,
		ArrowUpDown,
		SearchX,
		Check,
		GitCompare,
		Crown
	} from '@lucide/svelte';
	import { rankNeed, type NeedSpec } from '$lib/needs';
	import { scenarioLabel } from '$lib/scenarios';
	import BurnBadge from './BurnBadge.svelte';
	import FallbackBadge from './FallbackBadge.svelte';

	interface Props {
		models: GoModel[];
		filter: string;
		scenario: string;
		selectedModelId?: string;
		onSelectModel: (model: GoModel) => void;
		/** IDs currently selected for side-by-side comparison. */
		selectedIds?: string[];
		/** Toggle a model in/out of the comparison selection. */
		onToggleCompare?: (id: string) => void;
		/** Active "browse by need" ranking (null = plain table). */
		need?: NeedSpec | null;
		/** Called when the user clicks a column header while a need is active. */
		onExitNeed?: () => void;
	}

	let {
		models,
		filter = $bindable(''),
		scenario,
		selectedModelId,
		onSelectModel,
		selectedIds = [],
		onToggleCompare,
		need = null,
		onExitNeed = () => {}
	}: Props = $props();

	let filteredModels = $derived.by(() => {
		let result = models;
		if (filter) {
			const q = filter.toLowerCase();
			result = result.filter(
				(m) =>
					m.name.toLowerCase().includes(q) ||
					m.provider.toLowerCase().includes(q) ||
					m.tags.some((t) => t.label.toLowerCase().includes(q))
			);
		}
		return result;
	});

	type SortKey = 'name' | 'coding' | 'price' | 'quota' | 'fit' | 'burn' | 'score';

	// `userSort` is the user's explicit column choice (or null). When null,
	// the sort follows the scenario: scenario picked → fit desc, no scenario → burn asc.
	// Picking a new scenario clears `userSort` so Fit auto-activates again.
	type ExplicitSort = { key: SortKey; dir: 'asc' | 'desc' } | null;
	let userSort = $state<ExplicitSort>(null);

	$effect(() => {
		// Subscribe to scenario; when it changes, drop the user's column override
		// so Fit auto-activates for the new scenario.
		void scenario;
		userSort = null;
	});

	let sortKey = $derived<SortKey>(userSort?.key ?? (scenario ? 'fit' : 'burn'));
	let sortDir = $derived<'asc' | 'desc'>(userSort?.dir ?? (scenario ? 'desc' : 'asc'));

	let sortedModels = $derived.by(() =>
		[...filteredModels].sort((a, b) => compareModels(a, b, scenario, sortKey, sortDir))
	);

	// ── "Browse by need" ranked mode ────────────────────────────────────
	// A live need turns the table into a modelgrep-style ranked list: the
	// pool is narrowed by the need (e.g. vision-capable), ordered by its
	// metric, and each row carries a medal-styled rank. Text search still
	// narrows what's shown while keeping ranks stable.
	//
	// With a Task (scenario) also active, the ranking is BLENDED: the need's
	// metric is normalized and multiplied by each model's fit score, so the
	// two controls jointly determine the output — Long Context + Coding fit
	// demotes a context king with weak coding (mimo-v2.5-pro) below models
	// with comparable context and stronger coding.
	let fitLabel = $derived(scenario ? scenarioLabel(scenario) : null);
	let needEntries = $derived.by(() => {
		if (!need) return null;
		return scenario
			? rankNeed(need, models, {
					fitOf: (m) =>
						m.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? null
				})
			: rankNeed(need, models);
	});

	type DisplayRow = { model: GoModel; rank: number; value: number | null; fit: number | null };
	let displayRows = $derived.by((): DisplayRow[] => {
		if (!needEntries) {
			return sortedModels.map((model, index) => ({
				model,
				rank: index + 1,
				value: null,
				fit: null
			}));
		}
		const q = filter.toLowerCase();
		return needEntries
			.filter((e) => {
				if (!q) return true;
				return (
					e.model.name.toLowerCase().includes(q) ||
					e.model.provider.toLowerCase().includes(q) ||
					e.model.tags.some((t) => t.label.toLowerCase().includes(q))
				);
			})
			.map((e) => ({ model: e.model, rank: e.rank, value: e.value, fit: e.fit }));
	});

	// Bar fills relative to the best value in the current ranking. For
	// ascending needs (cheapest) the best value sits at the END of the list,
	// so the bar scale is inverted and the cheapest model gets the fullest bar.
	let metricBarMax = $derived.by(() => {
		if (!need || displayRows.length === 0) return 0;
		const rows = displayRows;
		return need.direction === 'asc' ? (rows[rows.length - 1].value ?? 0) : (rows[0].value ?? 0);
	});

	function metricWidth(value: number): number {
		if (metricBarMax <= 0) return 0;
		const ratio = need?.barScale === 'inverse' ? 1 - value / metricBarMax : value / metricBarMax;
		return Math.max(0, Math.min(100, ratio * 100));
	}

	function compareModels(
		a: GoModel,
		b: GoModel,
		scenario: string,
		key: SortKey,
		sortDir: 'asc' | 'desc'
	): number {
		// Sort and scenario are independent: let user sort by any key
		// while scenario filters which models are relevant.
		const cmp = compareByKey(a, b, scenario, key);
		return sortDir === 'asc' ? cmp : -cmp;
	}

	function compareByKey(a: GoModel, b: GoModel, scenario: string, key: SortKey): number {
		switch (key) {
			case 'name':
				return a.name.localeCompare(b.name);
			case 'coding':
				return (a.benchmarks.coding ?? 0) - (b.benchmarks.coding ?? 0);
			case 'price':
				return (b.pricing.inputPricePerM ?? 0) - (a.pricing.inputPricePerM ?? 0);
			case 'quota':
				return a.quota.requestsPer5h - b.quota.requestsPer5h;
			case 'fit': {
				// Strict primary / soft secondary: fit dominates; ties break on burn (cheap first).
				// Natural order is ascending; sortDir='desc' in the wrapper flips it so best fit is on top.
				const fitA = scenarioScore(a, scenario);
				const fitB = scenarioScore(b, scenario);
				if (fitA !== fitB) return fitA - fitB;
				return (a.burnDetails.score ?? 0) - (b.burnDetails.score ?? 0);
			}
			case 'burn':
				return (a.burnDetails.score ?? 0) - (b.burnDetails.score ?? 0);
			case 'score':
				return (a.burnDetails.score ?? 0) - (b.burnDetails.score ?? 0);
		}
	}

	function scenarioScore(model: GoModel, scenario: string): number {
		return model.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0;
	}

	function toggleSort(key: SortKey) {
		const currentKey = userSort?.key ?? (scenario ? 'fit' : 'burn');
		const currentDir = userSort?.dir ?? (scenario ? 'desc' : 'asc');
		if (currentKey === key) {
			userSort = { key, dir: currentDir === 'asc' ? 'desc' : 'asc' };
		} else {
			userSort = { key, dir: 'desc' };
		}
	}

	/** Column-header click: exit ranked mode (if active), then apply the sort. */
	function handleSort(key: SortKey) {
		if (need) onExitNeed();
		toggleSort(key);
	}

	function sortIndicator(key: SortKey) {
		if (sortKey !== key) {
			return { icon: ArrowUpDown, active: false };
		}
		// asc = low-to-high → up arrow; desc = high-to-low → down arrow.
		return { icon: sortDir === 'asc' ? ArrowDown : ArrowUp, active: true };
	}
</script>

<div class="overflow-x-auto rounded-xl border border-border bg-card">
	<Table.Root>
		<Table.Header class="sticky top-0 z-10 bg-card">
			<Table.Row class="border-b border-border hover:bg-transparent">
				<Table.Head class="w-10 text-center">
					<GitCompare class="mx-auto size-4 text-muted-foreground" />
				</Table.Head>
				<Table.Head class="w-10 whitespace-nowrap text-muted-foreground">
					{need ? 'Rank' : 'SN'}
				</Table.Head>
				{@const nameSort = sortIndicator('name')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('name')}
				>
					<span class="inline-flex items-center gap-1">
						Model
						<nameSort.icon
							class="size-3 {nameSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{@const priceSort = sortIndicator('price')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('price')}
				>
					<span class="inline-flex items-center gap-1">
						Price / 1M
						<priceSort.icon
							class="size-3 {priceSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{@const burnSort = sortIndicator('burn')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('burn')}
				>
					<span class="inline-flex items-center gap-1">
						Burn
						<burnSort.icon
							class="size-3 {burnSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{@const scoreSort = sortIndicator('score')}
				<Table.Head
					class="hidden cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground md:table-cell"
					onclick={() => handleSort('score')}
				>
					<span class="inline-flex items-center gap-1">
						Score
						<scoreSort.icon
							class="size-3 {scoreSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{@const quotaSort = sortIndicator('quota')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('quota')}
				>
					<span class="inline-flex items-center gap-1">
						Req / 5h
						<quotaSort.icon
							class="size-3 {quotaSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{@const codingSort = sortIndicator('coding')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('coding')}
				>
					<span class="inline-flex items-center gap-1">
						{need ? (fitLabel ? `${need.metricLabel} · ${fitLabel} fit` : need.metricLabel) : 'Coding'}
						<codingSort.icon
							class="size-3 {codingSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{#if scenario}
					{@const fitSort = sortIndicator('fit')}
					<Table.Head
						class="w-24 cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
						onclick={() => handleSort('fit')}
					>
						<span class="inline-flex items-center gap-1">
							Fit
							<fitSort.icon
								class="size-3 {fitSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
							/>
						</span>
					</Table.Head>
				{/if}
				<Table.Head class="hidden whitespace-nowrap text-muted-foreground md:table-cell"
					>Tags</Table.Head
				>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each displayRows as row (row.model.id)}
				{@const model = row.model}
				{@const isSelected = selectedModelId === model.id}
				{@const isCompared = selectedIds.includes(model.id)}
				{@const isLeader = need !== null && row.rank === 1}
				<Table.Row
					class="cursor-pointer border-b border-border transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 {isSelected
						? 'bg-muted/70 hover:bg-muted/80'
						: ''} {isCompared ? 'bg-primary/4' : ''} {isLeader ? 'bg-amber-500/5' : ''}"
					onclick={() => onSelectModel(model)}
					tabindex={0}
					role="button"
					aria-pressed={isSelected}
					data-state={isSelected ? 'selected' : undefined}
					onkeydown={(e) => e.key === 'Enter' && onSelectModel(model)}
				>
					<Table.Cell
						class="w-10 text-center"
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							role="checkbox"
							aria-checked={isCompared}
							aria-label={`${isCompared ? 'Remove' : 'Add'} ${model.name} from comparison`}
							onclick={(e) => {
								e.stopPropagation();
								onToggleCompare?.(model.id);
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									onToggleCompare?.(model.id);
								}
							}}
							class="flex size-5 items-center justify-center rounded-md border transition-colors {isCompared
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-border bg-background hover:border-primary/50'}"
						>
							{#if isCompared}
								<Check class="size-3.5" />
							{/if}
						</button>
					</Table.Cell>
					<Table.Cell class="w-10">
						{#if need}
							{#if row.rank === 1}
								<span
									class="inline-flex size-6 items-center justify-center rounded-md bg-amber-400/15 text-amber-500"
									title="#1 {model.name}"
								>
									<Crown class="size-3.5" />
								</span>
							{:else if row.rank === 2}
								<span
									class="inline-flex size-6 items-center justify-center rounded-md bg-slate-400/15 text-sm font-semibold tabular-nums text-slate-400"
								>
									2
								</span>
							{:else if row.rank === 3}
								<span
									class="inline-flex size-6 items-center justify-center rounded-md bg-orange-400/15 text-sm font-semibold tabular-nums text-orange-500"
								>
									3
								</span>
							{:else}
								<span class="text-sm tabular-nums text-muted-foreground/50">{row.rank}</span>
							{/if}
						{:else}
							<span class="text-sm tabular-nums text-muted-foreground/60">{row.rank}</span>
						{/if}
					</Table.Cell>
					<Table.Cell class="font-medium">
						<div class="flex items-center gap-2">
							<span class="text-foreground">{model.name}</span>
						</div>
						<div class="text-xs text-muted-foreground">{model.provider}</div>
					</Table.Cell>
					<Table.Cell class="text-sm tabular-nums">
						{#if model.pricing.inputPricePerM != null}
							<div class="text-foreground/80">
								${model.pricing.inputPricePerM.toFixed(2)} /
								<span class="text-muted-foreground"
									>${model.pricing.outputPricePerM?.toFixed(2) ?? '—'}</span
								>
							</div>
							<div class="flex items-center gap-1">
								<FallbackBadge source={model.pricing.source} />
							</div>
						{:else}
							<div class="flex items-center gap-1">
								<FallbackBadge source={model.pricing.source} />
							</div>
						{/if}
					</Table.Cell>
					<Table.Cell>
						<BurnBadge burnDetails={model.burnDetails} />
					</Table.Cell>
					<Table.Cell class="hidden text-sm tabular-nums md:table-cell">
						{#if model.burnDetails?.band != null}
							<div class="flex items-center gap-1.5">
								<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full {model.burnDetails.score >= 60
											? 'bg-emerald-500'
											: model.burnDetails.score >= 40
												? 'bg-amber-500'
												: 'bg-red-500'}"
										style="width: {model.burnDetails.score}%"
									></div>
								</div>
								<span class="text-xs text-muted-foreground">{model.burnDetails.score}</span>
							</div>
						{:else}
							<span class="text-muted-foreground/30">—</span>
						{/if}
					</Table.Cell>
					<Table.Cell class="text-sm tabular-nums text-muted-foreground/70">
						{model.quota.requestsPer5h.toLocaleString()}
					</Table.Cell>
					<Table.Cell class="text-sm tabular-nums">
						{#if need && row.value != null}
							<div class="flex items-center gap-2">
								<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full {need.bar}"
										style="width: {metricWidth(row.value)}%"
									></div>
								</div>
								<span class="text-xs font-semibold tabular-nums {need.accent}">
									{need.format(row.value)}
								</span>
								{#if row.fit != null}
									<span class="text-xs tabular-nums text-muted-foreground/60">
										fit {row.fit}
									</span>
								{/if}
							</div>
						{:else if model.benchmarks.coding}
							<span class="text-foreground/80">{model.benchmarks.coding.toFixed(1)}</span>
						{:else}
							<span class="text-muted-foreground/30">—</span>
						{/if}
					</Table.Cell>
					{#if scenario}
						{@const score = model.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0}
						<Table.Cell>
							<div class="flex items-center gap-1.5">
								<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full {score >= 60
											? 'bg-violet-500'
											: score >= 40
												? 'bg-amber-500'
												: 'bg-red-500'}"
										style="width: {score}%"
									></div>
								</div>
								<span class="text-xs tabular-nums text-muted-foreground">{score}</span>
							</div>
						</Table.Cell>
					{/if}
					<Table.Cell class="hidden md:table-cell">
						<div class="flex flex-wrap gap-1">
							{#each model.tags.slice(0, 2) as tag (tag.label)}
								<span
									class="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
								>
									{tag.label}
								</span>
							{/each}
							{#if model.tags.length > 2}
								<span class="text-xs text-muted-foreground/40">
									+{model.tags.length - 2}
								</span>
							{/if}
						</div>
					</Table.Cell>
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={scenario ? 10 : 9} class="py-12 text-center">
						<div class="flex flex-col items-center gap-2 text-muted-foreground">
							<SearchX class="size-8 opacity-40" />
							{#if need && needEntries?.length === 0}
								<p>No opencode model has {need.metricLabel.toLowerCase()} data yet.</p>
								<p class="text-xs">Check back after the next benchmark refresh.</p>
							{:else}
								<p>No models match your search.</p>
								<p class="text-xs">Try clearing the filter or switching scenarios.</p>
							{/if}
						</div>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
