import type { PlanTier } from '$lib/types/models';

/**
 * The OpenCode Go plan whose quota limits the UI shows.
 *
 * Defaults to the $10 **Go** plan; Go Plus subscribers flip it to read their
 * own (higher) allowances. Session-scoped and shared across routes, so toggling
 * on one page carries over — implemented as a class with a `$state` field
 * (like the compare store) so reads stay reactive without `svelte/store`.
 */
class PlanState {
	tier = $state<PlanTier>('go');

	set = (tier: PlanTier): void => {
		this.tier = tier;
	};

	toggle = (): void => {
		this.tier = this.tier === 'go' ? 'plus' : 'go';
	};
}

export const plan = new PlanState();
