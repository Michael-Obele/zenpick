import * as v from 'valibot';
import { DEFAULT_SUB_SHARE } from './logic';
import { PLAN_IDS, type PlanId } from './plans';

/**
 * Shared plan/main/sub/split URL state for home and compare. These keys belong
 * in each page's single useSearchParams schema so writes preserve other page state.
 */
export const stackSearchSchema = v.object({
	stack: v.optional(v.fallback(v.picklist(PLAN_IDS as [PlanId, ...PlanId[]]), 'zed'), 'zed'),
	main: v.optional(v.fallback(v.string(), ''), ''),
	sub: v.optional(v.fallback(v.string(), ''), ''),
	split: v.optional(
		v.fallback(v.pipe(v.number(), v.minValue(0), v.maxValue(100)), DEFAULT_SUB_SHARE),
		DEFAULT_SUB_SHARE
	)
});

export type StackSearchParams = v.InferOutput<typeof stackSearchSchema>;

/** The slice of the page's `useSearchParams` object the stack UI reads and writes. */
export interface StackParams {
	stack: PlanId;
	main: string;
	sub: string;
	split: number;
}
