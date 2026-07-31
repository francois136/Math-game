import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_TRACE_PARAMS, type GameMap, type TraceInput } from '@fw/contracts';
import { transposeBox, transposeMap, transposeObstacle, transposePoint } from './transpose.js';
import { trace } from './tracer.js';
import { isConvexCounterClockwise } from './geometry.js';
import { emptyMap, functionUnderTest, obstacleIdOf, playerIdOf } from './testing.js';

const point = fc.record({
  x: fc.double({ min: -100, max: 100, noNaN: true }),
  y: fc.double({ min: -100, max: 100, noNaN: true }),
});

describe('a quarter turn', () => {
  it('is its own inverse', () => {
    fc.assert(
      fc.property(point, (p) => {
        expect(transposePoint(transposePoint(p))).toEqual(p);
      }),
    );
  });

  it('is its own inverse on a box, corners the right way round', () => {
    fc.assert(
      fc.property(point, point, (a, b) => {
        const box = {
          min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
          max: { x: Math.max(a.x, b.x) + 1, y: Math.max(a.y, b.y) + 1 },
        };
        const turned = transposeBox(box);
        expect(turned.min.x).toBeLessThan(turned.max.x);
        expect(turned.min.y).toBeLessThan(turned.max.y);
        expect(transposeBox(turned)).toEqual(box);
      }),
    );
  });

  it('keeps a polygon counter-clockwise, which the collision code requires', () => {
    const square = {
      kind: 'polygon' as const,
      id: obstacleIdOf('carré'),
      vertices: [
        { x: -2, y: -1 },
        { x: 2, y: -1 },
        { x: 2, y: 1 },
        { x: -2, y: 1 },
      ],
    };
    expect(isConvexCounterClockwise(square.vertices)).toBe(true);
    const turned = transposeObstacle(square);
    expect(turned.kind).toBe('polygon');
    if (turned.kind !== 'polygon') return;
    expect(isConvexCounterClockwise(turned.vertices)).toBe(true);
    expect(transposeObstacle(turned)).toEqual(square);
  });
});

describe('shooting along y', () => {
  /**
   * The claim the whole scheme rests on: a shot along `y` on a map is the
   * transpose of the same shot along `x` on the transposed map. If that holds,
   * the y-axis needs no code of its own and inherits every tracer test.
   */
  it('is the same shot on a transposed map', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -4, max: 4, noNaN: true }),
        fc.double({ min: 0.2, max: 6, noNaN: true }),
        fc.constantFrom('increasing' as const, 'decreasing' as const),
        (amplitude, frequency, direction) => {
          const map: GameMap = {
            ...emptyMap(),
            obstacles: [
              { kind: 'disc', id: obstacleIdOf('caillou'), center: { x: 4, y: 9 }, radius: 4 },
              {
                kind: 'rect',
                id: obstacleIdOf('mur'),
                box: { min: { x: -14, y: -8 }, max: { x: -6, y: 4 } },
              },
            ],
          };
          const f = (u: number): number => amplitude * Math.sin(frequency * u);
          const origin = { x: 3, y: -7 };
          const target = {
            playerId: playerIdOf('cible'),
            radius: 2,
            vulnerability: 'lethal' as const,
            immuneUntilArc: 0,
          };

          const common = {
            ...functionUnderTest(f),
            params: DEFAULT_TRACE_PARAMS,
            pierce: false,
            direction,
          };

          const alongY: TraceInput = {
            ...common,
            axis: 'y',
            origin,
            map,
            targets: [{ ...target, center: { x: -20, y: 12 } }],
          };
          const alongXTurned: TraceInput = {
            ...common,
            axis: 'x',
            origin: transposePoint(origin),
            map: transposeMap(map),
            targets: [{ ...target, center: transposePoint({ x: -20, y: 12 }) }],
          };

          const turned = trace(alongY);
          const straight = trace(alongXTurned);

          expect(turned.polyline.map(transposePoint)).toEqual(straight.polyline);
          expect(turned.steps).toBe(straight.steps);
          expect(turned.arcLength).toBe(straight.arcLength);
          expect(turned.stop.kind).toBe(straight.stop.kind);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('reaches a player standing directly above the shooter', () => {
    // The placement that used to be unplayable: no function of x joins these
    // two, and that is the whole reason the axis exists (ADR 0013).
    const shooter = { x: 0, y: -20 };
    const victim = {
      playerId: playerIdOf('au-dessus'),
      center: { x: 0, y: 20 },
      radius: 1.5,
      vulnerability: 'lethal' as const,
      immuneUntilArc: 3,
    };
    const input = {
      ...functionUnderTest(() => 0),
      origin: shooter,
      map: emptyMap(),
      targets: [victim],
      params: DEFAULT_TRACE_PARAMS,
      pierce: false,
    };

    expect(trace({ ...input, axis: 'x', direction: 'increasing' }).hits).toHaveLength(0);

    const upwards = trace({ ...input, axis: 'y', direction: 'increasing' });
    expect(upwards.stop.kind).toBe('player-hit');
    expect(upwards.hits[0]?.playerId).toBe('au-dessus');
  });
});
