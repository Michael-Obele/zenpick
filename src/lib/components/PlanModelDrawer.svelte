<script lang="ts">
	import type { CatalogRow, PlanFilter } from '$lib/catalog';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Copy, Check, ExternalLink, GitCompare } from '@lucide/svelte';
	import { compare, MAX_COMPARE } from '$lib/stores/compare.svelte';
	import { selectedKeyForRow } from '$lib/compare-selection';
	import { planPriceRows, type PlanPriceRow } from '$lib/plan-prices';
	import { formatIntelligence } from '$lib/stack/format';
	import { formatCompact } from '$lib/utils';
	import { llmStatsModelUrl } from '$lib/utils/llm-stats-url';
	import PlanBadges from './PlanBadges.svelte';

	/**
	 * Detail panel for a row the Go catalog does not carry (Zed / Copilot only).
	 * Same sheet shell as `ModelDrawer`, but only the facts every plan shares:
	 * burn, quota windows, the scatter graph and migration hints are Go-only.
	 */
	interface Props {
		row: CatalogRow;
		activePlan?: PlanFilter;
		open?: boolean;
	}

	let { row, activePlan = '', open = $bindable(false) }: Props = $props();

	let copied = $state(false);
	let compareKey = $derived(selectedKeyForRow(row, activePlan));
	let isCompared = $derived(compareKey ? compare.has(compareKey) : false);
	let compareFull = $derived(compare.selection.length >= MAX_COMPARE);
	let prices = $derived(planPriceRows(row, activePlan));
	let llmStatsUrl = $derived(llmStatsModelUrl({ id: row.id, llmStatsId: null }));

	function copyModelId() {
		navigator.clipboard.writeText(row.id);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

{#snippet statTiles()}
	<section class="grid grid-cols-3 gap-2 text-sm">
		<div class="rounded-lg border border-border p-3 text-center">
			<div class="text-xs text-muted-foreground">Intelligence</div>
			<div class="text-lg font-medium text-foreground tabular-nums">
				{formatIntelligence(row.intelligence)}
			</div>
		</div>
		<div class="rounded-lg border border-border p-3 text-center">
			<div class="text-xs text-muted-foreground">Coding</div>
			<div class="text-lg font-medium text-foreground tabular-nums">
				{row.coding != null ? row.coding.toFixed(1) : '—'}
			</div>
		</div>
		<div class="rounded-lg border border-border p-3 text-center">
			<div class="text-xs text-muted-foreground">Context</div>
			<div class="text-lg font-medium text-foreground tabular-nums">
				{formatCompact(row.contextWindow)}
			</div>
		</div>
	</section>
{/snippet}

{#snippet priceCard(price: PlanPriceRow)}
	<div class="rounded-lg border border-border p-3">
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm font-medium text-foreground">{price.label}</span>
			{#if price.active}
				<Badge variant="secondary">Active filter</Badge>
			{/if}
		</div>
		<div class="mt-2 grid grid-cols-3 gap-2 text-sm tabular-nums">
			<div>
				<div class="text-xs text-muted-foreground">Input</div>
				<div class="text-foreground">{price.input}</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Output</div>
				<div class="text-foreground">{price.output}</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Cached read</div>
				<div class="text-foreground">{price.cached}</div>
			</div>
		</div>
		{#if price.note}
			<p class="mt-2 text-xs text-muted-foreground">{price.note}</p>
		{/if}
	</div>
{/snippet}

{#snippet sourceLinks()}
	<div class="flex flex-wrap gap-2">
		{#if row.modelgrepId}
			<a
				href={'https://modelgrep.com/models/' + row.modelgrepId}
				target="_blank"
				rel="noopener noreferrer"
				class={buttonVariants({ variant: 'outline', size: 'sm' })}
			>
				<ExternalLink class="size-3.5" aria-hidden="true" />
				View on modelgrep
			</a>
		{/if}
		<a
			href={llmStatsUrl}
			target="_blank"
			rel="noopener noreferrer"
			class={buttonVariants({ variant: 'outline', size: 'sm' })}
		>
			<ExternalLink class="size-3.5" aria-hidden="true" />
			View on llm-stats
		</a>
	</div>
{/snippet}

{#snippet footerActions()}
	<div class="flex flex-wrap gap-2">
		{#if compareKey}
			<Button
				variant={isCompared ? 'default' : 'outline'}
				size="sm"
				disabled={!isCompared && compareFull}
				onclick={() => compare.toggle(compareKey)}
			>
				<GitCompare class="size-3.5" aria-hidden="true" />
				{isCompared ? 'In comparison' : 'Add to compare'}
			</Button>
		{/if}
		<Button variant="default" size="sm" onclick={copyModelId}>
			{#if copied}
				<Check class="size-3.5" aria-hidden="true" />
				Copied!
			{:else}
				<Copy class="size-3.5" aria-hidden="true" />
				Copy model ID
			{/if}
		</Button>
		{#if row.modelgrepId}
			<Button
				href={'https://modelgrep.com/models/' + row.modelgrepId}
				target="_blank"
				rel="noopener noreferrer"
				variant="outline"
				size="sm"
			>
				<ExternalLink class="size-3.5" aria-hidden="true" />
				View on modelgrep
			</Button>
		{/if}
		<Button
			href={llmStatsUrl}
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="sm"
		>
			<ExternalLink class="size-3.5" aria-hidden="true" />
			View on llm-stats
		</Button>
	</div>
{/snippet}

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
		<!-- `pr-14` keeps the title clear of the sheet's own close button. -->
		<Sheet.Header class="p-5 pr-14">
			<Sheet.Title class="text-xl">{row.name}</Sheet.Title>
			<Sheet.Description>
				{row.provider}
				{#if row.description}
					<span class="mt-1 block text-sm text-muted-foreground">{row.description}</span>
				{/if}
			</Sheet.Description>
			<div class="mt-3">
				<PlanBadges entries={row.plans} active={activePlan} />
			</div>
		</Sheet.Header>

		<!-- Only the middle scrolls; the actions stay in the pinned footer so
		     Bits UI's open-focus cannot scroll the panel past its heading. -->
		<ScrollArea class="min-h-0 flex-1">
			<div class="space-y-6 px-5 pb-6">
				{@render statTiles()}

				<section>
					<h3 class="mb-2 text-sm font-medium text-muted-foreground">
						Plan prices (per 1M tokens)
					</h3>
					<div class="space-y-2">
						{#each prices as price (price.plan)}
							{@render priceCard(price)}
						{/each}
					</div>
				</section>

				<section>
					<h3 class="mb-2 text-sm font-medium text-muted-foreground">Where this data comes from</h3>
					{@render sourceLinks()}
					<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
						Plan prices come from the plan's official docs and are checked on the date shown on the
						plan card.
					</p>
				</section>
			</div>
		</ScrollArea>

		<Sheet.Footer class="border-t border-border p-5 py-3">
			{@render footerActions()}
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
