/** Maximum number of models that can be compared side-by-side. */
export const MAX_COMPARE = 4;

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
	 * Whether smart defaults have been seeded — or the user has taken over
	 * the selection — this session. Once set, auto-seeding never runs again,
	 * so "Clear all" stays clear and homepage Compare buttons always win.
	 */
	hasSeededDefaults = $state(false);

	/**
	 * Auto-seed the smart-default pair, but only when the session has no
	 * selection yet and defaults have not already been decided. Use `force`
	 * for explicit user actions (e.g. a "Load suggested models" button).
	 */
	seedDefaults = (ids: string[], force = false): void => {
		if (!force && (this.hasSeededDefaults || this.selection.length)) return;
		const room = ids.slice(0, MAX_COMPARE).filter((id) => !this.selection.includes(id));
		if (!room.length) return;
		this.selection = room;
		this.hasSeededDefaults = true;
	};

	/** Toggle a model in/out of the comparison selection. */
	toggle = (id: string): void => {
		this.hasSeededDefaults = true;
		if (this.selection.includes(id)) {
			this.selection = this.selection.filter((x) => x !== id);
		} else if (this.selection.length < MAX_COMPARE) {
			this.selection = [...this.selection, id];
		}
	};

	/** Add a model if there is room and it is not already selected. */
	add = (id: string): void => {
		if (this.selection.includes(id) || this.selection.length >= MAX_COMPARE) return;
		this.hasSeededDefaults = true;
		this.selection = [...this.selection, id];
	};

	/** Remove a model from the selection. */
	remove = (id: string): void => {
		this.hasSeededDefaults = true;
		this.selection = this.selection.filter((x) => x !== id);
	};

	/** Clear the entire selection. */
	clear = (): void => {
		this.selection = [];
		this.hasSeededDefaults = true;
	};
}

export const compare = new CompareState();
