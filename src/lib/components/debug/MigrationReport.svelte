<script lang="ts">
	import type { GoModel } from '$lib/types/models';

	interface Props {
		models: GoModel[];
	}

	let { models }: Props = $props();
</script>

<h2 class="mb-4 text-lg font-semibold text-foreground">Migration Report</h2>
<p class="mb-4 text-sm text-muted-foreground">
	What each Go model claims to replace, against its blended benchmark scores. Hints are computed
	from blended benchmarks (modelgrep-primary, llm-stats fallback) compared to frontier candidates on
	the same scale.
</p>
<div class="overflow-x-auto">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-border text-muted-foreground">
				<th class="p-2 font-medium">Go Model</th>
				<th class="p-2 font-medium">Open</th>
				<th class="p-2 font-medium">Coding</th>
				<th class="p-2 font-medium">Reasoning</th>
				<th class="p-2 font-medium">Math</th>
				<th class="p-2 font-medium">Replaces</th>
			</tr>
		</thead>
		<tbody>
			{#each models as m (m.id)}
				<tr class="border-b border-border/50 align-top hover:bg-muted/30">
					<td class="p-2 font-mono text-xs text-foreground">{m.id}</td>
					<td class="p-2">{m.openWeight ? '✅' : '❌'}</td>
					<td class="p-2">{m.benchmarks.coding ?? '—'}</td>
					<td class="p-2">{m.benchmarks.reasoning ?? '—'}</td>
					<td class="p-2">{m.benchmarks.math ?? '—'}</td>
					<td class="p-2">
						{#if m.migrationHints.length}
							<ul class="space-y-1">
								{#each m.migrationHints as hint (hint.model)}
									<li class="text-xs">
										<span class="font-medium text-foreground">{hint.model}</span>
										<span class="text-muted-foreground"> — {hint.reason}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<span class="text-xs text-muted-foreground/40">—</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
