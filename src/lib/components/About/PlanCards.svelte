<script lang="ts">
	import type { StackPlan } from '$lib/stack/plans';

	let { plans }: { plans: StackPlan[] } = $props();

	function plural(count: number, singular: string): string {
		return `${count} ${singular}${count === 1 ? '' : 's'}`;
	}
</script>

<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each plans as plan (plan.id)}
		<li class="h-full">
			<article class="flex h-full flex-col rounded-xl border border-border bg-card p-5">
				<div class="flex items-baseline justify-between gap-3">
					<h3 class="text-base font-semibold tracking-tight text-foreground">
						{plan.name}
					</h3>
					<span class="font-mono text-foreground tabular-nums">${plan.monthlyPriceUsd}/mo</span>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{plural(plan.models.length, 'model')}
				</p>

				<dl class="mt-4 space-y-3 text-sm">
					<div>
						<dt class="text-xs tracking-wider text-muted-foreground uppercase">
							What ${plan.monthlyPriceUsd}/mo buys
						</dt>
						<dd class="mt-1 leading-relaxed text-foreground">
							{plan.allowance}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wider text-muted-foreground uppercase">Watch out</dt>
						<dd class="mt-1 leading-relaxed text-muted-foreground">
							{plan.caveat}
						</dd>
					</div>
				</dl>

				<div class="mt-auto pt-4">
					<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
						{#each plan.sources as source, index (source.url)}
							<a
								href={source.url}
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium text-primary underline-offset-4 hover:underline dark:text-primary-strong"
							>
								{source.label}
							</a>
							{#if index < plan.sources.length - 1}
								<span class="text-muted-foreground/50" aria-hidden="true">·</span>
							{/if}
						{/each}
					</p>
					<p class="mt-2 text-xs text-muted-foreground">
						{#if plan.verifiedOn}
							Checked {plan.verifiedOn}
						{:else}
							Model list live; plan terms from the Go docs
						{/if}
					</p>
				</div>
			</article>
		</li>
	{/each}
</ul>
