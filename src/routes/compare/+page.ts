import { browser } from '$app/environment';
import { getModels } from '$lib/remote/models.remote';
import { validateSearchParams } from 'runed/kit';
import { compare } from '$lib/stores/compare.svelte';
import { compareSearchSchema } from '$lib/compare-search';
import type { PageLoad } from './$types';

/**
 * Compare page load
 * -----------------
 * Uses runed's `validateSearchParams` — the server-side pairing of
 * `useSearchParams` — so the URL is parsed through the same schema the
 * client uses, and the load function only re-runs when the schema-defined
 * `models` parameter changes (fine-grained reactivity, per runed docs).
 *
 * On CLIENT navigations (back/forward between share links, in-app
 * navigation back to this route), this load re-runs — so we also sync the
 * shared store from the validated URL, keeping the homepage compare tray
 * truthful. Guarded by `browser`: SSR never touches client store state.
 */
export const load: PageLoad = async ({ url }) => {
	const { data } = validateSearchParams(url, compareSearchSchema);
	const models = await getModels();
	if (browser && data.models) {
		const valid = data.models
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.filter((id) => models.some((m) => m.id === id));
		if (valid.length) compare.selection = valid;
	}
	return { models };
};
