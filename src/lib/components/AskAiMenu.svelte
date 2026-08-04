<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { GoModel } from '$lib/types/models';
	import { AI_PROVIDERS, buildComparePrompt } from '$lib/utils/ask-ai';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import {
		Sparkles,
		Bot,
		MessageSquareText,
		Brain,
		ExternalLink,
		Copy,
		Check
	} from '@lucide/svelte';
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

	// Transient "Copied!" feedback for the copy-prompt item.
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyPrompt() {
		let ok = false;
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(prompt);
				ok = true;
			} catch {
				// Fall through to the legacy path if the async API is blocked.
			}
		}
		if (!ok) {
			const ta = document.createElement('textarea');
			ta.value = prompt;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			ok = document.execCommand('copy');
			ta.remove();
		}
		if (ok) {
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		}
	}

	// Clear the feedback timer if the menu unmounts mid-feedback.
	$effect(() => () => clearTimeout(copyTimer));
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
			<DropdownMenu.Separator class="my-1 h-px bg-border" />
			<DropdownMenu.Item
				onSelect={copyPrompt}
				class="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
				aria-label="Copy the full prompt to the clipboard"
			>
				{#if copied}
					<Check class="size-4 text-emerald-500" />
					<span class="font-medium">Copied!</span>
				{:else}
					<Copy class="size-4 text-muted-foreground" />
					<span class="font-medium">Copy prompt</span>
				{/if}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
