/**
 * Go model lifecycle — when each model was live on OpenCode Go.
 *
 * models.dev's api.json CANNOT answer this on its own:
 *  - `release_date` / `last_updated` are UPSTREAM model dates, not Go listing
 *    dates (hy3 was released upstream 2026-07-06 but joined Go 2026-07-22);
 *  - and models.dev DELETES a retired model's file, so api.json is an
 *    incomplete tombstone ledger.
 *
 * The timeline therefore lives in models.dev's GIT HISTORY of
 * `providers/opencode-go/models/<id>.toml`. We read it through the per-file
 * ATOM feed, which is plain HTML served by GitHub — NOT the REST API — so it
 * carries no rate limit. (The REST API caps unauthenticated callers at
 * 60 req/hr, which a ~140-model sweep cannot survive across serverless cold
 * starts.)
 *
 * ADVISORY ONLY: this never changes which models ZenPick shows.
 */

export type GoLifecycleStatus = 'alive' | 'deprecated' | 'killed' | 'drift' | 'never';

export interface GoLifecycle {
	/** Model id as it appeared on the Go plan. */
	id: string;
	status: GoLifecycleStatus;
	/** ISO date the model first appeared in models.dev's Go provider. */
	firstSeen: string | null;
	/** ISO date the model was removed from the Go provider (killed only). */
	killedOn: string | null;
	/** ISO date of the last commit touching the provider file. */
	lastTouched: string | null;
}

const ATOM_BASE =
	'https://github.com/anomalyco/models.dev/commits/dev/providers/opencode-go/models';

/** How many Atom feeds to probe at once. */
const CONCURRENCY = 12;

/** Per-feed timeout. */
const FEED_TIMEOUT_MS = 10_000;

/**
 * Extract the ISO dates from an Atom feed's per-ENTRY `<updated>` elements.
 *
 * Scope matters: a real feed also carries a feed-level `<updated>` before the
 * entries, and parsing every `<updated>` in the document would fold that one
 * extra date in — so an otherwise entry-less 200 response would yield exactly
 * one date and classify a model that was NEVER on Go as `killed` with a
 * fabricated one-day window. Splitting on `<entry>` keeps the feed-level
 * element out, so the array length equals the true commit count.
 *
 * NAMESPACE ASSUMPTION: GitHub serves these entries UN-NAMESPACED — the opening
 * tag is a bare `<entry>`, and `go-lifecycle.fixture.ts` pins that exact shape
 * verbatim. Element-embedding is tolerated without being trusted: the opening
 * tag is matched as `<entry` followed by `>` or whitespace, and the closest
 * `</entry>` closes it. A hypothetical `<content type="html">` containing the
 * literal text `<entry>` could still over-match, which is why the fixture (not
 * a regex feature) is the guard against an upstream shape change.
 *
 * Returns them newest-first, as the feed orders them.
 */
export function parseAtomDates(xml: string): string[] {
	return [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/g)].flatMap((entry) =>
		[...entry[0].matchAll(/<updated>([^<]+)<\/updated>/g)].map((m) => m[1].slice(0, 10))
	);
}

/**
 * Fetch one model's history from its per-file Atom feed.
 * Returns `[]` on a 404 (the model was never on Go) and throws when the probe
 * FAILED (5xx, network error, timeout) — the two cases are distinguished by
 * the caller, so a transient failure is never recorded as `never`.
 */
async function fetchFeedDates(id: string): Promise<string[]> {
	const res = await fetch(`${ATOM_BASE}/${encodeURIComponent(id)}.toml.atom`, {
		headers: { accept: 'application/atom+xml, text/xml' },
		signal: AbortSignal.timeout(FEED_TIMEOUT_MS)
	});
	// 404 → the file never existed → the model was never on Go.
	if (res.status === 404) return [];
	if (!res.ok) throw new Error(`atom feed ${id}: ${res.status}`);
	return parseAtomDates(await res.text());
}

/**
 * Classify a model from its three inputs.
 *
 * | Condition                                        | Status      |
 * |--------------------------------------------------|-------------|
 * | in opencode-go AND live in the Go API             | `alive`     |
 * | in opencode-go, deprecated, NOT live in the API   | `deprecated`|
 * | NOT in opencode-go, NOT live in the API          | `killed`    |
 * | NOT in opencode-go, IS live in the API           | `drift`     |
 * | no Atom history at all                           | `never`     |
 */
export function classifyLifecycle(
	id: string,
	dates: string[] | null,
	opts: { inGoProvider: boolean; liveOnGo: boolean; deprecated: boolean }
): GoLifecycle {
	if (!dates || dates.length === 0) {
		return {
			id,
			status: 'never',
			firstSeen: null,
			killedOn: null,
			lastTouched: null
		};
	}

	// Order-independent: a feed is `updated`-descending today, but the oldest
	// and newest dates are what the ledger means, not the array positions.
	// Seeded with `dates[0]` rather than `reduce`'s implicit first element: an
	// empty array would THROW here, so the guard above is load-bearing either
	// way — but a seeded reduce keeps that guard the ONLY thing standing
	// between a reorder and a `TypeError` from a function that reads as total.
	const firstSeen = dates.reduce((a, b) => (a < b ? a : b), dates[0]);
	const lastTouched = dates.reduce((a, b) => (a > b ? a : b), dates[0]);
	// For `deprecated` and `killed` the kill date IS the last touch.
	const retired = { firstSeen, killedOn: lastTouched, lastTouched };

	if (opts.inGoProvider) {
		if (opts.liveOnGo) {
			return { id, status: 'alive', firstSeen, killedOn: null, lastTouched };
		}
		if (opts.deprecated) {
			return { id, status: 'deprecated', ...retired };
		}
		return { id, status: 'killed', ...retired };
	}

	if (opts.liveOnGo) {
		// Live on Go, but models.dev has not published it under the Go
		// provider — catalog drift, not a retirement.
		return { id, status: 'drift', firstSeen, killedOn: null, lastTouched };
	}

	// Absent from the Go provider AND absent from the Go API → the newest
	// commit is the commit that removed it.
	return { id, status: 'killed', ...retired };
}

/**
 * Build the lifecycle ledger for a set of candidate model ids.
 *
 * A 404 contributes a `never` entry (the model genuinely was never on Go).
 * A FAILED probe contributes NO entry at all — its state is unknown, not
 * "never" — so a transient 5xx or timeout can never overwrite a verified kill
 * window with a false `never` in the caller's 24h cache.
 *
 * Probes the per-file Atom feed for each id at a bounded concurrency. Measured:
 * 423 ms sequential, 102 ms concurrent — the full 143-id universe costs ~1.2 s.
 */
export async function fetchGoLifecycle(
	candidateIds: string[],
	opts: {
		goProviderIds: Set<string>;
		liveGoIds: Set<string>;
		deprecatedIds: Set<string>;
	}
): Promise<Map<string, GoLifecycle>> {
	const results = new Map<string, GoLifecycle>();

	for (let i = 0; i < candidateIds.length; i += CONCURRENCY) {
		const batch = candidateIds.slice(i, i + CONCURRENCY);
		const entries = await Promise.all(
			batch.map(async (id) => {
				let dates: string[];
				try {
					dates = await fetchFeedDates(id);
				} catch (e: unknown) {
					const msg = e instanceof Error ? e.message : String(e);
					console.error(`[go-lifecycle] atom feed ${id} failed:`, msg);
					// Unknown, not `never` — omit the entry entirely.
					return null;
				}
				return [
					id,
					classifyLifecycle(id, dates, {
						inGoProvider: opts.goProviderIds.has(id),
						liveOnGo: opts.liveGoIds.has(id),
						deprecated: opts.deprecatedIds.has(id)
					})
				] as const;
			})
		);
		for (const entry of entries) if (entry) results.set(entry[0], entry[1]);
	}

	return results;
}
