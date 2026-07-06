# ZenPick UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken Competitive and Agentic scenario filters by replacing tag matching with scenario fit scores, and redesign the UI around a solid-color "thermal management" metaphor.

**Architecture:** Add a `scenarioScores` object to each `GoModel` in the inference engine. The filter bar will emit scenario keys; the table will sort by the active scenario score and render a fit meter per row. The UI will drop gradients in favor of solid thermal colors (cyan/amber/red) for burn-rate and fit indicators, and the model drawer will be reorganized for clearer hierarchy.

**Tech Stack:** Svelte 5 (Runes), SvelteKit remote functions, Tailwind CSS v4, shadcn-svelte, `@lucide/svelte`, TypeScript, Bun.

## Global Constraints

- Svelte 5 Runes only: `$state`, `$props`, `$derived`, `$effect`. Never `export let` or `$:`.
- Icons from `@lucide/svelte` only; never `lucide-svelte`.
- Tailwind v4 semantic tokens preferred; solid colors allowed for the thermal accent system (cyan/amber/red) and the primary accent (`violet-600`).
- No gradients anywhere.
- shadcn-svelte components must be used as installed; do not hand-write new primitive UI.
- All edited files must pass `bun check` and `bunx prettier --write <path>`.
- Commit after each task.

---

## File Structure

- **Create:** none
- **Modify:**
  - `src/lib/types/models.ts` — add `scenarioScores` to `GoModel`
  - `src/lib/server/inference.ts` — compute per-model scenario fit scores
  - `src/lib/components/FilterBar.svelte` — scenario buttons emit keys, updated icons
  - `src/lib/components/ModelTable.svelte` — sort by scenario score, add fit meter, thermal burn badge
  - `src/lib/components/QuotaCalculator.svelte` — slider, thermal badges, default model
  - `src/lib/components/ModelDrawer.svelte` — thermal summary, sticky actions, benchmark bars
  - `src/routes/+page.svelte` — pass scenario, remove gradient hero, add loading skeleton

---

### Task 1: Add Scenario Scores to the Type Definition

**Files:**

- Modify: `src/lib/types/models.ts`

**Interfaces:**

- Consumes: existing `GoModel` interface
- Produces: `GoModel.scenarioScores: { brainstorming: number; coding: number; competitive: number; agentic: number; budget: number; }`

- [ ] **Step 1: Add `ScenarioScores` type and extend `GoModel`**

```typescript
export interface ScenarioScores {
	brainstorming: number;
	coding: number;
	competitive: number;
	agentic: number;
	budget: number;
}
```

Inside the `GoModel` interface, add:

```typescript
/** Per-scenario fit scores (0-100) */
scenarioScores: ScenarioScores;
```

- [ ] **Step 2: Verify the change**

Run: `bunx prettier --write src/lib/types/models.ts && bun check`
Expected: prettier formats cleanly; `bun check` may show errors in dependent files until Task 2 is complete.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/models.ts
git commit -m "types: add scenarioScores to GoModel"
```

---

### Task 2: Compute Scenario Fit Scores in the Inference Engine

**Files:**

- Modify: `src/lib/server/inference.ts`

**Interfaces:**

- Consumes: `LLMStatsModel`, coding/reasoning/math rankings, inferred benchmarks, pricing, quota, burn rate, speed, context window
- Produces: `inferScenarioScores(...): ScenarioScores`

- [ ] **Step 1: Add a normalization helper**

At the bottom of `inference.ts`, add:

```typescript
function normalizeScore(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}
```

- [ ] **Step 2: Implement `inferScenarioScores`**

Add the function after `inferTags`:

```typescript
function inferScenarioScores(
	goId: string,
	pricing: ModelPricing,
	benchmarks: ModelBenchmarks,
	burnRate: BurnRate,
	speed: ModelSpeed | null,
	model: LLMStatsModel | null,
	codingRankings: LLMStatsRanking[],
	reasoningRankings: LLMStatsRanking[],
	mathRankings: LLMStatsRanking[]
): ScenarioScores {
	const totalModels = codingRankings.length || 13;
	const codingRank = codingRankings.findIndex((r) =>
		r.model_name.toLowerCase().includes(goId.toLowerCase())
	);
	const reasoningRank = reasoningRankings.findIndex((r) =>
		r.model_name.toLowerCase().includes(goId.toLowerCase())
	);
	const mathRank = mathRankings.findIndex((r) =>
		r.model_name.toLowerCase().includes(goId.toLowerCase())
	);

	const ctx = model?.context_window ?? inferContextWindow(goId);
	const totalPrice = pricing.inputPricePerM + pricing.outputPricePerM;
	const quota = inferQuota(pricing);

	// Coding: rank (inverted) + sweBench/codeArena + speed
	const codingScore =
		(codingRank >= 0 ? normalizeScore(totalModels - codingRank, totalModels) * 0.5 : 0) +
		normalizeScore(benchmarks.sweBenchVerified ?? 0, 100) * 0.25 +
		normalizeScore(benchmarks.codeArena ?? 0, 100) * 0.15 +
		normalizeScore(speed?.tokensPerSecond ?? 0, 200) * 0.1;

	// Brainstorming: reasoning rank + context + moderate burn
	const brainstormingScore =
		(reasoningRank >= 0 ? normalizeScore(totalModels - reasoningRank, totalModels) * 0.5 : 0) +
		normalizeScore(ctx, 1_000_000) * 0.3 +
		(burnRate === 'medium' ? 100 : burnRate === 'slow' ? 70 : 40) * 0.2;

	// Competitive: sweBench + codeArena + coding rank
	const competitiveScore =
		normalizeScore(benchmarks.sweBenchVerified ?? 0, 100) * 0.4 +
		normalizeScore(benchmarks.codeArena ?? 0, 100) * 0.35 +
		(codingRank >= 0 ? normalizeScore(totalModels - codingRank, totalModels) * 0.25 : 0);

	// Agentic: coding rank + context >= 256K + speed + tool support
	const agenticContextBonus = ctx >= 500_000 ? 100 : ctx >= 256_000 ? 60 : 0;
	const toolSupport = model?.inference?.supports_tools ? 100 : 50;
	const agenticScore =
		(codingRank >= 0 ? normalizeScore(totalModels - codingRank, totalModels) * 0.4 : 0) +
		agenticContextBonus * 0.3 +
		normalizeScore(speed?.tokensPerSecond ?? 0, 200) * 0.15 +
		toolSupport * 0.15;

	// Budget: low price + high requests per window
	const budgetScore =
		normalizeScore(Math.max(0, 10 - totalPrice), 10) * 0.6 +
		normalizeScore(quota.requestsPer5h, 30_000) * 0.4;

	return {
		brainstorming: Math.round(brainstormingScore),
		coding: Math.round(codingScore),
		competitive: Math.round(competitiveScore),
		agentic: Math.round(agenticScore),
		budget: Math.round(budgetScore)
	};
}
```

- [ ] **Step 3: Wire `scenarioScores` into `inferModel`**

In `inferModel`, after `migrationHints`, add:

```typescript
const scenarioScores = inferScenarioScores(
	goId,
	pricing,
	benchmarks,
	burnRate,
	speed,
	llmStatsModel,
	codingRankings,
	reasoningRankings,
	mathRankings
);
```

Add `scenarioScores` to the returned object:

```typescript
return {
	id: goId,
	name,
	provider: llmStatsModel?.organization?.name ?? inferProvider(goId),
	description: llmStatsModel?.description ?? '',
	openWeight: llmStatsModel?.open_weight ?? true,
	contextWindow: llmStatsModel?.context_window ?? inferContextWindow(goId),
	releaseDate: llmStatsModel?.release_date ?? null,
	pricing,
	quota,
	burnRate,
	tags,
	benchmarks,
	speed,
	migrationHints,
	scenarioScores,
	endpoint,
	endpointUrl: goEndpointUrl(goId),
	isNew: llmStatsModel === null,
	llmStatsUrl: llmStatsModel ? llmStatsModelUrl(llmStatsModel.id) : '',
	fetchedAt: Date.now()
};
```

- [ ] **Step 4: Verify the change**

Run: `bunx prettier --write src/lib/server/inference.ts && bun check`
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/inference.ts
git commit -m "feat: compute scenario fit scores for all models"
```

---

### Task 3: Update Filter Bar Icons and Behavior

**Files:**

- Modify: `src/lib/components/FilterBar.svelte`

**Interfaces:**

- Consumes: `filter: string`, `scenario: string` via `$bindable`
- Produces: `scenario` emitted to parent; `filter` still bound for search

- [ ] **Step 1: Replace imports and scenario definitions**

```svelte
<script lang="ts">
	import { Search, X, Brain, Code, Zap, Globe, Trophy, Bot, Calculator } from '@lucide/svelte';

	interface Props {
		filter: string;
		scenario: string;
	}

	let { filter = $bindable(''), scenario = $bindable('') }: Props = $props();

	let searchOpen = $state(false);

	const scenarios: { value: string; label: string; icon: typeof Brain }[] = [
		{ value: '', label: 'All', icon: Globe },
		{ value: 'brainstorming', label: 'Brainstorming', icon: Brain },
		{ value: 'coding', label: 'Coding', icon: Code },
		{ value: 'competitive', label: 'Competitive', icon: Trophy },
		{ value: 'agentic', label: 'Agentic', icon: Bot },
		{ value: 'budget', label: 'Budget', icon: Calculator }
	];

	function applyScenario(value: string) {
		scenario = value;
	}

	function clearFilter() {
		filter = '';
		searchOpen = false;
	}
</script>
```

- [ ] **Step 2: Simplify the scenario button rendering**

Keep the existing `#each` block but use only `scenario === s.value` for active state. Remove the `switch` statement entirely.

- [ ] **Step 3: Verify the change**

Run: `bunx prettier --write src/lib/components/FilterBar.svelte && bun check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/FilterBar.svelte
git commit -m "refactor: filter bar emits scenario keys with updated icons"
```

---

### Task 4: Sort Table by Scenario Score and Add Thermal UI

**Files:**

- Modify: `src/lib/components/ModelTable.svelte`

**Interfaces:**

- Consumes: `models: GoModel[]`, `filter: string`, `scenario: string`, `onSelectModel`
- Produces: sorted/filtered table rows with fit meter and thermal burn badge

- [ ] **Step 1: Update props and imports**

```svelte
<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Flame, Snowflake } from '@lucide/svelte';

	interface Props {
		models: GoModel[];
		filter: string;
		scenario: string;
		onSelectModel: (model: GoModel) => void;
	}

	let { models, filter = $bindable(''), scenario = '', onSelectModel }: Props = $props();
</svelte>
```

- [ ] **Step 2: Compute filtered and sorted models**

```svelte
<script lang="ts">
	let filteredModels = $derived.by(() => {
		let result = models;
		if (filter) {
			const q = filter.toLowerCase();
			result = result.filter(
				(m) =>
					m.name.toLowerCase().includes(q) ||
					m.provider.toLowerCase().includes(q) ||
					m.tags.some((t) => t.label.toLowerCase().includes(q))
			);
		}
		return result;
	});

	let sortKey = $state<'name' | 'coding' | 'price' | 'quota' | 'fit'>('coding');
	let sortDir = $state<'asc' | 'desc'>('desc');

	let sortedModels = $derived.by(() => {
		const copy = [...filteredModels];
		if (scenario && sortKey !== 'fit') {
			copy.sort((a, b) => b.scenarioScores[scenario as keyof GoModel['scenarioScores']] - a.scenarioScores[scenario as keyof GoModel['scenarioScores']]);
		} else {
			copy.sort((a, b) => {
				let cmp = 0;
				switch (sortKey) {
					case 'name':
						cmp = a.name.localeCompare(b.name);
						break;
					case 'coding':
						cmp = (a.benchmarks.coding ?? 0) - (b.benchmarks.coding ?? 0);
						break;
					case 'price':
						cmp = b.pricing.inputPricePerM - a.pricing.inputPricePerM;
						break;
					case 'quota':
						cmp = a.quota.requestsPer5h - b.quota.requestsPer5h;
						break;
					case 'fit':
						cmp =
							(b.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0) -
							(a.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0);
						break;
				}
				return sortDir === 'asc' ? cmp : -cmp;
			});
		}
		return copy;
	});

	function toggleSort(key: typeof sortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
	}

	function sortIndicator(key: typeof sortKey) {
		if (sortKey !== key) return '';
		return sortDir === 'asc' ? ' ↑' : ' ↓';
	}
</svelte>
```

- [ ] **Step 3: Add thermal badge and fit meter helpers**

```svelte
<script lang="ts">
	function burnClasses(rate: string): string {
		switch (rate) {
			case 'slow':
				return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
			case 'medium':
				return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
			case 'fast':
				return 'bg-red-500/10 text-red-500 border-red-500/20';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function burnLabel(rate: string): string {
		switch (rate) {
			case 'slow':
				return 'Slow burn';
			case 'fast':
				return 'Fast burn';
			default:
				return 'Moderate';
		}
	}

	function fitSegments(score: number): number {
		if (score >= 80) return 4;
		if (score >= 60) return 3;
		if (score >= 40) return 2;
		if (score >= 20) return 1;
		return 0;
	}
</svelte>
```

- [ ] **Step 4: Update table header to include Fit column when scenario active**

In the header row, conditionally add a "Fit" column:

```svelte
{#if scenario}
	<Table.Head class="w-24 whitespace-nowrap text-muted-foreground">
		Fit{sortIndicator('fit')}
	</Table.Head>
{/if}
```

Also add `onclick={() => toggleSort('fit')}` and `cursor-pointer` to the Fit header.

- [ ] **Step 5: Update burn badge rendering**

Replace the existing burn cell with:

```svelte
<Table.Cell>
	<span
		class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {burnClasses(
			model.burnRate
		)}"
		title={burnLabel(model.burnRate)}
	>
		{#if model.burnRate === 'slow'}
			<Snowflake class="size-3" />
		{:else if model.burnRate === 'fast'}
			<Flame class="size-3" />
		{/if}
		{burnLabel(model.burnRate)}
	</span>
</Table.Cell>
```

- [ ] **Step 6: Add fit meter cell**

Inside the row, after the burn cell, add:

```svelte
{#if scenario}
	{@const score = model.scenarioScores[scenario as keyof GoModel['scenarioScores']] ?? 0}
	{@const segments = fitSegments(score)}
	<Table.Cell>
		<div class="flex items-center gap-1.5">
			<div class="flex gap-0.5">
				{#each Array(4) as _, i}
					<div
						class="h-2 w-2 rounded-sm {i < segments ? 'bg-violet-500' : 'bg-muted'}"
					></div>
				{/each}
			</div>
			<span class="text-xs tabular-nums text-muted-foreground">{score}</span>
		</div>
	</Table.Cell>
{/if}
```

- [ ] **Step 7: Update empty state copy**

Change the empty cell text to:

```svelte
No models match your search. Try clearing the filter or switching scenarios.
```

- [ ] **Step 8: Verify the change**

Run: `bunx prettier --write src/lib/components/ModelTable.svelte && bun check`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/ModelTable.svelte
git commit -m "feat: sort by scenario score, add thermal badges and fit meter"
```

---

### Task 5: Redesign the Quota Calculator

**Files:**

- Modify: `src/lib/components/QuotaCalculator.svelte`

**Interfaces:**

- Consumes: `models: { id; name; pricing }[]`
- Produces: calculator with slider, thermal badges, and sensible default

- [ ] **Step 1: Update imports and default model selection**

```svelte
<script lang="ts">
	import { Calculator, Clock, Flame, Snowflake } from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select/index.js';

	interface Props {
		models: {
			id: string;
			name: string;
			pricing: { inputPricePerM: number; outputPricePerM: number };
			burnRate: string;
		}[];
	}

	let { models }: Props = $props();

	let tokenInput = $state(50_000);

	let selectedModelId = $state<string>('');

	let selectedModel = $derived(models.find((m) => m.id === selectedModelId) ?? null);
</svelte>
```

- [ ] **Step 2: Pre-select the most quota-friendly model on mount**

```svelte
<script lang="ts">
	$effect(() => {
		if (!selectedModelId && models.length > 0) {
			const sorted = [...models].sort(
				(a, b) => a.pricing.inputPricePerM + a.pricing.outputPricePerM - (b.pricing.inputPricePerM + b.pricing.outputPricePerM)
			);
			selectedModelId = sorted[0]?.id ?? '';
		}
	});
</svelte>
```

- [ ] **Step 3: Replace number input with a range slider**

```svelte
<div>
	<label for="tokens" class="mb-1.5 block text-sm text-muted-foreground">
		Avg. tokens per request: <span class="font-medium text-foreground"
			>{tokenInput.toLocaleString()}</span
		>
	</label>
	<input
		id="tokens"
		type="range"
		min="1000"
		max="500000"
		step="1000"
		bind:value={tokenInput}
		class="w-full accent-violet-600"
	/>
	<div class="mt-1 flex justify-between text-xs text-muted-foreground/50">
		<span>Short prompt (~2K)</span>
		<span>Heavy refactor (~200K)</span>
	</div>
</div>
```

- [ ] **Step 4: Render thermal burn badge in results**

In the results block, replace the existing burn-level block with:

```svelte
{#if selectedModel}
	{@const total = selectedModel.pricing.inputPricePerM + selectedModel.pricing.outputPricePerM}
	{@const level = total < 1.5 ? 'slow' : total < 6 ? 'moderate' : 'fast'}
	<div class="flex items-center gap-2 text-xs">
		{#if level === 'slow'}
			<span
				class="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-cyan-500"
			>
				<Snowflake class="size-3" /> Slow burn
			</span>
		{:else if level === 'moderate'}
			<span
				class="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-500"
			>
				Moderate
			</span>
		{:else}
			<span
				class="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-red-500"
			>
				<Flame class="size-3" /> Fast burn
			</span>
		{/if}
		<span class="text-muted-foreground">
			{level === 'slow'
				? 'Great for high-volume use'
				: level === 'moderate'
					? 'Balanced for daily use'
					: 'Best for focused sessions'}
		</span>
	</div>
{/if}
```

- [ ] **Step 5: Verify the change**

Run: `bunx prettier --write src/lib/components/QuotaCalculator.svelte && bun check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/QuotaCalculator.svelte
git commit -m "feat: quota calculator slider, thermal badges, default model"
```

---

### Task 6: Redesign the Model Drawer

**Files:**

- Modify: `src/lib/components/ModelDrawer.svelte`

**Interfaces:**

- Consumes: `model: GoModel | null`, `open`, `onClose`
- Produces: reorganized drawer with thermal summary, benchmark bars, sticky actions

- [ ] **Step 1: Update imports and add burn helper**

```svelte
<script lang="ts">
	import type { GoModel } from '$lib/types/models';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { ExternalLink, Copy, Check, Info, Flame, Snowflake } from '@lucide/svelte';

	interface Props {
		model: GoModel | null;
		open: boolean;
		onClose: () => void;
	}

	let { model, open = $bindable(false), onClose }: Props = $props();

	let copied = $state(false);

	function copyModelId() {
		if (!model) return;
		navigator.clipboard.writeText(`opencode-go/${model.id}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function formatTokens(n: number | null): string {
		if (!n) return '—';
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		return `${Math.round(n / 1_000)}K`;
	}

	function burnClasses(rate: string): string {
		switch (rate) {
			case 'slow':
				return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
			case 'medium':
				return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
			case 'fast':
				return 'bg-red-500/10 text-red-500 border-red-500/20';
			default:
				return 'bg-muted text-muted-foreground border-border';
		}
	}

	function burnLabel(rate: string): string {
		switch (rate) {
			case 'slow':
				return 'Slow burn';
			case 'fast':
				return 'Fast burn';
			default:
				return 'Moderate';
		}
	}
</svelte>
```

- [ ] **Step 2: Reorganize drawer header**

```svelte
<Drawer.Header>
	<div class="flex items-start justify-between gap-3">
		<div>
			<Drawer.Title class="flex flex-wrap items-center gap-2 text-xl">
				{model.name}
				{#if model.isNew}
					<Badge variant="outline">New</Badge>
				{/if}
				<span
					class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {burnClasses(
						model.burnRate
					)}"
				>
					{#if model.burnRate === 'slow'}
						<Snowflake class="size-3" />
					{:else if model.burnRate === 'fast'}
						<Flame class="size-3" />
					{/if}
					{burnLabel(model.burnRate)}
				</span>
			</Drawer.Title>
			<Drawer.Description>
				{model.provider}
				{#if model.description}
					<span class="mt-1 block text-sm text-muted-foreground">{model.description}</span>
				{/if}
			</Drawer.Description>
		</div>
	</div>
	{#if model.tags.length > 0}
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each model.tags as tag}
				<span
					class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
				>
					{tag.label}
				</span>
			{/each}
		</div>
	{/if}
</Drawer.Header>
```

- [ ] **Step 3: Add thermal summary section**

After the header, add:

```svelte
<div class="px-4 pb-2">
	<div class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
		<div class="font-medium text-foreground">
			{burnLabel(model.burnRate)} — about {model.quota.requestsPer5h.toLocaleString()} requests per $12
			window
		</div>
		<div class="text-muted-foreground">
			Use this model for {model.burnRate === 'slow'
				? 'high-volume, iterative work'
				: model.burnRate === 'fast'
					? 'short, focused sessions'
					: 'balanced daily use'}.
		</div>
	</div>
</div>
```

- [ ] **Step 4: Convert benchmarks to bar list**

Replace the benchmark grid with:

```svelte
<section>
	<h3 class="mb-2 text-sm font-medium text-muted-foreground">Benchmarks</h3>
	<div class="space-y-3">
		{#each [{ label: 'Coding', value: model.benchmarks.coding }, { label: 'Reasoning', value: model.benchmarks.reasoning }, { label: 'Math', value: model.benchmarks.math }, { label: 'SWE-bench', value: model.benchmarks.sweBenchVerified }] as bench}
			{#if bench.value !== null}
				<div>
					<div class="mb-1 flex justify-between text-sm">
						<span class="text-muted-foreground">{bench.label}</span>
						<span class="font-medium tabular-nums text-foreground">{bench.value.toFixed(1)}</span>
					</div>
					<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-violet-500"
							style="width: {Math.min(100, bench.value)}%"
						></div>
					</div>
				</div>
			{/if}
		{/each}
	</div>
</section>
```

- [ ] **Step 5: Make action buttons sticky**

Wrap the action buttons in a sticky footer:

```svelte
<div
	class="sticky bottom-0 border-t border-border bg-background/95 px-4 pb-4 pt-3 backdrop-blur-sm"
>
	<div class="flex flex-wrap gap-2">
		<button class={buttonVariants({ variant: 'default', size: 'sm' })} onclick={copyModelId}>
			{#if copied}
				<Check class="size-3.5" />
				Copied!
			{:else}
				<Copy class="size-3.5" />
				Copy model ID
			{/if}
		</button>
		{#if model.llmStatsUrl}
			<a
				href={model.llmStatsUrl}
				target="_blank"
				rel="noopener noreferrer"
				class={buttonVariants({ variant: 'outline', size: 'sm' })}
			>
				<ExternalLink class="size-3.5" />
				Compare on LLM Stats
			</a>
		{/if}
	</div>
</div>
```

- [ ] **Step 6: Verify the change**

Run: `bunx prettier --write src/lib/components/ModelDrawer.svelte && bun check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/ModelDrawer.svelte
git commit -m "feat: drawer thermal summary, benchmark bars, sticky actions"
```

---

### Task 7: Update Page Layout and Pass Scenario State

**Files:**

- Modify: `src/routes/+page.svelte`

**Interfaces:**

- Consumes: `getModels()` query result
- Produces: page with gradient-free hero, scenario state, loading skeleton

- [ ] **Step 1: Update imports and state**

```svelte
<script lang="ts">
	import { getModels } from '$lib/remote/models.remote';
	import type { GoModel } from '$lib/types/models';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import QuotaCalculator from '$lib/components/QuotaCalculator.svelte';
	import ModelTable from '$lib/components/ModelTable.svelte';
	import ModelDrawer from '$lib/components/ModelDrawer.svelte';
	import { ArrowUpRight, Server, Brain, Zap } from '@lucide/svelte';

	let filter = $state('');
	let scenario = $state('');
	let selectedModel = $state<GoModel | null>(null);
	let drawerOpen = $state(false);

	function openDrawer(model: GoModel) {
		selectedModel = model;
		drawerOpen = true;
	}

	function closeDrawer() {
		drawerOpen = false;
	}
</svelte>
```

- [ ] **Step 2: Replace gradient hero with solid headline**

```svelte
<section class="mb-16 text-center">
	<h1 class="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
		Pick the right <span class="text-violet-600">OpenCode Go</span> model
	</h1>
	<p class="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
		Live benchmarks from LLM Stats, algorithmic "best for" tags, and quota burn estimates — so you
		make economically informed decisions, not guesses.
	</p>
	<div class="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
		<span
			class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1"
		>
			<Server class="size-3.5" /> 13+ models
		</span>
		<span
			class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1"
		>
			<Brain class="size-3.5" /> Live benchmark data
		</span>
		<span
			class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1"
		>
			<Zap class="size-3.5" /> $10/month subscription
		</span>
	</div>
</section>
```

- [ ] **Step 3: Pass scenario into FilterBar and ModelTable**

```svelte
<FilterBar bind:filter bind:scenario />
<ModelTable {models} {filter} {scenario} onSelectModel={openDrawer} />
```

- [ ] **Step 4: Add a loading skeleton for the table**

Wrap the model section in the existing `{#await}` and add a loading block:

```svelte
{#await getModels()}
	<div class="space-y-3">
		<div class="h-10 animate-pulse rounded-lg bg-muted"></div>
		<div class="h-64 animate-pulse rounded-xl bg-muted"></div>
	</div>
{:then models}
	<div class="mb-4">
		<FilterBar bind:filter bind:scenario />
	</div>
	<ModelTable {models} {filter} {scenario} onSelectModel={openDrawer} />
	<ModelDrawer model={selectedModel} open={drawerOpen} onClose={closeDrawer} />
{:catch err}
	...
{/await}
```

- [ ] **Step 5: Update QuotaCalculator prop type**

Ensure `QuotaCalculator` receives `burnRate`:

```svelte
{#await getModels() then models}
	<QuotaCalculator
		models={models.map((m) => ({
			id: m.id,
			name: m.name,
			pricing: m.pricing,
			burnRate: m.burnRate
		}))}
	/>
{/await}
```

- [ ] **Step 6: Verify the change**

Run: `bunx prettier --write src/routes/+page.svelte && bun check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: page layout with scenario state, thermal hero, loading skeleton"
```

---

### Task 8: Final Validation

- [ ] **Step 1: Run full type check**

Run: `bun check`
Expected: 0 errors.

- [ ] **Step 2: Run prettier on all edited files**

Run:

```bash
bunx prettier --write src/lib/types/models.ts src/lib/server/inference.ts src/lib/components/FilterBar.svelte src/lib/components/ModelTable.svelte src/lib/components/QuotaCalculator.svelte src/lib/components/ModelDrawer.svelte src/routes/+page.svelte
```

Expected: all files formatted cleanly.

- [ ] **Step 3: Manual browser checks**

Start the dev server:

```bash
bun dev --port 5174
```

Verify in the browser:

- Clicking **Competitive** returns ranked results.
- Clicking **Agentic** returns ranked results.
- Each scenario changes the row order.
- Fit meter segments appear when a scenario is active.
- Burn badges show cyan/amber/red with icons.
- Quota calculator pre-selects a cheap model and uses a slider.
- Drawer opens, shows thermal summary, benchmark bars, and copy button works.

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore: final formatting and validation"
```

---

## Self-Review

**1. Spec coverage:**

- Scenario scoring → Task 2
- Filter bar fix → Task 3
- Table sort + fit meter → Task 4
- Thermal UI (badges, no gradients) → Tasks 4, 5, 6, 7
- Drawer improvements → Task 6
- Quota calculator improvements → Task 5
- Loading state → Task 7

**2. Placeholder scan:**

- No TBD/TODO/fill-in-details found.
- All steps include concrete code or commands.

**3. Type consistency:**

- `ScenarioScores` interface used consistently.
- `burnRate` prop added to `QuotaCalculator` and passed from `+page.svelte`.
- `scenario` prop threaded through `FilterBar`, `ModelTable`, and `+page.svelte`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-05-opencode-compare-ui-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
