<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import type { CanonicalBenchmarkRow } from '$lib/server/models';
	import { MIN_COVERAGE, benchmarkKey } from '$lib/canonical-benchmarks';

	interface Props {
		benchmarks: CanonicalBenchmarkRow[];
		/** The live Go catalog — supplies display names for the benchmark rows. */
		models: { id: string; name: string }[];
	}

	let { benchmarks, models }: Props = $props();

	const DASH = '—';

	let displayNames = $derived(new Map(models.map((m) => [m.id, m.name])));

	/** Rows grouped by model, comparable pairs first; the first row carries the name. */
	let grouped = $derived.by(() => {
		const byModel = new Map<string, CanonicalBenchmarkRow[]>();
		for (const row of benchmarks) {
			const bucket = byModel.get(row.id);
			if (bucket) bucket.push(row);
			else byModel.set(row.id, [row]);
		}
		return [...byModel].map(([id, rows]) => {
			const model = displayNames.get(id) ?? id;
			const sorted = [...rows].sort((a, b) => Number(b.comparable) - Number(a.comparable));
			return { model, rows: sorted };
		});
	});

	/**
	 * Comparable vs total DISTINCT `name|metric` pairs.
	 *
	 * Counted as pairs on BOTH sides, not rows: one model can report two metrics
	 * of the same benchmark, so comparing a pair count to a row count would
	 * print a statistic that is not true of either number.
	 */
	let coverage = $derived.by(() => {
		const pairs = new Set(benchmarks.map((b) => benchmarkKey(b.name, b.metric)));
		const comparablePairs = new Set(
			benchmarks.filter((b) => b.comparable).map((b) => benchmarkKey(b.name, b.metric))
		);
		return { comparable: comparablePairs.size, total: pairs.size };
	});

	/** The score, marked inline when the pair is comparable. */
	function scoreLabel(row: CanonicalBenchmarkRow): string {
		return row.comparable ? `${row.score} (comparable)` : String(row.score);
	}
</script>

<h3 class="mb-2 text-base font-semibold text-foreground">Canonical Benchmarks</h3>
<p class="mb-4 text-sm text-muted-foreground">
	Benchmarks from models.dev's canonical model layer, joined to the live Go catalog. Scores are raw
	values: Elo ratings and Codeforces ratings are not on a 0-100 scale, so read the metric, not just
	the number. “Comparable” marks the pairs reported by {MIN_COVERAGE}+ models — {coverage.comparable}
	of {coverage.total} benchmark pairs.
</p>

{#if grouped.length === 0}
	<p class="rounded-lg border border-border p-3 text-sm text-muted-foreground">
		No canonical benchmark data for the current catalog.
	</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Model</Table.Head>
				<Table.Head>Benchmark</Table.Head>
				<Table.Head>Metric</Table.Head>
				<Table.Head>Score</Table.Head>
				<Table.Head>Coverage</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each grouped as group (group.model)}
				{#each group.rows as row, i (benchmarkKey(row.name, row.metric))}
					<Table.Row>
						<Table.Cell>
							{#if i === 0}<span class="font-medium">{group.model}</span>{/if}
						</Table.Cell>
						<Table.Cell>{row.name}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{row.metric ?? DASH}</Table.Cell>
						<Table.Cell class="tabular-nums">{scoreLabel(row)}</Table.Cell>
						<Table.Cell class="text-muted-foreground tabular-nums">{row.coverage}</Table.Cell>
					</Table.Row>
				{/each}
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
