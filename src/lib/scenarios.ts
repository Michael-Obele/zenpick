import type { Component } from 'svelte';
import { Brain, Bot, Calculator } from '@lucide/svelte';

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
 */
export const SCENARIOS: ScenarioSpec[] = [
	{ value: 'brainstorming', label: 'Brainstorming', icon: Brain },
	{ value: 'agentic', label: 'Agentic', icon: Bot },
	{ value: 'budget', label: 'Budget', icon: Calculator }
];

export function scenarioLabel(value: string): string | null {
	return SCENARIOS.find((s) => s.value === value)?.label ?? null;
}
