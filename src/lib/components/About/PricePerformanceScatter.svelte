<script lang="ts">
  import { ScatterChart } from "layerchart";
  import { scaleSymlog } from "d3-scale";
  import type { GoModel } from "$lib/types/models";
  import {
    readableTicks,
    type PositionScale,
  } from "$lib/components/chart-ticks";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Card from "$lib/components/ui/card/index.js";

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

  interface PricePerfPoint {
    name: string;
    provider: string;
    totalPrice: number;
    codingScore: number;
    burnColor: string;
  }

  const burnColors: Record<string, string> = {
    excellent: "var(--chart-1)",
    good: "var(--chart-2)",
    moderate: "var(--chart-3)",
    high: "var(--chart-4)",
    extreme: "var(--chart-5)",
  };

  const chartData = $derived.by(() => {
    const points: PricePerfPoint[] = [];
    for (const m of models) {
      const input = m.pricing.inputPricePerM;
      const output = m.pricing.outputPricePerM;
      const coding = m.benchmarks.coding;
      if (input == null || output == null || coding == null) continue;
      const band = m.burnDetails?.band ?? "moderate";
      points.push({
        name: m.name,
        provider: m.provider,
        totalPrice: input + output,
        codingScore: coding,
        burnColor: burnColors[band] ?? "var(--muted-foreground)",
      });
    }
    return points.sort((a, b) => a.totalPrice - b.totalPrice);
  });

  const chartConfig = {
    price: { label: "Price per 1M tokens", color: "var(--chart-1)" },
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

  // Build per-model series for individual point coloring
  const series = $derived(
    chartData.map((p) => ({
      key: p.name,
      label: p.name,
      color: p.burnColor,
      data: [p],
    })),
  );
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Price vs. Performance</Card.Title>
    <Card.Description>
      Cheaper isn't always worse — find the sweet spot for your workload
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <!-- `aspect-auto` drops the container's default 16:9 ratio so the
		     explicit chart height governs — the ratio made the card's height
		     depend on its width. -->
    <Chart.Container config={chartConfig} class="aspect-auto">
      {#if chartData.length}
        <ScatterChart
          data={chartData}
          x="totalPrice"
          y="codingScore"
          xScale={PRICE_SCALE}
          xDomain={priceDomain}
          xNice={false}
          height={520}
          padding={{ top: 8, right: 14, bottom: 44, left: 26 }}
          props={{
            xAxis: {
              label: "Price / 1M tokens",
              format: (d: number) => (d < 0 ? "$0.00" : `$${d.toFixed(2)}`),
              // The compressed price scale crowds the HIGH end, so
              // the tick COUNT is chosen from the scale's own
              // pixel positions instead of a fixed number.
              ticks: (scale) =>
                readableTicks(scale as unknown as PositionScale),
            },
            yAxis: {
              // No axis label here: layerchart anchors a LEFT-axis
              // label at the same offset as the tick labels, so the
              // two always overlap. The footer names this axis
              // instead.
              format: (d: number) => d.toFixed(0),
            },
            highlight: { points: { r: 6 } },
          }}
          {series}
        >
          {#snippet tooltip()}
            <Chart.Tooltip />
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
      <span>Dots colored by burn band: cyan = excellent, red = extreme.</span>
      <span
        >Up: coding score (0–100). Across: price per 1M tokens, log-compressed.</span
      >
    </div>
  </Card.Footer>
</Card.Root>
