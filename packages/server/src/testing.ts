import {
  LobbyCodeSchema,
  MatchIdSchema,
  PlayerIdSchema,
  PROTOCOL_VERSION,
  SessionTokenSchema,
  type ClientMessage,
  type ClockPort,
  type IdFactoryPort,
  type RulesDeps,
  type ServerFrame,
  type ServerMessage,
} from '@fw/contracts';
import { continuity, evaluator, parser } from '@fw/core-math';
import { maps, tracer } from '@fw/physics';
import { rules } from '@fw/rules';
import { GameServer, type Connection, type ServerDeps } from './server.js';

/**
 * Fixtures for this package's own tests. Not exported from `index.ts` and not
 * compiled into `dist`.
 *
 * A `Client` here is a real client in every way that matters: it speaks the
 * wire format, its frames go through the same validation, and it only knows
 * what the server told it. It simply has no socket.
 */

export class TestClock implements ClockPort {
  constructor(private ms = 0) {}
  nowMs(): number {
    return this.ms;
  }
  advance(by: number): void {
    this.ms += by;
  }
  set(to: number): void {
    this.ms = to;
  }
}

/** Predictable identifiers, so a failing test names the same player twice. */
export function countingIds(): IdFactoryPort {
  let n = 0;
  return {
    matchId: () => MatchIdSchema.parse(`match-${String((n += 1))}`),
    playerId: () => PlayerIdSchema.parse(`player-${String((n += 1))}`),
    sessionToken: () => SessionTokenSchema.parse(`token-${String((n += 1))}`.padEnd(16, '0')),
    lobbyCode: () => LobbyCodeSchema.parse(`AA${String((n += 1)).padStart(4, '2')}`),
  };
}

export class Client implements Connection {
  readonly received: ServerFrame[] = [];
  closedWith: string | null = null;
  private nextId = 0;

  constructor(private readonly server: GameServer) {
    server.open(this);
  }

  send(frame: ServerFrame): void {
    this.received.push(frame);
  }

  close(reason: string): void {
    this.closedWith = reason;
  }

  /** Send a well-formed frame, as a real client would. */
  say(message: ClientMessage): void {
    this.nextId += 1;
    this.server.receive(this, JSON.stringify({ id: this.nextId, message }));
  }

  /** Send whatever this is. Used to prove the server survives nonsense. */
  sayRaw(raw: string): void {
    this.server.receive(this, raw);
  }

  drop(): void {
    this.server.close(this);
  }

  hello(name: string, token: string | null = null): void {
    this.say({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      name,
      token: token === null ? null : SessionTokenSchema.parse(token),
    });
  }

  /** Every message of a kind, oldest first. */
  all<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received
      .map((frame) => frame.message)
      .filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type);
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.all(type).at(-1);
  }

  forget(): void {
    this.received.length = 0;
  }
}

export function serverWith(clock = new TestClock()): { game: GameServer; clock: TestClock } {
  const engine: RulesDeps = { parser, evaluator, continuity, tracer, maps };
  const deps: ServerDeps = { rules, engine, ids: countingIds(), clock };
  return { game: new GameServer(deps), clock };
}
