import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Vitest configuration for ZenPick's logic and component tests.
 *
 * The suite started out covering plain TypeScript modules only (blend / burn /
 * go-docs / plan / recommendation / compare-defaults), with a Node environment
 * plus the `$lib` alias and no Svelte plugin. It now ALSO renders Svelte
 * components: the Svelte plugin compiles `.svelte` imports and `svelte/server`
 * renders them server-side in plain Node — no DOM, no jsdom, and no
 * component-testing library. That is a one-line plugin change because
 * `@sveltejs/vite-plugin-svelte` is already a dependency.
 *
 * The full SvelteKit plugin (and its `$app` / `$env` shims) is still
 * deliberately not loaded, which keeps the suite fast and hermetic: a component
 * under test must not import SvelteKit virtual modules.
 *
 * The repo has no `svelte.config.js` (SvelteKit generates its own at build
 * time), so the plugin would otherwise warn "no Svelte config found". Explicit
 * `configFile: false` keeps the output clean without adding a config file at
 * the repo root — which would change how SvelteKit itself builds the app.
 */
export default defineConfig({
	plugins: [svelte({ configFile: false })],
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
