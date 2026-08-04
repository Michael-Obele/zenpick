<script lang="ts">
	import { Arc, Chart, ClipPath, Group, Layer, Line, LinearGradient, Text } from 'layerchart';
	import { scaleLinear } from 'd3-scale';
	import { onMount } from 'svelte';
	import type { BurnBand } from '$lib/types/models';

	interface Props {
		/** Burn speed to display (higher = burns faster). */
		value: number;
		band: BurnBand | null;
	}

	let { value, band }: Props = $props();

	const domain: [number, number] = [0, 100];
	const angleRange: [number, number] = [-120, 120];
	const outerRadius = 70;
	const innerRadius = 58;
	const angleScale = scaleLinear().domain(domain).range(angleRange);
	const ticks = [0, 25, 50, 75, 100];

	// Sweep 0 → value on mount. BurnGauge keys this component by `value`, so
	// every change remounts it and replays the sweep — no $effect needed.
	let displayValue = $state(0);
	onMount(() => {
		const t = setTimeout(() => {
			displayValue = value;
		}, 500);
		return () => clearTimeout(t);
	});

	function bandLabel(b: BurnBand | null): string {
		switch (b) {
			case 'excellent':
				return 'Slow burn — lasts longest';
			case 'good':
				return 'Light burn — economical';
			case 'moderate':
				return 'Moderate — balanced';
			case 'high':
				return 'Warm burn — faster';
			case 'extreme':
				return 'Fast burn — burns fastest';
			default:
				return 'Unknown';
		}
	}
</script>

<Chart height={160} padding={20}>
	<Layer center>
		<Group y={20}>
			<LinearGradient class="from-emerald-500 via-yellow-500 to-red-500">
				{#snippet children({ gradient })}
					<ClipPath>
						{#snippet clip()}
							<Arc
								value={displayValue}
								{domain}
								range={angleRange}
								{outerRadius}
								{innerRadius}
								cornerRadius={6}
								motion="spring"
							/>
						{/snippet}
						<Arc
							value={domain[1]}
							{domain}
							range={angleRange}
							{outerRadius}
							{innerRadius}
							cornerRadius={6}
							fill={gradient}
						/>
					</ClipPath>
				{/snippet}
			</LinearGradient>

			<!-- Track outline -->
			<Arc
				value={domain[1]}
				{domain}
				range={angleRange}
				{outerRadius}
				{innerRadius}
				cornerRadius={6}
				class="fill-none"
				track={{ class: 'fill-none stroke-border/40' }}
			/>

			<!-- Tick marks and labels -->
			{#each ticks as tick (tick)}
				{@const angleDeg = angleScale(tick)}
				{@const angleRad = (angleDeg * Math.PI) / 180}
				{@const tickOuter = innerRadius - 3}
				{@const tickInner = innerRadius - 10}
				{@const labelRadius = innerRadius - 16}
				<Line
					x1={Math.sin(angleRad) * tickInner}
					y1={-Math.cos(angleRad) * tickInner}
					x2={Math.sin(angleRad) * tickOuter}
					y2={-Math.cos(angleRad) * tickOuter}
					class="stroke-border/40"
					strokeWidth={1.5}
				/>
				<Text
					x={Math.sin(angleRad) * labelRadius}
					y={-Math.cos(angleRad) * labelRadius}
					value={String(tick)}
					textAnchor="middle"
					verticalAnchor="middle"
					class="fill-muted-foreground/50 text-[8px] tabular-nums"
				/>
			{/each}

			<!-- Value display -->
			<Text
				value={Math.round(displayValue) + ''}
				textAnchor="middle"
				verticalAnchor="middle"
				class="fill-foreground text-3xl font-bold tabular-nums"
			/>

			<!-- Status label -->
			<Text
				x={0}
				y={45}
				value={bandLabel(band)}
				textAnchor="middle"
				verticalAnchor="middle"
				class="fill-muted-foreground text-[10px] font-medium"
			/>
		</Group>
	</Layer>
</Chart>
