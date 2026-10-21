<script lang="ts">
	import { ScatterChart } from 'layerchart';
	import { scaleSymlog } from 'd3-scale';
	import { Info } from '@lucide/svelte';
	import type { ComponentProps } from 'svelte';
	import type { GoModel } from '$lib/types/models';
	import { readableTicks, type PositionScale } from '$lib/components/chart-ticks';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	interface Props {
		models: GoModel[];
		selectedModel: GoModel;
	}

	let { models, selectedModel }: Props = $props();

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

	interface ScatterPoint {
		modelId: string;
		name: string;
		totalPrice: number;
		codingScore: number;
		isSelected: boolean;
	}

	const allPoints = $derived.by(() => {
		const points: ScatterPoint[] = [];
		for (const m of models) {
			const input = m.pricing.inputPricePerM;
			const output = m.pricing.outputPricePerM;
			const coding = m.benchmarks.coding;
			if (input == null || output == null || coding == null) continue;
			points.push({
				modelId: m.id,
				name: m.name,
				totalPrice: input + output,
				codingScore: coding,
				isSelected: m.id === selectedModel?.id
			});
		}
		return points;
	});

	const selectedPoint = $derived(allPoints.find((p) => p.isSelected));
	const peerPoints = $derived(allPoints.filter((p) => !p.isSelected));

	/**
	 * The price domain, with headroom on BOTH ends.
	 *
	 * The plot's clip path is exactly the domain, so a dot at the domain
	 * extreme is cut in half. The negative floor pulls the free ($0) models
	 * off the left edge; the 12% headroom does the same for the most
	 * expensive model on the right.
	 */
	const priceDomain = $derived.by((): [number, number] => {
		const prices = allPoints.map((p) => p.totalPrice);
		const max = prices.length ? Math.max(...prices) : 1;
		return [-(max * 0.02), max * 1.12];
	});

	/**
	 * The selected model's PRICE, even when it has no benchmark score.
	 *
	 * A model with no coding score (`qwen3.8-flash` and five others) cannot be
	 * placed on the y axis, but it still has a price — so the card explains
	 * where it stands instead of rendering an EMPTY chart. The chart used to be
	 * gated on the selected point existing, which made the whole card vanish
	 * for exactly those models.
	 */
	const selectedPrice = $derived.by(() => {
		const input = selectedModel?.pricing.inputPricePerM;
		const output = selectedModel?.pricing.outputPricePerM;
		if (input == null || output == null) return null;
		return input + output;
	});

	/**
	 * The series list. The `selected` series is present only when the model
	 * can actually be plotted — an empty series would still register in the
	 * tooltip payload.
	 */
	const series = $derived.by((): ComponentProps<typeof ScatterChart>['series'] => {
		const list: NonNullable<ComponentProps<typeof ScatterChart>['series']> = [
			{
				key: 'peers',
				label: 'Other models',
				color: 'var(--muted-foreground)',
				data: peerPoints,
				// `opacity`, not a class: LayerChart's Points mark spreads the
				// series props and THEN overwrites `class` with its own layer
				// class, so a Tailwind `opacity-*` class never reaches the DOM.
				props: { opacity: 0.4, r: 5 }
			}
		];
		if (selectedPoint) {
			list.push({
				key: 'selected',
				label: selectedModel.name,
				color: 'var(--primary)',
				data: [selectedPoint],
				props: { r: 8, stroke: 'var(--background)', strokeWidth: 2 }
			});
		}
		return list;
	});

	const chartConfig = $derived({
		peers: { label: 'Other models', color: 'var(--muted-foreground)' },
		selected: {
			label: selectedModel?.name ?? 'Selected model',
			color: 'var(--primary)'
		}
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Price vs. Performance</Card.Title>
		<Card.Description>Where this model sits in the field</Card.Description>
	</Card.Header>
	<Card.Content>
		<!-- `aspect-auto` drops the container's default 16:9 ratio so the
		     explicit chart height governs — inside a narrow drawer the ratio
		     squeezed the plot into a letterbox. -->
		<Chart.Container config={chartConfig} class="aspect-auto">
			{#if peerPoints.length || selectedPoint}
				<ScatterChart
					data={selectedPoint ? [...peerPoints, selectedPoint] : peerPoints}
					x="totalPrice"
					y="codingScore"
					xScale={PRICE_SCALE}
					xDomain={priceDomain}
					xNice={false}
					height={240}
					padding={{ top: 8, right: 12, bottom: 40, left: 24 }}
					props={{
						xAxis: {
							label: 'Price / 1M tokens',
							format: (d: number) => (d < 0 ? '$0.00' : `$${d.toFixed(2)}`),
							// The compressed price scale crowds the HIGH end, so
							// the tick COUNT is chosen from the scale's own
							// pixel positions instead of a fixed number.
							ticks: (scale) => readableTicks(scale as unknown as PositionScale)
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
						<Chart.Tooltip />
					{/snippet}
				</ScatterChart>
			{:else}
				<div class="py-10 text-center text-sm text-muted-foreground">
					No model in the catalog reports a benchmark score yet.
				</div>
			{/if}
		</Chart.Container>
	</Card.Content>
	<Card.Footer>
		<div class="flex items-start gap-2 text-xs text-muted-foreground">
			<Info class="mt-0.5 size-3.5 shrink-0" />
			{#if selectedPoint}
				<span>
					Each dot is a Go model. Up: coding score (0–100). Across: price per 1M tokens (input +
					output) on a compressed scale, so cheap models stay readable next to expensive ones.
				</span>
			{:else if selectedPrice != null}
				<span>
					{selectedModel.name} has no benchmark score yet, so it is not plotted. It costs ${selectedPrice.toFixed(
						2
					)} per 1M tokens — the dots show where the rest of the field sits.
				</span>
			{:else}
				<span>
					{selectedModel.name} has no benchmark score and no published price yet, so it cannot be plotted.
					The dots show where the rest of the field sits.
				</span>
			{/if}
		</div>
	</Card.Footer>
</Card.Root>
