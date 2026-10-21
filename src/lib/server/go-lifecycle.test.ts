import { describe, it, expect, vi, afterEach } from 'vite-plus/test';
import {
	classifyLifecycle,
	fetchGoLifecycle,
	parseAtomDates,
	type GoLifecycle
} from './go-lifecycle';
import { OBSERVED_COUNTS, PROVENANCE, KILLED_WINDOWS, atomFeed } from './go-lifecycle.fixture';

/**
 * Trimmed to the shape that matters: newest entry first, `<updated>` carrying
 * an ISO timestamp, and — as every real feed carries — a feed-level
 * `<updated>` ahead of the entries. The two endpoints are `grok-4.5`'s real
 * history — 2026-07-16 (joined Go) through 2026-10-15 (the "remove models"
 * commit that killed it). The live feed holds 5 entries (2026-07-19 and
 * 2026-08-25 sit in between); they are omitted here because only the oldest
 * and newest matter.
 *
 * Measured across 33 real feeds: the feed-level date always EQUALS the newest
 * entry's date, so that is what the fixture mirrors.
 */
const GROK_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>2026-10-15T09:00:00Z</updated>
  <entry>
    <id>tag:github.com,2008:Grit::Commit/e2ada89cbd25</id>
    <updated>2026-10-15T09:00:00Z</updated>
    <title>chore(opencode-go): remove models</title>
  </entry>
  <entry>
    <id>tag:github.com,2008:Grit::Commit/c67a5bba</id>
    <updated>2026-07-16T09:00:00Z</updated>
    <title>update Go models</title>
  </entry>
</feed>`;

const GROK_DATES = ['2026-10-15', '2026-07-16'];

describe('parseAtomDates', () => {
	it('extracts the <updated> dates newest-first, as the feed orders them', () => {
		expect(parseAtomDates(GROK_FEED)).toEqual(GROK_DATES);
	});

	it('truncates timestamps to the ISO calendar date', () => {
		const dates = parseAtomDates(GROK_FEED);
		expect(dates[0]).toBe('2026-10-15');
		expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
	});

	it('returns an empty array for an empty or date-free document', () => {
		expect(parseAtomDates('')).toEqual([]);
		expect(parseAtomDates('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([]);
	});

	it('ignores the feed-level <updated> outside <entry>', () => {
		// Every real feed carries a feed-level <updated> before the entries, and it
		// always equals the newest entry's date. Only entry dates are commits.
		const withFeedLevel = GROK_FEED.replace(
			'<feed xmlns="http://www.w3.org/2005/Atom">',
			'<feed xmlns="http://www.w3.org/2005/Atom">\n  <updated>2026-10-15T23:59:59Z</updated>'
		);
		expect(parseAtomDates(withFeedLevel)).toEqual(GROK_DATES);
		expect(parseAtomDates(withFeedLevel)).not.toContain('2026-10-15T23:59:59Z');
	});

	it('returns [] for a 200 feed carrying a feed-level <updated> but NO entries', () => {
		// The latent bug: parsing every <updated> would yield one date here and
		// classify a model that was never on Go as `killed` with a fabricated
		// one-day window.
		const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>2026-10-15T09:00:00Z</updated>
  <title>commits</title>
</feed>`;
		expect(parseAtomDates(emptyFeed)).toEqual([]);

		// …and the classification that follows must be `never`, not a false kill.
		const l = classifyLifecycle('never-on-go', parseAtomDates(emptyFeed), {
			inGoProvider: false,
			liveOnGo: false,
			deprecated: false
		});
		expect(l.status).toBe('never');
		expect(l.killedOn).toBeNull();
		expect(l.firstSeen).toBeNull();
	});

	it('tolerates a namespaced <entry> opening tag', () => {
		// GitHub serves un-namespaced entries today (pinned by the fixture), but
		// the opening tag is matched as `<entry` + `>`/whitespace so the common
		// `<entry xmlns=…>` form parses instead of silently yielding [].
		const namespaced = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>2026-10-15T09:00:00Z</updated>
  <entry xmlns="http://www.w3.org/2005/Atom">
    <updated>2026-10-15T09:00:00Z</updated>
  </entry>
</feed>`;
		expect(parseAtomDates(namespaced)).toEqual(['2026-10-15']);
	});
});

describe('classifyLifecycle', () => {
	const base = { inGoProvider: false, liveOnGo: false, deprecated: false };

	it('alive — in opencode-go and live in the Go API', () => {
		const l = classifyLifecycle('hy3', GROK_DATES, {
			inGoProvider: true,
			liveOnGo: true,
			deprecated: false
		});
		expect(l).toEqual({
			id: 'hy3',
			status: 'alive',
			firstSeen: '2026-07-16',
			killedOn: null,
			lastTouched: '2026-10-15'
		});
	});

	it('deprecated — still published, marked deprecated, gone from the Go API', () => {
		const l = classifyLifecycle('old-1', GROK_DATES, {
			inGoProvider: true,
			liveOnGo: false,
			deprecated: true
		});
		expect(l.status).toBe('deprecated');
		expect(l.firstSeen).toBe('2026-07-16');
		expect(l.killedOn).toBe('2026-10-15');
		expect(l.lastTouched).toBe('2026-10-15');
	});

	it('killed — in opencode-go but neither live nor marked deprecated', () => {
		const l = classifyLifecycle('stale-1', GROK_DATES, {
			inGoProvider: true,
			liveOnGo: false,
			deprecated: false
		});
		expect(l.status).toBe('killed');
		expect(l.killedOn).toBe('2026-10-15');
	});

	it('drift — live on Go but absent from the models.dev Go provider', () => {
		const l = classifyLifecycle('drift-1', GROK_DATES, {
			inGoProvider: false,
			liveOnGo: true,
			deprecated: false
		});
		expect(l).toEqual({
			id: 'drift-1',
			status: 'drift',
			firstSeen: '2026-07-16',
			killedOn: null,
			lastTouched: '2026-10-15'
		});
	});

	it('never — no Atom history at all', () => {
		expect(classifyLifecycle('nope', [], base)).toEqual({
			id: 'nope',
			status: 'never',
			firstSeen: null,
			killedOn: null,
			lastTouched: null
		});
		expect(classifyLifecycle('nope', null, base).status).toBe('never');
	});

	it('an empty dates array yields never even when the model is otherwise live', () => {
		const l = classifyLifecycle('ghost', [], {
			inGoProvider: true,
			liveOnGo: true,
			deprecated: false
		});
		expect(l.status).toBe('never');
	});

	it('killed derives killedOn from the NEWEST date and firstSeen from the OLDEST', () => {
		const l = classifyLifecycle('grok-4.5', ['2026-10-15', '2026-08-01', '2026-07-16'], base);
		expect(l.status).toBe('killed');
		expect(l.killedOn).toBe('2026-10-15');
		expect(l.firstSeen).toBe('2026-07-16');
	});

	it('a model with dates but absent from both the provider and the API is killed, not never', () => {
		const l = classifyLifecycle('deepseek-v4-flash', GROK_DATES, base);
		expect(l.status).toBe('killed');
		expect(l.status).not.toBe('never');
	});

	it('a zero-day window (joined and killed in one commit) keeps firstSeen === killedOn', () => {
		// muse-spark-1.2: on Go 2026-08-19, killed 2026-08-19 (live fixture).
		const l = classifyLifecycle('muse-spark-1.2', ['2026-08-19'], base);
		expect(l.status).toBe('killed');
		expect(l.firstSeen).toBe('2026-08-19');
		expect(l.killedOn).toBe('2026-08-19');
	});

	it('derives oldest/newest independently of the input order', () => {
		const ascending = classifyLifecycle(
			'grok-4.5',
			['2026-07-16', '2026-08-01', '2026-10-15'],
			base
		);
		const shuffled = classifyLifecycle(
			'grok-4.5',
			['2026-08-01', '2026-10-15', '2026-07-16'],
			base
		);
		for (const l of [ascending, shuffled]) {
			expect(l.status).toBe('killed');
			expect(l.firstSeen).toBe('2026-07-16');
			expect(l.killedOn).toBe('2026-10-15');
		}
	});
});

describe('classifyLifecycle — verified killed windows (live fixture)', () => {
	// Every row below is a SNAPSHOT of real upstream, captured 2026-10-21 from
	// the per-file Atom feeds — see `go-lifecycle.fixture.ts` for provenance.
	// If these fail, upstream moved: re-capture the fixture, do not edit a row.

	it('fixture provenance records the snapshot it was captured from', () => {
		expect(PROVENANCE).toMatchObject({
			repo: 'anomalyco/models.dev',
			branch: 'dev',
			capturedOn: '2026-10-21',
			probeFailures: 0
		});
		expect(PROVENANCE.candidates).toBe(PROVENANCE.resolved);
	});

	it('pins the eight observed kill windows', () => {
		expect(KILLED_WINDOWS.map((k) => k.id)).toEqual([
			'deepseek-v4-flash',
			'deepseek-v4-flash-vision-exp',
			'glm-5',
			'grok-4.5',
			'kimi-k2.5',
			'muse-spark-1.2',
			'qwen3.5-plus',
			'space-bunny-free'
		]);
		expect(OBSERVED_COUNTS.killed).toBe(KILLED_WINDOWS.length);
	});

	it('observed status counts partition the candidate universe', () => {
		const sum = Object.values(OBSERVED_COUNTS).reduce((a, b) => a + b, 0);
		expect(sum).toBe(PROVENANCE.candidates);
	});

	it.each(KILLED_WINDOWS)('$id: $firstSeen → $killedOn', ({ id, firstSeen, killedOn, entries }) => {
		// The real feed, as GitHub serves it: newest entry first with the
		// feed-level <updated> it carries. Parsing it — rather than passing the
		// dates straight in — is what proves the two halves agree.
		const parsed = parseAtomDates(atomFeed(id, entries));
		expect(parsed).toEqual([...entries]);

		const l = classifyLifecycle(id, parsed, {
			inGoProvider: false,
			liveOnGo: false,
			deprecated: false
		});
		expect(l.status).toBe('killed');
		expect(l.firstSeen).toBe(firstSeen);
		expect(l.killedOn).toBe(killedOn);
		expect(l.lastTouched).toBe(killedOn);
	});

	it.each(KILLED_WINDOWS)(
		'$id classifies the same from a shuffled feed',
		({ id, firstSeen, killedOn, entries }) => {
			// The feed is newest-first today, but the ledger must not depend on feed
			// ordering — an ascending array has to yield the identical window.
			const l = classifyLifecycle(id, [...entries].reverse(), {
				inGoProvider: false,
				liveOnGo: false,
				deprecated: false
			});
			expect(l.firstSeen).toBe(firstSeen);
			expect(l.killedOn).toBe(killedOn);
		}
	);

	it('a two-entry zero-day feed keeps firstSeen === killedOn', () => {
		const zeroDay = KILLED_WINDOWS.filter((k) => k.firstSeen === k.killedOn);
		expect(zeroDay.map((k) => k.id)).toEqual(['muse-spark-1.2']);
	});
});

describe('fetchGoLifecycle', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	/** Stub `fetch` from a id → feed map; unmapped ids answer 404. */
	function stubFeeds(
		feeds: Record<string, string>,
		failing: string[] = [],
		serverError: string[] = []
	) {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url =
					input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
				calls.push(url);
				const match = /\/models\/(.+)\.toml\.atom$/.exec(url);
				const id = match ? decodeURIComponent(match[1]) : '';
				if (failing.includes(id)) throw new Error('network down');
				if (serverError.includes(id)) return new Response('boom', { status: 503 });
				const xml = feeds[id];
				if (xml === undefined) return new Response('Not Found', { status: 404 });
				return new Response(xml, { status: 200 });
			})
		);
		return calls;
	}

	const opts = (over: Partial<{ go: string[]; live: string[]; deprecated: string[] }> = {}) => ({
		goProviderIds: new Set(over.go ?? []),
		liveGoIds: new Set(over.live ?? []),
		deprecatedIds: new Set(over.deprecated ?? [])
	});

	it('classifies the whole universe from feeds, 404s and a failed request', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const calls = stubFeeds({ 'grok-4.5': GROK_FEED, hy3: GROK_FEED }, ['flaky']);
		const ledger = await fetchGoLifecycle(
			['hy3', 'grok-4.5', 'never-existed', 'flaky', 'drift-1'],
			{
				goProviderIds: new Set(['hy3']),
				liveGoIds: new Set(['hy3', 'drift-1']),
				deprecatedIds: new Set()
			}
		);

		expect(calls).toHaveLength(5);
		expect(calls[0]).toContain(
			'https://github.com/anomalyco/models.dev/commits/dev/providers/opencode-go/models/hy3.toml.atom'
		);

		// A 404 is a genuine `never`; a failed probe is omitted (unknown, not never).
		const statuses = Object.fromEntries([...ledger.values()].map((l) => [l.id, l.status] as const));
		expect(statuses).toEqual({
			hy3: 'alive',
			'grok-4.5': 'killed',
			'never-existed': 'never',
			'drift-1': 'never'
		});
		expect(ledger.has('flaky')).toBe(false);

		// The failure is logged and names the model that failed.
		expect(error).toHaveBeenCalledWith('[go-lifecycle] atom feed flaky failed:', 'network down');

		// A killed entry carries its verified window.
		expect(ledger.get('grok-4.5')).toMatchObject({
			firstSeen: '2026-07-16',
			killedOn: '2026-10-15'
		});
	});

	it('a single failed feed does not abort the sweep', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		stubFeeds({ a: GROK_FEED, b: GROK_FEED }, ['b']);
		const ledger = await fetchGoLifecycle(['a', 'b', 'c'], opts({ go: ['a'], live: ['a'] }));
		expect(ledger.size).toBe(2);
		expect(ledger.get('a')?.status).toBe('alive');
		expect(ledger.has('b')).toBe(false);
		expect(ledger.get('c')?.status).toBe('never');
	});

	it('a 404 gets a never entry while a 5xx gets none, and the sweep still resolves the rest', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const calls = stubFeeds({ a: GROK_FEED }, [], ['b']);
		const ledger = await fetchGoLifecycle(['a', 'b', 'c'], opts({ go: ['a'], live: ['a'] }));

		// All three were probed — the 5xx neither aborted the sweep nor retried.
		expect(calls).toHaveLength(3);
		expect(ledger.get('a')?.status).toBe('alive');
		// `c` 404s → genuinely never on Go → a `never` entry, with null dates.
		expect(ledger.get('c')).toEqual({
			id: 'c',
			status: 'never',
			firstSeen: null,
			killedOn: null,
			lastTouched: null
		});
		// `b` failed → NO entry: its state is unknown, not "never".
		expect(ledger.has('b')).toBe(false);
		expect(ledger.size).toBe(2);
		expect(error).toHaveBeenCalledWith('[go-lifecycle] atom feed b failed:', 'atom feed b: 503');
	});

	it('a non-404 error response yields no entry, not a never classification', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('boom', { status: 500 }))
		);
		const ledger = await fetchGoLifecycle(['x'], opts({ go: ['x'], live: ['x'] }));
		expect(ledger.has('x')).toBe(false);
		expect(ledger.size).toBe(0);
		expect(error).toHaveBeenCalled();
	});

	it('classifies drift for a live model with no feed', async () => {
		stubFeeds({});
		const ledger = await fetchGoLifecycle(['brand-new'], opts({ live: ['brand-new'] }));
		// No feed at all → `never` outranks drift: there is no listing history.
		expect(ledger.get('brand-new')?.status).toBe('never');
	});

	it('probes every id exactly once across batch boundaries', async () => {
		const ids = Array.from({ length: 25 }, (_, i) => `m${i}`);
		const calls = stubFeeds({});
		const ledger = await fetchGoLifecycle(ids, opts());
		expect(ledger.size).toBe(25);
		expect(new Set(calls).size).toBe(25);
		expect(calls).toHaveLength(25);
	});

	it('encodes the model id in the feed path', async () => {
		const calls = stubFeeds({});
		await fetchGoLifecycle(['weird/id'], opts());
		expect(calls[0]).toContain('models/weird%2Fid.toml.atom');
	});

	it('returns an empty ledger for an empty universe', async () => {
		stubFeeds({});
		const ledger: Map<string, GoLifecycle> = await fetchGoLifecycle([], opts());
		expect(ledger.size).toBe(0);
	});
});
