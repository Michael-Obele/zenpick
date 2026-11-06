<script lang="ts">
	import { untrack } from 'svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import ModelCombobox from './ModelCombobox.svelte';
	import { PLAN_LABEL } from '$lib/catalog';
	import { compareKey, parseCompareKey } from '$lib/compare-selection';
	import { toStackModel, type CompareModel } from '$lib/compare-model';
	import { burnLabel } from '$lib/burn';
	import { planModelEconomics } from '$lib/stack/allowance';
	import { DEFAULT_WORKLOAD, findModel, modelKey, type StackWorkload } from '$lib/stack/logic';
	import { evaluatePair, suggestPair } from '$lib/stack/pairing';
	import { formatCost } from '$lib/stack/format';
	import type { PlanId, StackModel, StackPlan } from '$lib/stack/plans';
	import type { StackParams } from '$lib/stack/search';
	import { ChevronDown, GitCompare, TriangleAlert } from '@lucide/svelte';

	/**
	 * Pair builder for the compare route
	 * ----------------------------------
	 * The homepage `AgentStack` ranks every model on a plan. This builder is
	 * deliberately narrower: it only offers the models already in the comparison.
	 * Suggesting an unrelated model (or a model from a plan the user is not
	 * comparing) is noise, so a pair must be two selected models from the same
	 * plan.
	 *
	 * The recommendation weighs the main agent's benchmark quality, the pair's
	 * saving versus all-main, and how much quality the sub retains. Warnings call
	 * out pairs that are technically possible but a bad idea (a sub that costs as
	 * much as the main, a big context drop, or a plan price cliff).
	 */
	let {
		plans,
		models,
		params,
		selectedKeys = [],
		onUse,
		defaultOpen = false
	}: {
		plans: StackPlan[];
		models: CompareModel[];
		params: StackParams;
		selectedKeys?: string[];
		onUse: (keys: string[]) => void;
		defaultOpen?: boolean;
	} = $props();

	// `defaultOpen` is a one-time initial value: the panel is user-toggled after
	// mount, so it must not track the prop. `untrack` says that out loud.
	let open = $state(untrack(() => defaultOpen));

	let workload: StackWorkload = $derived({
		...DEFAULT_WORKLOAD,
		subShare: params.split
	});

	/** The comparison's models, grouped by the plan that carries each one. */
	let byPlan = $derived.by(() => {
		const grouped = new Map<PlanId, StackModel[]>();
		for (const model of models) {
			const list = grouped.get(model.plan) ?? [];
			list.push(toStackModel(model));
			grouped.set(model.plan, list);
		}
		return grouped;
	});

	/** A pair needs two selected models on the same plan. */
	let pairPlans = $derived(plans.filter((option) => (byPlan.get(option.id)?.length ?? 0) >= 2));
	let lonePlans = $derived(
		plans
			.filter((option) => (byPlan.get(option.id)?.length ?? 0) === 1)
			.map((option) => option.name)
	);

	let plan = $derived(
		pairPlans.find((option) => option.id === params.stack) ?? pairPlans[0] ?? null
	);
	let available = $derived(plan ? (byPlan.get(plan.id) ?? []) : []);

	/** The best pair the selection can make, before any user override. */
	let suggestion = $derived(plan ? suggestPair(available, plan, workload) : null);

	let requestedMain = $derived(findModel(available, params.main));
	let requestedSub = $derived(findModel(available, params.sub));

	/**
	 * An explicit `sub` claims its role even when the recommendation would have
	 * cast that model as the main — with two comparison models that is exactly the
	 * role swap, so the main is re-suggested from the models the sub leaves over
	 * (which with two models is simply the other one).
	 */
	let main = $derived.by(() => {
		if (requestedMain) return requestedMain;
		if (requestedSub) {
			const rest = available.filter((model) => model.id !== requestedSub.id);
			const candidate = plan && rest.length > 1 ? suggestPair(rest, plan, workload) : null;
			return candidate?.main ?? rest[0] ?? null;
		}
		return suggestion?.main ?? null;
	});
	let sub = $derived.by(() => {
		if (requestedSub && requestedSub.id !== main?.id) return requestedSub;
		const suggested = suggestion?.sub;
		if (suggested && suggested.id !== main?.id) return suggested;
		return available.find((model) => model.id !== main?.id) ?? null;
	});

	let autoMain = $derived(requestedMain == null);
	let autoSub = $derived(requestedSub == null || requestedSub.id === main?.id);
	let verdict = $derived(
		plan && main && sub && main.id !== sub.id ? evaluatePair(plan, main, sub, workload) : null
	);
	let mainEconomics = $derived(
		plan && main ? planModelEconomics(main, plan.includedUsd, workload) : null
	);
	let subEconomics = $derived(
		plan && sub ? planModelEconomics(sub, plan.includedUsd, workload) : null
	);

	/** The pair's compare keys — only real when both roles resolve. */
	let pairKeys = $derived(
		plan && main && sub ? [compareKey(plan.id, main.id), compareKey(plan.id, sub.id)] : []
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
		return pairPlans.some((option) => option.id === value);
	}

	/** Switching plans clears both roles: ids are plan-local. */
	function changePlan(value: string | undefined) {
		if (!value || !isKnownPlan(value)) return;
		params.stack = value;
		params.main = '';
		params.sub = '';
	}

	function handleSplit(value: number | number[]) {
		const next = Array.isArray(value) ? value[0] : value;
		if (typeof next === 'number') params.split = next;
	}

	let mainChoices = $derived(available.filter((model) => model.id !== sub?.id));
	let subChoices = $derived(available.filter((model) => model.id !== main?.id));

	let savingsLabel = $derived.by(() => {
		if (!verdict) return '—';
		if (verdict.economics.savingsPct > 0) return `−${verdict.economics.savingsPct}%`;
		if (verdict.economics.savingsPct < 0) return `+${Math.abs(verdict.economics.savingsPct)}% more`;
		return '—';
	});

	/** Swap the two roles in the URL: both end up explicit, so the swap sticks. */
	function swapRoles() {
		if (!main || !sub || main.id === sub.id) return;
		params.main = sub.id;
		params.sub = main.id;
	}
</script>

{#snippet economicsTiles()}
	{#if verdict}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<div class="rounded-xl border border-border bg-card p-3">
				<p class="text-xs text-muted-foreground">Cost per 100</p>
				<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
					{formatCost(verdict.economics.costPer100)}
				</p>
			</div>
			<div class="rounded-xl border border-border bg-card p-3">
				<p class="text-xs text-muted-foreground">Versus all-main</p>
				<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
					{savingsLabel}
				</p>
			</div>
			<div class="rounded-xl border border-border bg-card p-3">
				<p class="text-xs text-muted-foreground">Included / month</p>
				<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
					{#if verdict.economics.requestsPerMonth == null}
						Unlimited
					{:else}
						≈ {verdict.economics.requestsPerMonth.toLocaleString()}
					{/if}
				</p>
			</div>
			<div class="rounded-xl border border-border bg-card p-3">
				<p class="text-xs text-muted-foreground">Sub quality</p>
				<p class="mt-1 text-lg font-semibold text-foreground tabular-nums">
					{verdict.retention == null ? '—' : `${Math.round(verdict.retention)}% of main`}
				</p>
			</div>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">
			Pick two priced models from this comparison to see the pair economics.
		</p>
	{/if}
{/snippet}

{#snippet planEconomics()}
	{#if plan && mainEconomics && subEconomics}
		<p class="mt-3 text-xs leading-relaxed text-muted-foreground tabular-nums">
			{PLAN_LABEL[plan.id]} includes ${plan.includedUsd} of tokens each month. At this workload, 100 main
			requests use
			{mainEconomics.budgetPer100Pct == null
				? '—'
				: `${Math.round(mainEconomics.budgetPer100Pct)}%`} of that allowance, and 100 sub requests use
			{subEconomics.budgetPer100Pct == null ? '—' : `${Math.round(subEconomics.budgetPer100Pct)}%`}.
			Main burn:
			{mainEconomics.burnRate ? burnLabel(mainEconomics.burnRate) : '—'}; sub burn:
			{subEconomics.burnRate ? burnLabel(subEconomics.burnRate) : '—'}.
		</p>
	{/if}
{/snippet}

{#snippet verdictDetails()}
	{#if verdict && (verdict.strengths.length > 0 || verdict.warnings.length > 0)}
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			{#if verdict.strengths.length}
				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<h4 class="text-xs font-medium text-foreground">What this pair offers</h4>
					<ul class="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
						{#each verdict.strengths as strength, i (i)}
							<li>{strength}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if verdict.warnings.length}
				<div
					class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-100"
				>
					<h4 class="flex items-center gap-1.5 text-xs font-medium">
						<TriangleAlert class="size-3.5 shrink-0" aria-hidden="true" />
						Watch out
					</h4>
					<ul class="mt-1.5 space-y-1 text-xs leading-relaxed">
						{#each verdict.warnings as warning, i (i)}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
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
			{#if models.length === 0}
				<p class="text-sm text-muted-foreground">
					Add models to the comparison above, then build a pair from them here.
				</p>
			{:else if pairPlans.length === 0}
				<p class="text-sm text-muted-foreground">
					A pair has to run on one plan, and this comparison does not have two models on the same
					plan yet.
					{#if lonePlans.length}
						Add another model from {lonePlans.join(' or ')}.
					{:else}
						Add two models from the same plan.
					{/if}
				</p>
			{:else if plan}
				<p class="text-xs text-muted-foreground">
					Using the models already in this comparison. Main plans and decides; the sub handles
					delegated work.
				</p>

				<div class="mt-3 grid gap-3 sm:grid-cols-3">
					<div>
						<label for="pair-plan" class="text-xs font-medium text-muted-foreground">Plan</label>
						<Select.Root type="single" value={plan.id} onValueChange={changePlan}>
							<Select.Trigger id="pair-plan" class="mt-1 w-full">
								{PLAN_LABEL[plan.id]}
							</Select.Trigger>
							<Select.Content>
								{#each pairPlans as option (option.id)}
									<Select.Item value={option.id} label={PLAN_LABEL[option.id]} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<ModelCombobox
						id="pair-main"
						label="Main agent"
						models={mainChoices}
						value={main}
						onPick={(modelId) => (params.main = modelId)}
					/>
					<ModelCombobox
						id="pair-sub"
						label="Sub-agents"
						models={subChoices}
						value={sub}
						onPick={(modelId) => (params.sub = modelId)}
					/>
				</div>

				<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
					<p class="text-xs text-muted-foreground">
						{#if autoMain && autoSub}
							Recommended from this comparison
						{:else}
							Your pick
						{/if}
						· {main?.name ?? '—'} + {sub?.name ?? '—'}
					</p>
					<Button
						variant="outline"
						size="sm"
						onclick={swapRoles}
						disabled={!main || !sub || main.id === sub.id}
					>
						Swap roles
					</Button>
				</div>

				<div class="mt-3">
					<label for="pair-split" class="text-sm font-medium text-foreground">
						Requests handled by sub-agents: {params.split}%
					</label>
					<Slider
						id="pair-split"
						type="single"
						min={0}
						max={100}
						step={5}
						value={params.split}
						onValueChange={handleSplit}
						class="mt-2"
					/>
				</div>

				<div class="mt-4">{@render economicsTiles()}</div>
				{@render planEconomics()}
				{@render verdictDetails()}

				<div class="mt-4 flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						onclick={() => onUse(pairKeys)}
						disabled={pairKeys.length !== 2 || inComparison || main?.id === sub?.id}
					>
						{inComparison ? 'In comparison' : 'Use this pair'}
					</Button>
					<p class="text-xs text-muted-foreground">
						Only these two comparison models become the pair.
					</p>
				</div>
			{/if}
		</div>
	</Collapsible.Content>
</Collapsible.Root>
