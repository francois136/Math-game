/**
 * Hard limits on anything that comes from a player.
 *
 * These are not tuning knobs: they are the reason a hostile input cannot cost
 * the server more than a few hundred microseconds. They are frozen contract
 * values — raising one is a security decision and needs an ADR.
 */

/** Longest function source accepted, in characters. */
export const MAX_SOURCE_LENGTH = 512;

/** Deepest nesting accepted in the parsed tree. */
export const MAX_AST_DEPTH = 32;

/** Most nodes accepted in the parsed tree. */
export const MAX_AST_NODES = 512;

/** Most branches accepted in a piecewise function, catch-all included. */
export const MAX_PIECEWISE_BRANCHES = 8;

/** Most evaluations of `f` allowed for a single shot, across every phase. */
export const MAX_EVALUATIONS_PER_SHOT = 200_000;

/** Most polyline points a trace may emit. Beyond this the shot stops. */
export const MAX_TRACE_POINTS = 20_000;

/** Target wall-clock budget for resolving one shot, in milliseconds. */
export const SHOT_BUDGET_MS = 16;

/**
 * Most players in one match.
 *
 * Four, not the eight the brief asked for. This is not a technical shortcut: at
 * six seats and above the map generator cannot satisfy its two placement rules
 * at once — nothing trivial may connect two players, and something must — and
 * enlarging the field does not help. Measured and recorded in ADR 0012.
 */
export const MAX_PLAYERS = 4;
