---
title: OpenCode Compare
status: draft
owner: Michael Obele
tags:
  - opencode-go
  - comparison
  - calculator
  - svelte5
estimated_time: 15 hours
prototype: false
---

# OpenCode Compare

An interactive web application designed to help developers compare OpenCode Go models against closed-source alternatives, calculate estimated API requests based on token limits, and find the most cost-effective routing strategy.

## 🎯 Problem / Opportunity

- **Problem:** Developers migrating from Copilot Pro or individual API subscriptions (like Anthropic/OpenAI) struggle to estimate their exact usage, identify direct model replacements, and understand OpenCode Go's unique 5-hour rolling usage quota limits.
- **Opportunity:** By converting our static markdown guide into a dynamic, interactive website, we can provide developers with a real-time calculator, visual model comparisons, and interactive decision trees. This will drive adoption and simplify the migration to OpenCode Go.

## 💡 Proposed Approach

1. **Interactive Calculator:** Let users input their average daily/weekly token usage to dynamically calculate their estimated requests across the 5-hour, weekly, and monthly OpenCode Go quota windows.
2. **Visual Comparisons:** Use modern Svelte 5 charting libraries (like LayerChart) to render bar and radar charts comparing Kimi K2.6, GLM-5.1, DeepSeek V4 against Claude 4.5/4.6 and GPT-5.4 models based on input/output pricing, context limits, and quality ratings.
3. **LLMStats Integration:** Provide external links or fetch data from [LLM Stats](https://llm-stats.com/) (which tracks 300+ models) to show live benchmark and pricing comparisons for the closed-source counterparts.
4. **Interactive Routing Tree:** Convert the Mermaid decision tree into an interactive wizard where developers answer "Context Size?", "Needs Vision?", and "Complexity?" to get instant model recommendations.
5. **Tech Stack:**
   - **Framework:** Svelte 5 / SvelteKit
   - **Styling:** Tailwind CSS
   - **Charts:** Uncharted (Svelte 5 native) or LayerChart
   - **Package Manager:** Bun

## 🏆 Success Criteria

- [ ] Clean, intuitive UI showcasing OpenCode Go models.
- [ ] Accurate calculator mapping token inputs to OpenCode Go dollar-value quotas ($12/5h, $30/wk, $60/mo).
- [ ] Responsive comparison graphs displaying model capabilities.
- [ ] Interactive routing wizard effectively recommending correct models.
- [ ] Integration or prominent linking to LLM Stats for up-to-date closed-source data.

## 📝 Next Actions

- [ ] Outline specific component structure in `todos.md`.
- [ ] Define the JSON schema for model data.
- [ ] Design the UI layout and calculator component.
- [ ] Select and integrate the charting library (evaluate Uncharted vs LayerChart).
- [ ] Deploy prototype to Cloudflare Pages.

---

## 🔗 Related Documents

- [Original Research Document](../../archive/opencode-go-model-replacements/index.md)
- [Notes & Brainstorming](./notes.md)
- [Task List](./todos.md)
