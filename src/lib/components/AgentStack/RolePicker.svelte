<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronsUpDown, TriangleAlert } from '@lucide/svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { formatCompact } from '$lib/utils';
	import { formatIntelligence, formatPricePerM } from '$lib/stack/format';
	import { betterValue, isRecommended, type StackRole, type StackWorkload } from '$lib/stack/logic';
	import type { StackModel, StackPlan } from '$lib/stack/plans';

	let {
		role,
		plan,
		model,
		auto,
		workload,
		onPick
	}: {
		role: StackRole;
		plan: StackPlan;
		model: StackModel | null;
		auto: boolean;
		workload: StackWorkload;
		onPick: (id: string) => void;
	} = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);

	let title = $derived(role === 'main' ? 'Main agent' : 'Sub-agents');
	let subtitle = $derived(
		role === 'main' ? 'Plans, decides, edits the hard parts' : 'Implementers, reviewers and fixers'
	);
	let better = $derived(model ? betterValue(plan.models, model, workload) : null);

	/** Same grouping the /compare picker uses: one Command group per provider. */
	let grouped = $derived.by(() => {
		const groups = new Map<string, StackModel[]>();
		for (const option of plan.models) {
			const list = groups.get(option.provider) ?? [];
			list.push(option);
			groups.set(option.provider, list);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => triggerRef.focus());
	}
</script>

<div class="rounded-xl border border-border bg-card p-4">
	<div class="flex items-start justify-between gap-2">
		<div>
			<h3 class="text-sm font-semibold text-foreground">{title}</h3>
			<p class="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
		</div>
		{#if model && isRecommended(model, role)}
			<Badge variant="secondary">Recommended</Badge>
		{:else if auto}
			<Badge variant="outline">Auto-picked</Badge>
		{/if}
	</div>

	<Popover.Root bind:open>
		<Popover.Trigger bind:ref={triggerRef}>
			{#snippet child({ props })}
				<button
					{...props}
					class={buttonVariants({
						variant: 'outline',
						size: 'default',
						class: 'mt-3 w-full justify-between gap-2'
					})}
					role="combobox"
					aria-expanded={open}
					aria-label={role === 'main' ? 'Choose main agent model' : 'Choose sub-agent model'}
				>
					<span class="truncate">{model?.name ?? 'Choose a model'}</span>
					<ChevronsUpDown class="size-4 shrink-0 opacity-50" />
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-70 p-0">
			<Command.Root>
				<Command.Input placeholder="Search models…" />
				<Command.List>
					<Command.Empty>No model found.</Command.Empty>
					{#each grouped as [provider, providerModels] (provider)}
						<Command.Group heading={provider}>
							{#each providerModels as option (option.id)}
								<Command.Item
									value={option.name}
									onSelect={() => {
										onPick(option.id);
										closeAndFocusTrigger();
									}}
								>
									<span class="truncate">{option.name}</span>
								</Command.Item>
							{/each}
						</Command.Group>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	{#if model}
		<p class="mt-3 text-xs text-muted-foreground tabular-nums">
			{formatPricePerM(model.pricing.inputPricePerM)} in / {formatPricePerM(
				model.pricing.outputPricePerM
			)} out per 1M tokens
		</p>
		<p class="mt-1 text-xs text-muted-foreground tabular-nums">
			Context {formatCompact(model.contextWindow)} · Intelligence {formatIntelligence(
				model.intelligence
			)}
		</p>
		{#if auto}
			<p class="mt-2 text-xs text-muted-foreground">The recommended model isn't on this plan.</p>
		{/if}
		{#if model.note}
			<p class="mt-2 text-xs leading-relaxed text-muted-foreground">{model.note}</p>
		{/if}
	{:else}
		<p class="mt-3 text-xs text-muted-foreground">No priced models on this plan.</p>
	{/if}

	{#if model && better}
		<div class="mt-3 rounded-lg border border-border bg-muted/40 p-3">
			<p class="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
				<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
				<span>
					{better.name} scores {formatIntelligence(better.intelligence)} vs {formatIntelligence(
						model.intelligence
					)} at the same or lower price.
					{#if better.note}{better.note}{/if}
				</span>
			</p>
			<button
				class={buttonVariants({ variant: 'outline', size: 'sm', class: 'mt-2' })}
				onclick={() => onPick(better.id)}
			>
				Use {better.name}
			</button>
		</div>
	{/if}
</div>
