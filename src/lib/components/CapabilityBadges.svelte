<script lang="ts" module>
	import type { Component } from 'svelte';
	import { AudioLines, Braces, Brain, FileText, Image, Type, Video, Wrench } from '@lucide/svelte';
	import type { InputModality } from '$lib/types/models';
	import type { CapabilityFeature } from '$lib/capabilities';

	/**
	 * Icon per modality / feature.
	 *
	 * Lives here rather than in `capabilities.ts` so that module stays
	 * component-free — the server-side enrichment pipeline imports it, and
	 * Lucide components have no business in the server bundle.
	 *
	 * Exported from the module script so the drawer can render the same icons
	 * in a richer layout without redeclaring the mapping.
	 */
	export const CAPABILITY_ICONS: Record<InputModality | CapabilityFeature, Component> = {
		text: Type,
		image: Image,
		video: Video,
		audio: AudioLines,
		file: FileText,
		tools: Wrench,
		structured: Braces,
		reasoning: Brain
	};
</script>

<script lang="ts">
	import type { ModelCapabilities } from '$lib/types/models';
	import {
		FEATURE_HINT,
		FEATURE_LABEL,
		MODALITY_HINT,
		MODALITY_LABEL,
		supportedFeatures
	} from '$lib/capabilities';
	import { cn } from '$lib/utils';

	interface Props {
		capabilities: ModelCapabilities | null;
		/** Which chip set to render. */
		kind?: 'input' | 'output' | 'features';
		/**
		 * `full` pairs the icon with its label; `compact` shows the icon alone
		 * and keeps the label for assistive tech, for dense table rows.
		 */
		variant?: 'full' | 'compact';
		/**
		 * Modalities to leave out. The table hides `text` — every Go model
		 * accepts it, so the chip is a constant and carries no signal there.
		 */
		omit?: readonly string[];
		class?: string;
	}

	let {
		capabilities,
		kind = 'input',
		variant = 'full',
		omit = [],
		class: className
	}: Props = $props();

	type Chip = { key: string; label: string; hint: string; icon: Component };

	let chips = $derived.by((): Chip[] => {
		if (!capabilities) return [];
		if (kind === 'features') {
			return supportedFeatures(capabilities).map((f) => ({
				key: f,
				label: FEATURE_LABEL[f],
				hint: FEATURE_HINT[f],
				icon: CAPABILITY_ICONS[f]
			}));
		}
		// OutputModality is a subset of InputModality, so both sides index the
		// same label/hint/icon maps without casting.
		const list = kind === 'output' ? capabilities.output : capabilities.input;
		return list
			.filter((m) => !omit.includes(m))
			.map((m) => ({
				key: m,
				label: MODALITY_LABEL[m],
				hint: MODALITY_HINT[m],
				icon: CAPABILITY_ICONS[m]
			}));
	});
</script>

{#if chips.length > 0}
	<ul class={cn('flex flex-wrap items-center gap-1', className)}>
		{#each chips as chip (chip.key)}
			{@const Icon = chip.icon}
			<li
				class="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground"
				title={chip.hint}
			>
				<Icon class="size-3 shrink-0 opacity-70" aria-hidden="true" />
				{#if variant === 'full'}
					{chip.label}
				{:else}
					<span class="sr-only">{chip.label}</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
