import { z } from 'zod';
import { AabbSchema } from './geometry.js';
import {
  MAX_AST_NODES,
  MAX_EVALUATIONS_PER_SHOT,
  MAX_PLAYERS,
  MAX_TRACE_POINTS,
} from './limits.js';

/** Free-for-all, or teams. New modes are added here and in @fw/rules together. */
export const GameModeSchema = z.enum(['ffa', 'teams']);
export type GameMode = z.infer<typeof GameModeSchema>;

/**
 * Everything a lobby host can tune. Defaults are the balanced game; the
 * reasoning behind each number lives in docs/GAME_DESIGN.md.
 */
export const RuleSetSchema = z.object({
  mode: GameModeSchema,
  /** Teams mode only. Ignored in FFA. */
  friendlyFire: z.boolean(),
  /** When true a curve keeps going after eliminating someone. */
  pierce: z.boolean(),
  /** Turns during which a fresh player cannot be eliminated. 0 disables it. */
  shieldTurns: z.number().int().min(0).max(10),
  /** Arc length from the origin during which a shot cannot hit its author. */
  selfImmunityArc: z.number().min(0).max(100),
  /** Milliseconds a player has to fire before the turn is passed for them. */
  turnDurationMs: z.number().int().min(5_000).max(600_000),
  /** Everyone submits, then everything resolves at once. Designed, off by default. */
  simultaneousResolution: z.boolean(),
  /** Max AST nodes allowed per shot, or null for no per-turn budget. */
  complexityBudget: z.number().int().min(1).max(MAX_AST_NODES).nullable(),
  minPlayers: z.number().int().min(2).max(MAX_PLAYERS),
  maxPlayers: z.number().int().min(2).max(MAX_PLAYERS),
});
export type RuleSet = z.infer<typeof RuleSetSchema>;

export const DEFAULT_RULES: RuleSet = Object.freeze({
  mode: 'ffa',
  friendlyFire: false,
  pierce: false,
  shieldTurns: 2,
  selfImmunityArc: 3,
  turnDurationMs: 60_000,
  simultaneousResolution: false,
  complexityBudget: null,
  minPlayers: 2,
  maxPlayers: MAX_PLAYERS,
});

/**
 * Numerical parameters of the tracer. They belong to the contract because they
 * change the outcome of a shot: two builds that disagree here disagree on who
 * died, and replays stop reproducing.
 */
export const TraceParamsSchema = z.object({
  /** Initial step along x, in world units. */
  baseStep: z.number().positive(),
  /** Step never shrinks below this — the guarantee that a trace terminates. */
  minStep: z.number().positive(),
  /** Step never grows beyond this. */
  maxStep: z.number().positive(),
  /** Target segment length; the step adapts to keep segments near it. */
  targetSegmentLength: z.number().positive(),
  /** Above this |Δy| per segment the step is halved instead of accepted. */
  maxSegmentRise: z.number().positive(),
  /** Tolerance ε for the left/right limit comparison in the continuity check. */
  continuityEpsilon: z.number().positive(),
  /** Relative tolerance used alongside ε for large values. */
  continuityRelativeEpsilon: z.number().positive(),
  maxSteps: z.number().int().positive().max(MAX_TRACE_POINTS),
  maxEvaluations: z.number().int().positive().max(MAX_EVALUATIONS_PER_SHOT),
  /** Total arc length a shot may travel before stopping. */
  maxArcLength: z.number().positive(),
});
export type TraceParams = z.infer<typeof TraceParamsSchema>;

export const DEFAULT_TRACE_PARAMS: TraceParams = Object.freeze({
  baseStep: 0.25,
  minStep: 1e-4,
  maxStep: 1,
  targetSegmentLength: 0.35,
  maxSegmentRise: 1.5,
  continuityEpsilon: 1e-6,
  continuityRelativeEpsilon: 1e-9,
  maxSteps: 20_000,
  maxEvaluations: 200_000,
  maxArcLength: 400,
});

/**
 * How hard the field is to shoot across.
 *
 * `facile` — a simple parabola joins every pair. You will find a shot by
 *   trying; the field is a warm-up.
 * `moderee` — *some* continuous function joins every pair, and the generator
 *   proves it, but nothing promises it is a parabola. You have to look.
 * `difficile` — the same guarantee, and no parabola of the wide family gets
 *   through at all. Every kill has to be invented.
 *
 * In all three, nothing trivial — the straight line and barely-bent arcs — ever
 * connects two players. That rule is not a difficulty setting.
 */
export const DifficultySchema = z.enum(['facile', 'moderee', 'difficile']);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** Parameters of the procedural map generator. */
export const MapParamsSchema = z.object({
  bounds: AabbSchema,
  obstacleCount: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }),
  /**
   * Ceiling on the fraction of the map area obstacles may cover — a ceiling,
   * not a target. See docs/GAME_DESIGN.md for why the default is 0,35.
   */
  maxCoverage: z.number().min(0).max(0.6),
  /**
   * How many spawn points to produce. Set by the rules engine from the number
   * of players: a two-player map that had to satisfy the sight-line check for
   * eight seats would be needlessly hard to generate, and often uglier.
   */
  spawnCount: z.number().int().min(2).max(MAX_PLAYERS),
  difficulty: DifficultySchema,
  /**
   * Team of each seat, by index, or null for a player on their own side.
   *
   * The generator needs it because two team-mates may stand close together
   * while two enemies may not: a duel decided by who is nearer is not a duel.
   * Set by the rules engine from the lobby; its length matches `spawnCount`.
   */
  spawnTeams: z.array(z.number().int().nonnegative().nullable()).max(MAX_PLAYERS),
  /** Minimum distance between two seats on the same side, in world units. */
  spawnMinDistanceAllies: z.number().positive(),
  /**
   * Minimum distance between two seats on opposing sides, in world units.
   *
   * In units and not in fractions of the board, because the board grows with
   * the seat count (`sizedForSeats`): a fraction would silently ask for a
   * bigger and bigger gap precisely when there are more players to fit. Forty
   * five units is close to half the width of the two-player board, which is
   * what it was asked to be. See docs/GAME_DESIGN.md.
   */
  spawnMinDistanceEnemies: z.number().positive(),
  /** Distance kept clear around each spawn point. */
  spawnClearance: z.number().positive(),
  /**
   * Hitbox radius of a player. Bounded by `maxPlayerRadiusFor`: a target wider
   * than the sealed band is a target the generator did not hide (ADR 0017).
   */
  playerRadius: z.number().positive(),
  /**
   * Sight-line check: how many simple curves (lines and parabolas) are sampled
   * between each pair of spawns. A map where any of them connects two players
   * with nothing in the way is rejected and regenerated.
   */
  sightLineSamples: z.number().int().positive(),
  maxGenerationAttempts: z.number().int().positive().max(1000),
});
export type MapParams = z.infer<typeof MapParamsSchema>;

export const DEFAULT_MAP_PARAMS: MapParams = Object.freeze({
  bounds: { min: { x: -50, y: -30 }, max: { x: 50, y: 30 } },
  obstacleCount: { min: 6, max: 14 },
  maxCoverage: 0.35,
  spawnCount: 2,
  difficulty: 'facile',
  spawnTeams: [null, null],
  spawnMinDistanceAllies: 12,
  spawnMinDistanceEnemies: 45,
  spawnClearance: 6,
  playerRadius: 1.5,
  sightLineSamples: 9,
  maxGenerationAttempts: 200,
});

/**
 * What counts as a *trivial* curve: an arc rising at most this fraction of the
 * field's height between two players.
 *
 * The map generator seals every one of them, at every difficulty — that rule is
 * not a setting. It lives here rather than in @fw/physics because a second
 * thing depends on it: a player wider than the sealed band sticks out of it,
 * and the first flat shot wins. See `maxPlayerRadiusFor`.
 */
export const TRIVIAL_CURVE_FRACTION = 0.05;

/**
 * The widest a player may be on a given field.
 *
 * Measured, and the cliff is sharp: on the default 100 x 60 field the sealed
 * band is 3 units, and a radius of 3 plays normally — 2% of shots land — while
 * a radius of 3.5 makes *every* shot land and every match end on turn one. A
 * hitbox larger than the band the generator sealed is a hitbox the generator
 * did not hide (ADR 0017).
 *
 * Widening the band in proportion instead was tried and rejected: four-player
 * generation collapsed from 30/30 to 1/30.
 */
export function maxPlayerRadiusFor(bounds: MapParams['bounds']): number {
  return (bounds.max.y - bounds.min.y) * TRIVIAL_CURVE_FRACTION;
}

/**
 * How many seats a difficulty can actually hold.
 *
 * `facile` promises that a simple parabola joins every pair of players. There
 * are n(n−1)/2 pairs, every one of them has to be both sealed against trivial
 * curves and left open to a parabola, and past five seats the two demands stop
 * fitting on one field — measured: six seats do generate, but they cost some
 * three and a half seconds of a blocked server per map, which is not a price a
 * lobby should pay. `moderee` asks only for monotone connectivity and holds all
 * eight comfortably (ADR 0015).
 *
 * Measured at 16 maps out of 16, on the board `sizedForSeats` gives each count.
 */
export function maxSeatsFor(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'facile':
      return 5;
    case 'difficile':
      return 7;
    case 'moderee':
      return MAX_PLAYERS;
  }
}

/**
 * The board grows with the number of players.
 *
 * Eight players on the two-player field stand shoulder to shoulder, and the
 * generator cannot keep them apart at all. Enlarging it keeps the distance
 * between enemies at the same *number of units* rather than shrinking it, which
 * is the point: nobody wanted closer enemies, they wanted more room.
 *
 * Obstacle count follows the area, so a bigger field is not an emptier one.
 * Every other parameter is left alone.
 */
export function sizedForSeats(params: MapParams, seats: number): MapParams {
  const factor = seats <= 4 ? 1 : seats === 5 ? 1.3 : 1.6;
  if (factor === 1) return params;

  const grow = (value: number): number => Number((value * factor).toFixed(6));
  const area = factor * factor;
  return {
    ...params,
    bounds: {
      min: { x: grow(params.bounds.min.x), y: grow(params.bounds.min.y) },
      max: { x: grow(params.bounds.max.x), y: grow(params.bounds.max.y) },
    },
    obstacleCount: {
      min: Math.round(params.obstacleCount.min * area),
      max: Math.round(params.obstacleCount.max * area),
    },
  };
}

/** The complete, serialisable description of a match's setup. */
export const MatchConfigSchema = z.object({
  rules: RuleSetSchema,
  trace: TraceParamsSchema,
  map: MapParamsSchema,
});
export type MatchConfig = z.infer<typeof MatchConfigSchema>;

export const DEFAULT_MATCH_CONFIG: MatchConfig = Object.freeze({
  rules: DEFAULT_RULES,
  trace: DEFAULT_TRACE_PARAMS,
  map: DEFAULT_MAP_PARAMS,
});
