/** In-memory TTL cache for model data. No DB, no static JSON. */

interface CacheEntry<T> {
	data: T;
	/** Unix timestamp when this entry was created */
	createdAt: number;
	/** TTL in milliseconds */
	ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get from cache if fresh. Returns { data, stale } — stale=true means it's past TTL
 * but still usable for stale-while-revalidate.
 */
export function cacheGet<T>(key: string): { data: T; stale: boolean } | null {
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (!entry) return null;
	const age = Date.now() - entry.createdAt;
	const stale = age > entry.ttl;
	return { data: entry.data, stale };
}

/** Store in cache with a TTL in milliseconds. */
export function cacheSet<T>(key: string, data: T, ttl: number): void {
	cache.set(key, { data, createdAt: Date.now(), ttl });
}

/**
 * Every cached key whose name contains `fragment`, with the TTL it was written
 * with.
 *
 * TEST INTROSPECTION ONLY — not a production API. The loader keys are
 * content-addressed (hashed from builder source), so a test cannot hardcode
 * them, and the TTL a build chose is exactly what those tests assert.
 *
 * Passing `keep` also DROPS every other entry, which is the per-test cache
 * reset: the tests cannot name the content-addressed keys to clear them
 * individually.
 */
export function cacheKeysMatching(
	fragment: string,
	keep?: (key: string) => boolean
): { key: string; ttl: number }[] {
	if (keep) {
		// Snapshot the keys first: deleting while iterating a Map is safe, but
		// the copy keeps the intent obvious.
		const keys = Array.from(cache.keys());
		for (const key of keys) if (!keep(key)) cache.delete(key);
	}
	return [...cache.entries()]
		.filter(([key]) => key.includes(fragment))
		.map(([key, entry]) => ({ key, ttl: entry.ttl }));
}

/**
 * Drop one entry, so the next read rebuilds it instead of serving it.
 *
 * Used by the explicit revalidation paths (e.g. `?scope=lifecycle`), where
 * "bypass the TTL" means "re-run the build", not "treat it as stale".
 * Returns whether an entry was actually removed.
 */
export function cacheClear(key: string): boolean {
	return cache.delete(key);
}

/** Default TTL for model data: 6 hours. */
export const MODELS_TTL = 6 * 60 * 60 * 1000;

/** Default TTL for Go docs pricing: 24 hours (docs change infrequently). */
export const GO_DOCS_PRICING_TTL = 24 * 60 * 60 * 1000;
