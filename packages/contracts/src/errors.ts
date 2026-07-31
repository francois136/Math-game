import { z } from 'zod';
import type { DomainFailure } from './expression.js';

/**
 * Every failure a player can provoke has a code and typed parameters.
 *
 * The rendered French sentence travels with the error (see `messages.fr.ts`):
 * the server owns the wording so that a client version skew never turns a
 * teaching message into `[object Object]`. The client is free to re-render from
 * `code` + `params` if it wants richer formatting.
 */
export interface FwErrorParams {
  // — Parsing ————————————————————————————————————————————————
  ERR_EMPTY_INPUT: Record<string, never>;
  ERR_INPUT_TOO_LONG: { length: number; max: number };
  ERR_SYNTAX: { position: number; found: string };
  ERR_UNKNOWN_IDENTIFIER: { name: string; position: number; variable: string };
  ERR_UNKNOWN_FUNCTION: { name: string; position: number; suggestion: string | null };
  ERR_ARITY: { name: string; expected: number; received: number };
  ERR_AST_TOO_DEEP: { depth: number; max: number };
  ERR_AST_TOO_LARGE: { nodeCount: number; max: number };
  ERR_TOO_MANY_BRANCHES: { count: number; max: number };

  // — Validation, before the shot is fired ———————————————————————
  ERR_UNDEFINED_AT_ORIGIN: { x: number; failure: DomainFailure };
  ERR_DISCONTINUITY: { x: number; leftLimit: number | null; rightLimit: number | null };
  ERR_EVAL_BUDGET: { budget: number };
  ERR_COMPLEXITY_BUDGET: { nodeCount: number; budget: number };

  // — Rules ——————————————————————————————————————————————————
  ERR_NOT_YOUR_TURN: { activePlayerId: string };
  ERR_MATCH_NOT_RUNNING: { phase: string };
  ERR_PLAYER_ELIMINATED: Record<string, never>;
  ERR_NOT_ENOUGH_PLAYERS: { count: number; min: number };
  ERR_NOT_ENOUGH_TEAMS: { count: number };
  ERR_TOO_MANY_SEATS_FOR_DIFFICULTY: { count: number; max: number; difficulty: string };
  ERR_MAP_GENERATION_FAILED: { attempts: number };

  // — Lobby and transport ————————————————————————————————————
  ERR_LOBBY_NOT_FOUND: { code: string };
  ERR_LOBBY_FULL: { max: number };
  ERR_LOBBY_CLOSED: Record<string, never>;
  ERR_NAME_TAKEN: { name: string };
  ERR_BAD_MESSAGE: { detail: string };
  ERR_PROTOCOL_VERSION: { client: number; server: number };
  ERR_RATE_LIMITED: { retryAfterMs: number };
  ERR_UNAUTHORIZED: Record<string, never>;
  ERR_INTERNAL: Record<string, never>;
}

export type FwErrorCode = keyof FwErrorParams;

export type FwError<C extends FwErrorCode = FwErrorCode> = C extends FwErrorCode
  ? { readonly code: C; readonly params: FwErrorParams[C]; readonly message: string }
  : never;

/**
 * Wire shape. `params` stays opaque on the wire: the client displays `message`,
 * and only re-reads `params` for codes it explicitly knows about. This keeps a
 * new error code from breaking an older client.
 */
export const FwErrorSchema = z.object({
  code: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()),
  message: z.string().min(1).max(1000),
});
export type FwErrorWire = z.infer<typeof FwErrorSchema>;

/** Which side of the game produced the error — used for logging and metrics. */
export function errorCategory(code: FwErrorCode): 'parse' | 'validation' | 'rules' | 'transport' {
  if (code.startsWith('ERR_LOBBY') || code === 'ERR_NAME_TAKEN') return 'transport';
  switch (code) {
    case 'ERR_BAD_MESSAGE':
    case 'ERR_PROTOCOL_VERSION':
    case 'ERR_RATE_LIMITED':
    case 'ERR_UNAUTHORIZED':
    case 'ERR_INTERNAL':
      return 'transport';
    case 'ERR_UNDEFINED_AT_ORIGIN':
    case 'ERR_DISCONTINUITY':
    case 'ERR_EVAL_BUDGET':
    case 'ERR_COMPLEXITY_BUDGET':
      return 'validation';
    case 'ERR_NOT_YOUR_TURN':
    case 'ERR_MATCH_NOT_RUNNING':
    case 'ERR_PLAYER_ELIMINATED':
    case 'ERR_NOT_ENOUGH_PLAYERS':
    case 'ERR_NOT_ENOUGH_TEAMS':
    case 'ERR_TOO_MANY_SEATS_FOR_DIFFICULTY':
    case 'ERR_MAP_GENERATION_FAILED':
      return 'rules';
    default:
      return 'parse';
  }
}

/**
 * A parse or validation error costs the player nothing: the turn is not
 * consumed and the function can be corrected. Rules and transport errors are
 * reported but never rewind the match.
 */
export function isRecoverable(code: FwErrorCode): boolean {
  const category = errorCategory(code);
  return category === 'parse' || category === 'validation';
}
