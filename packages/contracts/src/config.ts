import { z } from 'zod';
import { AabbSchema } from './geometry.js';
import { MAX_AST_NODES, MAX_EVALUATIONS_PER_SHOT, MAX_TRACE_POINTS } from './limits.js';

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
  minPlayers: z.number().int().min(2).max(8),
  maxPlayers: z.number().int().min(2).max(8),
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
  maxPlayers: 8,
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
  spawnCount: z.number().int().min(2).max(8),
  /** Minimum distance between two spawn points. */
  spawnMinDistance: z.number().positive(),
  /** Distance kept clear around each spawn point. */
  spawnClearance: z.number().positive(),
  /** Hitbox radius of a player. */
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
  spawnMinDistance: 25,
  spawnClearance: 6,
  playerRadius: 1.5,
  sightLineSamples: 24,
  maxGenerationAttempts: 200,
});

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
