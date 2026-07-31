import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_CONFIG, type MatchCommand, type MatchState } from '@fw/contracts';
import { apply } from './engine.js';
import { deps, playerId, stateWith } from './testing.js';

/**
 * Everyone fires at once.
 *
 * `stateWith` seats its players along `y = 0`, so a flat shot from one reaches
 * whoever is next along that line — which is what makes crossing shots easy to
 * write here and impossible to arrange by accident.
 */
function together(
  players: Parameters<typeof stateWith>[0],
  rules: Partial<MatchState['config']['rules']> = {},
): MatchState {
  const base = stateWith(players);
  return {
    ...base,
    config: {
      ...base.config,
      rules: {
        ...DEFAULT_MATCH_CONFIG.rules,
        shieldTurns: 0,
        simultaneousResolution: true,
        ...rules,
      },
    },
    turn: { index: 0, playerId: null, deadlineAt: DEFAULT_MATCH_CONFIG.rules.turnDurationMs },
    pending: [],
  };
}

const fire = (id: string, direction: 'increasing' | 'decreasing'): MatchCommand => ({
  kind: 'fire',
  playerId: playerId(id),
  shot: { source: '0*x', axis: 'x', direction },
});

describe('a round where everyone fires at once', () => {
  it('belongs to nobody in particular', () => {
    // The field that would lie if it named someone (ADR 0019).
    expect(
      together([
        { id: 'anne', x: -20 },
        { id: 'bob', x: 20 },
      ]).turn?.playerId,
    ).toBeNull();
  });

  it('holds a shot until everyone has answered', () => {
    const state = together([
      { id: 'anne', x: -20 },
      { id: 'bob', x: 20 },
    ]);

    const first = apply(state, fire('anne', 'increasing'), deps(), 1000);
    expect(first.state.pending).toHaveLength(1);
    expect(first.state.history).toHaveLength(0);
    // Everyone is told someone answered — not what they wrote.
    expect(first.events).toEqual([{ kind: 'shot-submitted', playerId: playerId('anne') }]);

    const second = apply(first.state, fire('bob', 'decreasing'), deps(), 1000);
    expect(second.state.pending).toHaveLength(0);
    expect(second.state.history).toHaveLength(2);
  });

  it('kills both players when they hit each other', () => {
    // The decision the whole mode rests on: the two curves are traced against
    // the same position, so neither shooter is dead when the other fires.
    const state = together([
      { id: 'anne', x: -20 },
      { id: 'bob', x: 20 },
    ]);

    const after = apply(
      apply(state, fire('anne', 'increasing'), deps(), 1000).state,
      fire('bob', 'decreasing'),
      deps(),
      1000,
    );

    expect(after.state.players.filter((player) => player.alive)).toHaveLength(0);
    expect(after.state.phase).toBe('ended');
    expect(after.state.outcome).toEqual({ kind: 'draw' });
    expect(after.events.filter((event) => event.kind === 'player-eliminated')).toHaveLength(2);
  });

  it('gives the same result whichever order the shots arrived in', () => {
    // Independence from order is the property; a double KO is only its most
    // visible consequence.
    const state = together([
      { id: 'anne', x: -30 },
      { id: 'bob', x: 0 },
      { id: 'cleo', x: 30 },
    ]);

    const play = (commands: readonly MatchCommand[]): MatchState =>
      commands.reduce((at, command) => apply(at, command, deps(), 1000).state, state);

    const oneWay = play([
      fire('anne', 'increasing'),
      fire('bob', 'increasing'),
      fire('cleo', 'decreasing'),
    ]);
    const otherWay = play([
      fire('cleo', 'decreasing'),
      fire('anne', 'increasing'),
      fire('bob', 'increasing'),
    ]);

    expect(otherWay.players).toEqual(oneWay.players);
    expect(otherWay.outcome).toEqual(oneWay.outcome);
    // The log reads in seat order both times, which is a writing order and not
    // a resolution order.
    expect(otherWay.history.map((record) => record.playerId)).toEqual(
      oneWay.history.map((record) => record.playerId),
    );
  });

  it('counts a hit on someone another shot killed this round', () => {
    const state = together([
      { id: 'anne', x: -30 },
      { id: 'bob', x: 0 },
      { id: 'cleo', x: 30 },
    ]);

    const after = [
      fire('anne', 'increasing'),
      fire('cleo', 'decreasing'),
      fire('bob', 'increasing'),
    ].reduce((at, command) => apply(at, command, deps(), 1000).state, state);

    // Anne and Cléo both aimed at Bob and both connected: the shots left at the
    // same instant, so both are recorded as having eliminated him.
    const killedBob = after.history.filter((record) => record.eliminated.includes(playerId('bob')));
    expect(killedBob).toHaveLength(2);
    expect(after.players.find((player) => player.id === playerId('bob'))?.alive).toBe(false);
  });

  it('refuses a second shot from the same player in one round', () => {
    const state = together([
      { id: 'anne', x: -20 },
      { id: 'bob', x: 20 },
    ]);
    const once = apply(state, fire('anne', 'increasing'), deps(), 1000);
    const twice = apply(once.state, fire('anne', 'decreasing'), deps(), 1000);

    expect(twice.state).toBe(once.state);
    expect(twice.events[0]).toMatchObject({ kind: 'command-rejected' });
  });

  it('refuses a function the engine would not accept, without taking the round', () => {
    const state = together([
      { id: 'anne', x: -20 },
      { id: 'bob', x: 20 },
    ]);
    const refused = apply(
      state,
      {
        kind: 'fire',
        playerId: playerId('anne'),
        shot: { source: '{ 0 si x < 5 ; 9 sinon }', axis: 'x', direction: 'increasing' },
      },
      deps(),
      1000,
    );

    expect(refused.state).toBe(state);
    expect(refused.state.pending).toHaveLength(0);
    expect(refused.events[0]).toMatchObject({ kind: 'command-rejected' });
  });

  it('treats a pass as an answer, so the round does not wait for it twice', () => {
    const state = together([
      { id: 'anne', x: -20 },
      { id: 'bob', x: 20 },
    ]);
    const passed = apply(state, { kind: 'pass', playerId: playerId('anne') }, deps(), 1000);
    expect(passed.state.pending).toHaveLength(1);
    expect(passed.state.history).toHaveLength(0);

    const resolved = apply(passed.state, fire('bob', 'decreasing'), deps(), 1000);
    const anne = resolved.state.history.find((r) => r.playerId === playerId('anne'));
    expect(anne?.skipped).toBe('passed');
    expect(anne?.shot).toBeNull();
  });

  it('resolves at the deadline, counting the silent as timed out', () => {
    const state = together([
      { id: 'anne', x: -20 },
      { id: 'bob', x: 20 },
    ]);
    const submitted = apply(state, fire('anne', 'increasing'), deps(), 1000);

    const deadline = state.turn?.deadlineAt ?? 0;
    const resolved = apply(submitted.state, { kind: 'timeout', atMs: deadline }, deps(), deadline);

    expect(resolved.state.history).toHaveLength(2);
    expect(resolved.state.history.find((r) => r.playerId === playerId('bob'))?.skipped).toBe(
      'timeout',
    );
    expect(resolved.state.pending).toHaveLength(0);
  });

  it('opens the next round for everyone once one resolves', () => {
    const state = together([
      { id: 'anne', x: -30 },
      { id: 'bob', x: 0 },
      { id: 'cleo', x: 30 },
    ]);
    const after = [
      { kind: 'pass' as const, playerId: playerId('anne') },
      { kind: 'pass' as const, playerId: playerId('bob') },
      { kind: 'pass' as const, playerId: playerId('cleo') },
    ].reduce((at, command) => apply(at, command, deps(), 1000).state, state);

    expect(after.turn?.index).toBe(1);
    expect(after.turn?.playerId).toBeNull();
    expect(after.pending).toHaveLength(0);
    expect(after.history).toHaveLength(3);
  });

  it('does not wait for a player who has disconnected', () => {
    const state = together([
      { id: 'anne', x: -30 },
      { id: 'bob', x: 0 },
      { id: 'cleo', x: 30 },
    ]);
    const dropped = apply(state, { kind: 'disconnect', playerId: playerId('cleo') }, deps(), 1000);

    const after = [
      fire('anne', 'increasing'),
      { kind: 'pass' as const, playerId: playerId('bob') },
    ].reduce((at, command) => apply(at, command, deps(), 1000).state, dropped.state);

    expect(after.history).toHaveLength(3);
    expect(after.history.find((r) => r.playerId === playerId('cleo'))?.skipped).toBe('timeout');
  });
});
