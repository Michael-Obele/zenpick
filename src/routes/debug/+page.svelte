<script lang="ts">
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { resource } from 'runed';
	import { useSearchParams } from 'runed/kit';
	import {
		DEBUG_FORMATS,
		DEBUG_SECTIONS,
		debugSearchSchema,
		sectionLabel,
		type DebugFormat,
		type DebugSection
	} from '$lib/debug/sections';
	import { exportSection } from '$lib/debug/export';
	import ModelsOverview from '$lib/components/debug/ModelsOverview.svelte';
	import PricingMatrix from '$lib/components/debug/PricingMatrix.svelte';
	import QuotaMatrix from '$lib/components/debug/QuotaMatrix.svelte';
	import BurnTable from '$lib/components/debug/BurnTable.svelte';
	import BenchmarkMatrix from '$lib/components/debug/BenchmarkMatrix.svelte';
	import MatchingReport from '$lib/components/debug/MatchingReport.svelte';
	import MigrationReport from '$lib/components/debug/MigrationReport.svelte';
	import CatalogCoverage from '$lib/components/debug/CatalogCoverage.svelte';
	import CompareLogic from '$lib/components/debug/CompareLogic.svelte';
	import TagReport from '$lib/components/debug/TagReport.svelte';
	import ScenarioBreakdown from '$lib/components/debug/ScenarioBreakdown.svelte';
	import RawJson from '$lib/components/debug/RawJson.svelte';
	import { Bug, RefreshCw } from '@lucide/svelte';

	let { data }: { data: PageData } = $props();

	// URL is the source of truth for the active tab and output format.
	const params = useSearchParams(debugSearchSchema, { pushHistory: true, noScroll: true });

	/**
	 * SSR-safe view state. `data` is validated in the load function (which
	 * re-runs when a schema param changes), so the server HTML matches the URL
	 * with no JavaScript. On the client we read `params` — runed's live URL state
	 * — so tab clicks update instantly and survive back/forward. Both read the
	 * same URL through the same schema, so hydration always agrees.
	 */
	const section = $derived<DebugSection>(
		browser ? (params.section as DebugSection) : (data.section as DebugSection)
	);
	const format = $derived<DebugFormat>(
		browser ? (params.format as DebugFormat) : (data.format as DebugFormat)
	);

	/**
	 * Bumped by the Refresh button. It is a dependency of BOTH resources below,
	 * so a refresh re-pulls the machine-readable export too.
	 */
	let revision = $state(0);

	// ── Machine-readable export ──────────────────────────────────────────────
	// Seeded with the server-rendered text (a no-JS fetch already sees content)
	// and refetched from `/debug/export` when section/format change.
	const initialExport = untrack(() =>
		data.format === 'html'
			? ''
			: exportSection(data.section as DebugSection, data.format as DebugFormat, {
					models: data.models,
					frontierSnapshot: data.frontierSnapshot,
					catalogAudit: data.catalogAudit
				})
	);

	const exportRes = resource(
		(): [DebugSection, DebugFormat, number] => [section, format, revision],
		async ([s, f], _prev, { signal }) => {
			if (f === 'html') return '';
			const res = await fetch(`/debug/export?section=${s}&format=${f}`, { signal });
			if (!res.ok) throw new Error(`Export failed (${res.status})`);
			return await res.text();
		},
		{ initialValue: initialExport, lazy: true }
	);

	// ── Cache-bypassing refresh ──────────────────────────────────────────────
	// `/debug/refresh` forces a full upstream rebuild; `invalidateAll` then
	// re-runs the load so every panel reflects the fresh catalog.
	const refreshRes = resource(
		() => revision,
		async (_rev, _prev, { signal }) => {
			const res = await fetch('/debug/refresh', { method: 'POST', signal });
			if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
			const out = (await res.json()) as { models: number; at: string };
			await invalidateAll();
			return out;
		},
		{ lazy: true }
	);

	function refresh() {
		revision += 1;
	}

	const FORMAT_LABELS: Record<DebugFormat, string> = {
		html: 'HTML',
		md: 'Markdown',
		json: 'JSON'
	};
</script>

<svelte:head>
	<title>ZenPick — Debug</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8">
	<div class="mb-6 flex flex-wrap items-center gap-2">
		<Bug class="size-5 text-amber-500" />
		<h1 class="text-2xl font-bold text-foreground">Calculation Debug Page</h1>
		<span class="ml-2 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
			>{data.models.length} models</span
		>

		<div class="ml-auto flex items-center gap-2">
			<!-- Output format -->
			<div class="inline-flex overflow-hidden rounded-full border border-border">
				{#each DEBUG_FORMATS as f (f)}
					<button
						class="px-3 py-1.5 text-xs font-medium transition-colors {format === f
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground hover:text-foreground'}"
						aria-pressed={format === f}
						onclick={() => (params.format = f)}
					>
						{FORMAT_LABELS[f]}
					</button>
				{/each}
			</div>
			<button
				class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
				onclick={refresh}
				disabled={refreshRes.loading}
			>
				<RefreshCw class="size-3.5 {refreshRes.loading ? 'animate-spin' : ''}" />
				{refreshRes.loading ? 'Refreshing…' : 'Refresh data'}
			</button>
		</div>
	</div>

	{#if refreshRes.error}
		<p class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
			Refresh failed: {refreshRes.error.message}
		</p>
	{:else if refreshRes.current}
		<p class="mb-4 text-xs text-muted-foreground">
			Refreshed {refreshRes.current.models} models at {new Date(
				refreshRes.current.at
			).toLocaleTimeString()}.
		</p>
	{/if}

	<!-- Section nav -->
	<div class="mb-6 flex flex-wrap gap-1.5">
		{#each DEBUG_SECTIONS as s (s.id)}
			<button
				class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all {section ===
				s.id
					? 'border-primary/40 bg-primary/10 text-primary'
					: 'border-border bg-card text-muted-foreground hover:text-foreground'}"
				aria-current={section === s.id ? 'page' : undefined}
				onclick={() => (params.section = s.id)}
			>
				{s.label}
			</button>
		{/each}
	</div>

	<!-- Machine-readable links (for LLM agents and curl) -->
	<p class="mb-4 text-xs text-muted-foreground">
		Machine-readable:
		<a
			class="underline hover:text-foreground"
			href="/debug/export?section={section}&format=md"
			target="_blank"
			rel="noopener">markdown</a
		>
		·
		<a
			class="underline hover:text-foreground"
			href="/debug/export?section={section}&format=json"
			target="_blank"
			rel="noopener">JSON</a
		>
		<span class="text-muted-foreground/60">(served by /debug/export)</span>
	</p>

	{#if format === 'html'}
		<div class="rounded-xl border border-border bg-card p-6">
			{#if section === 'overview'}
				<ModelsOverview models={data.models} />
			{:else if section === 'pricing'}
				<PricingMatrix models={data.models} />
			{:else if section === 'quota'}
				<QuotaMatrix models={data.models} />
			{:else if section === 'burn'}
				<BurnTable models={data.models} />
			{:else if section === 'benchmarks'}
				<BenchmarkMatrix models={data.models} />
			{:else if section === 'matching'}
				<CatalogCoverage audit={data.catalogAudit} />
				<MatchingReport models={data.models} />
			{:else if section === 'migration'}
				<MigrationReport models={data.models} />
			{:else if section === 'compare'}
				<CompareLogic
					models={data.models}
					frontier={data.frontierSnapshot.frontier}
					cutoff={data.frontierSnapshot.cutoff}
				/>
			{:else if section === 'tags'}
				<TagReport models={data.models} />
			{:else if section === 'scenarios'}
				<ScenarioBreakdown models={data.models} />
			{:else if section === 'raw'}
				<RawJson models={data.models} />
			{/if}
		</div>
	{:else}
		<div class="rounded-xl border border-border bg-card">
			<div class="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
				<span class="text-xs text-muted-foreground">
					{sectionLabel(section)} · {FORMAT_LABELS[format]}
					{#if exportRes.loading}<span> · loading…</span>{/if}
					{#if exportRes.error}<span class="text-red-500"> · {exportRes.error.message}</span>{/if}
				</span>
				<button
					class="text-xs text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => exportRes.refetch()}
				>
					Reload
				</button>
			</div>
			<pre
				class="max-h-[70vh] overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground"
				aria-label="{sectionLabel(section)} {FORMAT_LABELS[format]}">{exportRes.current ?? ''}</pre>
		</div>
	{/if}
</div>
