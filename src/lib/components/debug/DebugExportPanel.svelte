<script lang="ts">
	import { sectionLabel, type DebugFormat, type DebugSection } from '$lib/debug/sections';

	interface Props {
		section: DebugSection;
		format: DebugFormat;
		label: string;
		text: string;
		loading: boolean;
		error: string | null;
		onreload: () => void;
	}

	let { section, format, label, text, loading, error, onreload }: Props = $props();
</script>

<div class="rounded-xl border border-border bg-card">
	<div class="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
		<span class="text-xs text-muted-foreground">
			{sectionLabel(section)} · {label}
			{#if loading}<span> · loading…</span>{/if}
			{#if error}<span class="text-red-500"> · {error}</span>{/if}
		</span>
		<button
			class="text-xs text-muted-foreground transition-colors hover:text-foreground"
			onclick={onreload}
		>
			Reload
		</button>
	</div>
	<pre
		class="max-h-[70vh] overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap text-foreground"
		aria-label="{sectionLabel(section)} {format === 'json' ? 'JSON' : 'Markdown'}">{text}</pre>
</div>
