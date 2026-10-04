import type { Component } from 'svelte';
import { Brain, Bot, Calculator, Palette } from '@lucide/svelte';

export interface ScenarioSpec {
	value: string;
	label: string;
	icon: Component;
}

/**
 * Task scenarios — the "Weight by" row of filters. Each scenario produces
 * a fit score per model; when combined with a browse-by-need ranking,
 * fit weights the metric so the two controls jointly determine the output
 * (one need + one scenario = a merged, fit-weighted ranking).
 *
 * No "All" entry: no selection IS the default — an empty scenario means
 * the table ranks purely by the chosen need (or burn rate when no need is
 * selected either).
 *
 * `frontend` earns its place here for a specific reason: Design Arena Elo is
 * a Bradley-Terry fit over pairwise VOTES, and Design Arena drops any model
 * with fewer than 15 of them — so ~70% of the catalog has no Elo at all, and
 * that share is newest releases first (Qwen 3.8, GLM 5.3 Flash). The Frontend
 * scenario is the honest fallback for those models: it scores UI work from
 * reasoning + coding + vision + tools, degrading gracefully instead of going
 * blank. It is a DIFFERENT question from the Design need's Elo — "good at UI
 * work" rather than "voted best at UI work" — so the two are never merged into
 * one ranking; see needs.ts on why Elo is never imputed.
 */
export const SCENARIOS: ScenarioSpec[] = [
	{ value: 'brainstorming', label: 'Brainstorming', icon: Brain },
	{ value: 'agentic', label: 'Agentic', icon: Bot },
	{ value: 'budget', label: 'Budget', icon: Calculator },
	{ value: 'frontend', label: 'Frontend', icon: Palette }
];

export function scenarioLabel(value: string): string | null {
	return SCENARIOS.find((s) => s.value === value)?.label ?? null;
}
