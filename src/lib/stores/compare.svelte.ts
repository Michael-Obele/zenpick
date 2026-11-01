import { compareIdentity, compareKey, parseCompareKey } from '$lib/compare-selection';

/** Maximum number of models that can be compared side-by-side. */
export const MAX_COMPARE = 10;

/**
 * Canonicalise a key for storage and matching.
 *
 * The stored spelling stays `plan:id` (readable in URLs); the identity folds
 * `modelKey(id)` in so `gpt-6-luna` and `go:gpt-6-luna` (or two spellings of
 * the same static-plan id) are one slot, matching the resolver's dedupe.
 * Returns null for an unknown plan, an empty id, or a whitespace-only key.
 */
function normalize(key: string): { key: string; identity: string } | null {
	const parsed = parseCompareKey(key);
	const identity = compareIdentity(key);
	if (!parsed || identity === null) return null;
	return { key: compareKey(parsed.plan, parsed.id), identity };
}

/** Index of the first stored key with the same identity, or `-1`. */
function indexOfIdentity(selection: string[], identity: string): number {
	return selection.findIndex((stored) => normalize(stored)?.identity === identity);
}

/**
 * Append `keys` to `base`, canonicalising each spelling, deduping by identity
 * and capping at MAX_COMPARE. Returns a new array; `base` is never mutated.
 */
function mergeKeys(base: string[], keys: string[]): string[] {
	const next = [...base];
	for (const raw of keys) {
		if (next.length >= MAX_COMPARE) break;
		const normalized = normalize(raw);
		if (!normalized) continue;
		if (indexOfIdentity(next, normalized.identity) !== -1) continue;
		next.push(normalized.key);
	}
	return next;
}

/**
 * Shared, in-session selection of the models the user wants to compare.
 *
 * The selection holds `plan:id` compare keys (`go:deepseek-v4.1-flash`,
 * `zed:claude-sonnet-5.5`) so one selection can span plans; the resolver in
 * `$lib/compare-selection` still accepts bare legacy Go ids. Implemented as a
 * class with a `$state` field so the selection is reactive across components
 * without `svelte/store`. Read `compare.selection` in templates/markup (it
 * stays reactive); mutate via the methods below.
 */
class CompareState {
	/** `plan:id` compare keys selected for side-by-side comparison. */
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
	seedDefaults = (keys: string[], force = false): void => {
		if (!force && (this.dismissedDefaults || this.selection.length)) return;
		const next: string[] = [];
		for (const raw of keys.slice(0, MAX_COMPARE)) {
			const normalized = normalize(raw);
			if (!normalized) continue;
			if (indexOfIdentity(this.selection, normalized.identity) !== -1) continue;
			if (indexOfIdentity(next, normalized.identity) !== -1) continue;
			next.push(normalized.key);
		}
		if (!next.length) return;
		this.selection = next;
		this.dismissedDefaults = false;
	};

	/**
	 * Whether any stored key shares this key's identity (`plan` + `modelKey(id)`).
	 * Reads the same identity `toggle`/`remove` match on, so a bare legacy id or
	 * an alternate spelling of the same id reports as selected.
	 */
	has = (key: string): boolean => {
		const normalized = normalize(key);
		if (!normalized) return false;
		return indexOfIdentity(this.selection, normalized.identity) !== -1;
	};

	/** Toggle a model in/out of the comparison selection. */
	toggle = (key: string): void => {
		const normalized = normalize(key);
		if (!normalized) return;
		const index = indexOfIdentity(this.selection, normalized.identity);
		if (index !== -1) {
			this.selection = this.selection.filter((_, current) => current !== index);
		} else if (this.selection.length < MAX_COMPARE) {
			this.selection = [...this.selection, normalized.key];
		}
	};

	/** Add a model if there is room and it is not already selected. */
	add = (key: string): void => {
		const normalized = normalize(key);
		if (!normalized) return;
		if (indexOfIdentity(this.selection, normalized.identity) !== -1) return;
		if (this.selection.length >= MAX_COMPARE) return;
		this.selection = [...this.selection, normalized.key];
	};

	/** Add several keys in order, skipping duplicates and respecting MAX_COMPARE. */
	addMany = (keys: string[]): void => {
		const next = mergeKeys(this.selection, keys);
		if (next.length !== this.selection.length) this.selection = next;
	};

	/**
	 * Replace the whole selection with the canonical spelling of `keys`, deduping
	 * by identity and capping at MAX_COMPARE.
	 */
	set = (keys: string[]): void => {
		this.selection = mergeKeys([], keys);
	};

	/** Remove every stored key with the same identity. */
	remove = (key: string): void => {
		const normalized = normalize(key);
		if (!normalized) return;
		const next = this.selection.filter(
			(stored) => normalize(stored)?.identity !== normalized.identity
		);
		if (next.length !== this.selection.length) this.selection = next;
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
	moveTo = (key: string, index: number): number => {
		const normalized = normalize(key);
		if (!normalized) return -1;
		const from = indexOfIdentity(this.selection, normalized.identity);
		if (from === -1) return -1;
		const to = Math.max(0, Math.min(index, this.selection.length - 1));
		if (to === from) return -1;
		const next = [...this.selection];
		const [stored] = next.splice(from, 1);
		next.splice(to, 0, stored);
		this.selection = next;
		return to;
	};

	/**
	 * Nudge a model one slot earlier (`-1`) or later (`+1`). Clamped at both
	 * ends rather than wrapping, so the arrow controls stay predictable.
	 */
	move = (key: string, delta: number): number => {
		const normalized = normalize(key);
		if (!normalized) return -1;
		const from = indexOfIdentity(this.selection, normalized.identity);
		if (from === -1) return -1;
		const to = from + delta;
		if (to < 0 || to >= this.selection.length) return -1;
		return this.moveTo(key, to);
	};

	/**
	 * Move a model into the slot currently held by another model — the drop
	 * semantics for drag-and-drop, so callers never do index math.
	 */
	moveToward = (key: string, targetKey: string): number => {
		const normalized = normalize(key);
		const target = normalize(targetKey);
		if (!normalized || !target) return -1;
		if (normalized.identity === target.identity) return -1;
		const to = indexOfIdentity(this.selection, target.identity);
		if (to === -1) return -1;
		return this.moveTo(key, to);
	};

	/** Clear the entire selection — and keep it clear for this session. */
	clear = (): void => {
		this.selection = [];
		this.dismissedDefaults = true;
	};
}

export const compare = new CompareState();
