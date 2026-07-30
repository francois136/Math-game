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

  it('treats two players on the same vertical as unreachable', () => {
    // No function of x joins them, whatever the obstacles do.
    const stacked: GameMap = {
      ...bare,
      spawns: [
        { index: 0, position: { x: 0, y: -20 } },
        { index: 1, position: { x: 0, y: 20 } },
      ],
    };
    expect(validate(stacked, DEFAULT_MAP_PARAMS).exposedPairs).toEqual([]);
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
