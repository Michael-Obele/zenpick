import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { revalidateModels } from '$lib/server/models';
import type { RequestHandler } from './$types';

/**
 * Operator-only endpoint that forces a fresh upstream fetch of the Go model
 * catalog and frontier snapshot, bypassing the 6h stale-while-revalidate TTL.
 *
 *   POST /api/revalidate
 *   Authorization: Bearer <REVALIDATE_SECRET>
 *
 * Use it from a Netlify build hook, a scheduled GitHub Action, or a one-off
 * `curl` when a new model lands upstream and you don't want to wait out the TTL
 * or redeploy. See the README ("Refreshing model data in production").
 *
 * NOTE: the model cache is per-instance memory. On a serverless host with more
 * than one warm instance this invalidates the instance that receives the
 * request; others converge as their own TTLs lapse. A shared cache (KV/Blobs/
 * Redis) would make this global — out of scope here.
 */

// Runs at request time (route default) — this is a mutation, never prerender it.

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.REVALIDATE_SECRET;
	if (!secret) {
		error(500, 'Revalidation is not configured (REVALIDATE_SECRET is unset)');
	}

	const provided = bearerToken(request.headers.get('authorization'));
	if (!provided || !constantTimeEqual(provided, secret)) {
		error(401, 'Unauthorized');
	}

	const started = Date.now();
	const models = await revalidateModels();

	return json({
		ok: true,
		models: models.length,
		durationMs: Date.now() - started,
		at: new Date().toISOString()
	});
};

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
