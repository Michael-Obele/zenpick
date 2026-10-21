<script lang="ts">
	import type { GoModel } from '$lib/types/models';

	interface Props {
		status: GoModel['modelsDevStatus'];
	}

	let { status }: Props = $props();
</script>

<!--
	Self-suppressing, like `FallbackBadge`: renders nothing unless models.dev
	marks the model deprecated. That is deliberate — the drawer drops this in as
	a single tag with no `{#if}` around it, so its pinned template complexity
	does not move (see the `ModelDrawer.svelte` fallow override).

	TEXT ONLY — no icon. The copy credits the upstream catalogue rather than
	claiming the model is gone: models.dev marks a model deprecated as a LEADING
	indicator of removal, and the Go API can still be serving it.
-->
{#if status === 'deprecated'}
	<span
		class="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-400/30 dark:text-amber-100"
		title="models.dev marks this model as deprecated upstream. That is a leading indicator of removal — the model may still be served on OpenCode Go, and pricing and limits on this page come from the Go docs page, not models.dev."
	>
		Marked deprecated upstream — still served here
	</span>
{/if}
