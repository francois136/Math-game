import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_PARAMS, SeedSchema, type GameMap, type MapParams } from '@fw/contracts';
import { generate, validate, GENERATOR_VERSION } from './mapgen.js';
import { obstacleIdOf } from './testing.js';

const seed = (name: string) => SeedSchema.parse(name);

function generated(name: string, params: MapParams = DEFAULT_MAP_PARAMS): GameMap {
  const result = generate(seed(name), params);
  if (!result.ok) throw new Error(`generation failed: ${result.error.message}`);
  return result.value;
}

describe('determinism', () => {
  it('gives the same map for the same seed', () => {
    expect(generated('alpha')).toEqual(generated('alpha'));
  });

  it('gives a different map for a different seed', () => {
    expect(generated('alpha')).not.toEqual(generated('beta'));
  });

  it('stamps the generator version, so an old replay keeps its map', () => {
    expect(generated('alpha').generatorVersion).toBe(GENERATOR_VERSION);
    expect(generated('alpha').seed).toBe('alpha');
  });
});

describe('what it produces', () => {
  it('succeeds up to four seats', () => {
    // Five is intermittent and six and above is out of reach with the default
    // parameters — see ADR 0011 and the balancing task in TASKS.md. The
    // generator refuses rather than shipping a map nobody could win, which is
    // the behaviour the next test pins down.
    for (const spawnCount of [2, 3, 4]) {
      const params = { ...DEFAULT_MAP_PARAMS, spawnCount };
      for (let i = 0; i < 5; i += 1) {
        const result = generate(seed(`seat-${String(spawnCount)}-${String(i)}`), params);
        expect(result.ok, `${String(spawnCount)} seats, seed ${String(i)}`).toBe(true);
        if (result.ok) expect(result.value.spawns).toHaveLength(spawnCount);
      }
    }
  });

  it('never returns a map that fails its own validation', () => {
    // The invariant that matters: whatever the seat count, a map that comes
    // back is playable. Nothing here asserts that generation succeeds.
    // Few attempts at the high seat counts on purpose: they are expected to
    // fail, and burning a dozen doomed attempts per seed buys no coverage.
    for (const spawnCount of [2, 4, 6, 8]) {
      const params = {
        ...DEFAULT_MAP_PARAMS,
        spawnCount,
        maxGenerationAttempts: spawnCount > 4 ? 3 : 12,
      };
      for (let i = 0; i < 3; i += 1) {
        const result = generate(seed(`invariant-${String(spawnCount)}-${String(i)}`), params);
        if (!result.ok) continue;
        const check = validate(result.value, params);
        expect(check.ok, `${String(spawnCount)} seats`).toBe(true);
        expect(check.exposedPairs).toEqual([]);
        expect(check.unreachablePairs).toEqual([]);
      }
    }
  });

  it('keeps every spawn clear of obstacles and of the others', () => {
    const params = { ...DEFAULT_MAP_PARAMS, spawnCount: 4 };
    const map = generated('clearance', params);
    const check = validate(map, params);
    expect(check.ok).toBe(true);
    expect(check.coverage).toBeLessThanOrEqual(params.maxCoverage);
  });

  it('leaves no trivial curve between any two players', () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const map = generated(name);
      expect(validate(map, DEFAULT_MAP_PARAMS).exposedPairs, name).toEqual([]);
    }
  });

  it('always leaves a way through, which is the other half of the rule', () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const map = generated(name);
      expect(validate(map, DEFAULT_MAP_PARAMS).unreachablePairs, name).toEqual([]);
    }
  });

  it('gives up rather than shipping a map it cannot make', () => {
    // Eight seats, twenty-five apart, in a field far too small to hold them.
    const impossible: MapParams = {
      ...DEFAULT_MAP_PARAMS,
      bounds: { min: { x: -10, y: -10 }, max: { x: 10, y: 10 } },
      spawnCount: 8,
      maxGenerationAttempts: 8,
    };
    const result = generate(seed('impossible'), impossible);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ERR_MAP_GENERATION_FAILED');
  });
});

describe('validation of a map written by hand', () => {
  const bare: GameMap = {
    name: 'aucun couvert',
    bounds: DEFAULT_MAP_PARAMS.bounds,
    obstacles: [],
    spawns: [
      { index: 0, position: { x: -30, y: 0 } },
      { index: 1, position: { x: 30, y: 0 } },
    ],
    seed: null,
    generatorVersion: 0,
  };

  it('refuses an empty field, where a straight line already wins', () => {
    const check = validate(bare, DEFAULT_MAP_PARAMS);
    expect(check.ok).toBe(false);
    expect(check.exposedPairs).toEqual([[0, 1]]);
    expect(check.unreachablePairs).toEqual([]);
  });

  it('refuses a field so walled that nothing can get through', () => {
    const sealed: GameMap = {
      ...bare,
      obstacles: [
        {
          kind: 'rect',
          id: obstacleIdOf('wall'),
          box: { min: { x: -2, y: -30 }, max: { x: 2, y: 30 } },
        },
        {
          kind: 'rect',
          id: obstacleIdOf('roof'),
          box: { min: { x: -40, y: 24 }, max: { x: 40, y: 30 } },
        },
        {
          kind: 'rect',
          id: obstacleIdOf('floor'),
          box: { min: { x: -40, y: -30 }, max: { x: 40, y: -24 } },
        },
      ],
    };
    const check = validate(sealed, DEFAULT_MAP_PARAMS);
    expect(check.exposedPairs).toEqual([]);
    expect(check.unreachablePairs).toEqual([[0, 1]]);
    expect(check.ok).toBe(false);
  });

  it('accepts a column that blocks the trivial shots but leaves a way over', () => {
    // This is the shape the whole rule is aiming for: nothing flat gets past,
    // a deliberate lob does.
    const walled: GameMap = {
      ...bare,
      obstacles: [
        {
          kind: 'rect',
          id: obstacleIdOf('column'),
          box: { min: { x: -2, y: -30 }, max: { x: 2, y: 6 } },
        },
      ],
    };
    const check = validate(walled, DEFAULT_MAP_PARAMS);
    expect(check.exposedPairs).toEqual([]);
    expect(check.unreachablePairs).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('refuses a non-convex polygon, which the collision code cannot handle', () => {
    const concave: GameMap = {
      ...bare,
      obstacles: [
        {
          kind: 'polygon',
          id: obstacleIdOf('bad'),
          vertices: [
            { x: -2, y: -30 },
            { x: 2, y: -30 },
            { x: 2, y: 30 },
            { x: 0, y: 0 },
            { x: -2, y: 30 },
          ],
        },
      ],
    };
    expect(validate(concave, DEFAULT_MAP_PARAMS).ok).toBe(false);
  });

  it('refuses two players standing on top of each other', () => {
    const crowded: GameMap = {
      ...bare,
      spawns: [
        { index: 0, position: { x: -1, y: 0 } },
        { index: 1, position: { x: 1, y: 0 } },
      ],
    };
    expect(validate(crowded, DEFAULT_MAP_PARAMS).ok).toBe(false);
  });

  it('sees two players on the same vertical as reachable, along y', () => {
    // No function of x joins them — and that used to make the placement
    // unplayable. A function of y joins them straight away (ADR 0013), which
    // also means an empty field leaves them exposed, exactly as it would
    // side by side.
    const stacked: GameMap = {
      ...bare,
      spawns: [
        { index: 0, position: { x: 0, y: -20 } },
        { index: 1, position: { x: 0, y: 20 } },
      ],
    };
    const check = validate(stacked, DEFAULT_MAP_PARAMS);
    expect(check.unreachablePairs).toEqual([]);
    expect(check.exposedPairs).toEqual([[0, 1]]);
  });
});

describe('cost of generating a map', () => {
  it('stays well under a second at the seat counts it supports', () => {
    const params = { ...DEFAULT_MAP_PARAMS, spawnCount: 4 };
    const started = performance.now();
    for (let i = 0; i < 5; i += 1) generate(seed(`bench-${String(i)}`), params);
    const perMap = (performance.now() - started) / 5;
    expect(perMap).toBeLessThan(1000);
  });
});

describe('difficulty', () => {
  const at = (difficulty: MapParams['difficulty'], spawnCount = 2): MapParams => ({
    ...DEFAULT_MAP_PARAMS,
    difficulty,
    spawnCount,
    spawnTeams: Array.from({ length: spawnCount }, () => null),
  });

  it('generates a field at every difficulty and every seat count', () => {
    for (const difficulty of ['facile', 'moderee', 'difficile'] as const) {
      for (const spawnCount of [2, 3, 4]) {
        const params = at(difficulty, spawnCount);
        for (let i = 0; i < 3; i += 1) {
          const result = generate(seed(`${difficulty}-${String(spawnCount)}-${String(i)}`), params);
          expect(result.ok, `${difficulty} at ${String(spawnCount)} seats, seed ${String(i)}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('facile promises a parabola between every pair', () => {
    const params = at('facile');
    for (const name of ['f1', 'f2', 'f3', 'f4']) {
      const check = validate(generated(name, params), params);
      expect(check.parabolaPairs, name).toEqual([[0, 1]]);
      expect(check.exposedPairs, name).toEqual([]);
    }
  });

  it('difficile promises no parabola at all, and still a way through', () => {
    const params = at('difficile');
    for (const name of ['d1', 'd2', 'd3', 'd4']) {
      const map = generated(name, params);
      const check = validate(map, params);
      // Nothing findable by sweeping one coefficient…
      expect(check.parabolaPairs, name).toEqual([]);
      // …and yet a continuous function gets there. Both, or the field is
      // either a warm-up or a wall (ADR 0014).
      expect(check.unreachablePairs, name).toEqual([]);
      expect(check.ok, name).toBe(true);
    }
  });

  it('moderee promises only that something gets through', () => {
    const params = at('moderee');
    for (const name of ['m1', 'm2', 'm3', 'm4']) {
      const check = validate(generated(name, params), params);
      expect(check.unreachablePairs, name).toEqual([]);
      expect(check.exposedPairs, name).toEqual([]);
    }
  });

  it('judges the same field differently depending on what is asked of it', () => {
    // One map, three verdicts: the difficulty is a question about a field, not
    // a property of it.
    const easy = at('facile');
    const map = generated('verdicts', easy);
    expect(validate(map, easy).ok).toBe(true);
    expect(validate(map, { ...easy, difficulty: 'moderee' }).ok).toBe(true);
    expect(validate(map, { ...easy, difficulty: 'difficile' }).ok).toBe(false);
  });
});

describe('who stands where', () => {
  const teamed = (spawnTeams: (number | null)[]): MapParams => ({
    ...DEFAULT_MAP_PARAMS,
    spawnCount: spawnTeams.length,
    spawnTeams,
  });

  it('keeps enemies apart by nearly half the field', () => {
    const params = teamed([null, null, null, null]);
    const map = generated('ennemis', params);
    const wanted = (params.bounds.max.x - params.bounds.min.x) * params.enemySeparationFraction;

    for (let i = 0; i < map.spawns.length; i += 1) {
      for (let j = i + 1; j < map.spawns.length; j += 1) {
        const a = map.spawns[i]!.position;
        const b = map.spawns[j]!.position;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(wanted);
      }
    }
    expect(validate(map, params).tooClosePairs).toEqual([]);
  });

  it('lets team-mates stand together, and still keeps the sides apart', () => {
    const params = teamed([0, 0, 1, 1]);
    const map = generated('equipes', params);
    const enemyDistance =
      (params.bounds.max.x - params.bounds.min.x) * params.enemySeparationFraction;

    const between = (i: number, j: number): number => {
      const a = map.spawns[i]!.position;
      const b = map.spawns[j]!.position;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    // Allies only owe each other the small distance…
    expect(between(0, 1)).toBeGreaterThanOrEqual(params.spawnMinDistanceAllies);
    expect(between(2, 3)).toBeGreaterThanOrEqual(params.spawnMinDistanceAllies);
    // …and at least one pair uses that freedom, or the setting bought nothing.
    expect(Math.min(between(0, 1), between(2, 3))).toBeLessThan(enemyDistance);

    for (const [i, j] of [
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
    ]) {
      expect(between(i!, j!)).toBeGreaterThanOrEqual(enemyDistance);
    }
  });

  it('refuses a hand-made map that seats two enemies on top of each other', () => {
    const params = teamed([0, 1]);
    const crowded: GameMap = {
      name: 'trop près',
      bounds: DEFAULT_MAP_PARAMS.bounds,
      obstacles: [],
      // Fourteen units apart: fine between team-mates, far too close between
      // enemies, who owe each other forty-five.
      spawns: [
        { index: 0, position: { x: -7, y: 0 } },
        { index: 1, position: { x: 7, y: 0 } },
      ],
      seed: null,
      generatorVersion: 0,
    };
    const check = validate(crowded, params);
    expect(check.tooClosePairs).toEqual([[0, 1]]);
    expect(check.ok).toBe(false);

    // The same two, on the same side, are simply neighbours.
    expect(validate(crowded, teamed([0, 0])).tooClosePairs).toEqual([]);
  });
});
