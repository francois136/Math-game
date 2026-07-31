import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  MatchIdSchema,
  PlayerIdSchema,
  SeedSchema,
  type MatchState,
  type ServerMessage,
} from '@fw/contracts';
import { initialState, reduce, type AppState } from './state.js';

function matchState(): MatchState {
  const anne = PlayerIdSchema.parse('anne');
  const bob = PlayerIdSchema.parse('bob');
  return {
    id: MatchIdSchema.parse('m'),
    seed: SeedSchema.parse('s'),
    phase: 'running',
    config: DEFAULT_MATCH_CONFIG,
    map: {
      name: 'test',
      bounds: DEFAULT_MATCH_CONFIG.map.bounds,
      obstacles: [],
      spawns: [
        { index: 0, position: { x: -20, y: 0 } },
        { index: 1, position: { x: 20, y: 0 } },
      ],
      seed: null,
      generatorVersion: 0,
    },
    players: [
      {
        id: anne,
        name: 'Anne',
        teamId: null,
        origin: { x: -20, y: 0 },
        radius: 1.5,
        alive: true,
        shieldTurnsLeft: 2,
        connected: true,
        isBot: false,
      },
      {
        id: bob,
        name: 'Bob',
        teamId: null,
        origin: { x: 20, y: 0 },
        radius: 1.5,
        alive: true,
        shieldTurnsLeft: 2,
        connected: true,
        isBot: false,
      },
    ],
    order: [anne, bob],
    turn: { index: 0, playerId: anne, deadlineAt: 60_000 },
    history: [],
    outcome: null,
  };
}

const feed = (state: AppState, ...messages: ServerMessage[]): AppState =>
  messages.reduce((current, message) => reduce(current, { kind: 'server', message }), state);

describe('what the client believes', () => {
  it('knows nothing before the server speaks', () => {
    expect(initialState.match).toBeNull();
    expect(initialState.playerId).toBeNull();
  });

  it('takes its identity from the welcome', () => {
    const state = feed(initialState, {
      type: 'welcome',
      protocolVersion: 1,
      playerId: PlayerIdSchema.parse('anne'),
      token: 'x'.repeat(16) as never,
    });
    expect(state.status).toBe('identified');
    expect(state.playerId).toBe('anne');
  });

  it('follows the turn without deciding it', () => {
    const match = matchState();
    const state = feed(
      initialState,
      { type: 'match:state', match },
      {
        type: 'match:events',
        matchId: match.id,
        seq: 1,
        events: [
          {
            kind: 'turn-started',
            turn: { index: 1, playerId: match.order[1]!, deadlineAt: 120_000 },
          },
        ],
      },
    );
    expect(state.match?.turn?.playerId).toBe('bob');
  });

  it('marks a player dead only when told', () => {
    const match = matchState();
    const state = feed(
      initialState,
      { type: 'match:state', match },
      {
        type: 'match:events',
        matchId: match.id,
        seq: 1,
        events: [
          { kind: 'player-eliminated', playerId: match.order[1]!, byPlayerId: match.order[0]! },
        ],
      },
    );
    expect(state.match?.players.find((p) => p.id === 'bob')?.alive).toBe(false);
    expect(state.log.at(-1)).toContain('Bob');
  });

  it('ends the match when the server says so, and not before', () => {
    const match = matchState();
    const state = feed(
      initialState,
      { type: 'match:state', match },
      {
        type: 'match:events',
        matchId: match.id,
        seq: 1,
        events: [{ kind: 'match-ended', outcome: { kind: 'solo', winnerId: match.order[0]! } }],
      },
    );
    expect(state.match?.phase).toBe('ended');
    expect(state.match?.turn).toBeNull();
    expect(state.log.at(-1)).toContain('Anne gagne');
  });

  it('shows a rejection as narration, not as a state change', () => {
    const match = matchState();
    const state = feed(
      initialState,
      { type: 'match:state', match },
      {
        type: 'match:events',
        matchId: match.id,
        seq: 1,
        events: [
          {
            kind: 'command-rejected',
            error: {
              code: 'ERR_DISCONTINUITY',
              params: {},
              message: 'La fonction est discontinue.',
            },
          },
        ],
      },
    );
    expect(state.match?.turn).toEqual(match.turn);
    expect(state.log.at(-1)).toContain('discontinue');
  });

  it('ignores events for a match it has never seen', () => {
    const state = feed(initialState, {
      type: 'match:events',
      matchId: MatchIdSchema.parse('inconnu'),
      seq: 1,
      events: [{ kind: 'match-ended', outcome: { kind: 'draw' } }],
    });
    expect(state.match).toBeNull();
  });
});
