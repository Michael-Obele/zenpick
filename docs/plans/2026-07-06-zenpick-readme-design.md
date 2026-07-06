# ZenPick README Design

**Date:** 2026-07-06
**Status:** approved

## Overview

Replaced the default SvelteKit scaffold README with a marketing-forward, developer-friendly README for the ZenPick project (live at [zenpick.netlify.app](https://zenpick.netlify.app)).

## Design Decisions

### Approach: Marketing-Forward (#3)

Chose approach #3 (marketing-forward) over minimal (#1) and standard OSS (#2) because:

- The repo is the primary landing point for users discovering the tool
- A screenshot and value propositions immediately communicate what the tool does
- Developer setup instructions still included but placed after the pitch

### Copy Strategy

- **Headline**: Uses the thermal metaphor ("without burning through your quota") to hook developers who feel the pain of choosing wrong models
- **Why ZenPick section**: Frames the problem before listing features — answers the exact questions a developer asks when staring at 12+ model options
- **Features**: Each bullet connects a feature to its outcome
- **CTA**: Primary CTA is visiting the live site (link in hero); secondary is `git clone && bun run dev`

### Screenshot

Captured from the live Netlify deployment at `https://zenpick.netlify.app`. Saved to `static/screenshot.png` so GitHub renders it inline.

### Netlify Badge

Placeholder badge URL included — replace `YOUR_BADGE_ID` with the actual Netlify badge UUID from the site settings.

## Files Changed

- `README.md` — full replacement of scaffold README
- `.env.example` — created to document required environment variables
- `static/screenshot.png` — full-page screenshot from live deployment
