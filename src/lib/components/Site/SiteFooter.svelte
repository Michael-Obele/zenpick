<script lang="ts">
	import { ArrowUpRight, Receipt, ExternalLink, Terminal, Database } from '@lucide/svelte';
	import { Separator } from '$lib/components/ui/separator';
	import GithubIcon from '$lib/assets/github.svelte';

	const year = new Date().getFullYear();

	const productLinks = [
		{ href: '/', label: 'Compare models' },
		{ href: '/about', label: 'About ZenPick' }
	];

	const dataLinks = [
		{ href: 'https://llm-stats.com', label: 'LLM Stats', external: true },
		{ href: 'https://modelgrep.com', label: 'modelgrep', external: true },
		{ href: 'https://opencode.ai/docs/go/', label: 'OpenCode Go docs', external: true },
		{ href: 'https://github.com/Michael-Obele/zenpick', label: 'Source on GitHub', external: true }
	];
</script>

<footer class="border-t border-border/60 bg-muted/20">
	<div class="px-4 py-8 sm:py-10 md:px-6 lg:px-8">
		<div class="signal-board-enter grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.9fr_1.4fr]">
			<!-- Brand -->
			<div class="space-y-4">
				<a
					href="/"
					class="group inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="ZenPick home"
				>
					<span
						class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10 transition-all group-hover:bg-primary/15 group-hover:ring-primary/20"
					>
						<Receipt class="size-4" />
					</span>
					<span class="font-mono text-sm font-semibold tracking-tight text-foreground">
						ZenPick
					</span>
				</a>
				<p class="max-w-xs text-sm leading-relaxed text-muted-foreground">
					A thermal-quota compass for OpenCode Go. Compare open coding models on benchmarks,
					pricing, and quota burn.
				</p>
				<div class="inline-flex items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
					>
						<Database class="size-3" />
						Open data
					</span>
				</div>
			</div>

			<!-- Product -->
			<div class="space-y-4">
				<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
					Product
				</h3>
				<ul class="space-y-2">
					{#each productLinks as link (link.href)}
						<li>
							<a
								href={link.href}
								class="group inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
							>
								{link.label}
								<ArrowUpRight class="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
							</a>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Data & source -->
			<div class="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-4">
				<div class="space-y-1">
					<h3
						class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80"
					>
						<Database class="size-3.5" />
						Data & source
					</h3>
					<p class="text-xs leading-relaxed text-muted-foreground/80">
						Benchmarks, pricing, and quota burn are compiled from the public sources below.
					</p>
				</div>
				<ul class="space-y-2">
					{#each dataLinks as link (link.href)}
						<li>
							<a
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								class="group inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none transition-all duration-200 hover:translate-x-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
							>
								{#if link.href.includes('github')}
									<span class="size-3.5"><GithubIcon class="size-full" /></span>
								{:else if link.href.includes('opencode')}
									<Terminal class="size-3.5" />
								{:else}
									<ExternalLink class="size-3.5" />
								{/if}
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<Separator class="my-8 bg-border/60" />

		<div
			class="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground/70 sm:flex-row"
		>
			<span>© {year} ZenPick. Built for OpenCode Go users.</span>
			<a
				href="https://github.com/Michael-Obele/zenpick"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
			>
				<span class="size-3.5"><GithubIcon class="size-full" /></span>
				<span class="font-mono">Michael-Obele/zenpick</span>
			</a>
		</div>
	</div>
</footer>
