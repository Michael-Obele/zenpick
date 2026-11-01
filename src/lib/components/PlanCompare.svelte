<script lang="ts">
	import { ChevronLeft, ChevronRight, X } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { PLAN_LABEL } from '$lib/catalog';
	import type { CompareEntry } from '$lib/compare-selection';
	import { formatIntelligence, formatPricePerM } from '$lib/stack/format';
	import { formatCompact, tieRound } from '$lib/utils';

	/**
	 * Cross-plan comparison table
	 * ---------------------------
	 * `ModelCompare` is the deep Go grid (burn, quota, scenario fit, migration
	 * hints). It reads fields only OpenCode Go publishes, so a mixed or
	 * static-plan selection cannot use it. This table shows what every plan
	 * publishes — price, context, intelligence, coding — one row per selected
	 * entry, with the same remove/reorder controls.
	 */

	let {
		entries,
		onRemove,
		onMove
	}: {
		entries: CompareEntry[];
		onRemove?: (key: string) => void;
		onMove?: (key: string, delta: number) => void;
	} = $props();

	type NumericColumn = 'input' | 'output' | 'cached' | 'context' | 'intelligence' | 'coding';

	/** One definition drives the header and the body, so they cannot drift. */
	const COLUMNS: ReadonlyArray<{ key: NumericColumn; label: string }> = [
		{ key: 'input', label: 'Input / 1M' },
		{ key: 'output', label: 'Output / 1M' },
		{ key: 'cached', label: 'Cached / 1M' },
		{ key: 'context', label: 'Context' },
		{ key: 'intelligence', label: 'Intelligence' },
		{ key: 'coding', label: 'Coding' }
	];

	/** Cheaper is better for prices; bigger is better for the rest. */
	const LOWER_IS_BETTER: ReadonlySet<NumericColumn> = new Set(['input', 'output', 'cached']);

	/**
	 * Decimals each column renders at, so two values that print identically are
	 * a tie instead of one of them silently owning the highlight.
	 */
	const DECIMALS: Record<NumericColumn, number> = {
		input: 3,
		output: 3,
		cached: 3,
		context: 0,
		intelligence: 1,
		coding: 1
	};

	/** The value a column reads off one entry; null means "not published". */
	function metricValue(entry: CompareEntry, column: NumericColumn): number | null {
		switch (column) {
			case 'input':
				return entry.plan.pricing.inputPricePerM;
			case 'output':
				return entry.plan.pricing.outputPricePerM;
			case 'cached':
				return entry.plan.pricing.cachedReadPerM;
			case 'context':
				return entry.row.contextWindow;
			case 'intelligence':
				return entry.row.intelligence;
			case 'coding':
				return entry.row.coding;
		}
	}

	function formatMetric(value: number | null, column: NumericColumn): string {
		if (column === 'context') return formatCompact(value);
		if (column === 'intelligence') return formatIntelligence(value);
		if (column === 'coding') return value == null ? '—' : value.toFixed(1);
		return formatPricePerM(value);
	}

	/** Best value per column at display precision, ignoring nulls; null when nothing is comparable. */
	let best = $derived.by(() => {
		const out = {} as Record<NumericColumn, number | null>;
		for (const column of COLUMNS) {
			const values = entries
				.map((entry) => metricValue(entry, column.key))
				.filter((value): value is number => value != null)
				.map((value) => tieRound(value, DECIMALS[column.key]));
			out[column.key] = values.length
				? LOWER_IS_BETTER.has(column.key)
					? Math.min(...values)
					: Math.max(...values)
				: null;
		}
		return out;
	});

	/** End-of-row arrows stay focusable; the caller clamps, so a press is a no-op. */
	const moveBtn =
		'text-muted-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40';
</script>

{#snippet metricCell(entry: CompareEntry, column: NumericColumn)}
	{@const value = metricValue(entry, column)}
	<Table.Cell class="text-right tabular-nums">
		<span
			class={value != null && tieRound(value, DECIMALS[column]) === best[column]
				? 'font-semibold text-primary'
				: undefined}>{formatMetric(value, column)}</span
		>
	</Table.Cell>
{/snippet}

<div class="overflow-x-auto rounded-xl border border-border bg-card">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Model</Table.Head>
				<Table.Head>Plan</Table.Head>
				{#each COLUMNS as column (column.key)}
					<Table.Head class="text-right">{column.label}</Table.Head>
				{/each}
				<Table.Head class="text-right">
					<span class="sr-only">Actions</span>
				</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each entries as entry, i (entry.key)}
				<Table.Row>
					<Table.Cell class="max-w-72 min-w-48 whitespace-normal">
						<div class="font-medium text-foreground">{entry.row.name}</div>
						<div class="text-xs text-muted-foreground">
							{entry.row.provider}
						</div>
						{#if entry.plan.note}
							<div class="mt-0.5 text-xs text-muted-foreground">
								{entry.plan.note}
							</div>
						{/if}
					</Table.Cell>
					<Table.Cell>
						<Badge variant="outline">{PLAN_LABEL[entry.plan.plan]}</Badge>
					</Table.Cell>
					{#each COLUMNS as column (column.key)}
						{@render metricCell(entry, column.key)}
					{/each}
					<Table.Cell class="text-right">
						<div class="flex items-center justify-end gap-0.5">
							{#if onMove}
								<Button
									variant="ghost"
									size="icon-xs"
									class={moveBtn}
									onclick={() => onMove(entry.key, -1)}
									aria-disabled={i === 0}
									aria-label={`Move ${entry.row.name} (${PLAN_LABEL[entry.plan.plan]}) earlier`}
									title="Move earlier"
								>
									<ChevronLeft class="size-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									class={moveBtn}
									onclick={() => onMove(entry.key, 1)}
									aria-disabled={i === entries.length - 1}
									aria-label={`Move ${entry.row.name} (${PLAN_LABEL[entry.plan.plan]}) later`}
									title="Move later"
								>
									<ChevronRight class="size-3.5" />
								</Button>
							{/if}
							{#if onRemove}
								<Button
									variant="ghost"
									size="icon-xs"
									class="text-muted-foreground"
									onclick={() => onRemove(entry.key)}
									aria-label={`Remove ${entry.row.name} (${PLAN_LABEL[entry.plan.plan]})`}
								>
									<X class="size-3.5" />
								</Button>
							{/if}
						</div>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
<p class="mt-2 text-xs text-muted-foreground">
	Plan comparison shows the metrics every plan publishes. Burn, OpenCode Go quotas and replaces
	hints appear on the Go comparison.
</p>
