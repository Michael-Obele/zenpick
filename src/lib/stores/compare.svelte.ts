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

	/** Clear the entire selection. */
	clear = (): void => {
		this.selection = [];
	};
}

export const compare = new CompareState();
