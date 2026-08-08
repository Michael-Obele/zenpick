import type {
	ModelgrepModelData,
	ModelBenchmarks,
	ModelSpeed,
	ScenarioScores,
	BurnDetails,
	ModelPricing
} from '$lib/types/models';

interface ScenarioInputs {
	goId: string;
	pricing: ModelPricing;
	benchmarks: ModelBenchmarks;
	burnDetails: BurnDetails;
	speed: ModelSpeed | null;
	mgModel: ModelgrepModelData | null;
	/** Resolved context window (modelgrep → llm-stats → inference fallback). */
	contextWindow: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function normalize(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(1, Math.max(0, value / max));
}

// ─── Two-axis scoring ─────────────────────────────────────────────────

function scoreQualityCoding(benchmarks: ModelBenchmarks): number {
	// Quality = BLENDED benchmark scores, not raw modelgrep AA fields.
	// `benchmarks.coding` already prefers modelgrep AA and falls back to
	// llm-stats when AA data is missing — so a model that DISPLAYS a real
	// coding score can never collapse to ~0 here (the M2.5 bug).
	let score = 0;
	let weight = 0;

	if (benchmarks.coding != null) {
		score += normalize(benchmarks.coding, 100) * 0.7;
		weight += 0.7;
	}
	if (benchmarks.sweBenchVerified != null) {
		// sweBenchVerified is stored internally as a 0–1 fraction (displayed
		// ×100). Scale it back to 0–100 before applying the 60 cap — the old
		// code normalized a 0–1 value against 60, silently dividing its
		// contribution by ~100 and zeroing out every model missing AA coding.
		score += normalize(benchmarks.sweBenchVerified * 100, 60) * 0.2;
		weight += 0.2;
	}
	return weight > 0 ? score / weight : 0;
}

function scoreFitCoding(speed: ModelSpeed | null, mgModel: ModelgrepModelData | null): number {
	// Pure ability fit for coding tasks (cost lives in the Burn column, not here).
	//   40% speed  — faster iteration matters
	//   40% tools  — coding agents need tool support
	//   20% uptime — reliability over time
	let score = 0;
	let weight = 0;
	if (speed?.tokensPerSecond) {
		score += normalize(speed.tokensPerSecond, 200) * 0.4;
		weight += 0.4;
	}
	if (mgModel?.capabilities?.tools != null) {
		score += (mgModel.capabilities.tools ? 1 : 0.3) * 0.4;
		weight += 0.4;
	}
	if (mgModel?.performance?.uptime != null) {
		score += normalize(mgModel.performance.uptime, 1) * 0.2;
		weight += 0.2;
	}
	// Neutral 0.5 floor when we have no fit signal — don't zero out a model just
	// because it lacks speed/tools metadata. The 0.5 is neutral, not a cheapness
	// reward (the Burn column carries the cost signal).
	return weight > 0 ? score / weight : 0.5;
}

function scoreQualityReasoning(benchmarks: ModelBenchmarks): number {
	// Blended reasoning (modelgrep AA.intelligence primary with outlier
	// guard, llm-stats fallback) — same value shown in the Reasoning column.
	return benchmarks.reasoning != null ? normalize(benchmarks.reasoning, 100) : 0;
}

function scoreFitBrainstorming(
	ctx: number,
	reasoning: number | null,
	mgModel: ModelgrepModelData | null
): number {
	// Pure ability fit for open-ended ideation (cost lives in the Burn column, not here).
	//   40% context       — long chains of thought need long context
	//   40% AA.intelligence — raw reasoning quality
	//   20% reasoning flag  — extended-thinking support
	let score = 0;
	let weight = 0;
	score += normalize(ctx, 1_000_000) * 0.4;
	weight += 0.4;
	if (reasoning != null) {
		score += normalize(reasoning, 100) * 0.4;
		weight += 0.4;
	}
	if (mgModel?.capabilities?.reasoning != null) {
		score += (mgModel.capabilities.reasoning ? 1 : 0.5) * 0.2;
		weight += 0.2;
	}
	// Neutral 0.5 floor when no fit signal — see scoreFitCoding.
	return weight > 0 ? score / weight : 0.5;
}

function scoreQualityAgentic(benchmarks: ModelBenchmarks): number {
	return scoreQualityCoding(benchmarks);
}

function scoreFitAgentic(
	ctx: number,
	speed: ModelSpeed | null,
	mgModel: ModelgrepModelData | null
): number {
	let score = 0;
	let weight = 0;
	score += normalize(Math.min(ctx, 1_000_000), 1_000_000) * 0.5;
	weight += 0.5;
	if (speed?.tokensPerSecond) {
		score += normalize(speed.tokensPerSecond, 200) * 0.3;
		weight += 0.3;
	}
	if (mgModel?.capabilities?.tools != null) {
		score += (mgModel.capabilities.tools ? 1 : 0.3) * 0.2;
		weight += 0.2;
	}
	return weight > 0 ? score / weight : 0.3;
}

function scoreQualityBudget(pricing: ModelPricing): number {
	// Price-as-quality: cheaper is better, capped at 1.0 (free).
	// Burn double-counting removed — cost already lives in the Burn column.
	if (pricing.inputPricePerM == null || pricing.outputPricePerM == null) return 0;
	const totalPrice = pricing.inputPricePerM + pricing.outputPricePerM;
	return Math.max(0, 1 - totalPrice / 10);
}

function scoreFitBudget(_mgModel: ModelgrepModelData | null): number {
	// Budget is price-driven. The fit axis is constant 1.0 so the score collapses
	// to the price-quality, and the cheapest model tops the list. (Multiplication
	// is symmetric, so we can't put price on the fit axis either — same result.)
	// If users want "smart + cheap" they should pick the Coding or Brainstorming
	// scenario; Budget is for "I just want the cheapest thing that runs."
	return 1.0;
}

function scoreQualityFrontend(
	benchmarks: ModelBenchmarks,
	mgModel: ModelgrepModelData | null
): number {
	// UI/website generation quality — driven by Design Arena Elo, the canonical
	// human-preference benchmark for UI work (head-to-head votes on generated UIs).
	// The 1500 ceiling is generous: the current top sits around 1380, so we have
	// headroom for future models without compressing the rankings.
	//   70% Design Arena Elo  — direct UI quality signal
	//   20% blended reasoning — smarter models write cleaner, more idiomatic code
	//   10% blended coding    — UI work is still code; can't be terrible at it
	const elo = mgModel?.benchmarks?.design_arena?.elo;
	let score = 0;
	let weight = 0;
	if (elo != null) {
		score += normalize(elo, 1500) * 0.7;
		weight += 0.7;
	}
	if (benchmarks.reasoning != null) {
		score += normalize(benchmarks.reasoning, 100) * 0.2;
		weight += 0.2;
	}
	if (benchmarks.coding != null) {
		score += normalize(benchmarks.coding, 100) * 0.1;
		weight += 0.1;
	}
	// Neutral 0.5 floor when we have no quality signal — see scoreFitCoding.
	return weight > 0 ? score / weight : 0.5;
}

function scoreFitFrontend(speed: ModelSpeed | null, mgModel: ModelgrepModelData | null): number {
	// UI work is iterative and often needs to read design comps.
	//   35% vision    — UI work often starts from a mockup or screenshot
	//   25% speed     — fast iteration matters when tweaking CSS/components
	//   20% tools     — modern UI work needs to call APIs / set up state
	//   20% uptime    — long sessions
	let score = 0;
	let weight = 0;
	if (mgModel?.capabilities?.vision != null) {
		score += (mgModel.capabilities.vision ? 1 : 0.3) * 0.35;
		weight += 0.35;
	}
	if (speed?.tokensPerSecond) {
		score += normalize(speed.tokensPerSecond, 200) * 0.25;
		weight += 0.25;
	}
	if (mgModel?.capabilities?.tools != null) {
		score += (mgModel.capabilities.tools ? 1 : 0.3) * 0.2;
		weight += 0.2;
	}
	if (mgModel?.performance?.uptime != null) {
		score += normalize(mgModel.performance.uptime, 1) * 0.2;
		weight += 0.2;
	}
	// Neutral 0.5 floor when no fit signal — see scoreFitCoding.
	return weight > 0 ? score / weight : 0.5;
}

// ─── Public API ───────────────────────────────────────────────────────

export function computeScenarioScores(inputs: ScenarioInputs): ScenarioScores {
	const ctx = inputs.contextWindow;
	return {
		coding: computeScore(
			scoreQualityCoding(inputs.benchmarks),
			scoreFitCoding(inputs.speed, inputs.mgModel)
		),
		brainstorming: computeScore(
			scoreQualityReasoning(inputs.benchmarks),
			scoreFitBrainstorming(ctx, inputs.benchmarks.reasoning, inputs.mgModel)
		),
		agentic: computeScore(
			scoreQualityAgentic(inputs.benchmarks),
			scoreFitAgentic(ctx, inputs.speed, inputs.mgModel)
		),
		budget: computeScore(scoreQualityBudget(inputs.pricing), scoreFitBudget(inputs.mgModel)),
		frontend: computeScore(
			scoreQualityFrontend(inputs.benchmarks, inputs.mgModel),
			scoreFitFrontend(inputs.speed, inputs.mgModel)
		)
	};
}

function computeScore(quality: number, fit: number): number {
	return Math.round(quality * fit * 100);
}
