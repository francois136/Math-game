import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ReplaySchema, type MatchState } from '@fw/contracts';
import { apply, createMatch } from './engine.js';
import { replay, replayFrames, toReplay } from './replay.js';
import { deps, duellists, noShield, setup } from './testing.js';

const SOURCES = ['x/3', '-x/2', 'x^2/40', '3*sin(x/4)', '0*x', 'sqrt(abs(x))'] as const;

/** A match played to a script, so the test knows exactly what happened. */
function played(seed: string, sources: readonly string[]): MatchState {
  const created = createMatch(
    setup({ players: duellists(), map: null, seed, config: noShield() }),
    deps(),
  );
  if (!created.ok) throw new Error(created.error.message);

  let state = created.value;
  sources.forEach((source, step) => {
    if (state.turn === null) return;
    state = apply(
      state,
      {
        kind: 'fire',
        playerId: state.turn.playerId,
        shot: { source, axis: 'x', direction: step % 2 === 0 ? 'increasing' : 'decreasing' },
      },
      deps(),
      (step + 1) * 1000,
    ).state;
  });
  return state;
}

describe('a replay', () => {
  it('replays to the very same match', () => {
    // The only property that makes a replay worth keeping. Not "the same
    // winner", not "roughly the same": equal, field for field, including the
    // traces — which are recomputed, not stored.
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.array(fc.constantFrom(...SOURCES), { minLength: 1, maxLength: 10 }),
        (seed, sources) => {
          const original = played(seed, sources);
          const restored = replay(toReplay(original), deps());

          expect(restored.ok).toBe(true);
          if (!restored.ok) return;
          expect(restored.value).toEqual(original);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('is small, because it stores what was done and not what was drawn', () => {
    const original = played('taille', [...SOURCES, ...SOURCES, ...SOURCES]);
    const asDocument = JSON.stringify(toReplay(original)).length;
    const asState = JSON.stringify(original).length;

    // Measured at about 68x on a thirty-turn duel; ten is a floor that will not
    // start failing on a quiet day (ADR 0018).
    expect(asDocument * 10).toBeLessThan(asState);
  });

  it('is a document its own schema accepts', () => {
    expect(ReplaySchema.safeParse(toReplay(played('schema', [...SOURCES]))).success).toBe(true);
  });

  it('stops where it is told to', () => {
    const original = played('partiel', [...SOURCES]);
    const document = toReplay(original);

    const half = replay(document, deps(), { upToTurn: 3 });
    expect(half.ok).toBe(true);
    if (!half.ok) return;
    expect(half.value.history).toHaveLength(3);
    expect(half.value.phase).toBe('running');
  });

  it('gives one frame per turn, plus the opening position', () => {
    const document = toReplay(played('images', [...SOURCES]));
    const frames = replayFrames(document, deps());

    expect(frames.ok).toBe(true);
    if (!frames.ok) return;
    expect(frames.value).toHaveLength(document.turns.length + 1);
    expect(frames.value[0]?.history).toHaveLength(0);
    expect(frames.value.at(-1)?.history).toHaveLength(document.turns.length);
  });

  it('refuses a document that is not one', () => {
    for (const rubbish of [null, 42, {}, { format: 'autre-chose' }, '{"format":"x"}']) {
      const result = replay(rubbish, deps());
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('ERR_BAD_REPLAY');
      expect(result.error.message).toContain('rejeu');
    }
  });

  it('says so rather than diverge when a turn no longer stands', () => {
    // A replay from another build, whose shots this engine refuses. Returning
    // a match that quietly went somewhere else would be the worst answer.
    const document = toReplay(played('divergent', [...SOURCES]));
    const at = document.turns.findIndex((turn) => turn.shot !== null);
    expect(at, 'the scripted match must contain at least one shot').toBeGreaterThanOrEqual(0);

    const tampered = {
      ...document,
      turns: document.turns.map((turn, index) =>
        index === at && turn.shot !== null
          ? { ...turn, shot: { ...turn.shot, source: '{ 0 si x < 5 ; 9 sinon }' } }
          : turn,
      ),
    };

    const result = replay(tampered, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ERR_BAD_REPLAY');
    expect(result.error.message).toContain(`tour ${String(at)}`);
  });

  it('survives its own JSON round trip', () => {
    const original = played('json', [...SOURCES]);
    const restored = replay(JSON.parse(JSON.stringify(toReplay(original))), deps());

    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value).toEqual(original);
  });
});
