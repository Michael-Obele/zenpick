<script lang="ts">
	import type { BurnDetails, GoModel, ModelQuota } from '$lib/types/models';
	import {
		matchesCatalogPlan,
		matchesCatalogRow,
		PLAN_LABEL,
		rowPlanEntry,
		type CatalogRow,
		type PlanFilter
	} from '$lib/catalog';
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
	import { rankNeed, scoredEntries, type NeedSpec } from '$lib/needs';
	import { isCompareSelected, selectedKeyForRow } from '$lib/compare-selection';
	import { quotaFor, burnFor } from '$lib/plan';
	import { plan } from '$lib/stores/plan.svelte';
	import { scenarioLabel } from '$lib/scenarios';
	import { formatCompact } from '$lib/utils';
	import { formatIntelligence } from '$lib/stack/format';
	import BurnBadge from './BurnBadge.svelte';
	import BurnScoreCell from './BurnScoreCell.svelte';
	import CapabilityBadges from './CapabilityBadges.svelte';
	import PlanBadges from './PlanBadges.svelte';
	import PriceCell from './PriceCell.svelte';
	import RowTagsCell from './RowTagsCell.svelte';
	import ScenarioFitCell from './ScenarioFitCell.svelte';

	interface Props {
		rows: CatalogRow[];
		filter: string;
		scenario: string;
		planFilter?: PlanFilter;
		selectedModelId?: string;
		onSelectModel: (row: CatalogRow) => void;
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
		rows,
		filter = $bindable(''),
		scenario,
		planFilter = '',
		selectedModelId,
		onSelectModel,
		selectedIds = [],
		onToggleCompare,
		need = null,
		onExitNeed = () => {}
	}: Props = $props();

	// One row per model across plans; the plan filter narrows to the plans that
	// carry it, and the search goes through the catalog matcher so plan names
	// stay searchable.
	let visibleRows = $derived(
		rows.filter((row) => matchesCatalogPlan(row, planFilter) && matchesCatalogRow(row, filter))
	);

	type SortKey = 'name' | 'coding' | 'intelligence' | 'price' | 'quota' | 'fit' | 'burn' | 'score';

	// `userSort` is the user's explicit column choice (or null), stamped with
	// the scenario and plan filter it was chosen under. When either changes, the
	// stamp no longer matches and the override is ignored (derived → null), so the
	// new per-plan default sort takes over — pure derived, no $effect to reset
	// state, and a Go-only choice never survives a plan switch.
	type ExplicitSort = {
		key: SortKey;
		dir: 'asc' | 'desc';
		forScenario: string;
		forPlan: PlanFilter;
	} | null;
	let userSort = $state<ExplicitSort>(null);

	let effectiveSort = $derived(
		userSort && userSort.forScenario === scenario && userSort.forPlan === planFilter
			? userSort
			: null
	);

	/** Static plans have no burn data, so they open on intelligence instead. */
	function defaultSortKey(): SortKey {
		if (scenario) return 'fit';
		return planFilter === 'zed' || planFilter === 'copilot' ? 'intelligence' : 'burn';
	}

	function defaultSortDir(): 'asc' | 'desc' {
		if (scenario) return 'desc';
		return planFilter === 'zed' || planFilter === 'copilot' ? 'desc' : 'asc';
	}

	let sortKey = $derived<SortKey>(effectiveSort?.key ?? defaultSortKey());
	let sortDir = $derived<'asc' | 'desc'>(effectiveSort?.dir ?? defaultSortDir());

	let sortedRows = $derived.by(() =>
		[...visibleRows].sort((a, b) => compareModels(a, b, scenario, sortKey, sortDir))
	);

	// ── "Browse by need" ranked mode ────────────────────────────────────
	// A live need turns the table into a modelgrep-style ranked list: the
	// pool is narrowed by the need (e.g. vision-capable), ordered by its
	// metric, and each row carries a medal-styled rank. Text search still
	// narrows what's shown while keeping ranks stable.
	//
	// Rankings are Go-only: the static plans carry no scenario scores, so a
	// non-Go row is never scored. It still stays visible (the plan filter may
	// well include it) and trails the ranked rows unscored, at `rank: null`.
	//
	// With a Task (scenario) also active, the ranking is BLENDED: the need's
	// metric is normalized and multiplied by each model's fit score, so the
	// two controls jointly determine the output — Long Context + Coding fit
	// demotes a context king with weak coding (mimo-v2.5-pro) below models
	// with comparable context and stronger coding.
	let fitLabel = $derived(scenario ? scenarioLabel(scenario) : null);

	let goModels = $derived(rows.flatMap((row) => (row.go ? [row.go] : [])));
	let catalogByGoId = $derived(
		new Map(rows.flatMap((row) => (row.go ? [[row.go.id, row] as const] : [])))
	);

	let needEntries = $derived.by(() => {
		if (!need) return null;
		return scenario
			? rankNeed(need, goModels, {
					fitOf: (m) => m.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? null
				})
			: rankNeed(need, goModels);
	});

	type DisplayRow = {
		row: CatalogRow;
		rank: number | null;
		value: number | null;
		fit: number | null;
		/** Quota + burn resolved for the SELECTED plan tier (see $lib/plan). */
		quota: ModelQuota | null;
		burn: BurnDetails | null;
	};

	function displayValues(row: CatalogRow): Pick<DisplayRow, 'quota' | 'burn'> {
		return row.go
			? { quota: quotaFor(row.go, plan.tier), burn: burnFor(row.go, plan.tier) }
			: { quota: null, burn: null };
	}

	let displayRows = $derived.by((): DisplayRow[] => {
		if (!needEntries) {
			// Browse mode: the SN column numbers every visible row, including the
			// non-Go rows a static plan carries.
			return sortedRows.map((row, index) => ({
				row,
				rank: index + 1,
				value: null,
				fit: null,
				...displayValues(row)
			}));
		}

		const ranked = needEntries
			.flatMap((entry) => {
				const row = catalogByGoId.get(entry.model.id);
				return row ? [{ row, entry }] : [];
			})
			.filter(({ row }) => matchesCatalogPlan(row, planFilter) && matchesCatalogRow(row, filter))
			.map(({ row, entry }) => ({
				row,
				rank: entry.rank,
				value: entry.value,
				fit: entry.fit,
				...displayValues(row)
			}));

		// Rows without a Go model cannot be scored, so they keep their browse
		// order after every ranked row in both sort directions.
		const rankedKeys = new Set(ranked.map((display) => display.row.key));
		const unscored = sortedRows
			.filter((row) => row.go === null && !rankedKeys.has(row.key))
			.map((row) => ({
				row,
				rank: null,
				value: null,
				fit: null,
				...displayValues(row)
			}));

		return [...ranked, ...unscored];
	});

	/**
	 * Bar fills relative to the best value in the current ranking. For
	 * ascending needs (cheapest) the best value sits at the END of the SCORED
	 * list, so the bar scale is inverted and the cheapest model gets the
	 * fullest bar.
	 *
	 * Measured over the scored rows only: a text search can leave the visible
	 * window starting mid-leaderboard, and unscored rows trail with null —
	 * neither should redefine the scale.
	 */
	let metricBarMax = $derived.by(() => {
		if (!need) return 0;
		const scored = displayRows.filter((r) => r.value != null);
		if (scored.length === 0) return 0;
		return need.direction === 'asc'
			? (scored[scored.length - 1].value ?? 0)
			: (scored[0].value ?? 0);
	});

	function metricWidth(value: number): number {
		if (metricBarMax <= 0) return 0;
		const ratio = need?.barScale === 'inverse' ? 1 - value / metricBarMax : value / metricBarMax;
		return Math.max(0, Math.min(100, ratio * 100));
	}

	/** Sort key for the quota column — unlimited (free) models rank highest. */
	function quotaSortKey(model: GoModel): number {
		const q = quotaFor(model, plan.tier);
		return q.unlimited ? Number.MAX_SAFE_INTEGER : q.requestsPer5h;
	}

	function compareModels(
		a: CatalogRow,
		b: CatalogRow,
		scenario: string,
		key: SortKey,
		sortDir: 'asc' | 'desc'
	): number {
		// These metrics only exist for Go rows; rows without one trail every
		// scored row regardless of the direction the user picked.
		const goOnly = key === 'quota' || key === 'burn' || key === 'score' || key === 'fit';
		if (goOnly && Boolean(a.go) !== Boolean(b.go)) return a.go ? -1 : 1;

		// Sort and scenario are independent: let user sort by any key
		// while scenario filters which models are relevant.
		const cmp = compareByKey(a, b, scenario, key);
		return sortDir === 'asc' ? cmp : -cmp;
	}

	function compareByKey(a: CatalogRow, b: CatalogRow, scenario: string, key: SortKey): number {
		switch (key) {
			case 'name':
				return a.name.localeCompare(b.name);
			case 'coding':
				return (a.coding ?? 0) - (b.coding ?? 0);
			case 'intelligence':
				return (a.intelligence ?? 0) - (b.intelligence ?? 0);
			case 'price':
				return (
					(rowPlanEntry(b, planFilter)?.pricing.inputPricePerM ?? 0) -
					(rowPlanEntry(a, planFilter)?.pricing.inputPricePerM ?? 0)
				);
			case 'quota':
				return goQuotaScore(a) - goQuotaScore(b);
			case 'fit': {
				// Strict primary / soft secondary: fit dominates; ties break on burn (cheap first).
				// Natural order is ascending; sortDir='desc' in the wrapper flips it so best fit is on top.
				const fit = goFitScore(a, scenario) - goFitScore(b, scenario);
				return fit !== 0 ? fit : goBurnScore(a) - goBurnScore(b);
			}
			case 'burn':
			case 'score':
				return goBurnScore(a) - goBurnScore(b);
		}
	}

	// Go-only sort keys. Non-Go rows read as zero; the wrapper already puts them
	// after every Go row whichever direction the user picked.
	function goQuotaScore(row: CatalogRow): number {
		return row.go ? quotaSortKey(row.go) : 0;
	}

	function goBurnScore(row: CatalogRow): number {
		return row.go ? burnFor(row.go, plan.tier).score : 0;
	}

	function goFitScore(row: CatalogRow, scenario: string): number {
		return row.go ? scenarioScore(row.go, scenario) : 0;
	}

	function scenarioScore(model: GoModel, scenario: string): number {
		return model.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0;
	}

	function toggleSort(key: SortKey) {
		const currentKey = effectiveSort?.key ?? defaultSortKey();
		const currentDir = effectiveSort?.dir ?? defaultSortDir();
		if (currentKey === key) {
			userSort = {
				key,
				dir: currentDir === 'asc' ? 'desc' : 'asc',
				forScenario: scenario,
				forPlan: planFilter
			};
		} else {
			userSort = {
				key,
				dir: 'desc',
				forScenario: scenario,
				forPlan: planFilter
			};
		}
	}

	/** Column-header click: exit ranked mode (if active), then apply the sort. */
	function handleSort(key: SortKey) {
		if (need) onExitNeed();
		toggleSort(key);
	}

	/** Burn, Score, Req / 5h and Fit are OpenCode Go data, so static plans cannot sort by them. */
	let goColumnsSortable = $derived(planFilter === '' || planFilter === 'go');

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
				<Table.Head class="whitespace-nowrap text-muted-foreground">Plans</Table.Head>
				{@const intelligenceSort = sortIndicator('intelligence')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('intelligence')}
				>
					<span class="inline-flex items-center gap-1">
						Intelligence
						<intelligenceSort.icon
							class="size-3 {intelligenceSort.active
								? 'text-foreground'
								: 'text-muted-foreground/40'}"
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
				{@render goOnlyHead('burn', 'Burn')}
				{@render goOnlyHead('score', 'Score', 'hidden md:table-cell')}
				{@render goOnlyHead('quota', 'Req / 5h')}
				{@const codingSort = sortIndicator('coding')}
				<Table.Head
					class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground"
					onclick={() => handleSort('coding')}
				>
					<span class="inline-flex items-center gap-1">
						{need
							? fitLabel
								? `${need.metricLabel} · ${fitLabel} fit`
								: need.metricLabel
							: 'Coding'}
						<codingSort.icon
							class="size-3 {codingSort.active ? 'text-foreground' : 'text-muted-foreground/40'}"
						/>
					</span>
				</Table.Head>
				{#if scenario}
					{@render goOnlyHead('fit', 'Fit', 'w-24')}
				{/if}
				<Table.Head class="hidden whitespace-nowrap text-muted-foreground md:table-cell"
					>Tags</Table.Head
				>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each displayRows as display (display.row.key)}
				{@const row = display.row}
				{@const compareKey = selectedKeyForRow(row, planFilter)}
				{@const isSelected = selectedModelId === row.id}
				{@const isCompared = compareKey ? isCompareSelected(selectedIds, compareKey) : false}
				{@const isLeader = need !== null && display.rank === 1}
				<Table.Row
					class="cursor-pointer border-b border-border transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none focus-visible:ring-inset {isSelected
						? 'bg-muted/70 hover:bg-muted/80'
						: ''} {isCompared ? 'bg-primary/4' : ''} {isLeader ? 'bg-amber-500/5' : ''}"
					onclick={() => onSelectModel(row)}
					tabindex={0}
					role="button"
					aria-pressed={isSelected}
					data-state={isSelected ? 'selected' : undefined}
					onkeydown={(e) => {
						if (e.key === 'Enter') onSelectModel(row);
					}}
				>
					<Table.Cell
						class="w-10 text-center"
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => e.stopPropagation()}
					>
						{#if compareKey}
							<button
								type="button"
								role="checkbox"
								aria-checked={isCompared}
								aria-label={`${isCompared ? 'Remove' : 'Add'} ${row.name} ${
									isCompared ? 'from' : 'to'
								} comparison`}
								onclick={(e) => {
									e.stopPropagation();
									onToggleCompare?.(compareKey);
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										e.stopPropagation();
										onToggleCompare?.(compareKey);
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
						{:else}
							<!-- No plan carries this row, so it has no compare key. -->
							<span
								class="mx-auto flex size-5 items-center justify-center rounded-md border border-border bg-background opacity-40"
								aria-hidden="true"
							></span>
						{/if}
					</Table.Cell>
					<Table.Cell class="w-10">
						{@render rankBadge(display.rank, need, row.name)}
					</Table.Cell>
					<Table.Cell class="font-medium">
						<div class="flex items-center gap-2">
							<span class="text-foreground">{row.name}</span>
						</div>
						<div class="text-xs text-muted-foreground">{row.provider}</div>
						<!-- Non-text modalities only: every Go model accepts text, so that
						     chip would be a constant. Static plans carry no capabilities. -->
						<CapabilityBadges
							capabilities={row.go?.capabilities ?? null}
							kind="input"
							variant="compact"
							omit={['text']}
							class="mt-1.5"
						/>
					</Table.Cell>
					<Table.Cell>
						<PlanBadges entries={row.plans} active={planFilter} />
					</Table.Cell>
					<Table.Cell class="text-sm tabular-nums">
						{formatIntelligence(row.intelligence)}
					</Table.Cell>
					<Table.Cell class="text-sm tabular-nums">
						<PriceCell {row} {planFilter} />
					</Table.Cell>
					<Table.Cell>
						{#if display.burn}
							<BurnBadge burnDetails={display.burn} />
						{:else}
							<span class="text-muted-foreground/40">—</span>
						{/if}
					</Table.Cell>
					<Table.Cell class="hidden text-sm tabular-nums md:table-cell">
						<BurnScoreCell burn={display.burn} />
					</Table.Cell>
					<Table.Cell class="text-sm text-muted-foreground/70 tabular-nums">
						{#if display.quota}
							{display.quota.unlimited ? 'Unlimited' : formatCompact(display.quota.requestsPer5h)}
						{:else}
							<span class="text-muted-foreground/40">—</span>
						{/if}
					</Table.Cell>
					<Table.Cell class="text-sm tabular-nums">
						{@render metricCell(display, row, need)}
					</Table.Cell>
					{#if scenario}
						<Table.Cell>
							<ScenarioFitCell go={row.go} {scenario} />
						</Table.Cell>
					{/if}
					<Table.Cell class="hidden md:table-cell">
						<RowTagsCell {row} {planFilter} />
					</Table.Cell>
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={scenario ? 12 : 11} class="py-12 text-center">
						<div class="flex flex-col items-center gap-2 text-muted-foreground">
							<SearchX class="size-8 opacity-40" />
							{#if need && needEntries && scoredEntries(needEntries).length === 0}
								<p>
									No opencode model has {need.metricLabel.toLowerCase()} data yet.
								</p>
								<p class="text-xs">Check back after the next benchmark refresh.</p>
							{:else if planFilter !== ''}
								<p>
									No models on {PLAN_LABEL[planFilter]}{filter.trim() ? ' match your search' : ''}.
								</p>
								<p class="text-xs">Try clearing the search or switching plans.</p>
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

<!--
			Row cells live in snippets so the row body stays a readable list of cells.
			Both branches depend on whether a need is active, which is a per-row state
			decision rather than table chrome.
		-->
{#snippet goOnlyHead(key: SortKey, label: string, extraClass?: string)}
	{@const indicator = sortIndicator(key)}
	{#if goColumnsSortable}
		<Table.Head
			class="cursor-pointer whitespace-nowrap text-muted-foreground hover:text-foreground {extraClass ??
				''}"
			onclick={() => handleSort(key)}
		>
			<span class="inline-flex items-center gap-1">
				{label}
				<indicator.icon
					class="size-3 {indicator.active ? 'text-foreground' : 'text-muted-foreground/40'}"
				/>
			</span>
		</Table.Head>
	{:else}
		<Table.Head
			class="cursor-default whitespace-nowrap text-muted-foreground {extraClass ?? ''}"
			title="OpenCode Go data"
		>
			<span class="inline-flex items-center gap-1">{label}</span>
		</Table.Head>
	{/if}
{/snippet}

{#snippet rankBadge(rank: number | null, activeNeed: NeedSpec | null, name: string)}
	{#if !activeNeed}
		<span class="text-sm text-muted-foreground/60 tabular-nums">{rank}</span>
	{:else if rank == null}
		<!-- No data for this need's metric: the model is listed but unranked,
				     so it shows an em dash rather than a rank it was never given. -->
		<span
			class="text-sm text-muted-foreground/30"
			title="No {activeNeed.metricLabel.toLowerCase()} data"
		>
			—
		</span>
	{:else if rank === 1}
		<span
			class="inline-flex size-6 items-center justify-center rounded-md bg-amber-400/15 text-amber-500"
			title="#1 {name}"
		>
			<Crown class="size-3.5" />
		</span>
	{:else if rank === 2}
		<span
			class="inline-flex size-6 items-center justify-center rounded-md bg-slate-400/15 text-sm font-semibold text-slate-400 tabular-nums"
		>
			2
		</span>
	{:else if rank === 3}
		<span
			class="inline-flex size-6 items-center justify-center rounded-md bg-orange-400/15 text-sm font-semibold text-orange-500 tabular-nums"
		>
			3
		</span>
	{:else}
		<span class="text-sm text-muted-foreground/50 tabular-nums">{rank}</span>
	{/if}
{/snippet}

{#snippet metricCell(display: DisplayRow, row: CatalogRow, activeNeed: NeedSpec | null)}
	{#if activeNeed && display.value != null}
		<div class="flex items-center gap-2">
			<div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full {activeNeed.bar}"
					style="width: {metricWidth(display.value)}%"
				></div>
			</div>
			<span class="text-xs font-semibold tabular-nums {activeNeed.accent}">
				{activeNeed.format(display.value)}
			</span>
			{#if display.fit != null}
				<span class="text-xs text-muted-foreground/60 tabular-nums">fit {display.fit}</span>
			{/if}
		</div>
	{:else if activeNeed}
		<!-- Active need, no data for it: an em dash rather than falling through
				     to the Coding index, which would answer a different question. -->
		<span class="text-xs text-muted-foreground/40" title="No {activeNeed.metricLabel} data">—</span>
	{:else if row.coding != null}
		<span class="text-foreground/80">{row.coding.toFixed(1)}</span>
	{:else}
		<span class="text-muted-foreground/30">—</span>
	{/if}
{/snippet}
