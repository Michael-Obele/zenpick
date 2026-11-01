import { describe, expect, it } from 'vite-plus/test';
import { inferMigrationHints, type MigrationSubject } from './inference';
import { makeBenchmarks } from '$lib/test/fixtures';
import type { FrontierCandidate } from '$lib/types/models';

const subject: MigrationSubject = {
	id: 'hy3',
	name: 'Hy3',
	modelgrepId: 'tencent/hy3',
	llmStatsId: null
};

function candidate(
	name: string,
	coding: number | null,
	reasoning: number | null,
	math: number | null
): FrontierCandidate {
	return {
		id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
		name,
		organization: null,
		releaseDate: null,
		benchmarks: makeBenchmarks({ coding, reasoning, math })
	};
}

describe('inferMigrationHints', () => {
	it('does not claim a replacement from a single matching category', () => {
		const hints = inferMigrationHints(
			subject,
			true,
			makeBenchmarks({ coding: 60, reasoning: null, math: null }),
			[candidate('Claude Opus 5', 62, null, null)]
		);

		expect(hints).toEqual([]);
	});

	it('claims a replacement when two categories are within the band', () => {
		const hints = inferMigrationHints(
			subject,
			true,
			makeBenchmarks({ coding: 60, reasoning: null, math: 80 }),
			[candidate('Claude Opus 5', 62, null, 78)]
		);

		expect(hints).toEqual([{ model: 'Claude Opus 5', reason: 'Comparable on coding & math' }]);
	});

	it('orders the candidate matching more categories first', () => {
		const hints = inferMigrationHints(
			subject,
			true,
			makeBenchmarks({ coding: 60, reasoning: 70, math: 80 }),
			[candidate('Two Category Model', 62, 72, null), candidate('Three Category Model', 61, 69, 78)]
		);

		expect(hints.map((hint) => hint.model)).toEqual(['Three Category Model', 'Two Category Model']);
	});

	it('does not compare a model with itself', () => {
		const hints = inferMigrationHints(
			subject,
			true,
			makeBenchmarks({ coding: 60, reasoning: 70, math: 80 }),
			[candidate('Tencent: Hy3', 60, 70, 80)]
		);

		expect(hints).toEqual([]);
	});

	it('excludes a candidate the Go model trails by more than the deficit', () => {
		const hints = inferMigrationHints(
			subject,
			true,
			makeBenchmarks({ coding: 60, reasoning: null, math: 80 }),
			[candidate('Far Ahead Model', 66, null, 78)]
		);

		expect(hints).toEqual([]);
	});

	it('caps the hint list at four candidates', () => {
		const hints = inferMigrationHints(
			subject,
			true,
			makeBenchmarks({ coding: 60, reasoning: null, math: 80 }),
			Array.from({ length: 6 }, (_, index) => candidate(`Candidate ${index + 1}`, 60, null, 80))
		);

		expect(hints).toHaveLength(4);
	});

	it('never gives a closed-source Go model replacement hints', () => {
		const hints = inferMigrationHints(
			subject,
			false,
			makeBenchmarks({ coding: 60, reasoning: 70, math: 80 }),
			[candidate('Claude Opus 5', 60, 70, 80)]
		);

		expect(hints).toEqual([]);
	});
});
