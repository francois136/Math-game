import { randomInt, randomUUID } from 'node:crypto';
import {
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  LobbyCodeSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SessionTokenSchema,
  type IdFactoryPort,
} from '@fw/contracts';

/**
 * Identifiers for a running server.
 *
 * `node:crypto`, not the seeded generator: a session token a player could
 * predict is a seat a player could steal, and the whole point of the seeded
 * generator is that its output is predictable.
 */
export const cryptoIds: IdFactoryPort = {
  matchId: () => MatchIdSchema.parse(`match-${randomUUID()}`),
  playerId: () => PlayerIdSchema.parse(`player-${randomUUID()}`),
  sessionToken: () => SessionTokenSchema.parse(randomUUID().replaceAll('-', '')),
  lobbyCode: () => {
    let code = '';
    for (let i = 0; i < LOBBY_CODE_LENGTH; i += 1) {
      code += LOBBY_CODE_ALPHABET[randomInt(LOBBY_CODE_ALPHABET.length)] ?? 'A';
    }
    return LobbyCodeSchema.parse(code);
  },
};
