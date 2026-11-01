<script lang="ts">
	import './layout.css';
	import { browser, dev } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import SiteHeader from '$lib/components/Site/SiteHeader.svelte';
	import SiteFooter from '$lib/components/Site/SiteFooter.svelte';
	import { Agentation, type AnnotationProps } from 'sv-agentation';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	// Analytics: InsightFlare tracker, emitted only when the deploy sets
	// VITE_INSIGHTFLARE_SRC (https://<instance>/script.js?siteId=<id>).
	// Kept out of the repo so the site id and instance are not hardcoded.
	const analyticsSrc = import.meta.env.VITE_INSIGHTFLARE_SRC as string | undefined;

	let playgroundAnnotationProps: AnnotationProps = {
		toolbarPosition: 'bottom-left',
		outputMode: 'detailed',
		clearOnCopy: true
	};

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link
		rel="alternate"
		type="text/plain"
		href="/llms.txt"
		title="ZenPick — llms.txt (machine-readable catalog)"
	/>
	{#if analyticsSrc}
		<script defer src={analyticsSrc}></script>
	{/if}
</svelte:head>

<div class="flex min-h-screen flex-col">
	<SiteHeader />
	<div class="flex-1">
		{@render children()}
	</div>
	<SiteFooter />
</div>

<Toaster />

{#if browser && dev}
	<Agentation {...playgroundAnnotationProps} />
{/if}
