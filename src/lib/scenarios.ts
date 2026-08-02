import type { Component } from 'svelte';
import { Brain, Calculator, Code, Globe, Layout, Trophy, Bot } from '@lucide/svelte';

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
 */
export const SCENARIOS: ScenarioSpec[] = [
	{ value: '', label: 'All', icon: Globe },
	{ value: 'brainstorming', label: 'Brainstorming', icon: Brain },
	{ value: 'coding', label: 'Coding', icon: Code },
	{ value: 'competitive', label: 'Competitive', icon: Trophy },
	{ value: 'agentic', label: 'Agentic', icon: Bot },
	{ value: 'frontend', label: 'Frontend UI', icon: Layout },
	{ value: 'budget', label: 'Budget', icon: Calculator }
];

export function scenarioLabel(value: string): string | null {
	return SCENARIOS.find((s) => s.value === value)?.label ?? null;
}
