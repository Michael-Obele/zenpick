<script lang="ts">
	import { Printer, Calendar, ArrowRightLeft, BadgeCheck } from '@lucide/svelte';

	const today = new Date().toLocaleDateString('en-US', {
		month: 'short',
		day: '2-digit',
		year: 'numeric'
	});
</script>

<figure
	class="receipt-shadow mx-auto max-w-md overflow-hidden rounded-sm border border-border/60 bg-card font-mono text-sm sm:text-base"
	aria-label="A thermal receipt representing the decision to switch AI plans"
>
	<!-- receipt sprocket holes -->
	<div class="flex justify-between px-3 py-2" aria-hidden="true">
		{#each Array(18) as _, i (i)}
			<span class="h-1.5 w-1.5 rounded-full bg-border/80"></span>
		{/each}
	</div>

	<!-- header -->
	<div class="border-b-2 border-dashed border-border/60 px-6 pb-5 pt-2 text-center">
		<div
			class="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
		>
			<Printer class="size-5" />
		</div>
		<div class="text-lg font-semibold tracking-tight text-foreground">ZENPICK CO.</div>
		<div class="text-xs uppercase tracking-wider text-muted-foreground">thermal-quota compass</div>
		<div class="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<Calendar class="size-3" />
			<span>{today}</span>
		</div>
	</div>

	<!-- line items -->
	<div class="px-6 py-5">
		<div class="mb-3 text-xs uppercase tracking-wider text-muted-foreground">why I switched</div>

		<div class="space-y-3">
			<div class="flex justify-between">
				<span class="text-foreground/90">Old AI plans</span>
				<span class="tabular-nums text-muted-foreground">$20-200/mo</span>
			</div>
			<div class="flex justify-between">
				<span class="text-foreground/90">Rising prices</span>
				<span class="tabular-nums text-destructive">+ stress</span>
			</div>
			<div class="flex justify-between">
				<span class="text-foreground/90">Model overlap</span>
				<span class="tabular-nums text-muted-foreground">confusing</span>
			</div>
			<div class="flex justify-between">
				<span class="text-foreground/90">OpenCode Go</span>
				<span class="tabular-nums text-emerald-500">$10/mo</span>
			</div>
			<div class="flex justify-between font-medium text-foreground">
				<span class="inline-flex items-center gap-1.5">
					<ArrowRightLeft class="size-3.5 text-primary" />
					Switched to
				</span>
				<span class="tabular-nums text-primary">13 models</span>
			</div>
		</div>

		<div class="my-5 border-t-2 border-dashed border-border/60"></div>

		<div class="flex items-start justify-between gap-4">
			<span class="text-foreground/90">Problem left unsolved</span>
			<span class="max-w-[55%] text-right text-xs leading-snug text-muted-foreground">
				Which open model fits which task? How fast does each burn the quota?
			</span>
		</div>
	</div>

	<!-- totals / action -->
	<div class="border-t-2 border-dashed border-border/60 bg-muted/20 px-6 py-5">
		<div class="flex items-center justify-between text-foreground">
			<span class="font-semibold">So I built</span>
			<span class="text-lg font-bold tracking-tight text-primary">ZenPick</span>
		</div>
		<div class="mt-2 text-xs leading-relaxed text-muted-foreground">
			A comparison layer for OpenCode Go: benchmarks, burn rates, and fit scores in one page.
		</div>
		<div class="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-primary">
			<BadgeCheck class="size-3.5" />
			<span>verified by real usage</span>
		</div>
	</div>

	<!-- zigzag bottom edge -->
	<svg
		class="block h-3 w-full text-background"
		viewBox="0 0 400 12"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<polygon
			points="0,0 10,12 20,0 30,12 40,0 50,12 60,0 70,12 80,0 90,12 100,0 110,12 120,0 130,12 140,0 150,12 160,0 170,12 180,0 190,12 200,0 210,12 220,0 230,12 240,0 250,12 260,0 270,12 280,0 290,12 300,0 310,12 320,0 330,12 340,0 350,12 360,0 370,12 380,0 390,12 400,0"
			fill="currentColor"
		/>
	</svg>
</figure>

<style>
	.receipt-shadow {
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.05),
			0 12px 28px oklch(0 0 0 / 0.08),
			0 24px 48px oklch(0 0 0 / 0.05);
	}
	:global(.dark) .receipt-shadow {
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.2),
			0 12px 28px oklch(0 0 0 / 0.25),
			0 24px 48px oklch(0 0 0 / 0.2);
	}
</style>
