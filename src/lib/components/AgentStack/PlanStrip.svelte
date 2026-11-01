<script lang="ts">
	import { cn } from '$lib/utils';
	import { formatCost } from '$lib/stack/format';
	import { modelKey, type PlanStackRow } from '$lib/stack/logic';
	import type { PlanId, StackModel } from '$lib/stack/plans';

	let {
		rows,
		activeId,
		onSelect,
		mainId,
		subId
	}: {
		rows: PlanStackRow[];
		activeId: PlanId;
		onSelect: (id: PlanId) => void;
		/** The main role the user requested (empty = no explicit pick). */
		mainId: string;
		/** The sub role the user requested (empty = no explicit pick). */
		subId: string;
	} = $props();

	/** A requested pick this plan could not honour, so it shows another model. */
	function substituted(requestedId: string, resolved: StackModel | null): boolean {
		if (!requestedId || !resolved) return false;
		return modelKey(resolved.id) !== modelKey(requestedId);
	}

	function rowSubstituted(row: PlanStackRow): boolean {
		return substituted(mainId, row.stack.main) || substituted(subId, row.stack.sub);
	}

	/** The pair line, labelled when this plan cannot carry a requested pick. */
	function pairLabel(row: PlanStackRow): string {
		const { main, sub } = row.stack;
		if (!main || !sub) return "Needs models this plan doesn't have";
		const pair = `${main.name} + ${sub.name}`;
		return rowSubstituted(row) ? `${pair} · best available on this plan` : pair;
	}

	function economicsLabel(row: PlanStackRow): string {
		const economics = row.economics;
		if (!economics) return '—';
		const monthly =
			economics.requestsPerMonth === null
				? 'Unlimited'
				: `≈ ${economics.requestsPerMonth.toLocaleString()} / month`;
		return `${formatCost(economics.costPer100)} per 100 requests · ${monthly}`;
	}

	/** Card text is resolved here, so the markup stays a plain list. */
	let cards = $derived(
		rows.map((row) => ({
			id: row.plan.id,
			name: row.plan.name,
			pair: pairLabel(row),
			substituted: rowSubstituted(row),
			economics: economicsLabel(row)
		}))
	);

	let anySubstituted = $derived(cards.some((card) => card.substituted));
</script>

<div class="space-y-3">
	<div>
		<h3 class="text-sm font-semibold text-foreground">Same pair, every plan</h3>
		<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
			{#if anySubstituted}
				Not every plan carries the models you picked, so those rows show the closest pair it has.
			{:else}
				Where your main and sub-agent picks exist, this is what each plan gives you.
			{/if}
		</p>
	</div>

	<div class="grid gap-2 sm:grid-cols-3">
		{#each cards as card (card.id)}
			<button
				type="button"
				class={cn(
					'rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
					card.id === activeId ? 'border-primary' : 'border-border'
				)}
				aria-pressed={card.id === activeId}
				onclick={() => onSelect(card.id)}
			>
				<p class="text-sm font-semibold text-foreground">{card.name}</p>
				<p class="mt-1 text-xs text-muted-foreground">{card.pair}</p>
				<p class="mt-2 text-xs text-muted-foreground tabular-nums">
					{card.economics}
				</p>
			</button>
		{/each}
	</div>
</div>
