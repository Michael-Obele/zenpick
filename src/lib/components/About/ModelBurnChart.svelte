<script lang="ts">
	import { scaleBand } from 'd3-scale';
	import { BarChart } from 'layerchart';
	import { ChartColumn } from '@lucide/svelte';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { cubicInOut } from 'svelte/easing';

	interface Model {
		name: string;
		requests: number;
		tier: 'slow' | 'moderate' | 'fast';
	}

	const models: Model[] = [
		{ name: 'DeepSeek V4 Flash', requests: 31650, tier: 'slow' },
		{ name: 'MiMo-V2.5', requests: 30100, tier: 'slow' },
		{ name: 'MiniMax M2.5', requests: 6300, tier: 'slow' },
		{ name: 'DeepSeek V4 Pro', requests: 3450, tier: 'moderate' },
		{ name: 'MiniMax M2.7', requests: 3400, tier: 'moderate' },
		{ name: 'Qwen3.6 Plus', requests: 3300, tier: 'moderate' },
		{ name: 'MiMo-V2.5-Pro', requests: 3250, tier: 'moderate' },
		{ name: 'Kimi K2.5', requests: 1850, tier: 'moderate' },
		{ name: 'GLM-5', requests: 1150, tier: 'fast' },
		{ name: 'Kimi K2.6', requests: 1150, tier: 'fast' },
		{ name: 'Qwen3.7 Max', requests: 950, tier: 'fast' },
		{ name: 'GLM-5.1', requests: 880, tier: 'fast' }
	];

	const chartData = models.map((m) => ({
		model: m.name,
		requests: m.requests,
		tier: m.tier
	}));

	const tierColor = {
		slow: 'var(--chart-1)',
		moderate: 'var(--chart-3)',
		fast: 'var(--chart-5)'
	} as const;

	const chartConfig = {
		requests: { label: 'Requests per 5h window', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	function formatCompact(n: number): string {
		return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : n.toString();
	}
</script>

<Card.Root class="overflow-hidden">
	<Card.Header>
		<div class="flex items-center gap-2">
			<ChartColumn class="size-4 text-primary" />
			<Card.Title>Requests per $12 quota window</Card.Title>
		</div>
		<Card.Description>
			How many requests each OpenCode Go model fits inside the 5-hour limit.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Chart.Container config={chartConfig} class="aspect-16/10">
			<BarChart
				data={chartData}
				xScale={scaleBand().padding(0.25)}
				x="model"
				axis="x"
				series={[
					{
						key: 'requests',
						label: 'Requests',
						color: chartConfig.requests.color ?? 'var(--chart-1)'
					}
				]}
				props={{
					bars: {
						stroke: 'none',
						rounded: 'all',
						radius: 6,
						motion: { type: 'tween', duration: 600, easing: cubicInOut },
						class: 'fill-primary'
					},
					highlight: { area: { fill: 'none' } },
					xAxis: {
						format: (d: string) =>
							d
								.replace('DeepSeek', 'DS')
								.replace('MiniMax', 'MM')
								.replace('Qwen', 'Qw')
								.replace('Kimi', 'Km')
								.replace('MiMo', 'MM')
								.replace('GLM', 'GLM')
								.replace(' V4 ', ' ')
					},
					yAxis: {
						format: (d: number) => formatCompact(d)
					}
				}}
			>
				{#snippet tooltip()}
					<Chart.Tooltip hideLabel />
				{/snippet}
			</BarChart>
		</Chart.Container>
	</Card.Content>
	<Card.Footer>
		<div class="flex w-full flex-wrap items-center gap-3 text-xs text-muted-foreground">
			<span class="inline-flex items-center gap-1.5">
				<span class="size-2 rounded-full" style="background: {tierColor.slow};"></span>
				Slow burn
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="size-2 rounded-full" style="background: {tierColor.moderate};"></span>
				Moderate
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="size-2 rounded-full" style="background: {tierColor.fast};"></span>
				Fast burn
			</span>
			<span class="ml-auto">Source: OpenCode Go docs & community estimates.</span>
		</div>
	</Card.Footer>
</Card.Root>
