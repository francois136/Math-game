import { z } from 'zod';
import {
  LobbyCodeSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SessionTokenSchema,
  TeamIdSchema,
} from './ids.js';
import { MatchConfigSchema } from './config.js';
import { AxisSchema, DirectionSchema, ShotRequestSchema } from './shot.js';
import { MatchEventSchema, MatchViewSchema } from './match.js';
import { FwErrorSchema } from './errors.js';
import { MAX_SOURCE_LENGTH } from './limits.js';

/**
 * The wire protocol.
 *
 * `lobby:add-bot` is deliberately absent. There is no bot yet, and a message
 * the server can only answer with "not yet" is worse than no message: it makes
 * a client write code for a feature that does not exist. It comes back with the
 * bot, in phase 6.
 *
 * One WebSocket, JSON frames, every inbound frame validated by the schemas
 * below before it reaches any game code. The server is authoritative: a client
 * frame is a *request*, never a fact.
 *
 * Bumping PROTOCOL_VERSION is a breaking change and needs an ADR.
 */
export const PROTOCOL_VERSION = 1;

// — Lobby view ————————————————————————————————————————————————

export const LobbyMemberSchema = z.object({
  playerId: PlayerIdSchema,
  name: z.string().min(1).max(24),
  teamId: TeamIdSchema.nullable(),
  ready: z.boolean(),
  connected: z.boolean(),
  isBot: z.boolean(),
  isSpectator: z.boolean(),
});
export type LobbyMember = z.infer<typeof LobbyMemberSchema>;

export const LobbyStateSchema = z.object({
  code: LobbyCodeSchema,
  hostId: PlayerIdSchema,
  members: z.array(LobbyMemberSchema).max(32),
  config: MatchConfigSchema,
  /** Set while a match is running in this lobby. */
  matchId: MatchIdSchema.nullable(),
});
export type LobbyState = z.infer<typeof LobbyStateSchema>;

// — Client → Server ——————————————————————————————————————————

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.number().int(),
    name: z.string().min(1).max(24),
    /** Present when resuming a seat after a disconnect. */
    token: SessionTokenSchema.nullable(),
  }),
  z.object({ type: z.literal('lobby:create'), config: MatchConfigSchema.nullable() }),
  z.object({
    type: z.literal('lobby:join'),
    code: LobbyCodeSchema,
    asSpectator: z.boolean(),
  }),
  z.object({ type: z.literal('lobby:leave') }),
  /** Host only. */
  z.object({ type: z.literal('lobby:configure'), config: MatchConfigSchema }),
  z.object({ type: z.literal('lobby:set-team'), teamId: TeamIdSchema.nullable() }),
  z.object({ type: z.literal('lobby:ready'), ready: z.boolean() }),
  /** Host only. */
  z.object({ type: z.literal('lobby:remove-player'), playerId: PlayerIdSchema }),
  /** Host only. */
  z.object({ type: z.literal('match:start'), seed: z.string().max(64).nullable() }),
  /**
   * Ask the server whether a function would be accepted. Parse and continuity
   * only — no trace, no collision information. Rate-limited; costs no turn.
   */
  z.object({
    type: z.literal('shot:validate'),
    source: z.string().min(1).max(MAX_SOURCE_LENGTH),
    axis: AxisSchema,
    direction: DirectionSchema,
  }),
  z.object({ type: z.literal('shot:fire'), shot: ShotRequestSchema }),
  z.object({ type: z.literal('turn:pass') }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Every client frame is wrapped so replies can be correlated. */
export const ClientFrameSchema = z.object({
  /** Monotonic per connection. Echoed back as `replyTo`. */
  id: z.number().int().nonnegative(),
  message: ClientMessageSchema,
});
export type ClientFrame = z.infer<typeof ClientFrameSchema>;

// — Server → Client ——————————————————————————————————————————

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    protocolVersion: z.number().int(),
    playerId: PlayerIdSchema,
    token: SessionTokenSchema,
  }),
  z.object({ type: z.literal('lobby:state'), lobby: LobbyStateSchema }),
  /** Full snapshot: sent on match start, on join and on reconnect. */
  z.object({ type: z.literal('match:state'), match: MatchViewSchema }),
  /** Incremental. A client that misses one asks for a snapshot by reconnecting. */
  z.object({
    type: z.literal('match:events'),
    matchId: MatchIdSchema,
    /** Snapshot sequence number this batch applies to. */
    seq: z.number().int().nonnegative(),
    events: z.array(MatchEventSchema),
  }),
  z.object({
    type: z.literal('shot:validation'),
    ok: z.boolean(),
    error: FwErrorSchema.nullable(),
  }),
  z.object({ type: z.literal('error'), error: FwErrorSchema }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const ServerFrameSchema = z.object({
  /** The `id` of the client frame this answers, or null for broadcasts. */
  replyTo: z.number().int().nonnegative().nullable(),
  message: ServerMessageSchema,
});
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

// — Connection state machine ————————————————————————————————————

/**
 * Server-side view of a connection. Transitions are documented in
 * docs/PROTOCOL.md; illegal transitions close the socket.
 */
export const ConnectionStateSchema = z.enum([
  'connected', // socket open, no `hello` yet
  'identified', // `hello` accepted, not in a lobby
  'in-lobby',
  'in-match',
  'spectating',
  'closed',
]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
