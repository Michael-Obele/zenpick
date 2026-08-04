<script lang="ts">
	import {
		ArrowRight,
		Check,
		ChevronsUpDown,
		Clock,
		Flame,
		Layers,
		Share,
		Snowflake,
		Target,
		Thermometer
	} from '@lucide/svelte';
	import { useSearchParams } from 'runed/kit';
	import { burnClasses, burnLabel, burnRateFromPrice } from '$lib/burn';
	import { recommendModel } from '$lib/recommendation';
	import {
		RECOMMENDATION_SCENARIO_VALUES,
		recommendationSearchSchema
	} from '$lib/recommendation-search';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Card from '$lib/components/ui/card';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Label } from './ui/label';
	import { Badge } from './ui/badge';
	import { Button } from './ui/button';
	import { cn } from '$lib/utils';
	import type { GoModel, ModelPricing } from '$lib/types/models';

	interface Props {
		models: GoModel[];
	}

	let { models }: Props = $props();

	// URL-backed funnel state (see recommendation-search.ts).
	const params = useSearchParams(recommendationSearchSchema, {
		pushHistory: false,
		noScroll: true,
		debounce: 250
	});

	const SCENARIO_LABELS: Record<string, string> = {
		coding: 'Coding',
		agentic: 'Agentic',
		brainstorming: 'Brainstorming',
		budget: 'Budget',
		frontend: 'Frontend'
	};

	const SCENARIO_OPTIONS: Array<{ value: string; label: string }> = [
		{ value: '', label: 'Any task' },
		...RECOMMENDATION_SCENARIO_VALUES.map((value) => ({
			value,
			label: SCENARIO_LABELS[value] ?? value
		}))
	];

	let tokenInput = $derived(params.tokens);
	let cachedPctValue = $derived(params.cached);
	let scenarioValue = $derived(params.scenario);

	// User-selected comparison model id, stored in the URL.
	let explicitModelId = $derived(params.model);

	// Compute the recommendation from the user's workload assumptions.
	let recommendation = $derived(
		recommendModel(models, {
			tokens: tokenInput,
			cachedPct: cachedPctValue,
			scenario: scenarioValue ? (scenarioValue as never) : undefined
		})
	);

	// Active model: explicit selection wins, otherwise fall back to the recommendation.
	let selectedModel = $derived.by(() => {
		if (explicitModelId) {
			const explicit = models.find((m) => m.id === explicitModelId);
			if (explicit) return explicit;
		}
		return recommendation?.winner.model ?? null;
	});

	let hasCachedPricing = $derived(selectedModel?.pricing.cachedReadPerM != null);

	function computeCost(
		pricing: ModelPricing,
		inputTokens: number,
		outputTokens: number,
		cachedPct: number
	): number | null {
		if (pricing.inputPricePerM == null || pricing.outputPricePerM == null) return null;
		const cachedInputTokens = Math.round(inputTokens * (cachedPct / 100));
		const uncachedInput = inputTokens - cachedInputTokens;
		const cachedRate = pricing.cachedReadPerM ?? pricing.inputPricePerM;
		return (
			(uncachedInput * pricing.inputPricePerM +
				cachedInputTokens * cachedRate +
				outputTokens * pricing.outputPricePerM) /
			1_000_000
		);
	}

	let costPerRequest = $derived.by(() => {
		if (!selectedModel) return null;
		const inputTokens = tokenInput * 0.7;
		const outputTokens = tokenInput * 0.15;
		const effectiveCachedPct = hasCachedPricing ? cachedPctValue : 0;
		return computeCost(selectedModel.pricing, inputTokens, outputTokens, effectiveCachedPct);
	});

	let quotaEstimates = $derived.by(() => {
		if (costPerRequest == null || costPerRequest <= 0) return null;
		return {
			per5h: Math.floor(12 / costPerRequest),
			perWeek: Math.floor(30 / costPerRequest),
			perMonth: Math.floor(60 / costPerRequest)
		};
	});

	let burnLevel = $derived.by(() => {
		if (!selectedModel) return null;
		return burnRateFromPrice(
			(selectedModel.pricing.inputPricePerM ?? 0) + (selectedModel.pricing.outputPricePerM ?? 0)
		);
	});

	function handleTokensChange(value: number | number[]) {
		const next = Array.isArray(value) ? value[0] : value;
		if (typeof next === 'number') params.tokens = next;
	}

	function handleCachedChange(value: number | number[]) {
		const next = Array.isArray(value) ? value[0] : value;
		if (typeof next === 'number') params.cached = next;
	}

	type ScenarioValue = (typeof RECOMMENDATION_SCENARIO_VALUES)[number] | '';

	function handleScenarioChange(value: string | undefined) {
		if (value === undefined) {
			params.scenario = '';
			return;
		}
		const allowed = new Set<string>(RECOMMENDATION_SCENARIO_VALUES);
		const next: ScenarioValue = (allowed.has(value) ? value : '') as ScenarioValue;
		params.scenario = next;
	}

	function handleModelChange(value: string | undefined) {
		params.model = value ?? '';
	}

	// Combobox state
	let modelComboboxOpen = $state(false);
	let modelSearchQuery = $state('');

	let filteredModels = $derived.by(() => {
		const query = modelSearchQuery.toLowerCase();
		if (!query) return models;
		return models.filter(
			(m) =>
				m.name.toLowerCase().includes(query) ||
				m.provider.toLowerCase().includes(query) ||
				m.id.toLowerCase().includes(query)
		);
	});

	// Share / copy feedback
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function shareRecommendation() {
		if (typeof window === 'undefined') return;
		const shareUrl = window.location.href;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(shareUrl);
			}
		} catch {
			// Clipboard might be unavailable; the URL is still in window.location.href.
		}
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			copied = false;
			copyTimer = null;
		}, 1500);
	}
</script>

<Card.Root class="border-border bg-card">
	<Card.Header class="pb-3">
		<div class="flex items-start gap-3">
			<span
				class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10"
				aria-hidden="true"
			>
				<Target class="size-4" />
			</span>
			<div class="min-w-0 flex-1">
				<Card.Title class="text-base font-semibold">
					Find the model that fits your workload
				</Card.Title>
				<Card.Description class="mt-1">
					Adjust two assumptions and get a quota-aware recommendation. The model below is the best
					fit for these settings.
				</Card.Description>
			</div>
		</div>
	</Card.Header>

	<Card.Content class="space-y-5 pt-0">
		<!-- Token slider -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<Label for="recommend-tokens" class="text-sm text-muted-foreground">
					Avg. tokens per request
				</Label>
				<span class="text-sm font-medium tabular-nums text-foreground">
					{tokenInput.toLocaleString()}
				</span>
			</div>
			<Slider
				id="recommend-tokens"
				type="single"
				value={tokenInput}
				onValueChange={handleTokensChange}
				min={1000}
				max={500000}
				step={1000}
			/>
			<div class="flex justify-between text-xs text-muted-foreground/50">
				<span>Short (~2K)</span>
				<span>Heavy refactor (~200K)</span>
			</div>
		</div>

		<!-- Cached reads slider -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<Label for="recommend-cached" class="text-sm text-muted-foreground">Cached reads</Label>
				{#if selectedModel && !hasCachedPricing}
					<span class="text-xs text-muted-foreground/60">Not available for this model</span>
				{:else}
					<span class="text-sm font-medium tabular-nums text-foreground">
						{cachedPctValue}%
					</span>
				{/if}
			</div>
			<Slider
				id="recommend-cached"
				type="single"
				value={cachedPctValue}
				onValueChange={handleCachedChange}
				min={0}
				max={90}
				step={5}
				disabled={!hasCachedPricing}
			/>
			<div class="flex justify-between text-xs text-muted-foreground/50">
				<span>No cache</span>
				<span>90% cached</span>
			</div>
		</div>

		<!-- Scenario selector -->
		<div class="space-y-2">
			<Label for="recommend-scenario" class="text-sm text-muted-foreground">Task scenario</Label>
			<Select.Root type="single" value={scenarioValue} onValueChange={handleScenarioChange}>
				<Select.Trigger class="w-full" id="recommend-scenario">
					{SCENARIO_OPTIONS.find((o) => o.value === scenarioValue)?.label ?? 'Any task'}
				</Select.Trigger>
				<Select.Content>
					{#each SCENARIO_OPTIONS as option (option.value || 'any')}
						<Select.Item value={option.value} label={option.label}>
							{option.label}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- Live region announcing the recommendation update -->
		<div role="status" aria-live="polite" class="sr-only">
			{#if recommendation}
				Recommended {recommendation.winner.model.name} for {scenarioValue
					? (SCENARIO_LABELS[scenarioValue] ?? scenarioValue)
					: 'your workload'}.
			{/if}
		</div>

		<!-- Result card -->
		{#if recommendation && selectedModel && costPerRequest != null}
			<div
				class={cn(
					'flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5',
					'ring-1 ring-primary/10'
				)}
			>
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<div class="mb-1 text-xs font-medium uppercase tracking-wider text-primary">
							Best fit for these assumptions
						</div>
						<div class="text-lg font-semibold text-foreground">
							{selectedModel.name}
						</div>
						<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
							{recommendation.winner.rationale}
						</p>
					</div>
					{#if burnLevel}
						<Badge variant="outline" class={burnClasses(burnLevel)}>
							{#if burnLevel === 'slow'}
								<Snowflake class="mr-1 size-3" /> {burnLabel(burnLevel)}
							{:else if burnLevel === 'fast'}
								<Flame class="mr-1 size-3" /> {burnLabel(burnLevel)}
							{:else}
								<Thermometer class="mr-1 size-3" /> {burnLabel(burnLevel)}
							{/if}
						</Badge>
					{/if}
				</div>

				<div class="grid grid-cols-3 gap-2">
					<div class="rounded-lg border border-border bg-background/60 p-2.5 text-center">
						<div class="mb-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
							<Clock class="size-3" /> 5 Hours
						</div>
						<div class="text-lg font-medium tabular-nums text-foreground">
							{quotaEstimates?.per5h.toLocaleString() ?? '—'}
						</div>
						<div class="text-xs text-muted-foreground/60">requests</div>
					</div>
					<div class="rounded-lg border border-border bg-background/60 p-2.5 text-center">
						<div class="mb-1 text-xs text-muted-foreground">Week</div>
						<div class="text-lg font-medium tabular-nums text-foreground">
							{quotaEstimates?.perWeek.toLocaleString() ?? '—'}
						</div>
						<div class="text-xs text-muted-foreground/60">requests</div>
					</div>
					<div class="rounded-lg border border-border bg-background/60 p-2.5 text-center">
						<div class="mb-1 text-xs text-muted-foreground">Month</div>
						<div class="text-lg font-medium tabular-nums text-foreground">
							{quotaEstimates?.perMonth.toLocaleString() ?? '—'}
						</div>
						<div class="text-xs text-muted-foreground/60">requests</div>
					</div>
				</div>

				<!-- Also consider: runner-ups from the same ranking -->
				{#if recommendation.top.length > 1}
					<div class="space-y-2 border-t border-primary/10 pt-3">
						<div
							class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
						>
							<Layers class="size-3" />
							Also consider
						</div>
						<div class="flex flex-wrap gap-2">
							{#each recommendation.top.slice(1) as alt (alt.model.id)}
								<button
									type="button"
									onclick={() => handleModelChange(alt.model.id)}
									class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
									aria-label={`Compare ${alt.model.name} instead`}
								>
									{alt.model.name}
									<span class="tabular-nums text-muted-foreground/50">{alt.score.toFixed(1)}</span>
								</button>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground/60">
							Ranked by the same fit · quota · quality blend. Click one to compare it directly.
						</p>
					</div>
				{/if}

				<div class="flex flex-wrap items-center gap-2">
					<Button
						href="https://opencode.ai/go?ref=ST810621HY"
						target="_blank"
						rel="noopener noreferrer"
					>
						Start with OpenCode Go
						<ArrowRight class="size-4" />
					</Button>
					<Button variant="outline" type="button" onclick={shareRecommendation}>
						{#if copied}
							<Check class="size-4 text-emerald-500" />
							Copied
						{:else}
							<Share class="size-4" />
							Share recommendation
						{/if}
					</Button>
				</div>

				<!-- Compare another model (searchable combobox) -->
				<div class="space-y-2 border-t border-border/60 pt-3">
					<Label id="recommend-model-label" class="text-sm text-muted-foreground">
						Compare another model
					</Label>
					<Popover.Root bind:open={modelComboboxOpen}>
						<Popover.Trigger class="w-fit">
							<button
								type="button"
								role="combobox"
								aria-expanded={modelComboboxOpen}
								aria-controls="model-combobox-list"
								aria-labelledby="recommend-model-label"
								class="flex h-9 w-fit items-center justify-between gap-2 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm transition-colors hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none select-none dark:bg-input/30 dark:hover:bg-input/50"
							>
								<span class="truncate">
									{#if explicitModelId}
										{models.find((m) => m.id === explicitModelId)?.name ?? '— Pick a model —'}
									{:else if selectedModel}
										{selectedModel.name} <span class="text-muted-foreground">(recommended)</span>
									{:else}
										— Pick a model —
									{/if}
								</span>
								<ChevronsUpDown class="size-4 shrink-0 text-muted-foreground opacity-70" />
							</button>
						</Popover.Trigger>
						<Popover.Content
							class="w-(--bits-popover-trigger-width) p-0"
							sideOffset={4}
							align="start"
						>
							<Command.Root shouldFilter={false}>
								<Command.Input placeholder="Search models…" bind:value={modelSearchQuery} />
								<Command.Empty>No models found.</Command.Empty>
								<Command.List id="model-combobox-list" class="max-h-64 overflow-auto p-1">
									<Command.Group>
										<Command.Item
											value=""
											onSelect={() => {
												handleModelChange('');
												modelComboboxOpen = false;
												modelSearchQuery = '';
											}}
											class="cursor-pointer"
										>
											<Check
												class={cn('mr-2 size-4', !explicitModelId ? 'opacity-100' : 'opacity-0')}
											/>
											Use recommendation
										</Command.Item>
										{#each filteredModels as m (m.id)}
											<Command.Item
												value={m.id}
												onSelect={() => {
													handleModelChange(m.id);
													modelComboboxOpen = false;
													modelSearchQuery = '';
												}}
												class="cursor-pointer"
											>
												<Check
													class={cn(
														'mr-2 size-4',
														explicitModelId === m.id ? 'opacity-100' : 'opacity-0'
													)}
												/>
												<span class="truncate">{m.name}</span>
												<span class="ml-auto text-xs text-muted-foreground">
													{m.provider}
												</span>
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
