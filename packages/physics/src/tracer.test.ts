import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_TRACE_PARAMS,
  type GameMap,
  type TraceInput,
  type TraceResult,
  type TraceTarget,
} from '@fw/contracts';
import { trace } from './tracer.js';
import { emptyMap, functionUnderTest, obstacleIdOf, playerIdOf } from './testing.js';

const ORIGIN = { x: -30, y: 0 };

function shoot(
  f: (x: number) => number | null,
  overrides: Partial<Omit<TraceInput, 'expression' | 'evaluator'>> = {},
): TraceResult {
  const { expression, evaluator } = functionUnderTest(f);
  return trace({
    expression,
    evaluator,
    origin: ORIGIN,
    axis: 'x',
    direction: 'increasing',
    map: emptyMap(),
    targets: [],
    params: DEFAULT_TRACE_PARAMS,
    pierce: false,
    ...overrides,
  });
}

function target(overrides: Partial<TraceTarget> & { x: number; y: number }): TraceTarget {
  return {
    playerId: playerIdOf('victim'),
    center: { x: overrides.x, y: overrides.y },
    radius: 1.5,
    vulnerability: 'lethal',
    immuneUntilArc: 0,
    ...overrides,
  };
}

describe('where the curve starts', () => {
  it('passes through the shooter whatever f(0) is', () => {
    // y = y₀ + f(x − x₀) − f(0): the +5 must not lift the curve off the player.
    const result = shoot((x) => x * x + 5);
    expect(result.polyline[0]).toEqual(ORIGIN);
  });

  it('walks towards decreasing x when asked', () => {
    const result = shoot(() => 0, { direction: 'decreasing' });
    const last = result.polyline.at(-1);
    expect(last?.x).toBeLessThan(ORIGIN.x);
    expect(result.stop.kind).toBe('map-edge');
  });
});

describe('what stops it', () => {
  it('the edge of the map', () => {
    const result = shoot(() => 0);
    expect(result.stop.kind).toBe('map-edge');
    expect(result.stop.at.x).toBeCloseTo(50, 6);
  });

  it('an obstacle, at the point where it enters', () => {
    const map: GameMap = {
      ...emptyMap(),
      obstacles: [{ kind: 'disc', id: obstacleIdOf('rock'), center: { x: 0, y: 0 }, radius: 5 }],
    };
    const result = shoot(() => 0, { map });
    expect(result.stop.kind).toBe('obstacle');
    // Entry point, not the far side and not the sample vertex before it.
    expect(result.stop.at.x).toBeCloseTo(-5, 3);
  });

  it('the end of the domain, on the asymptote rather than short of it', () => {
    // Defined only left of x − x₀ = 20, i.e. world x = −10.
    const result = shoot((x) => (x < 20 ? 0 : null));
    expect(result.stop.kind).toBe('domain-exit');
    expect(result.stop.at.x).toBeCloseTo(-10, 3);
  });

  it('the arc budget', () => {
    const result = shoot(() => 0, {
      params: { ...DEFAULT_TRACE_PARAMS, maxArcLength: 10 },
    });
    expect(result.stop.kind).toBe('arc-limit');
    expect(result.arcLength).toBeGreaterThanOrEqual(10);
  });

  it('the step budget', () => {
    const result = shoot(() => 0, {
      params: { ...DEFAULT_TRACE_PARAMS, maxSteps: 5 },
    });
    expect(result.stop.kind).toBe('step-limit');
    expect(result.steps).toBeLessThanOrEqual(5);
  });
});

describe('players', () => {
  it('stops on a lethal hit', () => {
    const result = shoot(() => 0, { targets: [target({ x: 0, y: 0 })] });
    expect(result.stop.kind).toBe('player-hit');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.lethal).toBe(true);
    expect(result.hits[0]?.absorbedBy).toBeNull();
  });

  it('goes through a shielded player, and says so', () => {
    const result = shoot(() => 0, {
      targets: [target({ x: 0, y: 0, vulnerability: 'shield' })],
    });
    expect(result.stop.kind).toBe('map-edge');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.lethal).toBe(false);
    expect(result.hits[0]?.absorbedBy).toBe('shield');
  });

  it('goes through a team-mate when friendly fire is off', () => {
    const result = shoot(() => 0, {
      targets: [target({ x: 0, y: 0, vulnerability: 'friendly-fire' })],
    });
    expect(result.hits[0]?.absorbedBy).toBe('friendly-fire');
    expect(result.stop.kind).toBe('map-edge');
  });

  it('carries on after a kill when pierce is on', () => {
    const result = shoot(() => 0, {
      pierce: true,
      targets: [
        target({ x: 0, y: 0, playerId: playerIdOf('first') }),
        target({ x: 20, y: 0, playerId: playerIdOf('second') }),
      ],
    });
    expect(result.hits).toHaveLength(2);
    expect(result.stop.kind).toBe('map-edge');
  });

  it('spares the shooter as the curve leaves them', () => {
    // The shot starts inside its author's own hitbox. Without the immunity arc
    // every shot would kill its author on the spot.
    const shooter = target({
      x: ORIGIN.x,
      y: ORIGIN.y,
      playerId: playerIdOf('shooter'),
      immuneUntilArc: 3,
    });
    expect(shoot(() => 0, { targets: [shooter] }).stop.kind).toBe('map-edge');

    // The arc has to outlast the hitbox, or the immunity buys nothing.
    const tooShort = { ...shooter, immuneUntilArc: 0.5 };
    expect(shoot(() => 0, { targets: [tooShort] }).stop.kind).toBe('player-hit');
  });

  it('measures the immunity in arc length, not as a blanket', () => {
    const far = target({
      x: ORIGIN.x + 10,
      y: 0,
      playerId: playerIdOf('other'),
      immuneUntilArc: 3,
    });
    expect(shoot(() => 0, { targets: [far] }).stop.kind).toBe('player-hit');
  });

  it('never comes back over its author, because y is a function of x', () => {
    // Worth stating as a test: the shot walks away in x and never returns to
    // the shooter's abscissa, whatever the function does. A player therefore
    // cannot be killed by their own curve later in the same shot — only as it
    // leaves, which is what the immunity arc prevents. See docs/GAME_DESIGN.md.
    const shooter = target({
      x: ORIGIN.x,
      y: ORIGIN.y,
      playerId: playerIdOf('shooter'),
      immuneUntilArc: 3,
    });
    for (const f of [
      (x: number) => 10 * Math.sin(x),
      (x: number) => -x,
      (x: number) => x * x * 0.01,
    ]) {
      const result = shoot(f, { targets: [shooter] });
      expect(result.hits).toHaveLength(0);
    }
  });

  it('lets whatever comes first along the segment decide', () => {
    const map: GameMap = {
      ...emptyMap(),
      obstacles: [{ kind: 'disc', id: obstacleIdOf('wall'), center: { x: -10, y: 0 }, radius: 3 }],
    };
    // Wall at x = −13 (entry), player at x = 0: the wall wins.
    const result = shoot(() => 0, { map, targets: [target({ x: 0, y: 0 })] });
    expect(result.stop.kind).toBe('obstacle');
    expect(result.hits).toHaveLength(0);
  });
});

describe('determinism and termination', () => {
  it('gives the same polyline twice', () => {
    const first = shoot((x) => 3 * Math.sin(x / 2));
    const second = shoot((x) => 3 * Math.sin(x / 2));
    expect(first).toEqual(second);
  });

  it('always terminates and stays on the map', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -5, max: 5, noNaN: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.constantFrom<'increasing' | 'decreasing'>('increasing', 'decreasing'),
        (amplitude, frequency, direction) => {
          const result = shoot((x) => amplitude * Math.sin(frequency * x), { direction });

          expect(result.steps).toBeLessThanOrEqual(DEFAULT_TRACE_PARAMS.maxSteps);
          expect(result.polyline.length).toBeLessThanOrEqual(DEFAULT_TRACE_PARAMS.maxSteps + 1);
          expect(result.arcLength).toBeLessThanOrEqual(
            DEFAULT_TRACE_PARAMS.maxArcLength + DEFAULT_TRACE_PARAMS.maxStep * 2,
          );

          const bounds = emptyMap().bounds;
          for (const point of result.polyline) {
            expect(point.x).toBeGreaterThanOrEqual(bounds.min.x - 1e-6);
            expect(point.x).toBeLessThanOrEqual(bounds.max.x + 1e-6);
            expect(point.y).toBeGreaterThanOrEqual(bounds.min.y - 1e-6);
            expect(point.y).toBeLessThanOrEqual(bounds.max.y + 1e-6);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('terminates on a curve that dives straight off the map', () => {
    const result = shoot((x) => (x === 0 ? 0 : -1 / x));
    expect(result.stop.kind).toBe('map-edge');
    expect(result.steps).toBeLessThan(DEFAULT_TRACE_PARAMS.maxSteps);
  });
});

describe('cost of a shot', () => {
  it('resolves well inside the 16 ms budget', () => {
    const map: GameMap = {
      ...emptyMap(),
      obstacles: Array.from({ length: 40 }, (_, i) => ({
        kind: 'disc' as const,
        id: obstacleIdOf(`o${String(i)}`),
        center: { x: -48 + (i % 20) * 5, y: i < 20 ? 12 : -12 },
        radius: 1.2,
      })),
    };
    const targets = Array.from({ length: 7 }, (_, i) =>
      target({ x: 40, y: -20 + i * 3, playerId: playerIdOf(`p${String(i)}`) }),
    );

    const started = performance.now();
    for (let i = 0; i < 50; i += 1) shoot((x) => 4 * Math.sin(x / 3), { map, targets });
    const perShot = (performance.now() - started) / 50;

    expect(perShot).toBeLessThan(16);
  });
});
