<script lang="ts">
	import { untrack } from 'svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import ModelCombobox from './ModelCombobox.svelte';
	import { PLAN_LABEL } from '$lib/catalog';
	import { compareKey, parseCompareKey } from '$lib/compare-selection';
	import { formatCost } from '$lib/stack/format';
	import { DEFAULT_WORKLOAD, modelKey, resolveStack, stackEconomics } from '$lib/stack/logic';
	import type { PlanId, StackPlan } from '$lib/stack/plans';
	import type { StackParams } from '$lib/stack/search';
	import { ChevronDown, GitCompare } from '@lucide/svelte';

	let {
		plans,
		params,
		selectedKeys = [],
		onUse,
		defaultOpen = false
	}: {
		plans: StackPlan[];
		params: StackParams;
		selectedKeys?: string[];
		onUse: (keys: string[]) => void;
		defaultOpen?: boolean;
	} = $props();

	// `defaultOpen` is a one-time initial value: the panel is user-toggled after
	// mount, so it must not track the prop. `untrack` says that out loud.
	let open = $state(untrack(() => defaultOpen));

	let plan = $derived(plans.find((option) => option.id === params.stack) ?? plans[0]);
	let resolved = $derived(resolveStack(plan, params.main, params.sub, DEFAULT_WORKLOAD));
	let economics = $derived(
		resolved.main && resolved.sub
			? stackEconomics(plan, resolved.main, resolved.sub, DEFAULT_WORKLOAD)
			: null
	);
	/** The rolling pair's compare keys — only real when both roles resolve. */
	let pairKeys = $derived(
		resolved.main && resolved.sub
			? [compareKey(plan.id, resolved.main.id), compareKey(plan.id, resolved.sub.id)]
			: []
	);
	/**
	 * `plan:modelKey(id)` — the same fold `resolveCompareEntries` dedupes on. Keys
	 * are compared by identity, never string equality, so a legacy bare Go key
	 * (`gpt-6-luna`), its canonical spelling (`go:gpt-6-luna`) and an alternate id
	 * spelling (`claude-sonnet-5-5`) all match the entry they name.
	 */
	function keyIdentity(key: string): string | null {
		const parsed = parseCompareKey(key);
		return parsed ? `${parsed.plan}:${modelKey(parsed.id)}` : null;
	}

	let selectedIdentities = $derived(
		new Set(
			selectedKeys.map(keyIdentity).filter((identity): identity is string => identity !== null)
		)
	);

	let inComparison = $derived(
		pairKeys.length === 2 &&
			pairKeys.every((key) => {
				const identity = keyIdentity(key);
				return identity !== null && selectedIdentities.has(identity);
			})
	);

	function isKnownPlan(value: string): value is PlanId {
		return plans.some((option) => option.id === value);
	}

	/** Switching plans clears both roles: ids are plan-local. */
	function changePlan(value: string | undefined) {
		if (!value || !isKnownPlan(value)) return;
		params.stack = value;
		params.main = '';
		params.sub = '';
	}

	function changeMain(modelId: string) {
		params.main = modelId;
	}

	function changeSub(modelId: string) {
		params.sub = modelId;
	}
</script>

{#snippet economicsLine()}
	{#if economics}
		<p class="mt-3 text-xs text-muted-foreground tabular-nums">
			{formatCost(economics.costPer100)} per 100 requests
			<span aria-hidden="true"> · </span>
			{#if economics.savingsPct > 0}
				−{economics.savingsPct}%
			{:else if economics.savingsPct < 0}
				+{Math.abs(economics.savingsPct)}% more
			{:else}
				—
			{/if}
			<span aria-hidden="true"> · </span>
			{#if economics.requestsPerMonth === null}
				Unlimited
			{:else}
				≈ {economics.requestsPerMonth.toLocaleString()} / month
			{/if}
			<span aria-hidden="true"> · </span>
			{DEFAULT_WORKLOAD.subShare}% of requests to sub-agents
		</p>
	{:else}
		<p class="mt-3 text-xs text-muted-foreground">Pick two priced models to see the cost.</p>
	{/if}
{/snippet}

<Collapsible.Root bind:open class="mt-4">
	<Collapsible.Trigger class={buttonVariants({ variant: 'outline', size: 'sm', class: 'gap-2' })}>
		<GitCompare class="size-4" aria-hidden="true" />
		Build an agent pair
		<ChevronDown
			class={['size-4 transition-transform', open ? 'rotate-180' : '']}
			aria-hidden="true"
		/>
	</Collapsible.Trigger>

	<Collapsible.Content>
		<div class="mt-3 rounded-xl border border-border bg-muted/20 p-4">
			<div class="grid gap-3 sm:grid-cols-3">
				<div>
					<label for="pair-plan" class="text-xs font-medium text-muted-foreground">Plan</label>
					<Select.Root type="single" value={plan.id} onValueChange={changePlan}>
						<Select.Trigger id="pair-plan" class="mt-1 w-full">
							{PLAN_LABEL[plan.id]}
						</Select.Trigger>
						<Select.Content>
							{#each plans as option (option.id)}
								<Select.Item value={option.id} label={PLAN_LABEL[option.id]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<ModelCombobox
					id="pair-main"
					label="Main agent"
					models={plan.models}
					value={resolved.main}
					onPick={changeMain}
				/>
				<ModelCombobox
					id="pair-sub"
					label="Sub-agents"
					models={plan.models}
					value={resolved.sub}
					onPick={changeSub}
				/>
			</div>

			{@render economicsLine()}

			<div class="mt-3 flex flex-wrap items-center gap-3">
				<Button
					size="sm"
					onclick={() => onUse(pairKeys)}
					disabled={pairKeys.length !== 2 || inComparison}
				>
					{inComparison ? 'In comparison' : 'Use this pair'}
				</Button>
				<p class="text-xs text-muted-foreground">
					{resolved.main?.name ?? '—'} + {resolved.sub?.name ?? '—'}
				</p>
			</div>
		</div>
	</Collapsible.Content>
</Collapsible.Root>
