import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MatchStateSchema, type MatchCommand, type MatchState } from '@fw/contracts';
import { apply, createMatch } from './engine.js';
import { deps, duellists, noShield, setup } from './testing.js';

/** Sources a player might plausibly type, valid and invalid mixed on purpose. */
const SOURCES = [
  '0*x',
  'x',
  '-x',
  'x^2/40',
  '5*sin(x/3)',
  'ln(x+40)',
  'ln(x)', // refused: no value at the shooter
  '{ 0 si x < 5 ; 9 sinon }', // refused: discontinuous
  '2 +* 3', // refused: syntax
  'tan(x/8)',
];

const arbitraryCommand = (state: MatchState): fc.Arbitrary<MatchCommand> => {
  const ids = state.players.map((player) => player.id);
  return fc.oneof(
    fc.record({
      kind: fc.constant('fire' as const),
      playerId: fc.constantFrom(...ids),
      shot: fc.record({
        source: fc.constantFrom(...SOURCES),
        axis: fc.constantFrom('x' as const, 'y' as const),
        direction: fc.constantFrom('increasing' as const, 'decreasing' as const),
      }),
    }),
    fc.record({ kind: fc.constant('pass' as const), playerId: fc.constantFrom(...ids) }),
    fc.record({ kind: fc.constant('disconnect' as const), playerId: fc.constantFrom(...ids) }),
    fc.record({ kind: fc.constant('reconnect' as const), playerId: fc.constantFrom(...ids) }),
  );
};

function fresh(seed: string): MatchState {
  const result = createMatch(setup({ players: duellists(), seed, config: noShield() }), deps());
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('invariants of a match under any sequence of commands', () => {
  it('never brings anyone back, never lets a dead player act, never breaks its own schema', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 40 }),
        (seed, picks) => {
          let state = fresh(seed);
          let living = state.players.filter((p) => p.alive).length;

          picks.forEach((pick, step) => {
            const command = fc.sample(arbitraryCommand(state), {
              numRuns: 1,
              seed: pick + step,
            })[0];
            if (command === undefined) return;

            const before = state;
            const { state: after } = apply(state, command, deps(), step * 1000);

            const nowLiving = after.players.filter((p) => p.alive).length;
            expect(nowLiving).toBeLessThanOrEqual(living);
            living = nowLiving;

            // The active player is always someone still in the game.
            if (after.turn !== null) {
              const active = after.players.find((p) => p.id === after.turn?.playerId);
              expect(active?.alive).toBe(true);
            }

            // An ended match never moves again — though a player may still
            // connect or drop, which changes nothing about the game itself.
            if (before.phase === 'ended') {
              expect(after.phase).toBe('ended');
              expect(after.turn).toBeNull();
              expect(after.outcome).toEqual(before.outcome);
              expect(after.history).toEqual(before.history);
              expect(after.players.map((p) => p.alive)).toEqual(before.players.map((p) => p.alive));
            }

            // The history only ever grows, and by at most one entry per command.
            expect(after.history.length).toBeGreaterThanOrEqual(before.history.length);
            expect(after.history.length).toBeLessThanOrEqual(before.history.length + 1);

            expect(MatchStateSchema.safeParse(after).success).toBe(true);
            state = after;
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it('never mutates the state it was handed', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
        const state = fresh(seed);
        const snapshot = structuredClone(state);
        apply(
          state,
          {
            kind: 'fire',
            playerId: state.turn!.playerId,
            shot: { source: 'x', axis: 'x', direction: 'increasing' },
          },
          deps(),
          1000,
        );
        expect(state).toEqual(snapshot);
      }),
      { numRuns: 40 },
    );
  });

  it('replays identically from the same seed and the same commands', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.array(fc.constantFrom(...SOURCES), { minLength: 1, maxLength: 12 }),
        (seed, sources) => {
          const play = (): MatchState => {
            let state = fresh(seed);
            sources.forEach((source, step) => {
              if (state.turn === null) return;
              state = apply(
                state,
                {
                  kind: 'fire',
                  playerId: state.turn.playerId,
                  shot: {
                    source,
                    axis: 'x',
                    direction: step % 2 === 0 ? 'increasing' : 'decreasing',
                  },
                },
                deps(),
                step * 1000,
              ).state;
            });
            return state;
          };

          expect(play()).toEqual(play());
        },
      ),
      { numRuns: 40 },
    );
  });
});
