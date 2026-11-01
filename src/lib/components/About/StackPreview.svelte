<script lang="ts">
	import {
		DEFAULT_WORKLOAD,
		resolveStack,
		stackEconomics,
		type ResolvedStack
	} from '$lib/stack/logic';
	import { formatCost } from '$lib/stack/format';
	import type { StackPlan } from '$lib/stack/plans';

	let { plans }: { plans: StackPlan[] } = $props();

	let rows = $derived(
		plans.map((plan) => {
			const stack = resolveStack(plan, '', '', DEFAULT_WORKLOAD);
			const economics =
				stack.main && stack.sub
					? stackEconomics(plan, stack.main, stack.sub, DEFAULT_WORKLOAD)
					: null;
			return { plan, stack, economics };
		})
	);

	let anyAuto = $derived(rows.some((row) => row.stack.autoMain || row.stack.autoSub));

	function pairLabel(stack: ResolvedStack): string {
		if (!stack.main || !stack.sub) return 'No priced pair on this plan';
		return `${stack.main.name} + ${stack.sub.name}`;
	}
</script>

<div class="overflow-x-auto rounded-xl border border-border bg-card">
	<table class="w-full min-w-[40rem] text-left text-sm">
		<thead>
			<tr class="border-b border-border">
				<th scope="col" class="px-4 py-2 text-xs tracking-wider text-muted-foreground uppercase">
					Plan
				</th>
				<th scope="col" class="px-4 py-2 text-xs tracking-wider text-muted-foreground uppercase">
					Default pair
				</th>
				<th scope="col" class="px-4 py-2 text-xs tracking-wider text-muted-foreground uppercase">
					Cost per 100 requests
				</th>
				<th scope="col" class="px-4 py-2 text-xs tracking-wider text-muted-foreground uppercase">
					Included each month
				</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.plan.id)}
				<tr class="border-b border-border/50 align-top last:border-0">
					<td class="px-4 py-3">
						<span class="font-medium text-foreground">{row.plan.name}</span>
						<span class="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums"
							>${row.plan.monthlyPriceUsd}/mo</span
						>
					</td>
					<td class="px-4 py-3">
						<span class="text-foreground">{pairLabel(row.stack)}</span>
						{#if row.stack.autoMain || row.stack.autoSub}
							<span
								class="ml-1.5 inline-block rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wider text-muted-foreground uppercase"
							>
								auto-picked
							</span>
						{/if}
					</td>
					<td class="px-4 py-3 font-mono text-foreground tabular-nums">
						{row.economics ? formatCost(row.economics.costPer100) : '—'}
					</td>
					<td class="px-4 py-3 font-mono text-foreground tabular-nums">
						{#if row.economics}
							{#if row.economics.requestsPerMonth === null}
								Unlimited
							{:else}
								≈ {row.economics.requestsPerMonth.toLocaleString()} requests
							{/if}
						{:else}
							—
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<div class="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
	<p>
		A request is 50K tokens, half of it cached. 70% of requests go to the sub-agent. Monthly
		coverage divides each plan's included token value by the blended request cost.
	</p>
	{#if anyAuto}
		<p>
			An auto-picked row uses the strongest main model under $12 per million output tokens and the
			cheapest sub-agent with an intelligence score of at least 25.
		</p>
	{/if}
</div>
