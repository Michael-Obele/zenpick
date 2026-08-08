<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import type { GoModel } from '$lib/types/models';

	interface Props {
		models: GoModel[];
	}

	let { models }: Props = $props();
</script>

<h2 class="mb-4 text-lg font-semibold text-foreground">Raw GoModel JSON</h2>
<p class="mb-4 text-sm text-muted-foreground">
	Collapsible JSON dump of every enriched model. Useful for inspecting exact values.
</p>
<div class="space-y-2">
	{#each models as m (m.id)}
		<Collapsible.Root class="rounded-lg border border-border">
			<Collapsible.Trigger
				class="w-full p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
			>
				{m.name}
			</Collapsible.Trigger>
			<Collapsible.Content class="px-3 pb-3">
				<pre
					class="max-h-96 overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">{JSON.stringify(
						m,
						null,
						2
					)}</pre>
			</Collapsible.Content>
		</Collapsible.Root>
	{/each}
</div>
