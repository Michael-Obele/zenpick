/** Maximum number of models that can be compared side-by-side. */
export const MAX_COMPARE = 10;

/**
 * Shared, in-session selection of model IDs the user wants to compare.
 *
 * Implemented as a class with a `$state` field so the selection is reactive
 * across components without `svelte/store`. Read `compare.selection` in
 * templates/markup (it stays reactive); mutate via the methods below.
 */
class CompareState {
	/** IDs of models selected for side-by-side comparison. */
	selection = $state<string[]>([]);

	/**
	 * The user explicitly cleared the selection ("Clear all") — suppress
	 * auto-seeding for the rest of the session so clearing actually sticks.
	 * Unlike the old "took over" flag, manual add/remove/toggle and simple
	 * navigation do NOT set this, so the suggested pair keeps coming back
	 * whenever the selection is empty again. "Load suggested models"
	 * re-enables auto-seeding (it clears the flag).
	 */
	dismissedDefaults = $state(false);

	/**
	 * Auto-seed the smart-default pair, but only when the session has no
	 * selection yet and the user hasn't explicitly dismissed suggestions
	 * with "Clear all". Use `force` for explicit user actions (e.g. a
	 * "Load suggested models" button) — it re-seeds even after a clear.
	 */
	seedDefaults = (ids: string[], force = false): void => {
		if (!force && (this.dismissedDefaults || this.selection.length)) return;
		const room = ids.slice(0, MAX_COMPARE).filter((id) => !this.selection.includes(id));
		if (!room.length) return;
		this.selection = room;
		this.dismissedDefaults = false;
	};

	/** Toggle a model in/out of the comparison selection. */
	toggle = (id: string): void => {
		if (this.selection.includes(id)) {
			this.selection = this.selection.filter((x) => x !== id);
		} else if (this.selection.length < MAX_COMPARE) {
			this.selection = [...this.selection, id];
		}
	};

	/** Add a model if there is room and it is not already selected. */
	add = (id: string): void => {
		if (this.selection.includes(id) || this.selection.length >= MAX_COMPARE) return;
		this.selection = [...this.selection, id];
	};

	/** Remove a model from the selection. */
	remove = (id: string): void => {
		this.selection = this.selection.filter((x) => x !== id);
	};

	/**
	 * Move a model to an absolute slot in the comparison order.
	 *
	 * Order is meaningful: the compare grid renders one column per entry in
	 * this array, so re-slotting a model is how you park it next to the one
	 * you actually want to read it against. Out-of-range indices are clamped.
	 * Returns the model's new index, or `-1` when nothing moved — callers use
	 * that to skip the URL write and the screen-reader announcement.
	 */
	moveTo = (id: string, index: number): number => {
		const from = this.selection.indexOf(id);
		if (from === -1) return -1;
		const to = Math.max(0, Math.min(index, this.selection.length - 1));
		if (to === from) return -1;
		const next = [...this.selection];
		next.splice(from, 1);
		next.splice(to, 0, id);
		this.selection = next;
		return to;
	};

	/**
	 * Nudge a model one slot earlier (`-1`) or later (`+1`). Clamped at both
	 * ends rather than wrapping, so the arrow controls stay predictable.
	 */
	move = (id: string, delta: number): number => {
		const from = this.selection.indexOf(id);
		if (from === -1) return -1;
		const to = from + delta;
		if (to < 0 || to >= this.selection.length) return -1;
		return this.moveTo(id, to);
	};

	/**
	 * Move a model into the slot currently held by another model — the drop
	 * semantics for drag-and-drop, so callers never do index math.
	 */
	moveToward = (id: string, targetId: string): number => {
		if (id === targetId) return -1;
		const to = this.selection.indexOf(targetId);
		if (to === -1) return -1;
		return this.moveTo(id, to);
	};

	/** Clear the entire selection — and keep it clear for this session. */
	clear = (): void => {
		this.selection = [];
		this.dismissedDefaults = true;
	};
}

export const compare = new CompareState();
