<script lang="ts">
	import { DEBUG_SECTIONS, type DebugSection } from '$lib/debug/sections';

	interface Props {
		/** The section currently shown — the URL is the source of truth. */
		section: DebugSection;
		/** Writing the URL param is the caller's job; this component is pure. */
		onselect: (id: DebugSection) => void;
	}

	let { section, onselect }: Props = $props();
</script>

<nav class="mb-6 flex flex-wrap gap-1.5" aria-label="Debug sections">
	{#each DEBUG_SECTIONS as s (s.id)}
		<button
			class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-all {section ===
			s.id
				? 'border-primary/40 bg-primary/10 text-primary'
				: 'border-border bg-card text-muted-foreground hover:text-foreground'}"
			aria-current={section === s.id ? 'page' : undefined}
			onclick={() => onselect(s.id)}
		>
			{s.label}
		</button>
	{/each}
</nav>
