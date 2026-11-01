<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import RolePicker from './RolePicker.svelte';
	import PlanStrip from './PlanStrip.svelte';
	import { compareHref, compareKey } from '$lib/compare-selection';
	import { formatCost } from '$lib/stack/format';
	import {
		compareAcrossPlans,
		DEFAULT_WORKLOAD,
		resolveStack,
		stackEconomics
	} from '$lib/stack/logic';
	import type { PlanId, StackPlan } from '$lib/stack/plans';
	import type { StackParams } from '$lib/stack/search';
	import { GitCompare } from '@lucide/svelte';

	let {
		plans,
		params,
		id = 'agent-stack'
	}: {
		plans: StackPlan[];
		params: StackParams;
		id?: string;
	} = $props();

	let plan = $derived(plans.find((option) => option.id === params.stack) ?? plans[0]);
	let workload = $derived({ ...DEFAULT_WORKLOAD, subShare: params.split });
	let resolved = $derived(resolveStack(plan, params.main, params.sub, workload));
	let economics = $derived(
		resolved.main && resolved.sub
			? stackEconomics(plan, resolved.main, resolved.sub, workload)
			: null
	);
	let rows = $derived(compareAcrossPlans(plans, params.main, params.sub, workload));
	// Explicit opt-in only: this link is the ONLY way the pair enters a compare.
	// The AgentStack must never add to the compare store by itself.
	let pairHref = $derived(
		resolved.main && resolved.sub
			? compareHref([compareKey(plan.id, resolved.main.id), compareKey(plan.id, resolved.sub.id)])
			: null
	);

	function handleSplit(value: number | number[]) {
		const next = Array.isArray(value) ? value[0] : value;
		if (typeof next === 'number') params.split = next;
	}
</script>

<section
	{id}
	class="rounded-2xl border border-border bg-card p-5 sm:p-6"
	aria-labelledby="{id}-title"
>
	<p
		class="font-mono text-xs font-semibold tracking-[0.16em] text-primary uppercase dark:text-primary-strong"
	>
		Agent stack
	</p>
	<h2 id="{id}-title" class="mt-2 text-lg font-semibold tracking-tight text-foreground">
		Pick a main agent and cheaper sub-agents
	</h2>
	<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
		The main agent plans and decides. Sub-agents implement, review and fix. Sending most requests to
		a cheap sub-agent is how a plan stretches.
	</p>

	<Tabs.Root
		class="mt-5"
		value={params.stack}
		onValueChange={(value) => (params.stack = value as PlanId)}
	>
		<Tabs.List class="max-w-full overflow-x-auto">
			{#each plans as option (option.id)}
				<Tabs.Trigger value={option.id}>
					{option.name}
					<span class="text-muted-foreground">${option.monthlyPriceUsd}/mo</span>
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	<div class="mt-4 space-y-1 text-sm">
		<p class="text-foreground">{plan.allowance}</p>
		<p class="text-xs leading-relaxed text-muted-foreground">{plan.caveat}</p>
		<p class="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
			{#each plan.sources as source (source.url)}
				<a
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
					class="font-medium text-primary underline-offset-4 hover:underline dark:text-primary-strong"
				>
					{source.label}
				</a>
			{/each}
			<span class="text-muted-foreground">
				{#if plan.verifiedOn}
					Checked {plan.verifiedOn}
				{:else}
					Live from the OpenCode Go catalog
				{/if}
			</span>
		</p>
	</div>

	<div class="mt-5 grid gap-3 sm:grid-cols-2">
		<RolePicker
			role="main"
			{plan}
			model={resolved.main}
			auto={resolved.autoMain}
			{workload}
			onPick={(modelId) => (params.main = modelId)}
		/>
		<RolePicker
			role="sub"
			{plan}
			model={resolved.sub}
			auto={resolved.autoSub}
			{workload}
			onPick={(modelId) => (params.sub = modelId)}
		/>
	</div>

	<div class="mt-5 space-y-3">
		<label for="{id}-split" class="text-sm font-medium text-foreground">
			Requests handled by sub-agents: {params.split}%
		</label>
		<Slider
			id="{id}-split"
			type="single"
			min={0}
			max={100}
			step={5}
			value={params.split}
			onValueChange={handleSplit}
		/>

		<div aria-live="polite">
			{#if economics}
				<div class="grid gap-2 sm:grid-cols-3">
					<div class="rounded-xl border border-border bg-muted/40 p-3">
						<p class="text-xs text-muted-foreground">Cost per 100 requests</p>
						<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
							{formatCost(economics.costPer100)}
						</p>
					</div>
					<div class="rounded-xl border border-border bg-muted/40 p-3">
						<p class="text-xs text-muted-foreground">Versus everything on the main agent</p>
						<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
							{#if economics.savingsPct === 0}
								—
							{:else}
								{#if economics.savingsPct > 0}
									−{economics.savingsPct}%
								{:else}
									+{Math.abs(economics.savingsPct)}% more
								{/if}
								<span class="text-sm font-normal text-muted-foreground">
									({formatCost(economics.mainOnlyCostPer100)} per 100)
								</span>
							{/if}
						</p>
					</div>
					<div class="rounded-xl border border-border bg-muted/40 p-3">
						<p class="text-xs text-muted-foreground">Included each month</p>
						<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
							{#if economics.requestsPerMonth === null}
								Unlimited
							{:else}
								≈ {economics.requestsPerMonth.toLocaleString()} requests
							{/if}
						</p>
					</div>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Pick two priced models to see the cost.</p>
			{/if}
		</div>

		<p class="text-xs leading-relaxed text-muted-foreground">
			A request is 50K tokens, half of it cached. {plan.name} includes ${plan.includedUsd}
			of tokens for ${plan.monthlyPriceUsd}/mo.
		</p>
	</div>

	{#if pairHref}
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<a href={pairHref} class={buttonVariants({ variant: 'outline', size: 'default' })}>
				<GitCompare class="size-4" />
				Compare this pair
			</a>
			<span class="text-xs text-muted-foreground">
				Adds both to the compare page; you can add more models there.
			</span>
		</div>
	{/if}

	<div class="mt-6 border-t border-border pt-5">
		<PlanStrip
			{rows}
			activeId={plan.id}
			onSelect={(next) => (params.stack = next)}
			mainId={params.main}
			subId={params.sub}
		/>
	</div>
</section>
