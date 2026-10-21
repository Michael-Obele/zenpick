import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { revalidateLifecycle, revalidateModels } from '$lib/server/models';
import type { RequestHandler } from './$types';

/**
 * Operator-only endpoint that forces a fresh upstream fetch, bypassing the
 * cached TTLs.
 *
 *   POST /api/revalidate
 *   POST /api/revalidate?scope=lifecycle
 *   Authorization: Bearer <REVALIDATE_SECRET>
 *
 * Without `scope` it rebuilds the Go model catalog and frontier snapshot
 * (6h TTL), exactly as before. `?scope=lifecycle` rebuilds ONLY the advisory
 * lifecycle ledger + canonical benchmark index (24h TTL) — the one cache the
 * default refresh deliberately leaves alone, because a ~140-feed Atom sweep
 * must never block a catalog rebuild.
 *
 * Use it from a Netlify build hook, a scheduled GitHub Action, or a one-off
 * `curl` when a new model lands upstream and you don't want to wait out the TTL
 * or redeploy. See the README ("Refreshing model data in production").
 *
 * NOTE: the cache is per-instance memory. On a serverless host with more
 * than one warm instance this invalidates the instance that receives the
 * request; others converge as their own TTLs lapse. A shared cache (KV/Blobs/
 * Redis) would make this global — out of scope here.
 */

// Runs at request time (route default) — this is a mutation, never prerender it.

/** The scopes a caller may request; anything else is a 400, never a silent default. */
const SCOPES = ['all', 'lifecycle'] as const;
type Scope = (typeof SCOPES)[number];

export const POST: RequestHandler = async ({ request, url }) => {
	const secret = env.REVALIDATE_SECRET;
	if (!secret) {
		error(500, 'Revalidation is not configured (REVALIDATE_SECRET is unset)');
	}

	const provided = bearerToken(request.headers.get('authorization'));
	if (!provided || !constantTimeEqual(provided, secret)) {
		error(401, 'Unauthorized');
	}

	const requested = url.searchParams.get('scope') ?? 'all';
	if (!isScope(requested)) {
		error(400, `Unknown scope '${requested}' (expected ${SCOPES.join(' | ')})`);
	}

	const started = Date.now();

	if (requested === 'lifecycle') {
		const lifecycle = await revalidateLifecycle();
		// `ok` reflects reality: a failed rebuild returns the previously cached
		// report (or the empty fallback), and only the empty fallback has
		// `builtAt: null`. Answering `ok: true` there would report a failed
		// sweep as a successful one.
		const ok = lifecycle.builtAt != null;
		return json(
			{
				ok,
				scope: 'lifecycle',
				models: lifecycle.rows.length,
				benchmarks: lifecycle.benchmarks.length,
				builtAt: lifecycle.builtAt,
				...(ok ? {} : { error: 'Lifecycle rebuild failed; serving the previous report' }),
				durationMs: Date.now() - started,
				at: new Date().toISOString()
			},
			{ status: ok ? 200 : 500 }
		);
	}

	const models = await revalidateModels();

	return json({
		ok: true,
		scope: 'all',
		models: models.length,
		durationMs: Date.now() - started,
		at: new Date().toISOString()
	});
};

function isScope(value: string): value is Scope {
	return (SCOPES as readonly string[]).includes(value);
}

function bearerToken(header: string | null): string | null {
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match ? match[1].trim() : null;
}

/** Length-checked, constant-time string comparison (avoids timing leaks). */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
