<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { getModels } from '$lib/remote/models.remote';
	import type { GoModel } from '$lib/types/models';
	import ModelCompare from '$lib/components/ModelCompare.svelte';
	import AskAiMenu from '$lib/components/AskAiMenu.svelte';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import { buildLlmStatsCompareUrl } from '$lib/utils/llm-stats-url';
	import * as Select from '$lib/components/ui/select/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { GitCompare, Plus, X, ArrowLeft, Info, ExternalLink, Copy, Check } from '@lucide/svelte';

	const modelsPromise = getModels();

	// Seed the shared store from the URL (?models=a,b,c) on first load.
	const urlModels = (page.url.searchParams.get('models') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (browser && urlModels.length && compare.selection.length === 0) {
		compare.selection = urlModels;
	}

	// Keep the URL in sync for shareable deep links.
	$effect(() => {
		const next = compare.selection.join(',');
		const current = page.url.searchParams.get('models') ?? '';
		if (current !== next) {
			goto(compare.selection.length ? `/compare?models=${next}` : '/compare', {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	});

	let allModels = $state<GoModel[]>([]);
	modelsPromise.then((m) => (allModels = m));

	let selectedModels = $derived(
		compare.selection
			.map((id) => allModels.find((m) => m.id === id))
			.filter((m): m is GoModel => Boolean(m))
	);
	let available = $derived(allModels.filter((m) => !compare.selection.includes(m.id)));
	let atMax = $derived(compare.selection.length >= MAX_COMPARE);
	let llmStatsCompareUrl = $derived(buildLlmStatsCompareUrl(selectedModels));

	let pick = $state<string | undefined>(undefined);
	function handlePick(v: string | undefined) {
		if (v) compare.add(v);
		pick = undefined;
	}
	function removeModel(id: string) {
		compare.remove(id);
	}
	function clearAll() {
		compare.clear();
	}

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

<div class="mx-auto max-w-6xl px-4 pb-24 pt-10">
	<!-- Header -->
	<div class="mb-8">
		<a
			href="/"
			class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-3.5" />
			Back to all models
		</a>
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
					<GitCompare class="size-7 text-primary" />
					Compare Models
				</h1>
				<p class="mt-1.5 max-w-xl text-sm text-muted-foreground">
					Put models head-to-head on benchmarks, pricing, context, and fit. The winner of each row
					is highlighted, and you can ask an AI assistant with the full context baked in.
				</p>
			</div>
			<div class="flex items-center gap-2">
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
					<button class={buttonVariants({ variant: 'ghost', size: 'default' })} onclick={clearAll}>
						<X class="size-4" />
						Clear all
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Model picker -->
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<Select.Root type="single" bind:value={pick} onValueChange={handlePick} disabled={atMax}>
			<Select.Trigger
				class={buttonVariants({ variant: 'outline', size: 'default' })}
				disabled={atMax}
			>
				<Plus class="size-4" />
				<span>{atMax ? `Max ${MAX_COMPARE} models` : 'Add model…'}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					{#each available as m (m.id)}
						<Select.Item value={m.id} label={m.name}>{m.name}</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
		<span class="text-xs text-muted-foreground">
			{selectedModels.length}/{MAX_COMPARE} selected
		</span>
		{#if selectedModels.length >= 2}
			<span
				class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-muted-foreground"
			>
				<Info class="size-3" />
				Tip: use <span class="font-medium text-foreground">Ask AI</span> to dig deeper.
			</span>
		{/if}
	</div>

	<!-- Comparison grid or empty state -->
	{#if selectedModels.length === 0}
		<div
			class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
		>
			<GitCompare class="size-10 text-muted-foreground/40" />
			<p class="text-sm font-medium text-foreground">No models selected yet</p>
			<p class="max-w-sm text-sm text-muted-foreground">
				Use the <span class="font-medium">Add model…</span> menu above, or pick models from the
				<a href="/" class="text-primary hover:underline">browse page</a> and choose “Compare”.
			</p>
		</div>
	{:else}
		<ModelCompare models={selectedModels} onRemove={removeModel} />
	{/if}
</div>
