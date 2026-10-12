import type { GoModel } from '$lib/types/models';
import { capabilitySearchTerms } from '$lib/capabilities';

/**
 * Model search, shared by every surface that accepts a `?q=`.
 *
 * The interactive table (`ModelTable.svelte`) and the `/llms.txt` route both
 * filter with these, so a search means the same thing in the browser and in
 * the markdown an agent reads.
 */

/**
 * Searchable text for a model: its identity, its tags, and the capability
 * vocabulary from capabilities.ts. Including the latter means "video" or
 * "pdf" finds the models that actually accept them — previously those words
 * only matched a model whose name or tag happened to contain them.
 */
function modelHaystack(m: GoModel): string {
	return [
		m.name,
		m.provider,
		...m.tags.map((t) => t.label),
		...capabilitySearchTerms(m.capabilities)
	]
		.join(' ')
		.toLowerCase();
}

/** Whether a model matches the raw search box / `?q=` value (normalized here). */
export function matchesModelSearch(m: GoModel, query: string): boolean {
	const q = query.trim().toLowerCase();
	return q === '' || modelHaystack(m).includes(q);
}
