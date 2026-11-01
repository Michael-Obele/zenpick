<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronsUpDown } from '@lucide/svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { formatIntelligence, formatPricePerM } from '$lib/stack/format';
	import type { StackModel } from '$lib/stack/plans';

	let {
		id,
		label,
		models,
		value,
		onPick
	}: {
		id: string;
		label: string;
		models: StackModel[];
		value: StackModel | null;
		onPick: (modelId: string) => void;
	} = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);

	/** Same grouping as `RolePicker`: one Command group per provider, alphabetical. */
	let grouped = $derived.by(() => {
		const groups = new Map<string, StackModel[]>();
		for (const model of models) {
			const list = groups.get(model.provider) ?? [];
			list.push(model);
			groups.set(model.provider, list);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => triggerRef.focus());
	}
</script>

<div>
	<label for={id} class="text-xs font-medium text-muted-foreground">{label}</label>
	<Popover.Root bind:open>
		<Popover.Trigger bind:ref={triggerRef}>
			{#snippet child({ props })}
				<!-- The Popover trigger already exposes `aria-haspopup="dialog"` and
				     `aria-expanded`; the visible name is the accessible name, via the
				     `<label for>` above plus the selected model's text. -->
				<button
					{...props}
					{id}
					class={buttonVariants({
						variant: 'outline',
						size: 'default',
						class: 'mt-1 w-full justify-between gap-2'
					})}
				>
					<span class="truncate">{value?.name ?? 'Choose a model'}</span>
					<ChevronsUpDown class="size-4 shrink-0 opacity-50" aria-hidden="true" />
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
							{#each providerModels as model (model.id)}
								<Command.Item
									value={model.id}
									keywords={[model.name, model.provider]}
									onSelect={() => {
										onPick(model.id);
										closeAndFocusTrigger();
									}}
								>
									<span class="truncate">{model.name}</span>
									<span class="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
										{formatPricePerM(model.pricing.inputPricePerM)} in ·
										{formatIntelligence(model.intelligence)}
									</span>
								</Command.Item>
							{/each}
						</Command.Group>
					{/each}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>
