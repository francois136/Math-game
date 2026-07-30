import { z } from 'zod';

/**
 * Identifiers are branded strings: a PlayerId can never be passed where a
 * TeamId is expected, even though both are strings at runtime.
 */

export const PlayerIdSchema = z.string().min(1).max(64).brand<'PlayerId'>();
export type PlayerId = z.infer<typeof PlayerIdSchema>;

export const TeamIdSchema = z.string().min(1).max(64).brand<'TeamId'>();
export type TeamId = z.infer<typeof TeamIdSchema>;

export const MatchIdSchema = z.string().min(1).max(64).brand<'MatchId'>();
export type MatchId = z.infer<typeof MatchIdSchema>;

export const ObstacleIdSchema = z.string().min(1).max(64).brand<'ObstacleId'>();
export type ObstacleId = z.infer<typeof ObstacleIdSchema>;

/** Lobby invitation code: 6 unambiguous upper-case characters (no I, O, 0, 1). */
export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LOBBY_CODE_LENGTH = 6;
export const LobbyCodeSchema = z
  .string()
  .length(LOBBY_CODE_LENGTH)
  .regex(/^[A-HJ-NP-Z2-9]+$/, 'Code de salon invalide')
  .brand<'LobbyCode'>();
export type LobbyCode = z.infer<typeof LobbyCodeSchema>;

/**
 * A match seed. Everything random in a match derives from it, so the same seed
 * plus the same ordered inputs replays the same game, bit for bit.
 */
export const SeedSchema = z.string().min(1).max(64).brand<'Seed'>();
export type Seed = z.infer<typeof SeedSchema>;

/**
 * Opaque token handed to a client on join, presented again to resume a seat
 * after a disconnect. Never derived from the PlayerId.
 */
export const SessionTokenSchema = z.string().min(16).max(128).brand<'SessionToken'>();
export type SessionToken = z.infer<typeof SessionTokenSchema>;
