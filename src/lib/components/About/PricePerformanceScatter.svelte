<script lang="ts">
	import { ScatterChart } from 'layerchart';
	import { scaleLinear } from 'd3-scale';
	import { scaleSymlog } from 'd3-scale';
	import type { ComponentProps } from 'svelte';
	import type { BurnBand, GoModel } from '$lib/types/models';
	import {
		BURN_BAND_COLOR,
		BURN_BAND_LABEL,
		BURN_BAND_ORDER,
		pricePerformanceStats,
		type PricePerfPoint,
		type XMode
	} from '$lib/price-performance';
	import { readableTicks, type PositionScale } from '$lib/components/chart-ticks';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Flame, DollarSign } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	type ChartAnnotations = NonNullable<ComponentProps<typeof ScatterChart>['annotations']>;

	interface Props {
		models: GoModel[];
	}

	let { models }: Props = $props();

	/**
	 * The price axis is HEAVILY skewed: the median Go model costs $1.50 per 1M
	 * tokens while the most expensive one costs $24. On a linear axis 21 of the
	 * 23 scorable models collapse into the leftmost ~6% of the plot, which
	 * reads as one tight clump instead of a field.
	 *
	 * A symmetric-log scale compresses that range. It is used instead of a
	 * plain square-root scale because it is ALSO defined for negative inputs,
	 * which lets the domain start just below zero — the plot's clip path IS
	 * the domain, so a dot sitting exactly on the domain edge is sliced in
	 * half, and the free ($0) models would otherwise be cut off.
	 *
	 * Created ONCE at module scope: layerchart copies the scale before mutating
	 * it (`createScale` -> `scale.copy()`), so a shared instance is safe.
	 */
	const PRICE_SCALE = scaleSymlog([0, 1]);
	const BURN_SCALE = scaleLinear([0, 100]);

	/**
	 * Which cost axis is shown. Burn is the default — it is the more
	 * discriminating axis for a quota-based plan (price and burn correlate
	 * but are not identical; free models are $0 yet burn nothing).
	 */
	let xMode = $state<XMode>('burn');

	/**
	 * The burn band to isolate, or `null` for "show every band".
	 *
	 * This is the chart's "highlight" gesture: one click narrows 23 dots to
	 * the handful that share a burn profile, which is the fastest way to see
	 * whether a cheap band is also a strong one.
	 */
	let focusBand = $state<BurnBand | null>(null);

	const BAND_COLOR = BURN_BAND_COLOR;

	const chartData = $derived.by(() => {
		const points: PricePerfPoint[] = [];
		for (const m of models) {
			const input = m.pricing.inputPricePerM;
			const output = m.pricing.outputPricePerM;
			const coding = m.benchmarks.coding;
			if (input == null || output == null || coding == null) continue;
			points.push({
				name: m.name,
				provider: m.provider,
				totalPrice: input + output,
				codingScore: coding,
				burnScore: m.burnDetails?.score ?? 0,
				band: m.burnDetails?.band ?? 'moderate'
			});
		}
		return points.sort((a, b) => a.totalPrice - b.totalPrice);
	});

	/** Medians, quadrants, and the model that best represents the sweet spot. */
	const stats = $derived(pricePerformanceStats(chartData, xMode));

	const bandCounts = $derived.by(() => {
		const counts: Partial<Record<BurnBand, number>> = {};
		for (const p of chartData) counts[p.band] = (counts[p.band] ?? 0) + 1;
		return counts;
	});

	const chartConfig = {
		free: { label: 'Free', color: 'var(--burn-free)' },
		excellent: { label: 'Excellent', color: 'var(--burn-excellent)' },
		good: { label: 'Good', color: 'var(--burn-good)' },
		moderate: { label: 'Moderate', color: 'var(--burn-moderate)' },
		high: { label: 'High', color: 'var(--burn-high)' },
		extreme: { label: 'Extreme', color: 'var(--burn-extreme)' }
	} satisfies Chart.ChartConfig;

	/**
	 * The price domain, with headroom on BOTH ends.
	 *
	 * The plot's clip path is exactly the domain, so a dot at the domain
	 * extreme is cut in half. The negative floor pulls the free ($0) models
	 * off the left edge; the 12% headroom does the same for the most
	 * expensive model on the right.
	 */
	const priceDomain = $derived.by((): [number, number] => {
		const prices = chartData.map((p) => p.totalPrice);
		const max = prices.length ? Math.max(...prices) : 1;
		return [-(max * 0.02), max * 1.12];
	});

	/** Burn domain is inverted: 100 (efficient) on the left, 0 (wasteful) on the right. */
	const burnDomain: [number, number] = [102, -2];

	const xProp = $derived(xMode === 'price' ? 'totalPrice' : 'burnScore');
	const xScale = $derived(xMode === 'price' ? PRICE_SCALE : BURN_SCALE);
	const xDomain = $derived(xMode === 'price' ? priceDomain : burnDomain);

	/** Model name -> point, so the tooltip can name the dot under the cursor. */
	const pointsByName = $derived(new Map(chartData.map((p) => [p.name, p])));

	// Build per-model series for individual point coloring
	const series = $derived(
		chartData.map((p) => {
			const isBest = stats?.bestValue?.name === p.name;
			const dimmed = focusBand !== null && focusBand !== p.band;
			return {
				key: p.name,
				label: p.name,
				color: BAND_COLOR[p.band],
				data: [p],
				props: {
					// `opacity`, not a class: LayerChart's Points mark spreads the
					// series props and THEN overwrites `class` with its own layer
					// class, so a Tailwind `opacity-*` class never reaches the DOM.
					opacity: dimmed ? 0.2 : 1,
					r: isBest ? 7 : 5,
					stroke: isBest ? 'var(--background)' : undefined,
					strokeWidth: isBest ? 2 : undefined
				}
			};
		})
	);

	/**
	 * The chart's reference marks — all four quadrants, even when some are
	 * empty, plus median crosshairs and the best-value ring.
	 *
	 * `layer: 'below'` puts washes behind the dots, `layer: 'above'` puts the
	 * ring in front. The quadrants tile the chart exactly (no overlap except
	 * at the median lines), but we still show all four so the reader can see
	 * where every model sits.
	 */
	const annotations = $derived.by((): ChartAnnotations => {
		if (!stats) return [];

		const medianX = xMode === 'price' ? stats.medianPrice : stats.medianBurn;
		const list: ChartAnnotations = [
			// Median crosshairs
			{
				type: 'line',
				x: medianX,
				label: '',
				props: { line: { stroke: 'var(--border)', 'stroke-dasharray': '4 4', strokeWidth: 1 } }
			},
			{
				type: 'line',
				y: stats.medianScore,
				label: '',
				props: { line: { stroke: 'var(--border)', 'stroke-dasharray': '4 4', strokeWidth: 1 } }
			},
			// Sweet spot — top-left: cheap/efficient + capable
			{
				type: 'range',
				layer: 'below',
				x: [null, medianX],
				y: [stats.medianScore, null],
				fill: 'var(--primary)',
				label: 'Sweet spot',
				labelPlacement: 'top-left',
				labelXOffset: 10,
				labelYOffset: 2,
				props: {
					rect: {
						fillOpacity: 0.07,
						stroke: 'var(--primary)',
						strokeOpacity: 0.35,
						strokeWidth: 1,
						class: '[stroke-dasharray:5_4]'
					},
					label: { fill: 'var(--annotation-label)', 'font-weight': '600' }
				}
			},
			// Premium — top-right: expensive/wasteful + capable
			{
				type: 'range',
				layer: 'below',
				x: [medianX, null],
				y: [stats.medianScore, null],
				fill: 'var(--color-amber-500)',
				label: 'Premium',
				labelPlacement: 'top-right',
				labelXOffset: 8,
				labelYOffset: 2,
				props: {
					rect: {
						fillOpacity: 0.05,
						stroke: 'var(--color-amber-500)',
						strokeOpacity: 0.25,
						strokeWidth: 1,
						class: '[stroke-dasharray:5_4]'
					},
					label: { fill: 'var(--color-amber-600)', 'font-weight': '500' }
				}
			},
			// Budget — bottom-left: cheap/efficient + weak
			{
				type: 'range',
				layer: 'below',
				x: [null, medianX],
				y: [null, stats.medianScore],
				fill: 'var(--muted-foreground)',
				label: 'Budget',
				labelPlacement: 'bottom-left',
				labelXOffset: 10,
				labelYOffset: 2,
				props: {
					rect: {
						fillOpacity: 0.04,
						stroke: 'var(--muted-foreground)',
						strokeOpacity: 0.2,
						strokeWidth: 1,
						class: '[stroke-dasharray:5_4]'
					},
					label: { fill: 'var(--muted-foreground)', 'font-weight': '500' }
				}
			},
			// Avoid — bottom-right: expensive/wasteful + weak
			{
				type: 'range',
				layer: 'below',
				x: [medianX, null],
				y: [null, stats.medianScore],
				fill: 'var(--color-red-500)',
				label: 'Avoid',
				labelPlacement: 'bottom-right',
				labelXOffset: 8,
				labelYOffset: 2,
				props: {
					rect: {
						fillOpacity: 0.05,
						stroke: 'var(--color-red-500)',
						strokeOpacity: 0.25,
						strokeWidth: 1,
						class: '[stroke-dasharray:5_4]'
					},
					label: { fill: 'var(--color-red-500)', 'font-weight': '500' }
				}
			}
		];

		const best = stats.bestValue;
		if (best) {
			const bx = xMode === 'price' ? best.totalPrice : best.burnScore;
			list.push({
				type: 'point',
				layer: 'above',
				x: bx,
				y: best.codingScore,
				r: 12,
				label: 'Best value',
				labelPlacement: 'top',
				props: {
					circle: {
						fill: 'none',
						stroke: 'var(--annotation-label)',
						strokeOpacity: 0.9,
						strokeWidth: 1.5
					},
					label: { fill: 'var(--annotation-label)' }
				}
			});
		}

		return list;
	});
</script>

<Card.Root class="ring-2 ring-primary/25">
	<Card.Header>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<Card.Title class="flex flex-wrap items-center gap-2.5">
					{xMode === 'burn' ? 'Burn vs. Performance' : 'Price vs. Performance'}
					<span
						class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.16em] text-primary uppercase dark:text-primary-strong"
					>
						Start here
					</span>
				</Card.Title>
				<Card.Description class="mt-1.5">
					{xMode === 'burn'
						? 'Efficient burn, high score — find the sweet spot for your quota'
						: "Cheaper isn't always worse — find the sweet spot for your workload"}
				</Card.Description>
			</div>
			<div
				class="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5"
			>
				<DollarSign
					class="size-3.5 {xMode === 'price' ? 'text-foreground' : 'text-muted-foreground/50'}"
				/>
				<Switch
					id="x-mode"
					checked={xMode === 'burn'}
					onCheckedChange={(v) => (xMode = v ? 'burn' : 'price')}
					aria-label="Toggle between burn score and price"
				/>
				<Flame
					class="size-3.5 {xMode === 'burn' ? 'text-foreground' : 'text-muted-foreground/50'}"
				/>
				<Label for="x-mode" class="cursor-pointer text-xs font-medium">
					{xMode === 'burn' ? 'Burn score' : 'Price'}
				</Label>
			</div>
		</div>
	</Card.Header>
	<Card.Content>
		<!-- The legend doubles as a filter: one click isolates a burn band. -->
		<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
			<span
				class="font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase"
			>
				Burn band
			</span>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each BURN_BAND_ORDER as band (band)}
					{@const count = bandCounts[band] ?? 0}
					{#if count > 0}
						<button
							type="button"
							title="Show only {BURN_BAND_LABEL[band]} models"
							aria-pressed={focusBand === band}
							onclick={() => (focusBand = focusBand === band ? null : band)}
							class={cn(
								'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
								focusBand === band
									? 'border-primary/50 bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
								focusBand !== null && focusBand !== band && 'opacity-50'
							)}
						>
							<span
								class="size-2 shrink-0 rounded-full"
								style="background-color: {BAND_COLOR[band]}"
								aria-hidden="true"
							></span>
							{BURN_BAND_LABEL[band]}
							<span class="font-mono tabular-nums opacity-70">{count}</span>
						</button>
					{/if}
				{/each}
			</div>
			{#if focusBand}
				<button
					type="button"
					class="text-xs text-primary underline-offset-4 hover:underline dark:text-primary-strong"
					onclick={() => (focusBand = null)}
				>
					Show all
				</button>
			{/if}
		</div>

		<!-- `aspect-auto` drops the container's default 16:9 ratio so the
		     explicit chart height governs — the ratio made the card's height
		     depend on its width. -->
		<Chart.Container config={chartConfig} class="aspect-auto">
			{#if chartData.length}
				<ScatterChart
					data={chartData}
					x={xProp}
					y="codingScore"
					{xScale}
					{xDomain}
					xNice={false}
					height={520}
					padding={{ top: 8, right: 14, bottom: 44, left: 26 }}
					{annotations}
					props={{
						xAxis: {
							label: xMode === 'price' ? 'Price / 1M tokens' : 'Burn score',
							format:
								xMode === 'price'
									? (d: number) => (d < 0 ? '$0.00' : `$${d.toFixed(2)}`)
									: (d: number) => d.toFixed(0),
							// The compressed price scale crowds the HIGH end, so
							// the tick COUNT is chosen from the scale's own
							// pixel positions instead of a fixed number.
							ticks:
								xMode === 'price'
									? (scale) => readableTicks(scale as unknown as PositionScale)
									: undefined
						},
						yAxis: {
							// No axis label here: layerchart anchors a LEFT-axis
							// label at the same offset as the tick labels, so the
							// two always overlap. The footer names this axis
							// instead.
							format: (d: number) => d.toFixed(0)
						},
						highlight: { points: { r: 6 } }
					}}
					{series}
				>
					{#snippet tooltip()}
						<Chart.Tooltip labelFormatter={(_value, payload) => payload[0]?.label ?? ''}>
							{#snippet formatter({ item })}
								{@const point = pointsByName.get(item.label)}
								<div class="grid w-full gap-1">
									{#if point}
										<div class="flex items-center gap-1.5">
											<span
												class="size-2.5 shrink-0 rounded-xs"
												style="background-color: {BAND_COLOR[point.band]}"
												aria-hidden="true"
											></span>
											<span class="text-muted-foreground">
												{BURN_BAND_LABEL[point.band]} burn
											</span>
										</div>
									{/if}
									<div class="flex items-center justify-between gap-x-4 leading-none">
										<span class="text-muted-foreground">Coding score</span>
										<span class="font-mono font-medium text-foreground tabular-nums">
											{point ? point.codingScore.toLocaleString() : ''}
										</span>
									</div>
									<div class="flex items-center justify-between gap-x-4 leading-none">
										<span class="text-muted-foreground"
											>{xMode === 'price' ? 'Price / 1M' : 'Burn score'}</span
										>
										<span class="font-mono font-medium text-foreground tabular-nums">
											{point
												? xMode === 'price'
													? `$${point.totalPrice.toFixed(2)}`
													: String(point.burnScore)
												: ''}
										</span>
									</div>
									<div class="flex items-center justify-between gap-x-4 leading-none">
										<span class="text-muted-foreground"
											>{xMode === 'price' ? 'Burn score' : 'Price / 1M'}</span
										>
										<span class="font-mono text-xs text-muted-foreground tabular-nums">
											{point
												? xMode === 'price'
													? String(point.burnScore)
													: `$${point.totalPrice.toFixed(2)}`
												: ''}
										</span>
									</div>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</ScatterChart>
			{:else}
				<div class="py-16 text-center text-sm text-muted-foreground">
					No model in the catalog reports a benchmark score yet.
				</div>
			{/if}
		</Chart.Container>
	</Card.Content>
	<Card.Footer>
		<div
			class="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
		>
			<span>
				Up: coding score (0–100). Across:
				{xMode === 'price' ? 'price per 1M tokens, log-compressed' : 'burn score (100 = efficient)'}
			</span>
			{#if stats}
				<span>
					{#if xMode === 'price'}
						Sweet spot: under ${stats.medianPrice.toFixed(2)} and scoring above {stats.medianScore.toFixed(
							0
						)}.
					{:else}
						Sweet spot: burn ≥ {stats.medianBurn.toFixed(0)} and scoring above {stats.medianScore.toFixed(
							0
						)}.
					{/if}
				</span>
			{/if}
		</div>
	</Card.Footer>
</Card.Root>
