import { describe, expect, it } from 'vitest';
import type { MatchState, TurnRecord } from '@fw/contracts';
import { narrateTurn, stateAt } from './replayView.js';

const record = (
  over: Partial<TurnRecord> & Pick<TurnRecord, 'index' | 'playerId'>,
): TurnRecord => ({
  shot: { source: 'x^2/40', axis: 'x', direction: 'increasing' },
  trace: null,
  skipped: null,
  eliminated: [],
  atMs: 1000,
  ...over,
});

/** Three seats, and two of them fall, on turns 1 and 3. */
function match(): MatchState {
  const player = (id: string) => ({
    id: id as MatchState['players'][number]['id'],
    name: id.toUpperCase(),
    teamId: null,
    origin: { x: 0, y: 0 },
    radius: 1.5,
    alive: id === 'anne',
    shieldTurnsLeft: 0,
    connected: true,
    isBot: false,
  });

  return {
    id: 'm' as MatchState['id'],
    seed: 's' as MatchState['seed'],
    phase: 'ended',
    config: {} as MatchState['config'],
    map: {} as MatchState['map'],
    players: [player('anne'), player('bob'), player('cleo')],
    order: ['anne', 'bob', 'cleo'] as MatchState['order'],
    turn: null,
    history: [
      record({ index: 0, playerId: 'anne' as MatchState['order'][number] }),
      record({
        index: 1,
        playerId: 'anne' as MatchState['order'][number],
        eliminated: ['bob'] as MatchState['order'],
      }),
      record({
        index: 2,
        playerId: 'cleo' as MatchState['order'][number],
        skipped: 'passed',
        shot: null,
      }),
      record({
        index: 3,
        playerId: 'anne' as MatchState['order'][number],
        eliminated: ['cleo'] as MatchState['order'],
      }),
    ],
    outcome: { kind: 'solo', winnerId: 'anne' as MatchState['order'][number] },
  };
}

describe('walking a replay', () => {
  it('shows everyone standing at the start', () => {
    const opening = stateAt(match(), 0);
    expect(opening.players.every((player) => player.alive)).toBe(true);
    expect(opening.history).toHaveLength(0);
    expect(opening.outcome).toBeNull();
    expect(opening.phase).toBe('running');
  });

  it('drops a player exactly on the turn they fell', () => {
    const before = stateAt(match(), 1);
    expect(before.players.find((player) => player.id === 'bob')?.alive).toBe(true);

    const after = stateAt(match(), 2);
    expect(after.players.find((player) => player.id === 'bob')?.alive).toBe(false);
    expect(after.players.find((player) => player.id === 'cleo')?.alive).toBe(true);
  });

  it('gives back the finished match at the end', () => {
    const end = stateAt(match(), 4);
    expect(end.phase).toBe('ended');
    expect(end.outcome).toEqual({ kind: 'solo', winnerId: 'anne' });
    expect(end.players.filter((player) => player.alive)).toHaveLength(1);
  });

  it('clamps a cursor that runs off either end', () => {
    expect(stateAt(match(), -5).history).toHaveLength(0);
    expect(stateAt(match(), 99).history).toHaveLength(4);
  });

  it('names whose turn it is about to be', () => {
    expect(stateAt(match(), 2).turn?.playerId).toBe('cleo');
    expect(stateAt(match(), 4).turn).toBeNull();
  });
});

describe('narrating a turn', () => {
  it('writes the function the way the player wrote it', () => {
    expect(narrateTurn(match(), 0)).toBe('ANNE : y = x^2/40');
  });

  it('says who was eliminated', () => {
    expect(narrateTurn(match(), 1)).toBe('ANNE : y = x^2/40 — élimine BOB');
  });

  it('says why a turn produced nothing', () => {
    expect(narrateTurn(match(), 2)).toBe('CLEO — passe');
  });

  it('says nothing about a turn that does not exist', () => {
    expect(narrateTurn(match(), 99)).toBe('');
  });
});
