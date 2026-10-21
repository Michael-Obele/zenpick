<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { ExternalLink, Copy, Check, Info, GitCompare, LockKeyhole } from '@lucide/svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import BurnBadge from './BurnBadge.svelte';
	import DeprecatedBadge from './DeprecatedBadge.svelte';
	import BurnGauge from './BurnGauge.svelte';
	import ModelScatterContext from './ModelScatterContext.svelte';
	import CapabilitiesPanel from './CapabilitiesPanel.svelte';
	import { llmStatsModelUrl } from '$lib/utils/llm-stats-url';
	import { benchmarkToPercent, benchmarkSourceNote } from '$lib/compare-defaults';
	import { formatCompact, detailRowsFor } from '$lib/utils';
	import { isFreePricing } from '$lib/burn';
	import { quotaFor, burnFor } from '$lib/plan';
	import { plan } from '$lib/stores/plan.svelte';

	interface Props {
		models: GoModel[];
		model: GoModel | null;
		open?: boolean;
	}

	let { models, model, open = $bindable(false) }: Props = $props();

	let copied = $state(false);
	let isCompared = $derived(model ? compare.selection.includes(model.id) : false);
	let compareFull = $derived(compare.selection.length >= MAX_COMPARE);

	function copyModelId() {
		if (!model) return;
		navigator.clipboard.writeText(`opencode-go/${model.id}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	/**
	 * Details rows, most model-specific first. Every row is a fact some models
	 * lack, so it is omitted rather than shown empty — including an empty
	 * `reasoningEfforts`, which is present-but-meaningless.
	 *
	 * The rule itself lives in `detailRowsFor` so it is unit-testable without a
	 * DOM (the Sheet portals via `mount()`, which renders nothing under SSR).
	 */
	let detailRows = $derived(detailRowsFor(model));

	function benchmarkBarWidth(value: number | null, max: number = 60): number {
		if (!value || value < 1) return 0;
		return Math.min(100, Math.round((value / Math.max(60, max)) * 100));
	}

	/** Price per 1M tokens, or "Free"/"—" for the free/unknown cases. */
	function priceLabel(value: number | null, free: boolean): string {
		if (free) return 'Free';
		return value != null ? `$${value.toFixed(2)}` : '—';
	}

	/** Request count for a quota window, or "Unlimited" for free models. */
	function windowLabel(unlimited: boolean, value: number): string {
		return unlimited ? 'Unlimited' : formatCompact(value);
	}
</script>

<!--
  A right-hand Sheet (a Bits UI Dialog), not a vaul Drawer. The Drawer's bottom-sheet
  anatomy fought this content at desktop widths: its header forces `text-center` via a
  `group-data-[vaul-drawer-direction=bottom]` variant whose specificity outranks the
  `md:text-left` meant to undo it, and it ships no close button. `side` stays fixed at
  `right` — the panel is full-bleed on phones and caps at `max-w-2xl` from `sm` up.
-->
<Sheet.Root bind:open>
	<Sheet.Content side="right" class="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
		{#if model}
			{@const quota = quotaFor(model, plan.tier)}
			{@const burn = burnFor(model, plan.tier)}
			<!-- `pr-14` keeps the title clear of the sheet's own close button. -->
			<Sheet.Header class="p-5 pr-14">
				<div class="flex items-start justify-between gap-3">
					<div>
						<Sheet.Title class="flex flex-wrap items-center gap-2 text-xl">
							{model.name}
							<BurnBadge burnDetails={burn} />
						</Sheet.Title>
						<Sheet.Description>
							{model.provider}
							{#if model.description}
								<span class="mt-1 block text-sm text-muted-foreground">{model.description}</span>
							{/if}
						</Sheet.Description>
					</div>
				</div>
				{#if model.tags.length > 0}
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each model.tags as tag (tag.label)}
							<span
								class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
							>
								{tag.label}
							</span>
						{/each}
					</div>
				{/if}
			</Sheet.Header>

			<!-- Only the middle scrolls. Actions live in the pinned footer below: they
			     are outside the scroller, so Bits UI's open-focus cannot scroll the
			     panel past its own heading. -->
			<ScrollArea class="min-h-0 flex-1">
				<div class="px-5 pb-2">
					{#if burn.band != null}
						<BurnGauge
							score={burn.score}
							band={burn.band}
							requestsPerWindow={quota.requestsPer5h}
						/>
					{:else}
						<div class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
							<div class="text-muted-foreground">Burn data unavailable — pricing unknown</div>
						</div>
					{/if}
				</div>

				{#if model.pricing.source === 'unknown'}
					<div
						class="mx-5 mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-600"
					>
						Pricing source: unknown — contact OpenCode for accurate pricing
					</div>
				{/if}

				<div class="space-y-6 px-5 pb-6">
					<!-- Capabilities — what the model accepts and what it can do.
					     Placed first: it is the question the rest of the panel
					     (price, quota, benchmarks) only makes sense after. -->
					<CapabilitiesPanel capabilities={model.capabilities} />

					<!-- Pricing -->
					<section>
						<h3 class="mb-2 text-sm font-medium text-muted-foreground">Pricing (per 1M tokens)</h3>
						<div class="grid grid-cols-2 gap-2 text-sm">
							<div class="rounded-lg border border-border p-3">
								<div class="text-muted-foreground">Input</div>
								<div class="text-lg text-foreground tabular-nums">
									{priceLabel(model.pricing.inputPricePerM, isFreePricing(model.pricing))}
								</div>
							</div>
							<div class="rounded-lg border border-border p-3">
								<div class="text-muted-foreground">Output</div>
								<div class="text-lg text-foreground tabular-nums">
									{priceLabel(model.pricing.outputPricePerM, isFreePricing(model.pricing))}
								</div>
							</div>
						</div>
					</section>

					<!-- Context scatter -->
					<section>
						<ModelScatterContext {models} selectedModel={model} />
					</section>

					<!-- Quota usage -->
					<section>
						<h3 class="mb-2 text-sm font-medium text-muted-foreground">
							Estimated requests per Go limit
						</h3>
						<div class="grid grid-cols-3 gap-2 text-sm">
							<div class="rounded-lg border border-border p-3 text-center">
								<div class="text-xs text-muted-foreground">5 Hours ($12)</div>
								<div class="text-lg font-medium text-foreground tabular-nums">
									{windowLabel(quota.unlimited, quota.requestsPer5h)}
								</div>
							</div>
							<div class="rounded-lg border border-border p-3 text-center">
								<div class="text-xs text-muted-foreground">Week ($30)</div>
								<div class="text-lg font-medium text-foreground tabular-nums">
									{windowLabel(quota.unlimited, quota.requestsPerWeek)}
								</div>
							</div>
							<div class="rounded-lg border border-border p-3 text-center">
								<div class="text-xs text-muted-foreground">Month ($60)</div>
								<div class="text-lg font-medium text-foreground tabular-nums">
									{windowLabel(quota.unlimited, quota.requestsPerMonth)}
								</div>
							</div>
						</div>
					</section>

					<!-- Benchmarks -->
					<section>
						<h3 class="mb-2 text-sm font-medium text-muted-foreground">Benchmarks</h3>
						<div class="space-y-3">
							{#each [{ label: 'Coding', value: model.benchmarks.coding, note: benchmarkSourceNote(model.benchmarks._meta?.coding) }, { label: 'Reasoning', value: model.benchmarks.reasoning, note: null }, { label: 'Math', value: model.benchmarks.math, note: benchmarkSourceNote(model.benchmarks._meta?.math) }, { label: 'SciCode', value: benchmarkToPercent(model.benchmarks.sweBenchVerified, 'sweBenchVerified'), note: null }] as bench (bench.label)}
								{#if bench.value !== null}
									<div>
										<div class="mb-1 flex justify-between text-sm">
											<span class="text-muted-foreground">
												{bench.label}
												{#if bench.note}
													<span class="ml-1 text-[10px] text-muted-foreground/70"
														>via {bench.note}</span
													>
												{/if}
											</span>
											<span class="font-medium text-foreground tabular-nums"
												>{bench.value.toFixed(1)}</span
											>
										</div>
										<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
											<div
												class="h-full rounded-full bg-violet-500"
												style="width: {benchmarkBarWidth(bench.value)}%"
											></div>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					</section>

					<!-- Details -->
					<section>
						<h3 class="mb-2 text-sm font-medium text-muted-foreground">Details</h3>
						<div class="space-y-2 rounded-lg border border-border p-3 text-sm">
							{#each detailRows as row (row.label)}
								<div class="flex justify-between gap-3">
									<span class="text-muted-foreground">{row.label}</span>
									<span class="text-right text-foreground/80">{row.value}</span>
								</div>
							{/each}
							<!-- Self-suppressing: renders nothing unless models.dev marks it
							     deprecated, so no `{#if}` is needed here. -->
							<DeprecatedBadge status={model.modelsDevStatus} />
						</div>
					</section>

					<!-- Migration hints -->
					{#if model.migrationHints.length > 0}
						<section>
							<h3 class="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
								<Info class="size-3.5" />
								If you're coming from...
							</h3>
							<div class="space-y-2">
								{#each model.migrationHints as hint (hint.model)}
									<div class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
										<div class="font-medium text-foreground/80">
											{hint.model}
										</div>
										<div class="text-muted-foreground">{hint.reason}</div>
									</div>
								{/each}
							</div>
						</section>
					{:else if !model.openWeight}
						<section>
							<h3 class="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
								<LockKeyhole class="size-3.5" />
								Closed-source model
							</h3>
							<div
								class="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
							>
								This model is closed-source, so it isn't an open-weight alternative to any frontier
								model — there's no open replacement to compare it against.
							</div>
						</section>
					{/if}
				</div>
			</ScrollArea>

			<Sheet.Footer class="border-t border-border p-5 py-3">
				<div class="flex flex-wrap gap-2">
					{#if model}
						<button
							type="button"
							class={buttonVariants({
								variant: isCompared ? 'default' : 'outline',
								size: 'sm'
							})}
							disabled={!isCompared && compareFull}
							onclick={() => compare.toggle(model.id)}
						>
							<GitCompare class="size-3.5" />
							{isCompared ? 'In comparison' : 'Add to compare'}
						</button>
					{/if}
					<button class={buttonVariants({ variant: 'default', size: 'sm' })} onclick={copyModelId}>
						{#if copied}
							<Check class="size-3.5" />
							Copied!
						{:else}
							<Copy class="size-3.5" />
							Copy model ID
						{/if}
					</button>
					{#if model.modelgrepId}
						<a
							href={'https://modelgrep.com/models/' + model.modelgrepId}
							target="_blank"
							rel="noopener noreferrer"
							class={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							<ExternalLink class="size-3.5" />
							View on modelgrep
						</a>
					{/if}
					<a
						href={llmStatsModelUrl(model)}
						target="_blank"
						rel="noopener noreferrer"
						class={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						<ExternalLink class="size-3.5" />
						View on llm-stats
					</a>
				</div>
			</Sheet.Footer>
		{:else}
			<div class="p-8 text-center text-muted-foreground">No model selected.</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
