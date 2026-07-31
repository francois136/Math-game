import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_MATCH_CONFIG, PROTOCOL_VERSION, type MatchConfig } from '@fw/contracts';
import { Client, serverWith } from './testing.js';

/**
 * A small, generous field.
 *
 * Deliberately easy to hit on: this test is about the protocol carrying a match
 * from a lobby to a winner, not about how hard aiming is. On the default map a
 * blind shot lands about once in two hundred, which would make this a stress
 * test of the tracer and a very slow one. The balance of the real field is
 * measured elsewhere — see docs/GAME_DESIGN.md §7.
 */
const GENEROUS: MatchConfig = {
  ...DEFAULT_MATCH_CONFIG,
  rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0 },
  map: {
    ...DEFAULT_MATCH_CONFIG.map,
    bounds: { min: { x: -25, y: -15 }, max: { x: 25, y: 15 } },
    playerRadius: 5,
    spawnClearance: 7,
    // The enemy distance is in world units, so a smaller board needs a smaller
    // one: the default 45 does not fit across a field 50 wide (ADR 0015).
    spawnMinDistanceEnemies: 18,
    obstacleCount: { min: 2, max: 4 },
  },
};

describe('a whole match, over the protocol, with no socket', () => {
  it('goes from an empty server to a winner', () => {
    const { game } = serverWith();
    const host = new Client(game);
    const guest = new Client(game);

    host.hello('Anne');
    host.say({ type: 'lobby:create', config: GENEROUS });
    const code = host.last('lobby:state')?.lobby.code;
    expect(code).toBeDefined();
    if (code === undefined) return;

    guest.hello('Bob');
    guest.say({ type: 'lobby:join', code, asSpectator: false });
    host.say({ type: 'lobby:ready', ready: true });
    guest.say({ type: 'lobby:ready', ready: true });
    host.say({ type: 'match:start', seed: 'integration' });

    const opening = host.last('match:state')?.match;
    expect(opening?.phase).toBe('running');
    if (opening?.turn == null) return;

    const bySeat = new Map([
      [host.last('welcome')?.playerId, host],
      [guest.last('welcome')?.playerId, guest],
    ]);

    const shots = ['0*x', 'x/4', '-x/4', 'x^2/30', '2*sin(x/3)', '-x/2'];
    let active = opening.turn.playerId;
    let ended = false;
    let eliminated: string | null = null;

    for (let turn = 0; turn < 60 && !ended; turn += 1) {
      const client = bySeat.get(active);
      expect(client, 'the active player must have a connection').toBeDefined();
      if (client === undefined) return;

      client.say({
        type: 'shot:fire',
        shot: {
          source: shots[turn % shots.length] ?? '0*x',
          axis: 'x',
          direction: turn % 2 === 0 ? 'increasing' : 'decreasing',
        },
      });

      for (const event of client.last('match:events')?.events ?? []) {
        if (event.kind === 'turn-started') active = event.turn.playerId;
        if (event.kind === 'player-eliminated') eliminated = event.playerId;
        if (event.kind === 'match-ended') ended = true;
      }
    }

    expect(ended, 'the match must reach a conclusion').toBe(true);
    expect(eliminated).not.toBeNull();

    // Both sides saw the same ending, and neither had to be told twice.
    for (const client of [host, guest]) {
      const events = client.all('match:events').flatMap((batch) => batch.events);
      expect(events.filter((event) => event.kind === 'match-ended')).toHaveLength(1);
    }

    // Sequence numbers are contiguous, which is how a client spots a gap.
    const seqs = host.all('match:events').map((batch) => batch.seq);
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));
  });
});

describe('the server survives nonsense', () => {
  it('never throws, whatever arrives on the wire', () => {
    const { game } = serverWith();

    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (raw) => {
        const client = new Client(game);
        expect(() => {
          client.sayRaw(raw);
        }).not.toThrow();
      }),
      { numRuns: 4000 },
    );
  });

  it('never throws on frames that are shaped right but wrong', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');

    const junk = fc.oneof(
      fc.record({ id: fc.integer(), message: fc.anything() }),
      fc.record({ id: fc.anything(), message: fc.record({ type: fc.string() }) }),
      fc.anything(),
    );

    fc.assert(
      fc.property(junk, (value) => {
        expect(() => {
          client.sayRaw(JSON.stringify(value));
        }).not.toThrow();
      }),
      { numRuns: 4000 },
    );
  });

  it('closes a connection that keeps sending rubbish', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');

    for (let i = 0; i < 3; i += 1) client.sayRaw('{');
    expect(client.closedWith).not.toBeNull();
  });

  it('forgives a bad frame between good ones', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');

    client.sayRaw('{');
    client.say({ type: 'ping' });
    client.sayRaw('{');
    client.say({ type: 'ping' });
    client.sayRaw('{');

    expect(client.closedWith).toBeNull();
  });

  it('holds the line on rate limits', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');

    for (let i = 0; i < 40; i += 1) client.say({ type: 'ping' });

    const limited = client
      .all('error')
      .filter((message) => message.error.code === 'ERR_RATE_LIMITED');
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]?.error.message).toContain('Réessaie');
  });

  it('rejects a frame whose protocol version is right but whose payload is not', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.sayRaw(
      JSON.stringify({ id: 1, message: { type: 'hello', protocolVersion: PROTOCOL_VERSION } }),
    );
    expect(client.last('error')?.error.code).toBe('ERR_BAD_MESSAGE');
  });
});
