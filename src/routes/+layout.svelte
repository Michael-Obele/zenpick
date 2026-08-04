<script lang="ts">
	import './layout.css';
	import { browser, dev } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import SiteHeader from '$lib/components/Site/SiteHeader.svelte';
	import SiteFooter from '$lib/components/Site/SiteFooter.svelte';
	import { Agentation, type AnnotationProps } from 'sv-agentation';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	let playgroundAnnotationProps: AnnotationProps = {
		toolbarPosition: 'bottom-left',
		outputMode: 'detailed',
		clearOnCopy: true
	};

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

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
