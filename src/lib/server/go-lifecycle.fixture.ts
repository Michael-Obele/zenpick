/**
 * SNAPSHOT — a recorded observation of live upstream, NOT a live assertion.
 *
 * Captured by sweeping the real Atom feeds on 2026-10-21 over the 144-id
 * candidate universe (`opencode-go` ∪ `opencode`/Zen ∪ live Go API). Upstream
 * moves; when this drifts, RE-CAPTURE from upstream and report the delta —
 * never edit a row to make a failing test pass.
 *
 * PROVENANCE
 *   repo      anomalyco/models.dev
 *   branch    dev
 *   path      providers/opencode-go/models/<id>.toml
 *   feed      https://github.com/anomalyco/models.dev/commits/dev/providers/opencode-go/models/<id>.toml.atom
 *   captured  2026-10-21
 *   sweep     144 candidates → 144 resolved, 0 probe failures
 *
 * WHY THESE ROWS: the kill windows are the highest-signal output of the sweep.
 * They pin BOTH endpoints of the Atom parsing (oldest entry `<updated>` =
 * listed, newest = killed) AND the classification, so a regression in either
 * corrupts a row here rather than reaching a user.
 *
 * The `entries` arrays are the feeds VERBATIM — newest first, duplicates and
 * all, exactly as GitHub emits them. Keep them that way: the duplicates are
 * real (several commits land on one day) and they are what makes the
 * "array length = true commit count" contract observable.
 */

/** Where the fixture came from — for failure output and future re-capture. */
export const PROVENANCE = {
	repo: 'anomalyco/models.dev',
	branch: 'dev',
	path: 'providers/opencode-go/models/<id>.toml',
	capturedOn: '2026-10-21',
	candidates: 144,
	resolved: 144,
	probeFailures: 0
} as const;

export interface KilledWindow {
	id: string;
	/** Oldest entry `<updated>` — the commit that put it on Go. */
	firstSeen: string;
	/** Newest entry `<updated>` — the commit that killed it. */
	killedOn: string;
	/** Every entry date in feed order (newest first), as upstream served it. */
	entries: readonly string[];
}

/**
 * Every model the sweep classified `killed`, with its observed window.
 * Sorted by id so a re-capture diffs as a clean set of changes.
 */
export const KILLED_WINDOWS: readonly KilledWindow[] = [
	{
		id: 'deepseek-v4-flash',
		firstSeen: '2026-04-24',
		killedOn: '2026-10-15',
		entries: [
			'2026-10-15',
			'2026-10-14',
			'2026-09-10',
			'2026-08-16',
			'2026-08-16',
			'2026-08-11',
			'2026-08-11',
			'2026-08-07',
			'2026-08-04',
			'2026-08-02',
			'2026-07-31',
			'2026-07-17',
			'2026-07-17',
			'2026-07-01',
			'2026-06-12',
			'2026-06-12',
			'2026-05-11',
			'2026-04-27',
			'2026-04-24'
		]
	},
	{
		id: 'deepseek-v4-flash-vision-exp',
		firstSeen: '2026-08-21',
		killedOn: '2026-10-15',
		entries: ['2026-10-15', '2026-10-14', '2026-09-10', '2026-08-21']
	},
	{
		id: 'glm-5',
		firstSeen: '2026-02-25',
		killedOn: '2026-09-28',
		entries: [
			'2026-09-28',
			'2026-07-01',
			'2026-06-17',
			'2026-06-12',
			'2026-04-27',
			'2026-04-07',
			'2026-02-25'
		]
	},
	{
		id: 'grok-4.5',
		firstSeen: '2026-07-16',
		killedOn: '2026-10-15',
		entries: ['2026-10-15', '2026-08-25', '2026-07-19', '2026-07-16']
	},
	{
		id: 'kimi-k2.5',
		firstSeen: '2026-02-25',
		killedOn: '2026-09-28',
		entries: [
			'2026-09-28',
			'2026-07-01',
			'2026-06-12',
			'2026-06-12',
			'2026-06-12',
			'2026-04-20',
			'2026-02-27',
			'2026-02-25'
		]
	},
	{
		// Zero-day window: listed and killed by the same commit, so both endpoints
		// collide — the one case where a min/max bug cannot hide behind a wide span.
		id: 'muse-spark-1.2',
		firstSeen: '2026-08-19',
		killedOn: '2026-08-19',
		entries: ['2026-08-19', '2026-08-19']
	},
	{
		id: 'qwen3.5-plus',
		firstSeen: '2026-04-15',
		killedOn: '2026-09-28',
		entries: [
			'2026-09-28',
			'2026-08-16',
			'2026-07-01',
			'2026-06-28',
			'2026-06-26',
			'2026-06-25',
			'2026-06-12',
			'2026-05-29',
			'2026-04-22',
			'2026-04-16',
			'2026-04-15',
			'2026-04-15',
			'2026-04-15',
			'2026-04-15'
		]
	},
	{
		id: 'space-bunny-free',
		firstSeen: '2026-09-23',
		killedOn: '2026-10-15',
		entries: ['2026-10-15', '2026-10-06', '2026-09-23']
	}
] as const;

/**
 * The status counts the same sweep produced. `alive + deprecated + killed +
 * drift + never === candidates` — pinned so a classification change that
 * shifts rows between buckets surfaces as a count mismatch.
 */
export const OBSERVED_COUNTS = {
	alive: 30,
	deprecated: 3,
	killed: 8,
	drift: 7,
	never: 96
} as const;

/**
 * Render a feed the way GitHub served it for this model: newest entry first, a
 * feed-level `<updated>` equal to the newest date, and one `<entry>` per
 * commit. Used to round-trip the fixture through `parseAtomDates`.
 */
export function atomFeed(id: string, entries: readonly string[]): string {
	const newest = entries[0];
	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>${newest}T09:00:00Z</updated>
  <title>Commits · anomalyco/models.dev · ${id}.toml</title>
${entries
	.map(
		(d, i) => `  <entry>
    <id>tag:github.com,2008:Grit::Commit/${id}-${i}</id>
    <updated>${d}T09:00:00Z</updated>
    <title>update ${id}.toml</title>
  </entry>`
	)
	.join('\n')}
</feed>`;
}
