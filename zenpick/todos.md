# ZenPick Tasks

## Phase 1: Foundation

- [ ] Initialize SvelteKit project with Bun (`bunx sv create opencode-compare`).
- [ ] Add Tailwind CSS (`bunx sv add tailwindcss`).
- [ ] Install charting library (e.g., Uncharted or LayerChart).

## Phase 2: Data & State

- [ ] Convert the Markdown model table into a structured TypeScript array/JSON object.
- [ ] Create a reactive state in Svelte 5 (`$state()`) for the user's input (tokens, task complexity).

## Phase 3: Components

- [ ] Build `ModelTable.svelte` with sorting/filtering.
- [ ] Build `QuotaCalculator.svelte` for translating token usage into the $12/$30/$60 limit thresholds.
- [ ] Build `InteractiveRouter.svelte` for the step-by-step wizard.
- [ ] Build `ComparisonCharts.svelte` using the chosen chart library.

## Phase 4: Polish

- [ ] Implement responsive dark mode design.
- [ ] Add "Compare on LLMStats" links to model cards.
- [ ] Finalize copy and deploy to Cloudflare Pages.
