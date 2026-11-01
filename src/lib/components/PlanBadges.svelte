<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		PLAN_LABEL,
		PLAN_SHORT_LABEL,
		type CatalogPlanEntry,
		type PlanFilter
	} from '$lib/catalog';

	/**
	 * Which plans carry a catalog model. `active` is the current `?plan=` filter:
	 * with `''` (all plans) every badge is neutral, because no single plan is the
	 * one being read.
	 */
	let { entries, active = '' }: { entries: CatalogPlanEntry[]; active?: PlanFilter } = $props();
</script>

<div class="flex flex-wrap gap-1">
	{#each entries as entry (entry.plan)}
		<Badge
			variant={entry.plan === active ? 'secondary' : 'outline'}
			class={entry.plan === active ? 'border-primary/40' : ''}
			aria-label={PLAN_LABEL[entry.plan]}
			title={PLAN_LABEL[entry.plan]}
		>
			{PLAN_SHORT_LABEL[entry.plan]}
		</Badge>
	{/each}
</div>
