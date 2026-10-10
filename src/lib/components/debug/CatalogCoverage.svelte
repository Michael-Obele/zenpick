<script lang="ts">
	import type { CatalogAudit } from '$lib/types/models';
	import { CircleCheck, TriangleAlert } from '@lucide/svelte';

	interface Props {
		audit: CatalogAudit;
	}

	let { audit }: Props = $props();

	type Tone = 'alert' | 'warn' | 'info';
	interface AuditSection {
		title: string;
		note?: string;
		items: string[];
		empty: string;
		tone: Tone;
	}

	/**
	 * The catalog is `apiIds ∩ usageTableIds`, so these lists are exactly where a
	 * model can silently vanish. Claude Haiku 5.5 was an "Unmatched docs rows"
	 * entry — the docs listed it, but its row couldn't be mapped to an API id.
	 */
	let sections = $derived<AuditSection[]>([
		{
			title: 'Unmatched docs rows',
			note: 'Docs rows that mapped to no Go API id — these models are MISSING from the catalog.',
			items: audit.unmatchedDocsRows.map((r) => `${r.name} · ${r.table}`),
			empty: 'None — every docs row mapped.',
			tone: 'alert'
		},
		{
			title: 'Priced but not in the usage table',
			items: audit.pricedButUnlisted,
			empty: 'None.',
			tone: 'alert'
		},
		{
			title: 'In the catalog but unpriced',
			items: audit.listedButUnpriced,
			empty: 'None.',
			tone: 'warn'
		},
		{
			title: 'In the API but not on the docs page',
			note: 'Usually models the docs dropped on purpose (deprecated) — expected to be non-empty.',
			items: audit.apiNotListed,
			empty: 'None.',
			tone: 'info'
		}
	]);

	let alerts = $derived(audit.unmatchedDocsRows.length + audit.pricedButUnlisted.length);

	function toneClass(tone: Tone): string {
		if (tone === 'alert') return 'text-red-500';
		if (tone === 'warn') return 'text-amber-600';
		return 'text-muted-foreground';
	}
</script>

<div class="mb-6">
	<h3 class="mb-1 text-sm font-semibold text-foreground">Catalog coverage</h3>
	<p class="mb-3 text-xs text-muted-foreground">
		Reconciliation between the Go API model list and the OpenCode docs tables. The catalog is built
		from models present in both, so any mismatch below is a model that did not reach the site.
	</p>

	{#if alerts > 0}
		<div
			class="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500"
		>
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<div>
				<div class="font-medium">
					{alerts} docs model{alerts === 1 ? '' : 's'} did not reach the catalog
				</div>
				<div class="text-xs text-red-400/80">
					The matcher failed or the docs/API changed shape — check the lists below.
				</div>
			</div>
		</div>
	{:else}
		<div
			class="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400"
		>
			<CircleCheck class="size-4 shrink-0" />
			All docs models matched a Go API id.
		</div>
	{/if}

	<div class="mb-4 grid grid-cols-3 gap-2 text-sm">
		<div class="rounded-lg border border-border p-2 text-center">
			<div class="text-xs text-muted-foreground">API models</div>
			<div class="tabular-nums text-foreground">{audit.apiCount}</div>
		</div>
		<div class="rounded-lg border border-border p-2 text-center">
			<div class="text-xs text-muted-foreground">Docs rows</div>
			<div class="tabular-nums text-foreground">{audit.docsRows}</div>
		</div>
		<div class="rounded-lg border border-border p-2 text-center">
			<div class="text-xs text-muted-foreground">Matched</div>
			<div class="tabular-nums text-foreground">{audit.matchedRows}</div>
		</div>
	</div>

	<div class="space-y-4 text-sm">
		{#each sections as section (section.title)}
			<div>
				<div class="mb-1 font-medium text-foreground">
					{section.title}
					<span class="text-muted-foreground">({section.items.length})</span>
				</div>
				{#if section.note}
					<p class="text-xs text-muted-foreground">{section.note}</p>
				{/if}
				{#if section.items.length === 0}
					<p class="text-xs text-muted-foreground">{section.empty}</p>
				{:else}
					<ul class="mt-0.5 space-y-0.5">
						{#each section.items as item (item)}
							<li class="font-mono text-xs {toneClass(section.tone)}">{item}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</div>
</div>
