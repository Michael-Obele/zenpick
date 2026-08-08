<script lang="ts">
	import { MIGRATION_BAND, GAP_BANDS } from '$lib/migration';
	import type { GoModel, FrontierCandidate } from '$lib/types/models';

	interface Props {
		models: GoModel[];
		frontier: FrontierCandidate[];
		/** Unix ms — candidates released before this are excluded from comparisons. */
		cutoff: number;
	}

	let { models, frontier, cutoff }: Props = $props();

	const CATS = [
		{ key: 'coding', label: 'Coding' },
		{ key: 'reasoning', label: 'Reasoning' },
		{ key: 'math', label: 'Math' }
	] as const;

	type CatKey = (typeof CATS)[number]['key'];

	// Default to the first open-weight model with hints — the interesting case.
	// Computed once at init inside a closure (props are static after load), so
	// the $state initializer never captures a reactive reference to `models`.
	const DEFAULT_ID = (() => {
		const m = models.find((m) => m.openWeight && m.migrationHints.length > 0) ?? models[0] ?? null;
		return m?.id ?? '';
	})();
	let selectedId = $state(DEFAULT_ID);

	const selected = $derived(models.find((m) => m.id === selectedId) ?? null);

	type Tone = 'way-below' | 'below' | 'just-below' | 'par' | 'just-above' | 'above' | 'way-above';

	interface Relation {
		word: string;
		tone: Tone;
	}

	/**
	 * Describe the Go model's standing vs a frontier model on one capability,
	 * on the 0–100 blended scale:
	 * - |gap| <= 4            → "on par"
	 * - 4 < |gap| <= BAND     → "just below / just above" (still replaceable)
	 * - BAND < |gap| <= 25    → "below / above"
	 * - |gap| > 25            → "way below / way above"
	 */
	function relation(go: number | null, theirs: number | null): Relation | null {
		if (go == null || theirs == null) return null;
		const gap = go - theirs;
		const abs = Math.abs(gap);
		if (abs <= 4) return { word: 'on par', tone: 'par' };
		if (abs <= MIGRATION_BAND) {
			return gap > 0
				? { word: 'just above', tone: 'just-above' }
				: { word: 'just below', tone: 'just-below' };
		}
		if (abs <= GAP_BANDS.moderate) {
			return gap > 0 ? { word: 'above', tone: 'above' } : { word: 'below', tone: 'below' };
		}
		return gap > 0
			? { word: 'way above', tone: 'way-above' }
			: { word: 'way below', tone: 'way-below' };
	}

	interface Row {
		id: string;
		name: string;
		org: string;
		releaseDate: string | null;
		cats: {
			key: CatKey;
			label: string;
			go: number | null;
			theirs: number | null;
			rel: Relation | null;
		}[];
		/** Categories the hint algorithm would claim for this frontier model. */
		comparable: CatKey[];
		minAbsGap: number | null;
	}

	const rows = $derived.by<Row[]>(() => {
		if (!selected) return [];
		const out: Row[] = [];
		for (const fm of frontier) {
			// Same model as the selected Go model — it is a "replaced" target,
			// not a peer; the algorithm skips it too.
			if (fm.id === selected.llmStatsId) continue;
			const cats = CATS.map((c) => {
				const go = selected.benchmarks[c.key];
				const theirs = fm.benchmarks[c.key];
				return { key: c.key, label: c.label, go, theirs, rel: relation(go, theirs) };
			});
			const comparable = cats
				.filter(
					(c) => c.go != null && c.theirs != null && Math.abs(c.go - c.theirs) <= MIGRATION_BAND
				)
				.map((c) => c.key);
			const minAbsGap = cats.reduce<number | null>((acc, c) => {
				if (c.go == null || c.theirs == null) return acc;
				const g = Math.abs(c.go - c.theirs);
				return acc == null ? g : Math.min(acc, g);
			}, null);
			out.push({
				id: fm.id,
				name: fm.name,
				org: fm.organization?.name ?? '?',
				releaseDate: fm.releaseDate,
				cats,
				comparable,
				minAbsGap
			});
		}
		// Closest candidates first: most comparable categories, then smallest gap.
		out.sort((a, b) => {
			const byCount = b.comparable.length - a.comparable.length;
			if (byCount !== 0) return byCount;
			return (a.minAbsGap ?? Infinity) - (b.minAbsGap ?? Infinity);
		});
		return out;
	});

	const cutoffLabel = $derived(
		new Date(cutoff).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		})
	);

	const toneClasses: Record<Tone, string> = {
		'way-below': 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
		below: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
		'just-below': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
		par: 'border-primary/40 bg-primary/10 text-primary',
		'just-above': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
		above: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
		'way-above': 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
	};

	const TONE_ORDER: Tone[] = [
		'way-below',
		'below',
		'just-below',
		'par',
		'just-above',
		'above',
		'way-above'
	];
	const TONE_WORDS: Record<Tone, string> = {
		'way-below': 'way below',
		below: 'below',
		'just-below': 'just below',
		par: 'on par',
		'just-above': 'just above',
		above: 'above',
		'way-above': 'way above'
	};

	function sentence(c: Row['cats'][number]): string {
		if (!selected || !c.rel) return '';
		return `${selected.name} is ${c.rel.word} ${c.label} (${c.go?.toFixed(1)} vs ${c.theirs?.toFixed(1)})`;
	}
</script>

<h2 class="mb-4 text-lg font-semibold text-foreground">Compare Logic</h2>
<p class="mb-4 text-sm text-muted-foreground">
	Pick a Go model and see how it stacks against every recent closed-source frontier model, per
	capability, on the blended 0–100 scale. The "Comparable" column mirrors the Replaces algorithm —
	categories whose scores fall within the {MIGRATION_BAND}-point band.
</p>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<label for="compare-logic-select" class="text-sm font-medium text-foreground">Go model</label>
	<select
		id="compare-logic-select"
		bind:value={selectedId}
		class="max-w-md rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
	>
		{#each models as m (m.id)}
			<option value={m.id}>
				{m.name}{m.openWeight ? '' : ' (closed)'}{m.migrationHints.length ? '' : ' · no hints'}
			</option>
		{/each}
	</select>
	<span class="text-xs text-muted-foreground">
		Recency window: only models released after
		<span class="font-medium text-foreground">{cutoffLabel}</span> are compared — older generations are
		excluded so the matchups stay peer-to-peer.
	</span>
</div>

{#if selected}
	<!-- Selected model summary -->
	<div class="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
		<div class="mb-1 flex flex-wrap items-center gap-2">
			<span class="font-semibold text-foreground">{selected.name}</span>
			{#if selected.openWeight}
				<span
					class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
				>
					open-weight
				</span>
			{:else}
				<span
					class="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
				>
					closed
				</span>
			{/if}
			<span class="text-xs text-muted-foreground">
				Blended scores — Coding {selected.benchmarks.coding ?? '—'} · Reasoning
				{selected.benchmarks.reasoning ?? '—'} · Math {selected.benchmarks.math ?? '—'}
			</span>
		</div>
		{#if selected.migrationHints.length}
			<div class="text-xs text-muted-foreground">
				<span class="font-medium text-foreground">Currently replaces:</span>
				{selected.migrationHints.map((h) => `${h.model} (${h.reason})`).join(' · ')}
			</div>
		{:else if !selected.openWeight}
			<div class="text-xs text-muted-foreground">
				<span class="font-medium text-foreground">Closed-source model:</span> no open alternative to compare
				— it is a replacement target, not an alternative.
			</div>
		{:else}
			<div class="text-xs text-muted-foreground">
				<span class="font-medium text-foreground">Currently replaces:</span> nothing — no frontier
				model is within the {MIGRATION_BAND}-point band.
			</div>
		{/if}
	</div>

	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm">
			<thead>
				<tr class="border-b border-border text-muted-foreground">
					<th class="p-2 font-medium">Frontier model</th>
					<th class="p-2 font-medium">Org</th>
					<th class="p-2 font-medium">Released</th>
					{#each CATS as c (c.key)}
						<th class="p-2 font-medium">{c.label}</th>
					{/each}
					<th class="p-2 font-medium">Comparable</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr class="border-b border-border/50 align-top hover:bg-muted/30">
						<td class="p-2 font-medium text-foreground">{row.name}</td>
						<td class="p-2 text-xs text-muted-foreground">{row.org}</td>
						<td class="p-2 text-xs text-muted-foreground">
							{row.releaseDate
								? new Date(row.releaseDate).toLocaleDateString(undefined, {
										year: 'numeric',
										month: 'short'
									})
								: 'unknown'}
						</td>
						{#each row.cats as c (c.key)}
							<td class="p-2">
								{#if c.rel}
									<div class="flex items-center gap-1 text-xs tabular-nums">
										<span class="text-foreground">{c.go?.toFixed(1)}</span>
										<span class="text-muted-foreground/60">vs</span>
										<span class="text-muted-foreground">{c.theirs?.toFixed(1)}</span>
									</div>
									<span
										class="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium {toneClasses[
											c.rel.tone
										]}"
										title={sentence(c)}
									>
										{c.rel.word}
									</span>
								{:else}
									<span class="text-xs text-muted-foreground/40">—</span>
								{/if}
							</td>
						{/each}
						<td class="p-2">
							{#if row.comparable.length}
								<span class="text-xs font-medium text-foreground">
									{row.comparable.map((k) => CATS.find((c) => c.key === k)?.label).join(' · ')}
								</span>
							{:else}
								<span class="text-xs text-muted-foreground/40">—</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Legend -->
	<div class="mt-4 flex flex-wrap items-center gap-2">
		<span class="text-[11px] uppercase tracking-wide text-muted-foreground">Go model is…</span>
		{#each TONE_ORDER as tone (tone)}
			<span
				class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium {toneClasses[
					tone
				]}"
			>
				{TONE_WORDS[tone]}
			</span>
		{/each}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">No models available to compare.</p>
{/if}
