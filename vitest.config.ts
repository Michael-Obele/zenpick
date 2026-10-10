import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for ZenPick's pure logic tests.
 *
 * The tested modules (blend / burn / go-docs / plan / recommendation /
 * compare-defaults) are plain TypeScript with no SvelteKit virtual imports,
 * so a Node environment plus the `$lib` alias is all that is required — the
 * full SvelteKit Vite plugin (and its `$app` / `$env` shims) is deliberately
 * not loaded, which keeps the suite fast and hermetic.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
