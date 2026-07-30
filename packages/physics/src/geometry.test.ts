import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Aabb, Vec2 } from '@fw/contracts';
import {
  boundsExit,
  distanceToObstacle,
  insideBounds,
  isConvexCounterClockwise,
  obstacleArea,
  segmentAabb,
  segmentConvexPolygon,
  segmentDisc,
} from './geometry.js';
import { obstacleIdOf } from './testing.js';

const BOX: Aabb = { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
const UNIT_SQUARE: Vec2[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

describe('segment against a box', () => {
  it('finds where it enters', () => {
    const t = segmentAabb({ x: -5, y: 0 }, { x: 5, y: 0 }, BOX);
    expect(t).toBeCloseTo(0.4, 10); // enters at x = -1, four tenths of the way
  });

  it('misses when it passes by', () => {
    expect(segmentAabb({ x: -5, y: 5 }, { x: 5, y: 5 }, BOX)).toBeNull();
  });

  it('answers zero when it starts inside', () => {
    expect(segmentAabb({ x: 0, y: 0 }, { x: 5, y: 0 }, BOX)).toBe(0);
  });

  it('handles a segment parallel to an axis and outside the slab', () => {
    expect(segmentAabb({ x: 5, y: -5 }, { x: 5, y: 5 }, BOX)).toBeNull();
  });

  it('stops short when the segment ends before the box', () => {
    expect(segmentAabb({ x: -5, y: 0 }, { x: -2, y: 0 }, BOX)).toBeNull();
  });
});

describe('segment against a disc', () => {
  it('agrees with the analytic answer', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: 0.5, max: 5, noNaN: true }),
        (height, radius) => {
          const a = { x: -20, y: height };
          const b = { x: 20, y: height };
          const t = segmentDisc(a, b, { x: 0, y: 0 }, radius);

          if (Math.abs(height) > radius) {
            expect(t).toBeNull();
            return;
          }
          // The chord at that height starts at x = −√(r² − h²).
          const expected = (-Math.sqrt(radius * radius - height * height) + 20) / 40;
          expect(t).not.toBeNull();
          expect(t ?? 0).toBeCloseTo(expected, 9);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('answers zero when it starts inside', () => {
    expect(segmentDisc({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 2)).toBe(0);
  });

  it('detects a crossing no sample point would have seen', () => {
    // A thin disc between two samples: point-by-point testing misses it, the
    // segment test does not. This is why collisions are done on segments.
    const t = segmentDisc({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, 0.05);
    expect(t).not.toBeNull();
  });
});

describe('segment against a convex polygon', () => {
  it('matches the box result on a square', () => {
    const box = segmentAabb({ x: -5, y: 0.3 }, { x: 5, y: 0.3 }, BOX);
    const polygon = segmentConvexPolygon({ x: -5, y: 0.3 }, { x: 5, y: 0.3 }, UNIT_SQUARE);
    expect(polygon ?? -1).toBeCloseTo(box ?? -2, 9);
  });

  it('misses when it passes outside', () => {
    expect(segmentConvexPolygon({ x: -5, y: 3 }, { x: 5, y: 3 }, UNIT_SQUARE)).toBeNull();
  });

  it('answers zero when it starts inside', () => {
    expect(segmentConvexPolygon({ x: 0, y: 0 }, { x: 5, y: 0 }, UNIT_SQUARE)).toBe(0);
  });
});

describe('distance to a shape', () => {
  it('is zero inside and the true distance outside', () => {
    const rect = obstacleIdOf('r');
    expect(distanceToObstacle({ x: 0, y: 0 }, { kind: 'rect', id: rect, box: BOX })).toBe(0);
    expect(distanceToObstacle({ x: 4, y: 0 }, { kind: 'rect', id: rect, box: BOX })).toBe(3);
    expect(
      distanceToObstacle(
        { x: 4, y: 0 },
        { kind: 'disc', id: rect, center: { x: 0, y: 0 }, radius: 1 },
      ),
    ).toBe(3);
    expect(
      distanceToObstacle({ x: 0, y: 0 }, { kind: 'polygon', id: rect, vertices: UNIT_SQUARE }),
    ).toBe(0);
    expect(
      distanceToObstacle({ x: 4, y: 0 }, { kind: 'polygon', id: rect, vertices: UNIT_SQUARE }),
    ).toBeCloseTo(3, 9);
  });
});

describe('areas', () => {
  it('measures each shape', () => {
    const id = obstacleIdOf('a');
    expect(obstacleArea({ kind: 'rect', id, box: BOX })).toBe(4);
    expect(obstacleArea({ kind: 'disc', id, center: { x: 0, y: 0 }, radius: 2 })).toBeCloseTo(
      4 * Math.PI,
      9,
    );
    expect(obstacleArea({ kind: 'polygon', id, vertices: UNIT_SQUARE })).toBeCloseTo(4, 9);
  });
});

describe('convexity', () => {
  it('accepts a counter-clockwise convex polygon', () => {
    expect(isConvexCounterClockwise(UNIT_SQUARE)).toBe(true);
  });

  it('refuses the same polygon wound the other way', () => {
    expect(isConvexCounterClockwise([...UNIT_SQUARE].reverse())).toBe(false);
  });

  it('refuses a concave polygon', () => {
    expect(
      isConvexCounterClockwise([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 2, y: 1 },
        { x: 0, y: 4 },
      ]),
    ).toBe(false);
  });
});

describe('leaving the map', () => {
  it('finds the crossing point', () => {
    const t = boundsExit({ x: 0, y: 0 }, { x: 4, y: 0 }, BOX);
    expect(t).toBeCloseTo(0.25, 6);
    expect(insideBounds({ x: 0.99, y: 0 }, BOX)).toBe(true);
    expect(insideBounds({ x: 1.01, y: 0 }, BOX)).toBe(false);
  });

  it('finds it at a corner too', () => {
    const t = boundsExit({ x: 0, y: 0 }, { x: 4, y: 4 }, BOX);
    expect(t).toBeCloseTo(0.25, 6);
  });
});
