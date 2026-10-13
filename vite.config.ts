import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
	lint: {
		jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
		rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
		options: { typeAware: true, typeCheck: true },
		// tsgolint has no Svelte transform, so `export ... from '*.svelte'`
		// re-exports in shadcn barrel files report TS2614. svelte-check is the
		// source of truth for those files — exclude them from vp check's
		// type-check (lint rules don't apply there anyway; they're pure re-exports).
		ignorePatterns: ['src/lib/components/ui/**/index.ts']
	},
	fmt: {
		useTabs: true,
		singleQuote: true,
		trailingComma: 'none',
		printWidth: 100,
		sortPackageJson: false,
		sortTailwindcss: {
			stylesheet: './src/routes/layout.css'
		},
		svelte: {},
		ignorePatterns: [
			'package-lock.json',
			'pnpm-lock.yaml',
			'yarn.lock',
			'bun.lock',
			'bun.lockb',
			'/static/'
		]
	},
	plugins: lazyPlugins(() => [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			alias: {
				'@/*': './src/lib/components/*'
			},
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			experimental: {
				remoteFunctions: true
			},
			vitePlugin: {
				inspector: {
					toggleKeyCombo: 'alt-x',
					showToggleButton: 'always',
					toggleButtonPos: 'bottom-right'
				}
			}
		})
	]),
	ssr: {
		noExternal: ['@dagrejs/dagre']
	}
});
