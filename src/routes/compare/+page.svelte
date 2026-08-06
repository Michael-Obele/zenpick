<script lang="ts">
	import { onMount } from 'svelte';
	import { useSearchParams } from 'runed/kit';
	import type { GoModel } from '$lib/types/models';
	import ModelCompare from '$lib/components/ModelCompare.svelte';
	import AskAiMenu from '$lib/components/AskAiMenu.svelte';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import { buildLlmStatsCompareUrl } from '$lib/utils/llm-stats-url';
	import { compareSearchSchema } from '$lib/compare-search';
	import {
		catalogQualityAnchor,
		catalogValueAnchor,
		randomSuggestedPair
	} from '$lib/compare-defaults';
	import * as Select from '$lib/components/ui/select/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import {
		Dices,
		GitCompare,
		Plus,
		X,
		ArrowLeft,
		Info,
		ExternalLink,
		Copy,
		Check
	} from '@lucide/svelte';
	import { LightRays } from '$lib/components/magic/light-rays';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// Re-declared via $derived so a re-navigation with a fresh catalog
	// (different array identity) stays reactive in deriveds.
	let models = $derived(data.models);

	// ── URL is the single source of truth for DISPLAY ─────────────────────
	// `params` is runed's live, schema-validated URL state — it syncs from
	// back/forward and tabs internally, so all display below is derived
	// with zero effects. Mutations are plain functions that write BOTH the
	// store (homepage bridge + dismissal flag) and `params` (URL).
	const params = useSearchParams(compareSearchSchema, {
		pushHistory: false,
		noScroll: true
	});

	/** Validated model IDs from the URL (reactive). */
	let urlIds = $derived(
		params.models
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.filter((id) => models.some((m) => m.id === id))
	);

	let selectedModels = $derived(
		urlIds.map((id) => models.find((m) => m.id === id)).filter((m): m is GoModel => Boolean(m))
	);
	let available = $derived(models.filter((m) => !urlIds.includes(m.id)));
	let atMax = $derived(urlIds.length >= MAX_COMPARE);
	let llmStatsCompareUrl = $derived(buildLlmStatsCompareUrl(selectedModels));

	// Catalog-wide anchor roles — computed from ALL models so the chips stay
	// truthful even when the user swaps models in or out of the comparison.
	let anchors = $derived.by(() => {
		const map: Record<string, 'quality' | 'value'> = {};
		const quality = catalogQualityAnchor(models);
		const value = catalogValueAnchor(models);
		if (quality) map[quality.id] = 'quality';
		if (value) map[value.id] = 'value';
		return map;
	});

	// ── Mutations: functions, no effects ──────────────────────────────────
	// Every mutation goes through the store (guards + dismissedDefaults)
	// and then mirrors the result into the URL — one write, both sides.

	function syncUrl() {
		params.models = compare.selection.join(',');
	}

	function handlePick(v: string | undefined) {
		if (v) {
			compare.add(v);
			syncUrl();
		}
		pick = undefined;
	}

	function removeModel(id: string) {
		compare.remove(id);
		syncUrl();
	}

	function clearAll() {
		compare.clear(); // also sets dismissedDefaults
		syncUrl(); // params.models = '' → clean URL
	}

	function loadSuggested() {
		if (!models.length) return;
		compare.seedDefaults(
			randomSuggestedPair(models).map((m) => m.id),
			true
		);
		syncUrl();
	}

	// ── One-time seed (initial mount only) ────────────────────────────────
	// Client navigations back to this route re-run `load`, which syncs the
	// store from the URL — so only the very first mount needs this.
	// Precedence: explicit ?models= share link → homepage store bridge →
	// fresh random pair (unless dismissed with "Clear all").
	onMount(() => {
		if (urlIds.length) {
			// Share link: the URL is already displayed; mirror it to the
			// store so the homepage tray stays truthful.
			compare.selection = urlIds;
		} else if (compare.selection.length) {
			// Homepage → compare: carry the tray selection into the URL.
			params.models = compare.selection.join(',');
		} else if (!compare.dismissedDefaults) {
			compare.seedDefaults(randomSuggestedPair(models).map((m) => m.id));
			params.models = compare.selection.join(',');
		}
	});

	// Combobox state (ephemeral UI, event-driven — not URL state)
	let pick = $state<string | undefined>(undefined);

	let copied = $state(false);
	async function copyLlmStats() {
		if (!llmStatsCompareUrl) return;
		try {
			await navigator.clipboard.writeText(llmStatsCompareUrl);
		} catch {
			// href is present for right-click → copy link address
		}
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<svelte:head>
	<title>Compare Models — ZenPick</title>
	<meta
		name="description"
		content="Compare OpenCode Go models side by side on benchmarks, pricing, context, and fit — then ask Grok or ChatGPT with the full context."
	/>
</svelte:head>

<div class="relative">
	<!-- Ambient backdrop: teal signal glow at the top, quiet warm glow at the page foot -->
	<!-- <div aria-hidden="true" class="pointer-events-none absolute inset-0">
		<div class="bg-hero-glow absolute inset-x-0 top-0 h-80"></div>
		<div class="bg-glow-warm absolute inset-x-0 bottom-0 h-72"></div>
	</div> -->

	<LightRays class="rays-quiet" count={5} blur={16} speed={26} length="45%" />

	<div class="relative mx-auto max-w-6xl px-4 pb-24">
		<!-- Decision-surface header: orient the page around choosing the right model for the work. -->
		<div class="relative -mx-4 -mt-10 mb-6 px-4 pt-10">
			<div class="relative mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
				<div>
					<a
						href="/"
						class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft class="size-3.5" />
						Back to all models
					</a>
					<p class="mb-2 font-mono text-xs font-medium tracking-[0.18em] text-primary">
						MODEL DECISION SURFACE
					</p>
					<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
						<GitCompare class="size-7 text-primary" />
						Find the model that fits the work
					</h1>
					<p class="mt-2 max-w-xl text-sm text-muted-foreground">
						Put models head-to-head on benchmarks, pricing, context, and fit. Compare the signals
						that matter for your task, then ask an AI assistant with the full context baked in.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2 lg:max-w-xs lg:justify-end">
					{#if selectedModels.length > 0}
						{#if llmStatsCompareUrl}
							<a
								href={llmStatsCompareUrl}
								target="_blank"
								rel="noopener noreferrer"
								class={buttonVariants({ variant: 'outline', size: 'default' })}
							>
								<ExternalLink class="size-4" />
								Compare on LLM Stats
							</a>
							<button
								type="button"
								onclick={copyLlmStats}
								aria-label="Copy LLM Stats compare link"
								class={buttonVariants({ variant: 'outline', size: 'icon' })}
							>
								{#if copied}
									<Check class="size-4 text-emerald-500" />
								{:else}
									<Copy class="size-4" />
								{/if}
							</button>
						{:else}
							<span
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
								title="LLM Stats compare needs 2–4 models"
							>
								<ExternalLink class="size-3.5" />
								LLM Stats: add tracked models
							</span>
						{/if}
						<AskAiMenu models={selectedModels} />
						<button
							class={buttonVariants({ variant: 'ghost', size: 'default' })}
							onclick={clearAll}
						>
							<X class="size-4" />
							Clear all
						</button>
					{/if}
				</div>
			</div>

			<!-- Model picker -->
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<div>
						<label for="compare-model-picker" class="text-sm font-semibold text-foreground"
							>Choose models to compare</label
						>
						<p class="mt-1 text-xs text-muted-foreground">
							Start with the models closest to your actual work.
						</p>
					</div>
					<span class="text-xs text-muted-foreground"
						>{selectedModels.length}/{MAX_COMPARE} selected</span
					>
				</div>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<Select.Root type="single" bind:value={pick} onValueChange={handlePick} disabled={atMax}>
						<Select.Trigger
							id="compare-model-picker"
							class={buttonVariants({ variant: 'default', size: 'default' })}
							disabled={atMax}
						>
							<Plus class="size-4" />
							<span>{atMax ? `Max ${MAX_COMPARE} models` : 'Add model…'}</span>
						</Select.Trigger>
						<Select.Content class="max-h-[min(30vh,80vh)]">
							<Select.Group>
								{#each available as m (m.id)}
									<Select.Item value={m.id} label={m.name}>{m.name}</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					{#if selectedModels.length >= 2}
						<span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
							<Info class="size-3" />
							Tip: use <span class="font-medium text-foreground">Ask AI</span> to dig deeper.
						</span>
					{/if}
				</div>

				{#if selectedModels.length > 0}
					<div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
						{#each selectedModels as model (model.id)}
							<div class="rounded-lg border border-border bg-background px-3 py-2.5">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold text-foreground">{model.name}</p>
										<p class="truncate text-xs text-muted-foreground">{model.provider}</p>
									</div>
									<button
										type="button"
										class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onclick={() => removeModel(model.id)}
										aria-label={`Remove ${model.name}`}
									>
										<X class="size-3.5" />
									</button>
								</div>
								<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
									<span>Fit {model.scenarioScores.coding}/100</span>
									{#if model.benchmarks.coding != null}
										<span>Benchmark {model.benchmarks.coding.toFixed(1)}</span>
									{/if}
									{#if model.burnDetails?.band != null}
										<span>Burn {model.burnDetails.band}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Comparison grid or empty state -->
		<div class="relative">
			{#if selectedModels.length === 0}
				<div
					class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
				>
					<GitCompare class="size-10 text-muted-foreground/40" />
					<p class="text-sm font-medium text-foreground">No models selected yet</p>
					<p class="max-w-sm text-sm text-muted-foreground">
						Start with a fresh suggested pair — randomized from the top of the catalog each visit —
						or choose your own from the <span class="font-medium">Add model…</span> menu above.
					</p>
					{#if models.length}
						<button
							type="button"
							class={buttonVariants({ variant: 'outline', size: 'default' })}
							onclick={loadSuggested}
						>
							<Dices class="size-4" />
							Load suggested models
						</button>
					{/if}
				</div>
			{:else}
				<ModelCompare models={selectedModels} onRemove={removeModel} {anchors} />
			{/if}
		</div>
	</div>
</div>
