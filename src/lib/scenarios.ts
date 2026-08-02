import type { Component } from 'svelte';
import { Brain, Globe, Bot, Calculator } from '@lucide/svelte';

export interface ScenarioSpec {
	value: string;
	label: string;
	icon: Component;
}

/**
 * Task scenarios — the "what are you doing" row of filters. Each scenario
 * produces a fit score per model; when combined with a browse-by-need
 * ranking, fit weights the metric so the two controls jointly determine
 * the output.
 *
 * Deliberately excludes Coding and Frontend UI: those are already
 * first-class one-click browse categories in the Browse-by-need row
 * (which carries richer data — live leaderboards with metric bars), so
 * duplicating them here only doubled the pills and forced an alias
 * clearing hack. The remaining scenarios are modes that no need covers.
 */
export const SCENARIOS: ScenarioSpec[] = [
	{ value: '', label: 'All', icon: Globe },
	{ value: 'brainstorming', label: 'Brainstorming', icon: Brain },
	{ value: 'agentic', label: 'Agentic', icon: Bot },
	{ value: 'budget', label: 'Budget', icon: Calculator }
];

export function scenarioLabel(value: string): string | null {
	return SCENARIOS.find((s) => s.value === value)?.label ?? null;
}
