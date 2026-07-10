<script lang="ts">
	import { Receipt, Menu, X, ExternalLink, Terminal } from '@lucide/svelte';
	import { page } from '$app/state';
	import * as Sheet from '$lib/components/ui/sheet';
	import GithubIcon from '$lib/assets/github.svelte';

	const links = [
		{ href: '/', label: 'Compare' },
		{ href: '/about', label: 'About' }
	];

	let open = $state(false);

	function isActive(href: string): boolean {
		const path: string = page.url.pathname;
		if (href === '/') return path === '/';
		return path === href || path.startsWith(href + '/');
	}

	function closeMenu() {
		open = false;
	}
</script>

<header
	class="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60"
>
	<!-- Gradient accent line -->
	<div
		class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
		aria-hidden="true"
	></div>

	<nav
		class="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4"
		aria-label="Primary"
	>
		<!-- Brand -->
		<a
			href="/"
			class="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="ZenPick home"
		>
			<span
				class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10 transition-all group-hover:bg-primary/15 group-hover:ring-primary/20"
			>
				<Receipt class="size-4" />
			</span>
			<span class="font-mono text-sm font-semibold tracking-tight text-foreground"> ZenPick </span>
		</a>

		<!-- Desktop links -->
		<div
			class="hidden items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1 sm:flex"
		>
			{#each links as link (link.href)}
				<a
					href={link.href}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="relative rounded-full px-4 py-1.5 text-sm font-medium transition-all {isActive(
						link.href
					)
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{#if isActive(link.href)}
						<span
							class="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-border/60"
							aria-hidden="true"
						></span>
					{/if}
					<span class="relative">{link.label}</span>
				</a>
			{/each}
		</div>

		<!-- Right side actions -->
		<div class="flex items-center gap-2">
			<a
				href="https://opencode.ai/docs/go/"
				target="_blank"
				rel="noopener noreferrer"
				class="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
				aria-label="OpenCode Go documentation"
			>
				<Terminal class="size-3.5" />
				<span class="font-mono">Docs</span>
			</a>

			<a
				href="https://github.com/Michael-Obele/zenpick"
				target="_blank"
				rel="noopener noreferrer"
				class="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="ZenPick on GitHub"
			>
				<span class="size-3.5 transition-transform group-hover:-rotate-6">
					<GithubIcon class="size-full" />
				</span>
				<span class="hidden font-mono sm:inline">GitHub</span>
			</a>

			<Sheet.Root bind:open>
				<Sheet.Trigger
					class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
					aria-label="Open menu"
				>
					<Menu class="size-4" />
				</Sheet.Trigger>
				<Sheet.Content side="right" class="w-70 border-l border-border/60 px-0">
					<Sheet.Header class="px-5 pb-4 pt-2">
						<Sheet.Title class="sr-only">Navigation menu</Sheet.Title>
						<a href="/" class="group flex items-center gap-2.5" onclick={closeMenu}>
							<span
								class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10"
							>
								<Receipt class="size-4" />
							</span>
							<span class="font-mono text-sm font-semibold tracking-tight">ZenPick</span>
						</a>
					</Sheet.Header>

					<nav class="flex flex-col gap-1 px-3" aria-label="Mobile primary">
						{#each links as link (link.href)}
							<a
								href={link.href}
								aria-current={isActive(link.href) ? 'page' : undefined}
								class="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {isActive(
									link.href
								)
									? 'bg-primary/10 text-foreground'
									: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
								onclick={closeMenu}
							>
								{link.label}
								{#if isActive(link.href)}
									<span class="size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
								{/if}
							</a>
						{/each}
					</nav>

					<div class="mx-5 my-4 h-px bg-border/60" aria-hidden="true"></div>

					<div class="flex flex-col gap-1 px-3">
						<a
							href="https://opencode.ai/docs/go/"
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<Terminal class="size-4" />
							OpenCode Go docs
							<ExternalLink class="ml-auto size-3 opacity-60" />
						</a>
						<a
							href="https://github.com/Michael-Obele/zenpick"
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<span class="size-4">
								<GithubIcon class="size-full" />
							</span>
							Source on GitHub
							<ExternalLink class="ml-auto size-3 opacity-60" />
						</a>
					</div>
				</Sheet.Content>
			</Sheet.Root>
		</div>
	</nav>
</header>
