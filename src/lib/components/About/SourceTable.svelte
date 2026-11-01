<script lang="ts">
	import { Database, ExternalLink } from '@lucide/svelte';

	interface Source {
		provider: string;
		href: string;
		license: string;
		use: string;
		required?: boolean;
	}

	const sources: Source[] = [
		{
			provider: 'modelgrep.com',
			href: 'https://modelgrep.com/',
			license: 'Free public API (no key required)',
			use: 'Benchmark scores, OpenRouter pricing, speed/latency, model metadata',
			required: true
		},
		{
			provider: 'llm-stats.com',
			href: 'https://llm-stats.com/',
			license: 'Per LLM Stats API terms',
			use: 'Benchmark scores, rankings, pricing, model metadata',
			required: true
		},
		{
			provider: 'opencode.ai/v2/docs/console/go',
			href: 'https://opencode.ai/v2/docs/console/go',
			license: 'Per OpenCode Go docs',
			use: 'Model list, endpoint types, quota windows'
		},
		{
			provider: 'models.dev',
			href: 'https://models.dev',
			license: 'Open source (MIT)',
			use: 'First-party OpenCode catalog metadata and the Go model lifecycle history'
		},
		{
			provider: 'zed.dev · hosted models',
			href: 'https://zed.dev/docs/account/zed-hosted-models',
			license: 'Per Zed docs',
			use: 'Zed Pro model list and list prices'
		},
		{
			provider: 'zed.dev · plans & pricing',
			href: 'https://zed.dev/docs/account/plans-and-pricing',
			license: 'Per Zed docs',
			use: 'Zed Pro monthly price, included token credit and 10% markup'
		},
		{
			provider: 'GitHub · supported models',
			href: 'https://docs.github.com/en/copilot/reference/ai-models/supported-models',
			license: 'Per GitHub docs',
			use: 'Copilot Pro model list'
		},
		{
			provider: 'GitHub · models & pricing',
			href: 'https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing',
			license: 'Per GitHub docs',
			use: 'Copilot Pro prices and credit rates'
		}
	];

	/** Only modelgrep and LLM Stats require attribution; the other six are advisory. */
	const attributionCount = sources.filter((source) => source.required).length;
</script>

<div class="overflow-hidden rounded-lg border border-border bg-card/40">
	<div
		class="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase"
	>
		<span class="flex items-center gap-1.5">
			<Database class="size-3" />
			data_sources.json
		</span>
		<span class="text-cyan-900 dark:text-cyan-200"
			>{sources.length} sources · {attributionCount} require attribution</span
		>
	</div>

	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
				<th class="px-4 py-2 font-medium">Provider</th>
				<th class="px-4 py-2 font-medium">License</th>
				<th class="px-4 py-2 font-medium">Use in ZenPick</th>
			</tr>
		</thead>
		<tbody class="font-mono">
			{#each sources as source (source.provider)}
				<tr class="border-b border-border/50 align-top last:border-0">
					<td class="px-4 py-3">
						<a
							href={source.href}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 text-cyan-800 underline-offset-4 hover:underline dark:text-cyan-300"
						>
							{source.provider}
							<ExternalLink class="size-3" />
						</a>
						{#if source.required}
							<div
								class="mt-1 text-[10px] tracking-wider text-amber-900 uppercase dark:text-amber-300"
							>
								attribution required
							</div>
						{/if}
					</td>
					<td class="px-4 py-3 text-xs text-muted-foreground">{source.license}</td>
					<td class="px-4 py-3 text-xs text-foreground">{source.use}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
