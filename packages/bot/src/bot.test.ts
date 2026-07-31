import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_MATCH_CONFIG,
  SeedSchema,
  createRng,
  type BotLevel,
  type MatchState,
} from '@fw/contracts';
import { apply } from '@fw/rules';
import { chooseShot } from './bot.js';
import { FAMILIES, sourceFor, towards } from './candidates.js';
import { deps, matchOf, playerId } from './testing.js';

const LEVELS: readonly BotLevel[] = ['debutant', 'confirme', 'redoutable'];

/** Play one bot turn. Returns the state afterwards and whether the shot stood. */
function botTurn(state: MatchState, level: BotLevel): { next: MatchState; accepted: boolean } {
  const active = state.turn?.playerId;
  if (active === undefined) return { next: state, accepted: false };
  const shot = chooseShot(state, active, level, deps());
  const result = apply(state, { kind: 'fire', playerId: active, shot }, deps(), 1000);
  return { next: result.state, accepted: result.state !== state };
}

describe('what a bot fires', () => {
  it('is a function the rules accept, every time', () => {
    // The one thing a bot must never do: waste its turn on a function the
    // engine refuses. It goes through the same parser and the same continuity
    // check a player does, so this is a property, not a hope.
    for (const level of LEVELS) {
      for (let i = 0; i < 8; i += 1) {
        const state = matchOf(`accepte-${String(i)}`);
        expect(state, `seed ${String(i)}`).not.toBeNull();
        if (state === null) continue;
        const { accepted } = botTurn(state, level);
        expect(accepted, `${level}, seed ${String(i)}`).toBe(true);
      }
    }
  });

  it('is the same shot for the same match, twice', () => {
    // Determinism is what makes a replay of a match with bots reproduce
    // (ADR 0004): the draw comes from the seed and the turn index, nothing else.
    const state = matchOf('determinisme');
    expect(state).not.toBeNull();
    if (state === null) return;
    const active = state.turn!.playerId;

    for (const level of LEVELS) {
      expect(chooseShot(state, active, level, deps())).toEqual(
        chooseShot(state, active, level, deps()),
      );
    }
  });

  it('changes from one turn to the next', () => {
    // A bot that submitted the same function every turn would be a bot that
    // never finds anything. Same match, different turn index, different draw.
    const state = matchOf('tours');
    expect(state).not.toBeNull();
    if (state === null) return;

    const first = chooseShot(state, state.turn!.playerId, 'confirme', deps());
    const later: MatchState = { ...state, turn: { ...state.turn!, index: 5 } };
    const second = chooseShot(later, later.turn!.playerId, 'confirme', deps());
    expect(second).not.toEqual(first);
  });

  it('fires something rather than nothing when there is no one left to hit', () => {
    const state = matchOf('seul');
    expect(state).not.toBeNull();
    if (state === null) return;
    const active = state.turn!.playerId;
    const alone: MatchState = {
      ...state,
      players: state.players.map((p) => (p.id === active ? p : { ...p, alive: false })),
    };
    expect(chooseShot(alone, active, 'redoutable', deps()).source).not.toHaveLength(0);
  });

  it('says nothing about a seat that is not playing', () => {
    const state = matchOf('absent');
    expect(state).not.toBeNull();
    if (state === null) return;
    // An id nobody holds: no throw, no undefined, a shot.
    const shot = chooseShot(state, playerId('fantome'), 'confirme', deps());
    expect(shot.source).not.toHaveLength(0);
  });
});

describe('the levels are levels', () => {
  /**
   * The claim a difficulty setting has to earn: trying harder wins sooner.
   *
   * Measured over twelve duels on a moderate field, shields off. The gap is
   * wide — a beginner takes some fifty turns, a redoutable seven — so twelve
   * matches are enough to see it without making this a slow test. The full
   * campaign is BA-3.
   */
  it('kills sooner the harder the bot tries', () => {
    const turnsToWin = (level: BotLevel): number => {
      let total = 0;
      let counted = 0;
      for (let i = 0; i < 12; i += 1) {
        let state = matchOf(`niveau-${String(i)}`, 2, {
          map: { ...DEFAULT_MATCH_CONFIG.map, difficulty: 'moderee' },
        });
        if (state === null) continue;
        let turn = 0;
        for (; turn < 60 && state.phase === 'running'; turn += 1) {
          const { next, accepted } = botTurn(state, level);
          state = accepted
            ? next
            : apply(state, { kind: 'pass', playerId: state.turn!.playerId }, deps(), 1000).state;
        }
        total += turn;
        counted += 1;
      }
      return counted === 0 ? Infinity : total / counted;
    };

    const beginner = turnsToWin('debutant');
    const strong = turnsToWin('redoutable');
    expect(strong).toBeLessThan(beginner);
  });

  it('never wins on the opening turn under the default rules', () => {
    // With the opening shield on — which is the default — nobody can be
    // eliminated for two turns, bot or not. This pins the rule down against
    // the strongest bot rather than trusting it: measured without a shield,
    // `redoutable` finds a winning first shot in about two matches in five.
    for (let i = 0; i < 40; i += 1) {
      const state = matchOf(`bouclier-${String(i)}`, 2, { rules: DEFAULT_MATCH_CONFIG.rules });
      if (state === null) continue;
      const { next } = botTurn(state, 'redoutable');
      expect(
        next.players.every((player) => player.alive),
        `seed ${String(i)}`,
      ).toBe(true);
      expect(next.outcome).toBeNull();
    }
  });
});

describe('the functions a bot writes', () => {
  it('parse, whatever the family and whatever the draw', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FAMILIES),
        fc.constantFrom('x' as const, 'y' as const),
        fc.integer({ min: 0, max: 10_000 }),
        (family, axis, draw) => {
          const rng = createRng(SeedSchema.parse(`tirage-${String(draw)}`));
          const source = sourceFor(family, axis, rng);
          const parsed = deps().parser.parse(source, axis);
          expect(parsed.ok, source).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('walks towards the target and not away from it', () => {
    const rng = createRng(SeedSchema.parse('sens'));
    const here = { x: 0, y: 0 };

    expect(towards(here, { x: 40, y: 1 }, rng)).toEqual({ axis: 'x', direction: 'increasing' });
    expect(towards(here, { x: -40, y: 1 }, rng)).toEqual({ axis: 'x', direction: 'decreasing' });
    expect(towards(here, { x: 1, y: 40 }, rng)).toEqual({ axis: 'y', direction: 'increasing' });
    expect(towards(here, { x: 1, y: -40 }, rng)).toEqual({ axis: 'y', direction: 'decreasing' });
  });
});
