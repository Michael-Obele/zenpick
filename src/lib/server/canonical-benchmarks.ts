/**
 * Canonical benchmarks — the server-only half.
 *
 * Only the network fetch lives here, so the models.dev URL and the `fetch` call
 * can never enter a client bundle. Everything else — the types, `MIN_COVERAGE`,
 * `benchmarkKey`, `isPercentageScore`, `buildBenchmarkIndex` — is pure and
 * lives in `$lib/canonical-benchmarks.ts`, which client code imports directly.
 */

import type { CanonicalModel } from '$lib/canonical-benchmarks';

/**
 * Fetch models.dev's canonical model layer.
 *
 * `models.json` is the standalone canonical bundle (~53 KB gzipped) — the
 * matching layer for the `canonical_model_id` field carried by the provider
 * entries in api.json. Its shape is a FLAT map at the top level,
 * `lab/model` → model, with NO `{ models: … }` wrapper (unlike api.json, which
 * nests models under each provider). A `{ models: … }` payload here would key
 * the map by `models` and make every lookup miss silently, so an empty body is
 * rejected loudly instead.
 */
export async function fetchCanonicalBenchmarks(): Promise<Map<string, CanonicalModel>> {
	const res = await fetch('https://models.dev/models.json', {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) throw new Error(`models.dev models.json: ${res.status}`);
	const data = (await res.json()) as Record<string, CanonicalModel> | null;
	// `Object.entries(null)` throws a bare `TypeError` BEFORE the message below
	// can be produced, which would lose the whole point of the guard — a JSON
	// `null` body is an empty bundle, described as such.
	if (data === null || typeof data !== 'object') {
		throw new Error('models.dev models.json: empty canonical bundle');
	}
	const entries = Object.entries(data);
	if (entries.length === 0) throw new Error('models.dev models.json: empty canonical bundle');
	return new Map(entries);
}
