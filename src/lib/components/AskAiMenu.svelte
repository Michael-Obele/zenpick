<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { GoModel } from '$lib/types/models';
	import { AI_PROVIDERS, buildComparePrompt } from '$lib/utils/ask-ai';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Sparkles, Bot, MessageSquareText, Brain, ExternalLink } from '@lucide/svelte';
	import type { ButtonVariant, ButtonSize } from '$lib/components/ui/button/index.js';

	interface Props {
		models: GoModel[];
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		align?: 'start' | 'center' | 'end';
	}

	let {
		models,
		variant = 'default',
		size = 'default',
		class: className = '',
		align = 'end'
	}: Props = $props();

	const iconMap: Record<string, typeof Sparkles> = {
		bot: Bot,
		'message-square-text': MessageSquareText,
		brain: Brain,
		sparkles: Sparkles
	};

	// Build the prompt once; each provider turns it into a copyable URL.
	let prompt = $derived(buildComparePrompt(models));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={buttonVariants({ variant, size, class: className })}
		aria-label="Ask an AI assistant about these models"
	>
		<Sparkles class="size-4" />
		Ask AI
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			class="z-50 min-w-52.5 rounded-xl border border-border bg-card p-1 text-foreground shadow-lg"
			sideOffset={8}
			{align}
		>
			<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">Ask with full context</div>
			<DropdownMenu.Separator class="my-1 h-px bg-border" />
			{#each AI_PROVIDERS as provider (provider.id)}
				{@const Icon = iconMap[provider.icon] ?? Sparkles}
				{@const url = provider.buildUrl(prompt)}
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					role="menuitem"
					tabindex={0}
					class="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
				>
					<Icon class="size-4 {provider.accent}" />
					<span class="font-medium">Ask {provider.label}</span>
					<ExternalLink class="ml-auto size-3.5 text-muted-foreground/50" />
				</a>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
