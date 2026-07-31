import {
  BOT_LEVEL_LABELS,
  fwError,
  MAX_PLAYERS,
  type BotLevel,
  type FwError,
  type IdFactoryPort,
  type LobbyCode,
  type LobbyState,
  type MatchConfig,
  type MatchState,
  type PlayerId,
  type Result,
  type TeamId,
  err,
  ok,
} from '@fw/contracts';

/** Spectators are cheap, but not free: a lobby is not a broadcast channel. */
export const MAX_LOBBY_MEMBERS = 32;

export interface Member {
  readonly playerId: PlayerId;
  name: string;
  teamId: TeamId | null;
  ready: boolean;
  connected: boolean;
  isSpectator: boolean;
  /** Null for a human. A bot has no connection and is always ready. */
  botLevel: BotLevel | null;
  /** Position in join order, used to hand the lobby over when the host leaves. */
  readonly joinedAt: number;
}

export interface Lobby {
  readonly code: LobbyCode;
  hostId: PlayerId;
  readonly members: Map<PlayerId, Member>;
  config: MatchConfig;
  match: MatchState | null;
  /** Bumped on every batch of events, so a client can spot a gap. */
  seq: number;
  joinCounter: number;
}

export function createLobby(code: LobbyCode, host: PlayerId, config: MatchConfig): Lobby {
  const lobby: Lobby = {
    code,
    hostId: host,
    members: new Map(),
    config,
    match: null,
    seq: 0,
    joinCounter: 0,
  };
  addMember(lobby, host, 'Hôte', false);
  return lobby;
}

export function addMember(
  lobby: Lobby,
  playerId: PlayerId,
  name: string,
  isSpectator: boolean,
): Member {
  const member: Member = {
    playerId,
    name,
    teamId: null,
    ready: false,
    connected: true,
    isSpectator,
    botLevel: null,
    joinedAt: lobby.joinCounter,
  };
  lobby.joinCounter += 1;
  lobby.members.set(playerId, member);
  return member;
}

export function players(lobby: Lobby): Member[] {
  return [...lobby.members.values()]
    .filter((member) => !member.isSpectator)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/**
 * Can this player still take a seat?
 *
 * A lobby fills up twice over: at `MAX_PLAYERS` seats, and at
 * `MAX_LOBBY_MEMBERS` connections including spectators.
 */
export function canJoin(lobby: Lobby, asSpectator: boolean): Result<void, FwError> {
  if (lobby.members.size >= MAX_LOBBY_MEMBERS) {
    return err(fwError('ERR_LOBBY_FULL', { max: MAX_LOBBY_MEMBERS }));
  }
  if (!asSpectator && players(lobby).length >= lobby.config.rules.maxPlayers) {
    return err(fwError('ERR_LOBBY_FULL', { max: lobby.config.rules.maxPlayers }));
  }
  return ok(undefined);
}

/**
 * Remove a member, handing the lobby over if it was the host's.
 *
 * Returns false when the lobby is now empty and should be dropped. The oldest
 * remaining member inherits — not the next in a map's iteration order, which
 * would make "who is host now" depend on insertion history nobody can see.
 */
export function removeMember(lobby: Lobby, playerId: PlayerId): boolean {
  lobby.members.delete(playerId);
  if (lobby.members.size === 0) return false;

  if (lobby.hostId === playerId) {
    const heir = [...lobby.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (heir === undefined) return false;
    lobby.hostId = heir.playerId;
  }
  return true;
}

export function requireHost(lobby: Lobby, playerId: PlayerId): Result<void, FwError> {
  return lobby.hostId === playerId ? ok(undefined) : err(fwError('ERR_UNAUTHORIZED', {}));
}

export function nameIsFree(lobby: Lobby, name: string, except?: PlayerId): boolean {
  for (const member of lobby.members.values()) {
    if (member.playerId !== except && member.name === name) return false;
  }
  return true;
}

/** A name nobody else in this lobby has: `Anne`, then `Anne (2)`, and so on. */
export function uniqueName(lobby: Lobby, wanted: string): string {
  if (nameIsFree(lobby, wanted)) return wanted;
  for (let suffix = 2; suffix < MAX_LOBBY_MEMBERS + 2; suffix += 1) {
    const candidate = `${wanted} (${String(suffix)})`;
    if (nameIsFree(lobby, candidate)) return candidate;
  }
  return wanted;
}

export function view(lobby: Lobby): LobbyState {
  return {
    code: lobby.code,
    hostId: lobby.hostId,
    members: [...lobby.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((member) => ({
        playerId: member.playerId,
        name: member.name,
        teamId: member.teamId,
        ready: member.ready,
        connected: member.connected,
        isBot: member.botLevel !== null,
        botLevel: member.botLevel,
        isSpectator: member.isSpectator,
      })),
    config: lobby.config,
    matchId: lobby.match?.id ?? null,
  };
}

/**
 * Seat a bot.
 *
 * It is a `Member` like any other — same seat, same team slot, removed by the
 * same `lobby:remove-player`. The only differences are that it has no socket,
 * so `connected` is meaningless, and that it is ready the moment it sits down:
 * nothing would ever tick its box.
 */
export function addBot(lobby: Lobby, playerId: PlayerId, level: BotLevel): Member {
  const member = addMember(lobby, playerId, uniqueName(lobby, BOT_LEVEL_LABELS[level]), false);
  member.botLevel = level;
  member.ready = true;
  return member;
}

/** Six unambiguous characters, retried until it does not collide. */
export function freshCode(taken: ReadonlySet<string>, ids: IdFactoryPort): LobbyCode | null {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const code = ids.lobbyCode();
    if (!taken.has(code)) return code;
  }
  return null;
}

export { MAX_PLAYERS };
