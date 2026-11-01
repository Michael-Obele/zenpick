/**
 * Shared constants for the "replaces" / migration-hint logic.
 *
 * Lives outside server/ so both the server-side hint algorithm
 * (inference.ts) and the client-side debug visualization (CompareLogic)
 * read the SAME bands — the words in the debug pill can't drift from
 * what the algorithm actually decides.
 */

/** Max normalized (0–100) gap to claim a "replaces" match. */
export const MIGRATION_BAND = 12;

/**
 * How far BELOW a candidate the Go model may sit on a matched category.
 * The symmetric band above also accepts a model 12 points stronger than the
 * Go model; for a "replaces" claim that reads as an overstatement. The
 * compare row only lists candidates the Go model matches or beats within this
 * deficit, while the debug view still shows the full band relation.
 */
export const MIGRATION_MAX_DEFICIT = 5;

/** How many hints the compare row surfaces; the debug table shows every candidate. */
export const MIGRATION_MAX_HINTS = 4;

/**
 * Gap bands used to describe the relation between a Go model and a
 * frontier model, on the 0–100 blended scale.
 * - on par:        |gap| <= MIGRATION_BAND (within the replaceable window)
 * - just above/below: within the band, but in a specific direction
 * - above/below:   clearly outside the band
 * - way above/below: a chasm — not a real alternative
 */
export const GAP_BANDS = {
	onPar: MIGRATION_BAND,
	moderate: 25
} as const;
