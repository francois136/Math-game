import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  LobbyCodeSchema,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type LobbyState,
} from '@fw/contracts';
import { RECONNECT_GRACE_MS } from './server.js';
import { Client, serverWith, TestClock } from './testing.js';

/** Two identified clients in the same lobby, both ready. */
function lobbyOfTwo(clock = new TestClock()) {
  const { game } = serverWith(clock);
  const host = new Client(game);
  const guest = new Client(game);

  host.hello('Anne');
  host.say({ type: 'lobby:create', config: null });
  const code = host.last('lobby:state')?.lobby.code;
  if (code === undefined) throw new Error('no lobby');

  guest.hello('Bob');
  guest.say({ type: 'lobby:join', code, asSpectator: false });
  host.say({ type: 'lobby:ready', ready: true });
  guest.say({ type: 'lobby:ready', ready: true });

  return { game, host, guest, code, clock };
}

const lobbyOf = (client: Client): LobbyState => {
  const state = client.last('lobby:state')?.lobby;
  if (state === undefined) throw new Error('no lobby state');
  return state;
};

describe('the handshake', () => {
  it('hands out a player and a token', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');

    const welcome = client.last('welcome');
    expect(welcome?.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(welcome?.playerId).toBeTruthy();
    expect(welcome?.token).toBeTruthy();
  });

  it('turns away a client that speaks another version', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.say({ type: 'hello', protocolVersion: 99, name: 'Anne', token: null });

    expect(client.last('error')?.error.code).toBe('ERR_PROTOCOL_VERSION');
    expect(client.closedWith).not.toBeNull();
  });

  it('refuses everything before hello', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.say({ type: 'lobby:create', config: null });

    expect(client.last('error')?.error.code).toBe('ERR_UNAUTHORIZED');
    expect(client.all('lobby:state')).toHaveLength(0);
  });
});

describe('lobbies', () => {
  it('creates one and puts the host in it', () => {
    const { host } = lobbyOfTwo();
    const lobby = lobbyOf(host);
    expect(lobby.members).toHaveLength(2);
    expect(lobby.hostId).toBe(lobby.members[0]?.playerId);
    expect(lobby.matchId).toBeNull();
  });

  it('tells a client the code does not exist rather than nothing', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');
    client.say({ type: 'lobby:join', code: LobbyCodeSchema.parse('AAAAAA'), asSpectator: false });

    expect(client.last('error')?.error.code).toBe('ERR_LOBBY_NOT_FOUND');
  });

  it('gives a second Anne a name of her own', () => {
    const { game, code } = lobbyOfTwo();
    const third = new Client(game);
    third.hello('Anne');
    third.say({ type: 'lobby:join', code, asSpectator: false });

    const names = lobbyOf(third).members.map((member) => member.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Anne (2)');
  });

  it('fills up at the seat limit but still takes spectators', () => {
    const { game, code } = lobbyOfTwo();
    const seats: Client[] = [];
    // Two are already seated, MAX_PLAYERS is the ceiling: one more than the
    // free seats, and the last one is turned away.
    for (let i = 0; i < MAX_PLAYERS - 1; i += 1) {
      const client = new Client(game);
      client.hello(`Joueur ${String(i)}`);
      client.say({ type: 'lobby:join', code, asSpectator: false });
      seats.push(client);
    }
    expect(seats.at(-1)?.last('error')?.error.code).toBe('ERR_LOBBY_FULL');
    expect(seats.at(-2)?.last('error')).toBeUndefined();

    const watcher = new Client(game);
    watcher.hello('Curieux');
    watcher.say({ type: 'lobby:join', code, asSpectator: true });
    expect(watcher.last('error')).toBeUndefined();
    expect(lobbyOf(watcher).members.filter((m) => m.isSpectator)).toHaveLength(1);
  });

  it('hands the lobby to the oldest member when the host leaves', () => {
    const { host, guest } = lobbyOfTwo();
    const hostId = lobbyOf(host).hostId;
    host.say({ type: 'lobby:leave' });

    const lobby = lobbyOf(guest);
    expect(lobby.hostId).not.toBe(hostId);
    expect(lobby.members).toHaveLength(1);
  });

  it('lets only the host change the settings', () => {
    const { host, guest } = lobbyOfTwo();
    const tighter = {
      ...DEFAULT_MATCH_CONFIG,
      rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0 },
    };

    guest.say({ type: 'lobby:configure', config: tighter });
    expect(guest.last('error')?.error.code).toBe('ERR_UNAUTHORIZED');
    expect(lobbyOf(guest).config.rules.shieldTurns).toBe(2);

    host.say({ type: 'lobby:configure', config: tighter });
    expect(lobbyOf(guest).config.rules.shieldTurns).toBe(0);
  });
});

describe('starting a match', () => {
  it('needs the host, enough players and everyone ready', () => {
    const { game } = serverWith();
    const host = new Client(game);
    host.hello('Anne');
    host.say({ type: 'lobby:create', config: null });
    const code = lobbyOf(host).code;

    host.say({ type: 'match:start', seed: null });
    expect(host.last('error')?.error.code).toBe('ERR_NOT_ENOUGH_PLAYERS');

    const guest = new Client(game);
    guest.hello('Bob');
    guest.say({ type: 'lobby:join', code, asSpectator: false });

    guest.say({ type: 'match:start', seed: null });
    expect(guest.last('error')?.error.code).toBe('ERR_UNAUTHORIZED');

    host.forget();
    host.say({ type: 'match:start', seed: null });
    expect(host.last('error')?.error.code).toBe('ERR_UNAUTHORIZED'); // nobody is ready

    host.say({ type: 'lobby:ready', ready: true });
    guest.say({ type: 'lobby:ready', ready: true });
    host.forget();
    host.say({ type: 'match:start', seed: null });
    expect(host.last('match:state')).toBeDefined();
  });

  it('sends the whole state to everyone, spectators included', () => {
    const { game, host, guest, code } = lobbyOfTwo();
    const watcher = new Client(game);
    watcher.hello('Curieux');
    watcher.say({ type: 'lobby:join', code, asSpectator: true });

    host.say({ type: 'match:start', seed: null });

    for (const client of [host, guest, watcher]) {
      const match = client.last('match:state')?.match;
      expect(match?.phase).toBe('running');
      expect(match?.players).toHaveLength(2);
    }
  });
});

describe('playing', () => {
  it('resolves a shot and tells everyone what happened', () => {
    const { host, guest } = lobbyOfTwo();
    host.say({ type: 'match:start', seed: null });

    const match = host.last('match:state')?.match;
    const active = match?.turn?.playerId;
    const shooter = [host, guest].find((c) => c.last('welcome')?.playerId === active);
    expect(shooter).toBeDefined();

    shooter?.forget();
    guest.forget();
    host.forget();
    shooter?.say({
      type: 'shot:fire',
      shot: { source: 'x/4', axis: 'x', direction: 'increasing' },
    });

    for (const client of [host, guest]) {
      const batch = client.last('match:events');
      expect(batch?.seq).toBe(1);
      expect(batch?.events.map((e) => e.kind)).toContain('shot-resolved');
    }
  });

  it('refuses a shot from the player whose turn it is not, without costing a turn', () => {
    const { host, guest } = lobbyOfTwo();
    host.say({ type: 'match:start', seed: null });

    const active = host.last('match:state')?.match.turn?.playerId;
    const idle = [host, guest].find((c) => c.last('welcome')?.playerId !== active);

    idle?.say({ type: 'shot:fire', shot: { source: 'x', axis: 'x', direction: 'increasing' } });
    const events = idle?.last('match:events')?.events ?? [];
    expect(events.some((e) => e.kind === 'command-rejected')).toBe(true);
  });

  it('answers a validation request without touching the match', () => {
    const { host } = lobbyOfTwo();
    host.say({ type: 'match:start', seed: null });
    const before = host.last('match:state')?.match;

    host.say({
      type: 'shot:validate',
      source: '{ 0 si x < 5 ; 9 sinon }',
      axis: 'x',
      direction: 'increasing',
    });
    const answer = host.last('shot:validation');
    expect(answer?.ok).toBe(false);
    expect(answer?.error?.code).toBe('ERR_DISCONTINUITY');

    host.say({ type: 'shot:validate', source: 'x^2/40', axis: 'x', direction: 'increasing' });
    expect(host.last('shot:validation')?.ok).toBe(true);
    expect(host.last('match:state')?.match).toEqual(before);
  });

  it('passes a turn when the clock runs out', () => {
    const clock = new TestClock();
    const { game, host } = lobbyOfTwo(clock);
    host.say({ type: 'match:start', seed: null });
    const deadline = host.last('match:state')?.match.turn?.deadlineAt ?? 0;

    game.tick();
    expect(host.all('match:events')).toHaveLength(0);

    clock.set(deadline);
    game.tick();
    const events = host.last('match:events')?.events ?? [];
    expect(events.some((e) => e.kind === 'shot-resolved')).toBe(true);
    expect(events.some((e) => e.kind === 'turn-started')).toBe(true);
  });
});

describe('losing and regaining a connection', () => {
  it('keeps the seat and returns a full snapshot', () => {
    const { game, host, guest } = lobbyOfTwo();
    host.say({ type: 'match:start', seed: null });
    const token = guest.last('welcome')?.token;
    const playerId = guest.last('welcome')?.playerId;

    guest.drop();
    expect(lobbyOf(host).members.find((m) => m.playerId === playerId)?.connected).toBe(false);

    const returning = new Client(game);
    returning.hello('Bob', token);

    expect(returning.last('welcome')?.playerId).toBe(playerId);
    expect(returning.last('match:state')?.match.phase).toBe('running');
    expect(lobbyOf(returning).members.find((m) => m.playerId === playerId)?.connected).toBe(true);
  });

  it('gives the seat up once the grace period is over', () => {
    const clock = new TestClock();
    const { game, host, guest } = lobbyOfTwo(clock);
    const playerId = guest.last('welcome')?.playerId;

    guest.drop();
    clock.advance(RECONNECT_GRACE_MS + 1);
    game.tick();

    expect(lobbyOf(host).members.map((m) => m.playerId)).not.toContain(playerId);
  });

  it('turns away a token nobody issued', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne', 'un-token-inventé');
    expect(client.last('error')?.error.code).toBe('ERR_UNAUTHORIZED');
  });
});

describe('bots', () => {
  it('seats one, ready, named after its level', () => {
    const { game } = serverWith();
    const host = new Client(game);
    host.hello('Anne');
    host.say({ type: 'lobby:create', config: null });

    host.say({ type: 'lobby:add-bot', level: 'confirme' });
    const seated = lobbyOf(host).members.filter((member) => member.isBot);

    expect(seated).toHaveLength(1);
    expect(seated[0]?.name).toBe('Confirmé');
    expect(seated[0]?.botLevel).toBe('confirme');
    // Nothing would ever tick its box, so it sits down ready.
    expect(seated[0]?.ready).toBe(true);
  });

  it('lets only the host add one', () => {
    const { guest } = lobbyOfTwo();
    guest.say({ type: 'lobby:add-bot', level: 'debutant' });
    expect(guest.last('error')?.error.code).toBe('ERR_UNAUTHORIZED');
    expect(lobbyOf(guest).members.filter((member) => member.isBot)).toHaveLength(0);
  });

  it('is removed like anyone else', () => {
    const { game } = serverWith();
    const host = new Client(game);
    host.hello('Anne');
    host.say({ type: 'lobby:create', config: null });
    host.say({ type: 'lobby:add-bot', level: 'debutant' });

    const botId = lobbyOf(host).members.find((member) => member.isBot)?.playerId;
    expect(botId).toBeDefined();
    if (botId === undefined) return;

    host.say({ type: 'lobby:remove-player', playerId: botId });
    expect(lobbyOf(host).members.filter((member) => member.isBot)).toHaveLength(0);
  });

  it('plays its own turn, without anyone asking', () => {
    // The whole point: a human plus a bot is a playable match. The bot fires as
    // soon as the turn reaches it, so control comes back to the human.
    const { game } = serverWith();
    const host = new Client(game);
    host.hello('Anne');
    host.say({
      type: 'lobby:create',
      config: { ...DEFAULT_MATCH_CONFIG, rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0 } },
    });
    host.say({ type: 'lobby:add-bot', level: 'confirme' });
    host.say({ type: 'lobby:ready', ready: true });
    host.say({ type: 'match:start', seed: 'avec-un-bot' });

    const opening = host.last('match:state')?.match;
    expect(opening?.phase).toBe('running');
    if (opening?.turn == null) return;

    const humanId = host.last('welcome')?.playerId;
    if (opening.turn.playerId !== humanId) {
      // The bot opened: it has already fired and handed the turn back.
      expect(opening.history.length).toBeGreaterThan(0);
      expect(opening.turn.playerId).toBe(humanId);
      return;
    }

    // The human passes; the bot must take its turn before control returns.
    host.say({ type: 'turn:pass' });
    const events = host.all('match:events').flatMap((message) => message.events);
    const shots = events.filter((event) => event.kind === 'shot-resolved');
    expect(shots.length).toBeGreaterThanOrEqual(1);
    expect(shots.some((event) => event.record.playerId !== humanId)).toBe(true);
  });
});

describe('replays', () => {
  it('hands everyone the finished match as a document', () => {
    const { game } = serverWith();
    const host = new Client(game);
    host.hello('Anne');
    host.say({
      type: 'lobby:create',
      config: { ...DEFAULT_MATCH_CONFIG, rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0 } },
    });
    host.say({ type: 'lobby:add-bot', level: 'redoutable' });
    host.say({ type: 'lobby:ready', ready: true });
    host.say({ type: 'match:start', seed: 'rejeu' });

    // Play until someone wins or the patience runs out; the bot fires by itself.
    for (let turn = 0; turn < 80 && host.last('match:replay') === undefined; turn += 1) {
      host.say({ type: 'turn:pass' });
    }

    const document = host.last('match:replay')?.replay;
    expect(document, 'the match must have ended within 80 turns').toBeDefined();
    if (document === undefined) return;

    expect(document.format).toBe('functionwars-replay');
    expect(document.outcome).not.toBeNull();
    expect(document.turns.length).toBeGreaterThan(0);
    // What was done, not what was drawn: a few kilobytes, not hundreds.
    expect(JSON.stringify(document).length).toBeLessThan(60_000);
  });

  it('reads one back and answers with the rebuilt match', () => {
    const { game } = serverWith();
    const host = new Client(game);
    host.hello('Anne');
    host.say({
      type: 'lobby:create',
      config: { ...DEFAULT_MATCH_CONFIG, rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0 } },
    });
    host.say({ type: 'lobby:add-bot', level: 'confirme' });
    host.say({ type: 'lobby:ready', ready: true });
    host.say({ type: 'match:start', seed: 'relecture' });
    for (let turn = 0; turn < 80 && host.last('match:replay') === undefined; turn += 1) {
      host.say({ type: 'turn:pass' });
    }
    const document = host.last('match:replay')?.replay;
    if (document === undefined) return;

    const watcher = new Client(game);
    watcher.hello('Curieux');
    watcher.say({ type: 'replay:load', replay: document });

    const rebuilt = watcher.last('replay:state')?.match;
    expect(rebuilt).toBeDefined();
    expect(rebuilt?.history).toHaveLength(document.turns.length);
    expect(rebuilt?.outcome).toEqual(document.outcome);
    // Every trace is there, which is what lets the client walk it with no engine.
    expect(rebuilt?.history.filter((record) => record.trace !== null).length).toBeGreaterThan(0);
  });

  it('refuses a document from somewhere else, in French', () => {
    const { game } = serverWith();
    const client = new Client(game);
    client.hello('Anne');
    // Shaped like a replay but with a turn nobody could have played.
    client.say({ type: 'replay:load', replay: { format: 'functionwars-replay' } as never });
    expect(client.last('error')?.error.code).toBe('ERR_BAD_MESSAGE');
  });
});
