import { describe, it, expect } from 'vitest';
import { burnFor, quotaFor } from './plan';
import { makeBurnDetails, makeGoModel, makeQuota } from '$lib/test/fixtures';

describe('quotaFor', () => {
	it('returns the Go quota on the "go" plan', () => {
		const model = makeGoModel({ quota: makeQuota({ requestsPer5h: 111 }) });
		expect(quotaFor(model, 'go').requestsPer5h).toBe(111);
	});

	it('returns the Go Plus quota when the plan and the block both exist', () => {
		const model = makeGoModel({
			quota: makeQuota({ requestsPer5h: 111 }),
			plus: {
				quota: makeQuota({ requestsPer5h: 222 }),
				burnDetails: makeBurnDetails(),
				burnRate: 'slow'
			}
		});
		expect(quotaFor(model, 'plus').requestsPer5h).toBe(222);
	});

	it('falls back to the Go quota on "plus" when no Plus block exists', () => {
		const model = makeGoModel({ quota: makeQuota({ requestsPer5h: 111 }), plus: null });
		expect(quotaFor(model, 'plus').requestsPer5h).toBe(111);
	});
});

describe('burnFor', () => {
	it('returns the Go burn details on the "go" plan', () => {
		const model = makeGoModel({ burnDetails: makeBurnDetails({ score: 42 }) });
		expect(burnFor(model, 'go').score).toBe(42);
	});

	it('returns the Go Plus burn details when available', () => {
		const model = makeGoModel({
			burnDetails: makeBurnDetails({ score: 42 }),
			plus: {
				quota: makeQuota(),
				burnDetails: makeBurnDetails({ score: 77 }),
				burnRate: 'slow'
			}
		});
		expect(burnFor(model, 'plus').score).toBe(77);
	});

	it('falls back to the Go burn details on "plus" when no Plus block exists', () => {
		const model = makeGoModel({ burnDetails: makeBurnDetails({ score: 42 }), plus: null });
		expect(burnFor(model, 'plus').score).toBe(42);
	});
});
