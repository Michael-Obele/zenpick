<script lang="ts">
	import { Calculator, Clock, Flame, Snowflake } from '@lucide/svelte';
	import { burnClasses, burnRateFromPrice } from '$lib/burn';
	import * as Select from '$lib/components/ui/select/index.js';

	interface Props {
		models: {
			id: string;
			name: string;
			pricing: { inputPricePerM: number; outputPricePerM: number };
			burnRate?: string;
		}[];
	}

	let { models }: Props = $props();

	let tokenInput = $state(50_000);
	let selectedModelId = $state<string>('');

	let selectedModel = $derived(models.find((m) => m.id === selectedModelId) ?? null);

	$effect(() => {
		if (!selectedModelId && models.length > 0) {
			selectedModelId = cheapestModel(models)?.id ?? '';
		}
	});

	function cheapestModel(
		models: { id: string; pricing: { inputPricePerM: number; outputPricePerM: number } }[]
	) {
		return [...models].sort((a, b) => totalPrice(a.pricing) - totalPrice(b.pricing))[0];
	}

	function totalPrice(pricing: { inputPricePerM: number; outputPricePerM: number }) {
		return pricing.inputPricePerM + pricing.outputPricePerM;
	}

	let estimatedCost = $derived.by(() => {
		if (!selectedModel) return null;
		const inputTokens = tokenInput * 0.7;
		const outputTokens = tokenInput * 0.15;
		return {
			perRequest:
				(inputTokens / 1_000_000) * selectedModel.pricing.inputPricePerM +
				(outputTokens / 1_000_000) * selectedModel.pricing.outputPricePerM
		};
	});

	let quotaEstimates = $derived.by(() => {
		if (!estimatedCost || estimatedCost.perRequest <= 0) return null;
		return {
			per5h: Math.floor(12 / estimatedCost.perRequest),
			perWeek: Math.floor(30 / estimatedCost.perRequest),
			perMonth: Math.floor(60 / estimatedCost.perRequest)
		};
	});
</script>

<div class="rounded-xl border border-border bg-card p-6">
	<div class="mb-4 flex items-center gap-2">
		<Calculator class="size-5 text-muted-foreground" />
		<h2 class="text-lg font-semibold text-foreground">Quota Calculator</h2>
	</div>

	<p class="mb-6 text-sm text-muted-foreground">
		Estimate how many coding requests you can make before hitting the
		<span class="text-foreground/70">$12/5h</span>,
		<span class="text-foreground/70">$30/week</span>, and
		<span class="text-foreground/70">$60/month</span> Go limits.
	</p>

	<div class="space-y-4">
		<!-- Token input -->
		<div>
			<label for="tokens" class="mb-1.5 block text-sm text-muted-foreground">
				Avg. tokens per request: <span class="font-medium text-foreground"
					>{tokenInput.toLocaleString()}</span
				>
			</label>
			<input
				id="tokens"
				type="range"
				min="1000"
				max="500000"
				step="1000"
				bind:value={tokenInput}
				class="w-full accent-violet-600"
			/>
			<div class="mt-1 flex justify-between text-xs text-muted-foreground/50">
				<span>Short prompt (~2K)</span>
				<span>Heavy refactor (~200K)</span>
			</div>
		</div>

		<!-- Model picker via shadcn Select -->
		<div>
			<label for="model-select" class="mb-1.5 block text-sm text-muted-foreground">
				Select a model
			</label>
			<Select.Root type="single" bind:value={selectedModelId}>
				<Select.Trigger class="w-full" id="model-select">
					{#if selectedModelId}
						{models.find((m) => m.id === selectedModelId)?.name ?? '— Pick a model —'}
					{:else}
						— Pick a model —
					{/if}
				</Select.Trigger>
				<Select.Content>
					{#each models as m}
						<Select.Item value={m.id} label={m.name}>{m.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- Results -->
		{#if selectedModel && estimatedCost}
			<div class="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
				<div class="text-sm text-muted-foreground">
					Cost per request: <span class="font-medium text-foreground"
						>~${estimatedCost.perRequest.toFixed(4)}</span
					>
				</div>

				{#if selectedModel}
					{@const level = burnRateFromPrice(
						selectedModel.pricing.inputPricePerM + selectedModel.pricing.outputPricePerM
					)}
					<div class="flex items-center gap-2 text-xs">
						<span
							class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 {burnClasses(
								level
							)}"
						>
							{#if level === 'slow'}
								<Snowflake class="size-3" /> Slow burn
							{:else if level === 'fast'}
								<Flame class="size-3" /> Fast burn
							{:else}
								Moderate
							{/if}
						</span>
						<span class="text-muted-foreground">
							{level === 'slow'
								? 'Great for high-volume use'
								: level === 'medium'
									? 'Balanced for daily use'
									: 'Best for focused sessions'}
						</span>
					</div>
				{/if}

				<div class="grid grid-cols-3 gap-2 pt-2">
					<div class="rounded-lg border border-border p-2 text-center">
						<div class="mb-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
							<Clock class="size-3" /> 5 Hours
						</div>
						<div class="text-lg font-medium tabular-nums text-foreground">
							{quotaEstimates?.per5h.toLocaleString() ?? '—'}
						</div>
						<div class="text-xs text-muted-foreground/60">requests</div>
					</div>
					<div class="rounded-lg border border-border p-2 text-center">
						<div class="mb-1 text-xs text-muted-foreground">Week</div>
						<div class="text-lg font-medium tabular-nums text-foreground">
							{quotaEstimates?.perWeek.toLocaleString() ?? '—'}
						</div>
						<div class="text-xs text-muted-foreground/60">requests</div>
					</div>
					<div class="rounded-lg border border-border p-2 text-center">
						<div class="mb-1 text-xs text-muted-foreground">Month</div>
						<div class="text-lg font-medium tabular-nums text-foreground">
							{quotaEstimates?.perMonth.toLocaleString() ?? '—'}
						</div>
						<div class="text-xs text-muted-foreground/60">requests</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
