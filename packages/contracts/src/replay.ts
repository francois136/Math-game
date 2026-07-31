import { z } from 'zod';
import { MatchIdSchema, PlayerIdSchema, SeedSchema, TeamIdSchema } from './ids.js';
import { GameMapSchema } from './geometry.js';
import { MatchConfigSchema } from './config.js';
import { MatchOutcomeSchema, TurnSkipReasonSchema } from './match.js';
import { ShotRequestSchema } from './shot.js';
import { MAX_PLAYERS } from './limits.js';

/**
 * A match, small enough to send in an email.
 *
 * A replay carries **what people did**, not what the engine drew: the seed, the
 * configuration, the map and one line per turn. The curves are recomputed when
 * it is read. Measured on a thirty-turn duel: the full state with its polylines
 * is 271 kB, this is 4 kB — sixty-eight times smaller, for the same match
 * (ADR 0018).
 *
 * The map is stored rather than regenerated from the seed. It costs about two
 * kilobytes and it buys independence from `GENERATOR_VERSION`: a replay
 * recorded today still reads after the generator changes, which a seed alone
 * could not promise.
 */

export const REPLAY_FORMAT = 'functionwars-replay';
export const REPLAY_VERSION = 1;

/** One turn, as it was played. Exactly one of `shot` and `skipped` is set. */
export const ReplayTurnSchema = z.object({
  playerId: PlayerIdSchema,
  shot: ShotRequestSchema.nullable(),
  skipped: TurnSkipReasonSchema.nullable(),
  /**
   * Epoch milliseconds the turn was resolved at.
   *
   * Stored because turn deadlines are part of the state: replaying with a
   * different clock reproduces every elimination and a different `deadlineAt`,
   * which is a replay that does not reproduce.
   */
  atMs: z.number().int().nonnegative(),
});
export type ReplayTurn = z.infer<typeof ReplayTurnSchema>;

export const ReplayPlayerSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().min(1).max(24),
  teamId: TeamIdSchema.nullable(),
  isBot: z.boolean(),
});
export type ReplayPlayer = z.infer<typeof ReplayPlayerSchema>;

export const ReplaySchema = z.object({
  format: z.literal(REPLAY_FORMAT),
  version: z.literal(REPLAY_VERSION),
  matchId: MatchIdSchema,
  seed: SeedSchema,
  config: MatchConfigSchema,
  map: GameMapSchema,
  players: z.array(ReplayPlayerSchema).min(2).max(MAX_PLAYERS),
  startedAtMs: z.number().int().nonnegative(),
  turns: z.array(ReplayTurnSchema).max(4096),
  /** What the match ended on, or null if it was exported before the end. */
  outcome: MatchOutcomeSchema.nullable(),
});
export type Replay = z.infer<typeof ReplaySchema>;
