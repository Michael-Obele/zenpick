# ZenPick — Design Doc

**Date:** 2026-07-04
**Status:** approved

## Overview

Interactive web app to help developers find the right OpenCode Go model for their task — with economically-informed decisions. Shows which models burn through the $12/5h quota fastest vs. slowest, which are best for brainstorming/coding/agentic work, and what closed-source models they replace.

## Architecture

### Data Sources (all live, zero static curation)

1. **OpenCode Go API** (`GET https://opencode.ai/zen/go/v1/models`) — model list (IDs only)
2. **LLM Stats API** (`GET /stats/v1/models`, `/stats/v1/rankings`, `/stats/v1/scores`) — benchmarks, pricing, context windows, speed, rankings by category (coding, reasoning, math)
3. **Inference layer** — algorithmic tag generation from benchmark data (see `src/lib/server/inference.ts`)

### Caching

- In-memory `Map` with 6-hour TTL in `src/lib/cache.ts`
- Stale-while-revalidate: serve stale data instantly, refresh in background
- Cold start: fetch live, ~2s initial load
- No static JSON, no database

### Data Flow

```
+page.svelte → getModels() query → cache check → fetch (LLM Stats + OpenCode Go) → inference → enriched models → client
```

### File Layout

```
src/lib/
  types/models.ts          — shared type definitions
  server/
    llm-stats.ts           — LLM Stats API client
    opencode-go.ts         — OpenCode Go /models endpoint
    inference.ts           — algorithmic tag/ranking generation
  cache.ts                 — in-memory TTL cache
  remote/
    models.remote.ts       — getModels Query, getModel Query
  components/
    ModelTable.svelte      — sortable/filterable table
    ModelRow.svelte        — single row with burn rate badge
    ModelDrawer.svelte     — detail panel
    QuotaCalculator.svelte — token → quota usage widget
    FilterBar.svelte       — scenario dropdown + search
src/routes/
  +page.svelte             — the one page
```

## Model Display Data

### Table Columns (Core)

- Model name, provider, pricing (input/output per 1M tokens), requests per quota window (5h/week/month), burn rate tier, best-for tags, coding/reasoning benchmark scores, context window

### Detail Drawer

- Migration mapping ("if you used Claude Sonnet 4.5..."), endpoint type, best-avoided-for notes, per-request cost estimate, model ID for config, provider info, all benchmark scores, LLM Stats comparison link

### Algorithmic Tags (inferred, not curated)

- 🧠 Brainstorming/Reasoning → top 25% in reasoning rankings
- 💻 Coding → top 25% in coding rankings
- ⚔️ Competitive Programming → high SWE-bench + Code Arena
- 🤖 Agentic/Autonomous → high SWE-bench + large context + coding rank
- 📐 Math/Research → top 25% in math rankings
- 📚 Long Context → ≥500K context window
- ⚡ Budget/High Volume → lowest pricing tier
- 🔥 Burns Quota Fast → high pricing → few requests per window
- ❄️ Quota-Friendly → low pricing → many requests per window

## Tech Stack

- Svelte 5 / SvelteKit (remote functions)
- Tailwind CSS v4
- shadcn-svelte UI components
- Lucide icons
- Bun package manager
- Cloudflare Pages deployment
