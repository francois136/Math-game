import { z } from 'zod';
import { MatchIdSchema, PlayerIdSchema, SeedSchema, TeamIdSchema } from './ids.js';
import { GameMapSchema, Vec2Schema } from './geometry.js';
import { MatchConfigSchema } from './config.js';
import { ShotRequestSchema, TraceResultSchema } from './shot.js';
import { FwErrorSchema } from './errors.js';
import { MAX_PLAYERS } from './limits.js';

export const PlayerSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().min(1).max(24),
  teamId: TeamIdSchema.nullable(),
  origin: Vec2Schema,
  radius: z.number().positive(),
  alive: z.boolean(),
  /** Remaining turns of start-of-match invulnerability. */
  shieldTurnsLeft: z.number().int().nonnegative(),
  connected: z.boolean(),
  isBot: z.boolean(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const MatchPhaseSchema = z.enum(['lobby', 'running', 'ended']);
export type MatchPhase = z.infer<typeof MatchPhaseSchema>;

/** Why a turn produced no trace. */
export const TurnSkipReasonSchema = z.enum(['timeout', 'passed', 'disconnected']);
export type TurnSkipReason = z.infer<typeof TurnSkipReasonSchema>;

/**
 * One entry of the match log. The log is the replay: replaying every
 * `TurnRecord` in order against the initial seed reproduces the match exactly.
 */
export const TurnRecordSchema = z.object({
  index: z.number().int().nonnegative(),
  playerId: PlayerIdSchema,
  shot: ShotRequestSchema.nullable(),
  trace: TraceResultSchema.nullable(),
  skipped: TurnSkipReasonSchema.nullable(),
  eliminated: z.array(PlayerIdSchema),
  /**
   * Epoch milliseconds this turn was resolved at.
   *
   * Here because turn deadlines are part of the state: a replay driven by a
   * different clock reproduces every elimination and a different `deadlineAt`,
   * which is a replay that does not reproduce (ADR 0018).
   */
  atMs: z.number().int().nonnegative(),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

export const ActiveTurnSchema = z.object({
  index: z.number().int().nonnegative(),
  /**
   * Whose turn it is, or null when it is everyone's.
   *
   * Nullable because of simultaneous resolution: a field that named a player
   * anyway would be a field that lies, and the client would grey out the wrong
   * things (ADR 0019).
   */
  playerId: PlayerIdSchema.nullable(),
  /** Epoch milliseconds. Injected by the server clock, never read ambiently. */
  deadlineAt: z.number().int().nonnegative(),
});
export type ActiveTurn = z.infer<typeof ActiveTurnSchema>;

export const MatchOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solo'), winnerId: PlayerIdSchema }),
  z.object({ kind: z.literal('team'), teamId: TeamIdSchema }),
  z.object({ kind: z.literal('draw') }),
]);
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;

/**
 * What a player has decided this round, before it resolves. Simultaneous only.
 *
 * `shot` is null for a pass, which is a decision like any other: it says "I am
 * done for this round", and the round can resolve without waiting further.
 */
export const PendingShotSchema = z.object({
  playerId: PlayerIdSchema,
  shot: ShotRequestSchema.nullable(),
});
export type PendingShot = z.infer<typeof PendingShotSchema>;

/**
 * The whole match, server-side. It is a plain value: @fw/rules never mutates
 * one, it returns a new state. That is what makes replay and undo trivial and
 * what keeps the server free of hidden state.
 */
export const MatchStateSchema = z.object({
  id: MatchIdSchema,
  seed: SeedSchema,
  phase: MatchPhaseSchema,
  config: MatchConfigSchema,
  map: GameMapSchema,
  players: z.array(PlayerSchema).min(2).max(MAX_PLAYERS),
  /** Turn order, decided once at match start from the seed. */
  order: z.array(PlayerIdSchema).min(2).max(MAX_PLAYERS),
  turn: ActiveTurnSchema.nullable(),
  /**
   * Shots waiting for the round to resolve. Always empty in turn-based play.
   *
   * Everyone's curve is traced against the state *before* any of them landed,
   * so the outcome does not depend on the order these were submitted in
   * (ADR 0019).
   */
  pending: z.array(PendingShotSchema).max(MAX_PLAYERS),
  history: z.array(TurnRecordSchema),
  outcome: MatchOutcomeSchema.nullable(),
});
export type MatchState = z.infer<typeof MatchStateSchema>;

/**
 * What a given client is allowed to see. Today it equals the full state minus
 * nothing — the map and every position are public. The type exists so that a
 * future fog-of-war mode has a place to land without touching every call site.
 */
export const MatchViewSchema = MatchStateSchema;
export type MatchView = z.infer<typeof MatchViewSchema>;

// — Commands: the only things that can change a match ————————————————

export const MatchCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fire'), playerId: PlayerIdSchema, shot: ShotRequestSchema }),
  z.object({ kind: z.literal('pass'), playerId: PlayerIdSchema }),
  /** Emitted by the server clock, never by a client. */
  z.object({ kind: z.literal('timeout'), atMs: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('disconnect'), playerId: PlayerIdSchema }),
  z.object({ kind: z.literal('reconnect'), playerId: PlayerIdSchema }),
]);
export type MatchCommand = z.infer<typeof MatchCommandSchema>;

/** What happened, for the client to animate and narrate. */
export const MatchEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('match-started'), order: z.array(PlayerIdSchema) }),
  z.object({ kind: z.literal('turn-started'), turn: ActiveTurnSchema }),
  /**
   * Simultaneous play only: someone has answered, and the round is waiting on
   * the others. What they wrote stays hidden until it resolves (ADR 0019).
   */
  z.object({ kind: z.literal('shot-submitted'), playerId: PlayerIdSchema }),
  z.object({ kind: z.literal('shot-resolved'), record: TurnRecordSchema }),
  z.object({
    kind: z.literal('player-eliminated'),
    playerId: PlayerIdSchema,
    byPlayerId: PlayerIdSchema,
  }),
  z.object({ kind: z.literal('shield-expired'), playerId: PlayerIdSchema }),
  z.object({ kind: z.literal('match-ended'), outcome: MatchOutcomeSchema }),
  z.object({ kind: z.literal('command-rejected'), error: FwErrorSchema }),
]);
export type MatchEvent = z.infer<typeof MatchEventSchema>;
