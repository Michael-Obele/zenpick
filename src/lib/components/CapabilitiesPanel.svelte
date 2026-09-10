<script lang="ts">
	import type { ModelCapabilities } from '$lib/types/models';
	import CapabilityBadges, { CAPABILITY_ICONS } from './CapabilityBadges.svelte';
	import { MODALITY_HINT, MODALITY_LABEL, supportedFeatures } from '$lib/capabilities';

	interface Props {
		capabilities: ModelCapabilities | null;
	}

	let { capabilities }: Props = $props();

	/**
	 * Output beyond plain text. Every model served by Go returns text, so a
	 * "Produces: Text" row would repeat the same word on every model — noise
	 * carrying no information. Surface it only when it says something new.
	 */
	let notableOutput = $derived(capabilities?.output.filter((o) => o !== 'text') ?? []);
	let features = $derived(supportedFeatures(capabilities));
</script>

{#if capabilities}
	<section>
		<h3 class="mb-2 text-sm font-medium text-muted-foreground">Capabilities</h3>
		<div class="rounded-lg border border-border p-3">
			<div class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
				Accepts
			</div>
			<ul class="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
				{#each capabilities.input as m (m)}
					{@const Icon = CAPABILITY_ICONS[m]}
					<li class="flex items-center gap-2 text-sm">
						<Icon class="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
						<span class="shrink-0 text-foreground/80">{MODALITY_LABEL[m]}</span>
						<span class="truncate text-xs text-muted-foreground">{MODALITY_HINT[m]}</span>
					</li>
				{/each}
			</ul>

			{#if notableOutput.length > 0}
				<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
					<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Produces
					</span>
					<CapabilityBadges {capabilities} kind="output" />
				</div>
			{/if}

			{#if features.length > 0}
				<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5">
					<span class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
						Supports
					</span>
					<CapabilityBadges {capabilities} kind="features" />
				</div>
			{/if}
		</div>
	</section>
{/if}
