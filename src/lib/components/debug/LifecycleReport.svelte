<script lang="ts">
	import * as Table from '$lib/components/ui/table/index.js';
	import type { ModelLifecycleReport } from '$lib/server/models';
	import type { GoLifecycleStatus } from '$lib/server/go-lifecycle';
	import CanonicalBenchmarkTable from './CanonicalBenchmarkTable.svelte';

	interface Props {
		lifecycle: ModelLifecycleReport;
		/** The live Go catalog — supplies display names for the benchmark rows. */
		models: { id: string; name: string }[];
	}

	let { lifecycle, models }: Props = $props();

	const DASH = '—';

	/** How each status reads in the table, and how loud it is. */
	const STATUS_META: Record<GoLifecycleStatus, { label: string; className: string }> = {
		drift: { label: 'Drift', className: 'text-amber-600 dark:text-amber-400' },
		killed: { label: 'Killed', className: 'text-red-500' },
		deprecated: { label: 'Deprecated', className: 'text-amber-600' },
		alive: { label: 'Alive', className: 'text-muted-foreground' },
		never: { label: 'Never on Go', className: 'text-muted-foreground/60' }
	};

	/**
	 * How old the ledger is, in the reader's own clock.
	 *
	 * The ledger is cached for 24h while the catalog behind it rebuilds every
	 * 6h, so after a catalog refresh a `killed` model can still read `alive`.
	 * Showing the build date — and flagging a day-old sweep — is what makes that
	 * staleness legible instead of looking like a live reading.
	 */
	const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
	let builtAt = $derived(lifecycle.builtAt == null ? null : new Date(lifecycle.builtAt));
	let stale = $derived(
		lifecycle.builtAt != null && Date.now() - lifecycle.builtAt > STALE_AFTER_MS
	);
</script>

<section class="mb-8">
	<h2 class="mb-2 text-lg font-semibold text-foreground">Model Lifecycle</h2>
	<p class="mb-2 text-sm text-muted-foreground">
		When each model was live on OpenCode Go, reconstructed from the commit history of models.dev's
		Go provider files. Advisory only — it never changes which models the catalog shows. A model
		absent from this table means its history could not be read (state unknown), not that it was
		never on Go.
	</p>
	<p class="mb-4 text-xs text-muted-foreground">
		{#if builtAt == null}
			Build time unknown — this report is the empty fallback, not a sweep result.
		{:else}
			Ledger built {builtAt.toLocaleString()} ({builtAt.toISOString()}) — cached for 24h, so a model
			retired since then can still read Alive.{#if stale}<span class="text-amber-600">
					More than 24h old; rebuild it with
					<code class="font-mono">POST /api/revalidate?scope=lifecycle</code>
					(requires
					<code class="font-mono">REVALIDATE_SECRET</code> as a bearer token).</span
				>{/if}
		{/if}
	</p>

	{#if lifecycle.rows.length === 0}
		<p class="mb-6 rounded-lg border border-border p-3 text-sm text-muted-foreground">
			No lifecycle data — the models.dev history sweep is unavailable or still running.
		</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Model</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>First seen</Table.Head>
					<Table.Head>Killed</Table.Head>
					<Table.Head>Last touched</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each lifecycle.rows as row (row.id)}
					<Table.Row>
						<Table.Cell class="font-mono text-xs">{row.id}</Table.Cell>
						<Table.Cell class={STATUS_META[row.status].className}>
							{STATUS_META[row.status].label}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground tabular-nums"
							>{row.firstSeen ?? DASH}</Table.Cell
						>
						<Table.Cell class="text-muted-foreground tabular-nums"
							>{row.killedOn ?? DASH}</Table.Cell
						>
						<Table.Cell class="text-muted-foreground tabular-nums">
							{row.lastTouched ?? DASH}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</section>

<section>
	<CanonicalBenchmarkTable benchmarks={lifecycle.benchmarks} {models} />
</section>
