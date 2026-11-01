import { describe, expect, it } from 'vite-plus/test';
import {
	frontierNameKey,
	isSameFrontierModel,
	mergeFrontierCandidates,
	type FrontierSubject
} from '$lib/frontier';
import { buildPlanFrontierCandidates, isClosedWeight } from './frontier';
import { makeAa, makeBenchmarks, makeModelgrep } from '$lib/test/fixtures';
import type { FrontierCandidate, ModelgrepModelData } from '$lib/types/models';
import type { StaticModelDef, StaticPlan } from '$lib/stack/plans';

function modelgrep(
	id: string,
	name: string,
	maker: string,
	openWeights: ModelgrepModelData['open_weights'] = null
): ModelgrepModelData {
	return {
		...makeModelgrep(makeAa({ intelligence: 60, coding: 58, math: 70 })),
		id,
		name,
		maker,
		open_weights: openWeights
	};
}

function planModel(id: string, name: string, modelgrepId: string | null): StaticModelDef {
	return {
		id,
		name,
		provider: 'Anthropic',
		modelgrepId,
		price: [4, 20, 0.2]
	};
}

function plan(models: StaticModelDef[]): StaticPlan {
	return {
		id: 'zed',
		name: 'Zed Pro',
		monthlyPriceUsd: 10,
		includedUsd: 5,
		allowance: '',
		caveat: '',
		sources: [],
		verifiedOn: '2026-11-01',
		priceMultiplier: 1.1,
		models
	};
}

const closed = modelgrep('anthropic/claude-opus-5', 'Anthropic: Claude Opus 5', 'anthropic');
const open = modelgrep('moonshotai/kimi-k3', 'Moonshot AI: Kimi K3', 'moonshotai', {
	params_b: 1000,
	license: 'modified-mit',
	hf_downloads: 12_000
});

describe('isClosedWeight', () => {
	it('treats missing or all-null open-weight evidence as closed', () => {
		expect(isClosedWeight(closed)).toBe(true);
		expect(
			isClosedWeight({
				...closed,
				open_weights: { params_b: null, license: null, hf_downloads: null }
			})
		).toBe(true);
	});

	it('treats any open-weight evidence as open', () => {
		expect(isClosedWeight(open)).toBe(false);
		expect(
			isClosedWeight({
				...closed,
				open_weights: { params_b: null, license: 'mit', hf_downloads: null }
			})
		).toBe(false);
	});
});

describe('buildPlanFrontierCandidates', () => {
	it('keeps closed plan models, drops open ones, and skips missing modelgrep rows', () => {
		const byId = new Map([
			[closed.id, closed],
			[open.id, open]
		]);
		const candidates = buildPlanFrontierCandidates(
			[
				plan([
					planModel('claude-opus-5', 'Claude Opus 5', closed.id),
					planModel('kimi-k3', 'Kimi K3', open.id),
					planModel('unmatched', 'Unmatched', 'lab/missing'),
					planModel('no-modelgrep-id', 'No Id', null)
				])
			],
			byId
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({
			id: closed.id,
			name: 'Claude Opus 5',
			organization: { id: 'anthropic', name: 'Anthropic' },
			releaseDate: null
		});
		expect(candidates[0].benchmarks.coding).toBe(58);
		expect(candidates[0].benchmarks.reasoning).toBe(60);
		expect(candidates[0].benchmarks.math).toBe(70);
	});

	it('dedupes the same closed model across plans by folded name', () => {
		const byId = new Map([[closed.id, closed]]);
		const candidates = buildPlanFrontierCandidates(
			[
				plan([planModel('claude-opus-5', 'Claude Opus 5', closed.id)]),
				plan([planModel('claude-opus-5-dupe', 'Claude Opus 5', closed.id)])
			],
			byId
		);

		expect(candidates).toHaveLength(1);
	});

	it('skips a closed model with no usable benchmark', () => {
		const bare = {
			...modelgrep('lab/bare', 'Lab: Bare', 'lab'),
			benchmarks: { artificial_analysis: null, design_arena: null }
		};
		const candidates = buildPlanFrontierCandidates(
			[plan([planModel('bare', 'Bare', bare.id)])],
			new Map([[bare.id, bare]])
		);

		expect(candidates).toEqual([]);
	});
});

describe('frontier identity', () => {
	const subject: FrontierSubject = {
		id: 'kimi-k3',
		name: 'Kimi K3',
		modelgrepId: 'moonshotai/kimi-k3',
		llmStatsId: null
	};

	const candidate: FrontierCandidate = {
		id: 'moonshotai/kimi-k3',
		name: 'Moonshot AI: Kimi K3',
		organization: null,
		releaseDate: null,
		benchmarks: makeBenchmarks({ coding: 60, reasoning: 60, math: 60 })
	};

	it('matches a candidate by modelgrep id or folded display name', () => {
		expect(isSameFrontierModel(candidate, subject)).toBe(true);
		expect(isSameFrontierModel({ ...candidate, id: 'other' }, subject)).toBe(true);
		expect(isSameFrontierModel({ ...candidate, id: 'other', name: 'Claude Opus 5' }, subject)).toBe(
			false
		);
	});

	it('folds provider prefixes and punctuation', () => {
		expect(frontierNameKey('Anthropic: Claude Opus 5.5')).toBe('claudeopus55');
		expect(frontierNameKey('GPT-5.5 pro')).toBe('gpt55pro');
	});

	it('merges with the primary source winning duplicates', () => {
		const primary: FrontierCandidate = {
			...candidate,
			id: 'llm-stats-id',
			name: 'Kimi K3',
			releaseDate: '2026-09-01'
		};
		const fallback: FrontierCandidate = { ...candidate, id: 'modelgrep-id' };

		expect(mergeFrontierCandidates([primary], [fallback])).toEqual([primary]);
		expect(mergeFrontierCandidates([], [fallback])).toEqual([fallback]);
	});
});
