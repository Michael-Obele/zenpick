# GitHub Copilot Instructions - Standard Project Template

## Tech Stack & Architecture

- **Runtime & Tooling**: Vite+ (`vp`) is the toolchain and entry point — Vite, Rolldown, Vitest, Oxlint, Oxfmt, tsdown and Vite Task behind one CLI, with package management delegated to Bun. Project scripts run via `vpr <script>` (`vpr` = `vp run`). See **Using Vite+** at the end of this file.
- **Framework**: SvelteKit 5 (using Runes: `$state`, `$props`, `$derived`, `$effect`).
- **Styling**: Tailwind CSS v4. Prefer semantic classes (e.g., `btn-primary`, `text-muted-foreground`).
- **Database**: Prisma ORM v6 (NOT v7) with PostgreSQL. Use a singleton client (typically at `$lib/prisma` or `$lib/server/db`).
- **Authentication**: Better Auth (preferred) or WorkOS.
- **Icons**: Use `@lucide/svelte` (NEVER use `lucide-svelte`). Import icons as components: `import { IconName } from '@lucide/svelte'`.
- **Components**: shadcn-svelte primitives and Bits UI. Never manually write shadcn-svelte components; always generate or install them via the official CLI commands obtained from MCP documentation or trusted research.

## Coding Conventions

### Commit or Push Policy

- **Commit locally only on explicit request; never push or force.** The agent may run `git commit` when the user explicitly asks it to commit. It must still stop after edits, run the quality checks, and hand control back to the user.
- **Never `git push`, open PRs, or run force/destructive operations** (`push`, `push --force`, `reset --hard`, `branch -D`, etc.). Those remain the user's to run.
- When changes are complete, the agent should summarize what changed, why, and which files were touched.
- This applies to all work in this repository, including chore commits, dependency bumps, formatting fixes, and doc updates.

### Quality Gate

- **Formatting**: Oxfmt through Vite+ — Prettier is no longer in the toolchain. Settings live in the `fmt` block of `vite.config.ts` (`useTabs: true`, `singleQuote: true`, `printWidth: 100`); never add a separate `.oxfmtrc.json`. Format only the files you edited, then verify the project: `vp fmt <file_path>` followed by `vp fmt --check .`. Write the configured style from the start — Oxfmt re-indents an entire file when its indentation is inconsistent, which turns a small change into a huge diff that then fails `--check`.
- **Proactive Checking**: Run `vp check` after substantive edits — one pass running Oxfmt, Oxlint and the tsgolint type-check (`typeCheck: true`). Without `--fix` it is read-only. It is a Vite+ built-in, so it SHADOWS the `check` npm script; run both: `vp check` (fast static gate) and `vpr check` (`svelte-kit sync && svelte-check`).
- **Type-check ownership**: tsgolint has no Svelte transform, so `src/lib/components/ui/**/index.ts` barrel re-exports are excluded from `vp check`. **`vpr check` / `svelte-check` is the source of truth for `.svelte` files and those barrels** — never treat a green `vp check` as full coverage.
- **Error Handling**: Only warnings can be ignored; errors must be fixed immediately. Use `<svelte:boundary>` for async operations to handle loading and error states gracefully.

### Package Management

- **Installation**: Install through the Vite+ CLI — `vp add <package>`, `vp remove <package>`, `vp update`, `vp install`, `vp why <package>` (it delegates to Bun). One-off package binaries: `vp dlx` / `vpx`. Project-local binaries: `vp exec`. Never edit package.json directly.
- **Research**: Thoroughly research packages before installation to ensure compatibility, necessity, and alignment with project standards (e.g., check for Svelte 5 compatibility, bundle size, maintenance status).

### Svelte 5 Runes

Always use Svelte 5 runes for reactivity. Never use legacy `export let` or `$:`.

- `$state(value)`: Declare reactive state. Use `$state.raw` for large objects/arrays that don't need deep reactivity.
- `$props()`: Receive component props. Destructure for clarity: `let { prop1, prop2 } = $props();`.
- `$derived(expression)`: Declare derived state. Use `$derived.by(() => ...)` for complex logic.
- `$effect(() => ...)`: Handle side effects (DOM, timers, etc.). Avoid for state synchronization.
- `$bindable()`: Mark a prop as bindable for two-way communication.
- `$inspect(value)`: Debug reactive state in development.
- **Events**: Use modern event attributes (e.g., `onclick`, `onsubmit`, `onchange`) directly on elements.

### Deprecated Svelte Patterns to Avoid

Avoid these deprecated patterns from Svelte 4 and earlier. Use the modern Svelte 5 equivalents instead:

- **State Management**: Never use `let` declarations at the top level for reactivity. Use `$state()` instead.
- **Reactive Statements**: Avoid `$:` for derived state or side effects. Use `$derived()` and `$effect()` instead.
- **Props**: Never use `export let` for component props. Use `$props()` destructuring instead.
- **Event Handlers**: Avoid `on:click={handler}` directives. Use `onclick={handler}` attributes instead.
- **Component Events**: Never use `createEventDispatcher`. Pass callback props instead.
- **Component Instantiation**: Avoid `new Component()`. Use `mount(Component, ...)` instead.
- **Lifecycle Hooks**: Avoid `beforeUpdate`/`afterUpdate`. Use `$effect.pre`/`$effect` instead.
- **Slots**: Avoid `<slot />`. Use `{@render children()}` with snippets instead.
- **Dynamic Components**: Avoid `<svelte:component this={Comp}>`. Use `<Comp />` directly.
- **Legacy Props**: Avoid `$$props` and `$$restProps`. Use destructuring in `$props()` instead.
- **Stores**: Prefer runes over Svelte stores for component-level state.
- **Class Components**: Avoid class-based components. Use function components with runes.

- Use `$app/state` (e.g., `import { page } from '$app/state'`) instead of the deprecated `$app/stores` for accessing `page`, `navigating`, `updated`, etc.

### Data Fetching & Mutations (Remote Functions)

Default to **Remote Functions** (experimental `@sveltejs/kit` features or standard patterns) over `+page.server.ts` actions for most mutations.

- **Location**: Place remote functions in `src/lib/remote/` with the `.remote.ts` extension.
- **Barrel Exports**: Use `src/lib/remote/index.ts` to re-export all functions individually (not `export *`) to allow for better documentation and discovery.
- **Flavors**:
  - `query`: For reading dynamic data. Supports `refresh()`, `loading`, `error`.
  - `form`: For mutations via `<form>`. Supports progressive enhancement via `enhance`. Always prefer `form` components with `bind:value` or `.as()` attributes over manual `async handleSubmit` functions.
  - `command`: For mutations triggered by scripts/buttons without a form.
  - `prerender`: For data that can be fetched at build time.
- **Validation**: Always validate inputs using a Standard Schema library, preferably **Valibot**.
- **Form Usage**: Always use the `form` object and its fields (e.g., `form.fields.name.as('text')`) to bind to native HTML elements. Avoid creating custom `handleSubmit` async functions to manually call remote functions; instead, let the form's native submission or `enhance` handle the interaction.
- **Client-side Validation**: Use `preflight(schema)` for client-side validation before submission where applicable.
- **Efficiency**: Use `query.batch` for multiple related fetches and `submit().updates(query)` for efficient post-mutation UI updates.

### Database Access

- **Version**: Always use Prisma v6 (not v7).
- Default to using a singleton Prisma client.
- Schema changes: Use `vp dlx prisma db push` for rapid prototyping and `vp dlx prisma migrate dev` for stable environments.

### Styling & UI Design

- **Gradients**: NEVER use gradients; prefer solid colors, clean layouts, and professional minimalist aesthetics.
- **Icons**: Use Lucide icons sparingly and only where they add real meaning — status, direction, or an action affordance. Never add decorative filler icons, and in particular avoid `Sparkles`/AI-style icons on buttons, headings, and dropdown options. Prefer text-only labels for dropdown options, tips, and captions; a control should communicate its purpose without its icon.
- **Tailwind v4**: Use semantic tokens from the CSS configuration. Avoid hardcoded HSL/Hex strings in components.
- **Responsive**: Use standard Tailwind responsive prefixes (e.g., `lg:flex-row`).
- **Utility**: Use a `cn` utility (clsx + tailwind-merge) for conditional class merging.
- **Registry classes (`ui/`)**: these are CLI-generated — fix a broken one by changing its _usage_, not the file, and never hand-author one. When a class silently does nothing it is almost always `cn()`/tailwind-merge dropping an earlier class in the same group (`'fixed relative'` → **neither** survives the merge) or a plain class losing on specificity to a `data-[…]`/`group-data-[…]` variant (`md:text-left` can never beat `group-data-[…]:text-center`). Override by passing the SAME variant the component already uses: `data-[side=right]:sm:max-w-2xl` merges and wins; a plain `sm:max-w-2xl` does neither.
- **Bits UI focus**: `Dialog.Content` auto-focuses on open (`onOpenAutoFocus`). Content inside a scroller therefore opens scrolled down to its first tabbable element — keep primary actions OUTSIDE the scroller (e.g. `Sheet.Footer`) so a panel opens at its heading.

## Key Files & Directories Pattern

- `src/lib/remote/`: Logic for data fetching and mutations.
- `src/lib/components/ui/`: shadcn-svelte / primitive UI components. Prefer CLI-generated shadcn-svelte components over hand-written implementations.
- `src/lib/components/`: Shared components (e.g., navbar, footer) in `blocks/` subfolder; route-specific components in folders named after the route.
- `src/routes/`: Router logic. Use `+page.server.ts` or `+layout.server.ts` ONLY for initial `load` functions.
- `static/`: Static assets.

## Common Workflows

- Do not run the dev server (`vp dev`; `bun run dev` maps to it) unless the user explicitly asks for live verification.
- **Type Checking**: `vp check` (Oxfmt + Oxlint + tsgolint) plus `vpr check` / `bun run check` (svelte-check — the source of truth for `.svelte` and the `ui/` barrels). For a repeat run use the cached `vpr typecheck` task (`vite.config.ts`); `package.json` scripts are uncached by default, tasks are cached.
- **Tests**: `vpr test` / `bun run test` → `vp test run` (single pass). Bare `vp test` is **watch mode** — only use it when the user wants a watcher.
- **Import from `vite-plus`**, not from the packages it wraps: `defineConfig` / `lazyPlugins` from `'vite-plus'`, and test APIs from `'vite-plus/test'` (`import { describe, it, expect } from 'vite-plus/test'`). The `vite-plus/prefer-vite-plus-imports` lint rule enforces this as an error.

## AI Agent Integration

- **Memory MCP**: Persist useful context by writing to and reading from the Memory MCP during work to maintain consistency across sessions.
- **Documentation**: Use `mcp_svelte_get-documentation` for the latest Svelte 5/Kit logic and `mcp_svelte_svelte-autofixer` to validate components before finalizing.
- **shadcn-svelte Workflow**: Never author shadcn-svelte components manually. Always use the CLI commands recommended by MCP documentation or equivalent trusted research to create, add, or update them.
- **MCP tool routing**: `shadcn-svelte-get` FIRST for any component/block/chart/doc question; use `bits-ui-get` only for the lower-level primitive, and only once the shadcn tool has named it. `components.json` pins `style: "maia"` — that style's registry copies carry class-composition bugs, so review the diff of any component you regenerate.

## Fallow Quality Gate

- **Run**: `bun run check:quality` → `fallow dead-code --fail-on-regression` + `fallow health`.
- **Baseline**: `fallow.toml` embeds a `[regression.baseline]` (dead-code counts) — the gate
  only fails on NEW dead code. Refresh with `fallow dead-code --save-regression-baseline`.
- **Health overrides**: known-safe functions/templates have `[[health.thresholdOverrides]]`
  ceilings pinned at their current scores — any growth re-flags. Add an override with a
  `reason` instead of loosening global thresholds.
- **Bundler convention**: runtime deps live in devDependencies (Vite bundles everything);
  `dev-dependencies-in-production` is set to `warn` so it never blocks.
- **Ignore deps**: `mode-watcher`, `tailwind-variants`, `vaul-svelte` are consumed by the
  excluded `ui/` folder — listed in `ignoreDependencies` so they don't report as unused.
- Requires fallow >= 3.14 (older versions silently drop `thresholdOverrides`).

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
