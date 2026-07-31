import {
  ClientFrameSchema,
  DEFAULT_MATCH_CONFIG,
  fwError,
  PROTOCOL_VERSION,
  SeedSchema,
  type ClientMessage,
  type ClockPort,
  type IdFactoryPort,
  type LobbyCode,
  type MatchCommand,
  type MatchConfig,
  type MatchSetupPlayer,
  type PlayerId,
  type RulesEnginePort,
  type RulesDeps,
  type ServerFrame,
  type BotPort,
  type MatchState,
  type ReplayPort,
  type ServerMessage,
  type SessionToken,
} from '@fw/contracts';
import {
  addBot,
  addMember,
  canJoin,
  createLobby,
  freshCode,
  players,
  removeMember,
  requireHost,
  uniqueName,
  view,
  type Lobby,
} from './lobby.js';
import { FRAME_LIMIT, PING_LIMIT, TokenBucket, VALIDATE_LIMIT } from './rate-limit.js';

/**
 * The authoritative server, with the socket taken out.
 *
 * Nothing here knows about `ws`: a connection is anything that can be sent a
 * frame and closed. That is what lets a whole match be played between two
 * simulated clients in a unit test, in memory, in a millisecond — and it is the
 * only reason the protocol gets tested at all rather than hoped about.
 */
export interface Connection {
  send(frame: ServerFrame): void;
  close(reason: string): void;
}

/** How long a seat is held for a player who dropped. */
export const RECONNECT_GRACE_MS = 120_000;

/** Invalid frames in a row before the socket is closed. */
const INVALID_FRAME_TOLERANCE = 3;

interface Session {
  readonly playerId: PlayerId;
  readonly token: SessionToken;
  name: string;
  lobbyCode: LobbyCode | null;
  connection: Connection | null;
  disconnectedAtMs: number | null;
}

interface Conn {
  session: Session | null;
  readonly frames: TokenBucket;
  readonly validates: TokenBucket;
  readonly pings: TokenBucket;
  invalidInARow: number;
}

/** A bot table cannot hand the turn round for ever; see `playBots`. */
const MAX_BOT_TURNS_IN_A_ROW = 256;

export interface ServerDeps {
  readonly rules: RulesEnginePort;
  readonly bot: BotPort;
  readonly replays: ReplayPort;
  readonly engine: RulesDeps;
  readonly ids: IdFactoryPort;
  readonly clock: ClockPort;
}

export class GameServer {
  private readonly lobbies = new Map<string, Lobby>();
  private readonly sessionsByToken = new Map<string, Session>();
  private readonly conns = new Map<Connection, Conn>();

  constructor(private readonly deps: ServerDeps) {}

  open(connection: Connection): void {
    const now = this.deps.clock.nowMs();
    this.conns.set(connection, {
      session: null,
      frames: new TokenBucket(FRAME_LIMIT, now),
      validates: new TokenBucket(VALIDATE_LIMIT, now),
      pings: new TokenBucket(PING_LIMIT, now),
      invalidInARow: 0,
    });
  }

  /** A frame straight off the wire. Nothing downstream sees unvalidated input. */
  receive(connection: Connection, raw: string): void {
    const conn = this.conns.get(connection);
    if (conn === undefined) return;
    const now = this.deps.clock.nowMs();

    const budget = conn.frames.take(now);
    if (!budget.allowed) {
      this.reply(connection, null, {
        type: 'error',
        error: fwError('ERR_RATE_LIMITED', { retryAfterMs: budget.retryAfterMs }),
      });
      return;
    }

    const frame = parseFrame(raw);
    if (frame === null) {
      conn.invalidInARow += 1;
      this.reply(connection, null, {
        type: 'error',
        error: fwError('ERR_BAD_MESSAGE', { detail: 'trame illisible ou hors protocole' }),
      });
      if (conn.invalidInARow >= INVALID_FRAME_TOLERANCE) {
        connection.close('trop de trames invalides');
        this.close(connection);
      }
      return;
    }

    conn.invalidInARow = 0;
    this.handle(connection, conn, frame.id, frame.message, now);
  }

  close(connection: Connection): void {
    const conn = this.conns.get(connection);
    this.conns.delete(connection);
    const session = conn?.session;
    if (session === undefined || session === null) return;

    session.connection = null;
    session.disconnectedAtMs = this.deps.clock.nowMs();

    const lobby = this.lobbyOf(session);
    if (lobby === undefined) return;
    const member = lobby.members.get(session.playerId);
    if (member !== undefined) member.connected = false;

    if (lobby.match !== null && lobby.match.phase === 'running') {
      this.runCommand(lobby, { kind: 'disconnect', playerId: session.playerId });
    }
    this.broadcastLobby(lobby);
  }

  /**
   * The clock talking to the match.
   *
   * Deadlines and the reconnection grace period are the only things that happen
   * without a client asking, so this is the only place the server acts on its
   * own — and even here the time comes in as a parameter.
   */
  tick(): void {
    const now = this.deps.clock.nowMs();

    for (const [code, lobby] of this.lobbies) {
      if (lobby.match !== null && lobby.match.phase === 'running' && lobby.match.turn !== null) {
        if (now >= lobby.match.turn.deadlineAt) {
          this.runCommand(lobby, { kind: 'timeout', atMs: now });
          this.playBots(lobby);
        }
      }

      for (const member of [...lobby.members.values()]) {
        if (member.connected) continue;
        const session = this.sessionOf(member.playerId);
        const droppedAt = session?.disconnectedAtMs ?? null;
        if (droppedAt !== null && now - droppedAt > RECONNECT_GRACE_MS) {
          this.releaseSeat(lobby, member.playerId);
        }
      }

      if (lobby.members.size === 0) this.lobbies.delete(code);
    }
  }

  // — Message handling ————————————————————————————————————————

  private handle(
    connection: Connection,
    conn: Conn,
    replyTo: number,
    message: ClientMessage,
    now: number,
  ): void {
    if (message.type === 'hello') {
      this.onHello(connection, conn, replyTo, message);
      return;
    }

    const session = conn.session;
    if (session === null) {
      this.reply(connection, replyTo, { type: 'error', error: fwError('ERR_UNAUTHORIZED', {}) });
      return;
    }

    switch (message.type) {
      case 'ping': {
        const budget = conn.pings.take(now);
        this.reply(
          connection,
          replyTo,
          budget.allowed
            ? { type: 'pong' }
            : {
                type: 'error',
                error: fwError('ERR_RATE_LIMITED', { retryAfterMs: budget.retryAfterMs }),
              },
        );
        return;
      }

      case 'lobby:create':
        this.onCreate(session, replyTo, message.config);
        return;

      case 'lobby:join':
        this.onJoin(session, replyTo, message.code, message.asSpectator);
        return;

      case 'lobby:leave':
        this.onLeave(session);
        return;

      case 'lobby:configure':
      case 'lobby:set-team':
      case 'lobby:ready':
      case 'lobby:add-bot':
      case 'lobby:remove-player':
        this.onLobbyEdit(session, replyTo, message);
        return;

      case 'match:start':
        this.onStart(session, replyTo, message.seed, now);
        return;

      case 'shot:validate':
        this.onValidate(session, conn, replyTo, message, now);
        return;

      case 'shot:fire':
        this.withMatch(session, replyTo, (lobby) => {
          this.runCommand(lobby, {
            kind: 'fire',
            playerId: session.playerId,
            shot: message.shot,
          });
          this.playBots(lobby);
        });
        return;

      case 'turn:pass':
        this.withMatch(session, replyTo, (lobby) => {
          this.runCommand(lobby, { kind: 'pass', playerId: session.playerId });
          this.playBots(lobby);
        });
        return;

      case 'replay:load': {
        // Replaying costs one full match of tracing, so it is rate limited like
        // validation is: it is the other way a client can ask the server to
        // compute on demand.
        const budget = conn.validates.take(now);
        if (!budget.allowed) {
          this.send(session, replyTo, {
            type: 'error',
            error: fwError('ERR_RATE_LIMITED', { retryAfterMs: budget.retryAfterMs }),
          });
          return;
        }
        const rebuilt = this.deps.replays.replay(message.replay, this.deps.engine);
        this.send(
          session,
          replyTo,
          rebuilt.ok
            ? { type: 'replay:state', match: rebuilt.value }
            : { type: 'error', error: rebuilt.error },
        );
        return;
      }
    }
  }

  private onHello(
    connection: Connection,
    conn: Conn,
    replyTo: number,
    message: Extract<ClientMessage, { type: 'hello' }>,
  ): void {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this.reply(connection, replyTo, {
        type: 'error',
        error: fwError('ERR_PROTOCOL_VERSION', {
          client: message.protocolVersion,
          server: PROTOCOL_VERSION,
        }),
      });
      connection.close('version de protocole incompatible');
      this.conns.delete(connection);
      return;
    }

    const resumed = message.token === null ? undefined : this.sessionsByToken.get(message.token);
    const session =
      resumed ??
      ((): Session => {
        const fresh: Session = {
          playerId: this.deps.ids.playerId(),
          token: this.deps.ids.sessionToken(),
          name: message.name,
          lobbyCode: null,
          connection: null,
          disconnectedAtMs: null,
        };
        this.sessionsByToken.set(fresh.token, fresh);
        return fresh;
      })();

    if (message.token !== null && resumed === undefined) {
      // The token is unknown: the seat is gone, or was never theirs.
      this.reply(connection, replyTo, { type: 'error', error: fwError('ERR_UNAUTHORIZED', {}) });
    }

    session.connection = connection;
    session.disconnectedAtMs = null;
    conn.session = session;

    this.reply(connection, replyTo, {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId: session.playerId,
      token: session.token,
    });

    const lobby = this.lobbyOf(session);
    if (lobby === undefined) return;

    const member = lobby.members.get(session.playerId);
    if (member !== undefined) member.connected = true;
    this.reply(connection, null, { type: 'lobby:state', lobby: view(lobby) });

    if (lobby.match !== null) {
      // A returning client gets a full snapshot, never a delta: catching up on
      // a stream it missed is the client's least reliable code path.
      this.reply(connection, null, { type: 'match:state', match: lobby.match });
      if (lobby.match.phase === 'running') {
        this.runCommand(lobby, { kind: 'reconnect', playerId: session.playerId });
      }
    }
    this.broadcastLobby(lobby);
  }

  private onCreate(session: Session, replyTo: number, config: MatchConfig | null): void {
    if (session.lobbyCode !== null) this.onLeave(session);

    const code = freshCode(new Set(this.lobbies.keys()), this.deps.ids);
    if (code === null) {
      this.send(session, replyTo, { type: 'error', error: fwError('ERR_INTERNAL', {}) });
      return;
    }

    const lobby = createLobby(code, session.playerId, config ?? DEFAULT_MATCH_CONFIG);
    const host = lobby.members.get(session.playerId);
    if (host !== undefined) host.name = session.name;
    this.lobbies.set(code, lobby);
    session.lobbyCode = code;
    this.broadcastLobby(lobby);
  }

  private onJoin(session: Session, replyTo: number, code: LobbyCode, asSpectator: boolean): void {
    const lobby = this.lobbies.get(code);
    if (lobby === undefined) {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_LOBBY_NOT_FOUND', { code }),
      });
      return;
    }
    if (!asSpectator && lobby.match !== null && lobby.match.phase === 'running') {
      this.send(session, replyTo, { type: 'error', error: fwError('ERR_LOBBY_CLOSED', {}) });
      return;
    }

    const room = canJoin(lobby, asSpectator);
    if (!room.ok) {
      this.send(session, replyTo, { type: 'error', error: room.error });
      return;
    }

    if (session.lobbyCode !== null) this.onLeave(session);
    addMember(lobby, session.playerId, uniqueName(lobby, session.name), asSpectator);
    session.lobbyCode = code;
    this.broadcastLobby(lobby);
  }

  private onLeave(session: Session): void {
    const lobby = this.lobbyOf(session);
    session.lobbyCode = null;
    if (lobby === undefined) return;

    const kept = removeMember(lobby, session.playerId);
    if (!kept) {
      this.lobbies.delete(lobby.code);
      return;
    }
    this.broadcastLobby(lobby);
  }

  private onLobbyEdit(
    session: Session,
    replyTo: number,
    message: Extract<
      ClientMessage,
      {
        type:
          | 'lobby:configure'
          | 'lobby:set-team'
          | 'lobby:ready'
          | 'lobby:add-bot'
          | 'lobby:remove-player';
      }
    >,
  ): void {
    const lobby = this.lobbyOf(session);
    if (lobby === undefined) {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_LOBBY_NOT_FOUND', { code: '—' }),
      });
      return;
    }

    if (message.type === 'lobby:set-team' || message.type === 'lobby:ready') {
      const member = lobby.members.get(session.playerId);
      if (member === undefined) return;
      if (message.type === 'lobby:set-team') member.teamId = message.teamId;
      else member.ready = message.ready;
      this.broadcastLobby(lobby);
      return;
    }

    const allowed = requireHost(lobby, session.playerId);
    if (!allowed.ok) {
      this.send(session, replyTo, { type: 'error', error: allowed.error });
      return;
    }

    if (message.type === 'lobby:configure') {
      lobby.config = message.config;
    } else if (message.type === 'lobby:add-bot') {
      const room = canJoin(lobby, false);
      if (!room.ok) {
        this.send(session, replyTo, { type: 'error', error: room.error });
        return;
      }
      addBot(lobby, this.deps.ids.playerId(), message.level);
    } else {
      this.releaseSeat(lobby, message.playerId);
    }
    this.broadcastLobby(lobby);
  }

  private onStart(session: Session, replyTo: number, seed: string | null, now: number): void {
    const lobby = this.lobbyOf(session);
    if (lobby === undefined) {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_LOBBY_NOT_FOUND', { code: '—' }),
      });
      return;
    }
    const allowed = requireHost(lobby, session.playerId);
    if (!allowed.ok) {
      this.send(session, replyTo, { type: 'error', error: allowed.error });
      return;
    }
    if (lobby.match !== null && lobby.match.phase === 'running') {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_MATCH_NOT_RUNNING', { phase: 'running' }),
      });
      return;
    }

    const seated = players(lobby);
    if (seated.length < lobby.config.rules.minPlayers) {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_NOT_ENOUGH_PLAYERS', {
          count: seated.length,
          min: lobby.config.rules.minPlayers,
        }),
      });
      return;
    }
    if (!seated.every((member) => member.ready)) {
      this.send(session, replyTo, { type: 'error', error: fwError('ERR_UNAUTHORIZED', {}) });
      return;
    }

    const matchId = this.deps.ids.matchId();
    const setupPlayers: MatchSetupPlayer[] = seated.map((member) => ({
      id: member.playerId,
      name: member.name,
      teamId: member.teamId,
      isBot: member.botLevel !== null,
    }));

    const created = this.deps.rules.createMatch(
      {
        id: matchId,
        // No seed given: the match id doubles as one. It is unique and
        // unpredictable, which is all a game seed has to be.
        seed: SeedSchema.parse(seed ?? matchId),
        config: lobby.config,
        players: setupPlayers,
        map: null,
        startedAtMs: now,
      },
      this.deps.engine,
    );

    if (!created.ok) {
      this.send(session, replyTo, { type: 'error', error: created.error });
      return;
    }

    lobby.match = created.value;
    lobby.seq = 0;
    this.broadcastLobby(lobby);
    this.broadcast(lobby, { type: 'match:state', match: created.value });
    // A bot may hold the first turn.
    this.playBots(lobby);
  }

  private onValidate(
    session: Session,
    conn: Conn,
    replyTo: number,
    message: Extract<ClientMessage, { type: 'shot:validate' }>,
    now: number,
  ): void {
    const budget = conn.validates.take(now);
    if (!budget.allowed) {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_RATE_LIMITED', { retryAfterMs: budget.retryAfterMs }),
      });
      return;
    }

    const lobby = this.lobbyOf(session);
    const match = lobby?.match ?? null;
    const shooter = match?.players.find((player) => player.id === session.playerId);

    const parsed = this.deps.engine.parser.parse(message.source, message.axis);
    if (!parsed.ok) {
      this.send(session, replyTo, { type: 'shot:validation', ok: false, error: parsed.error });
      return;
    }
    if (match === null || shooter === undefined) {
      this.send(session, replyTo, { type: 'shot:validation', ok: true, error: null });
      return;
    }

    // The interval is in the shot's own variable, as the rules engine computes
    // it for a real shot (ADR 0013).
    const low = message.axis === 'x' ? match.map.bounds.min.x : match.map.bounds.min.y;
    const high = message.axis === 'x' ? match.map.bounds.max.x : match.map.bounds.max.y;
    const start = message.axis === 'x' ? shooter.origin.x : shooter.origin.y;
    const span =
      message.direction === 'increasing'
        ? { from: 0, to: high - start }
        : { from: low - start, to: 0 };
    const continuity = this.deps.engine.continuity.check(parsed.value, span, match.config.trace);

    this.send(session, replyTo, {
      type: 'shot:validation',
      ok: continuity.ok,
      error: continuity.ok ? null : continuity.error,
    });
  }

  // — Plumbing ————————————————————————————————————————————————

  private withMatch(session: Session, replyTo: number, run: (lobby: Lobby) => void): void {
    const lobby = this.lobbyOf(session);
    if (lobby === undefined || lobby.match === null) {
      this.send(session, replyTo, {
        type: 'error',
        error: fwError('ERR_MATCH_NOT_RUNNING', { phase: 'lobby' }),
      });
      return;
    }
    run(lobby);
  }

  private runCommand(lobby: Lobby, command: MatchCommand): void {
    if (lobby.match === null) return;
    const { state, events } = this.deps.rules.apply(
      lobby.match,
      command,
      this.deps.engine,
      this.deps.clock.nowMs(),
    );
    lobby.match = state;
    if (events.length === 0) return;

    lobby.seq += 1;
    this.broadcast(lobby, {
      type: 'match:events',
      matchId: state.id,
      seq: lobby.seq,
      events: [...events],
    });

    // The match is over: hand everyone the whole thing, in a few kilobytes.
    if (events.some((event) => event.kind === 'match-ended')) {
      this.broadcast(lobby, { type: 'match:replay', replay: this.deps.replays.toReplay(state) });
    }
  }

  /**
   * Let every bot whose turn it is play, until a human is up again.
   *
   * A loop and not recursion, and bounded: a table of bots hands the turn round
   * and round, and a bug that stopped ending turns would otherwise take the
   * server down rather than misbehave visibly. The bound is generous — no real
   * match of eight bots reaches it in one call — and reaching it leaves the
   * match in a consistent state, simply waiting for the next command.
   */
  private playBots(lobby: Lobby): void {
    for (let guard = 0; guard < MAX_BOT_TURNS_IN_A_ROW; guard += 1) {
      const match = lobby.match;
      if (match === null || match.phase !== 'running' || match.turn === null) return;

      const played = match.config.rules.simultaneousResolution
        ? this.submitForBots(lobby, match)
        : this.playOneBotTurn(lobby, match);
      if (!played) return;
    }
  }

  /** Turn-based: the bot holding the turn fires. Returns false if none does. */
  private playOneBotTurn(lobby: Lobby, match: MatchState): boolean {
    const activeId = match.turn?.playerId ?? null;
    if (activeId === null) return false;

    const level = lobby.members.get(activeId)?.botLevel ?? null;
    if (level === null) return false;

    this.runCommand(lobby, {
      kind: 'fire',
      playerId: activeId,
      shot: this.deps.bot.chooseShot(match, activeId, level, this.deps.engine),
    });

    // A shot the rules refused would leave the same bot on turn for ever. The
    // bot goes through the same parser and continuity check as a player, so
    // this should not happen; if it does, pass rather than spin.
    if (lobby.match?.turn?.playerId === activeId) {
      this.runCommand(lobby, { kind: 'pass', playerId: activeId });
    }
    return true;
  }

  /**
   * Simultaneous: every bot that has not answered this round does.
   *
   * They submit and the round waits for the humans, exactly as it should — a
   * bot that resolved the round by itself would take the choice away from
   * whoever was still writing (ADR 0019).
   */
  private submitForBots(lobby: Lobby, match: MatchState): boolean {
    let any = false;

    for (const player of match.players) {
      if (!player.alive) continue;
      if (match.pending.some((entry) => entry.playerId === player.id)) continue;

      const level = lobby.members.get(player.id)?.botLevel ?? null;
      if (level === null) continue;

      this.runCommand(lobby, {
        kind: 'fire',
        playerId: player.id,
        shot: this.deps.bot.chooseShot(match, player.id, level, this.deps.engine),
      });
      any = true;
    }
    // Only worth looping again if a round resolved and a new one has opened.
    return any && lobby.match?.turn?.index !== match.turn?.index;
  }

  /** Free a seat, whether the player was kicked or their grace period ran out. */
  private releaseSeat(lobby: Lobby, playerId: PlayerId): void {
    const session = this.sessionOf(playerId);
    if (session !== undefined) session.lobbyCode = null;

    const kept = removeMember(lobby, playerId);
    if (!kept) this.lobbies.delete(lobby.code);
    else this.broadcastLobby(lobby);
  }

  private lobbyOf(session: Session): Lobby | undefined {
    return session.lobbyCode === null ? undefined : this.lobbies.get(session.lobbyCode);
  }

  private sessionOf(playerId: PlayerId): Session | undefined {
    for (const session of this.sessionsByToken.values()) {
      if (session.playerId === playerId) return session;
    }
    return undefined;
  }

  private broadcastLobby(lobby: Lobby): void {
    this.broadcast(lobby, { type: 'lobby:state', lobby: view(lobby) });
  }

  private broadcast(lobby: Lobby, message: ServerMessage): void {
    for (const member of lobby.members.values()) {
      const session = this.sessionOf(member.playerId);
      session?.connection?.send({ replyTo: null, message });
    }
  }

  private send(session: Session, replyTo: number | null, message: ServerMessage): void {
    session.connection?.send({ replyTo, message });
  }

  private reply(connection: Connection, replyTo: number | null, message: ServerMessage): void {
    connection.send({ replyTo, message });
  }
}

function parseFrame(raw: string): { id: number; message: ClientMessage } | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const frame = ClientFrameSchema.safeParse(json);
  return frame.success ? frame.data : null;
}
