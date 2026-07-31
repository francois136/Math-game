import type { Aabb, Axis, Direction, Obstacle, Vec2 } from '@fw/contracts';
import { transposeBox, transposeObstacle, transposePoint } from './transpose.js';

/**
 * Is there *any* continuous function joining two points?
 *
 * A curve `y = f(x)` walked towards increasing `x` is exactly a path through
 * the free space that never goes backwards in `x` and never jumps in `y`. So
 * the question "can a continuous function get from A to B" has a precise
 * answer: slice the field into columns perpendicular to the walk, list the free
 * intervals of each column, join two intervals of neighbouring columns when
 * they overlap, and look for a path.
 *
 * A path in that graph *is* the graph of a continuous function, and every
 * continuous function gives such a path. This is not an approximation of the
 * property — it is the property, up to the width of a column.
 *
 * That width is the one caveat: an obstacle thinner than a column can slip
 * between two slices. `COLUMNS` is chosen so a column is far thinner than a
 * player, which is the smallest thing that matters on this field.
 */

const COLUMNS = 220;

/** Overlap smaller than this is a corner touching a corner, not a way through. */
const OVERLAP_EPSILON = 1e-6;

interface Interval {
  readonly low: number;
  readonly high: number;
}

export interface Sweep {
  readonly axis: Axis;
  readonly direction: Direction;
}

export const ALL_SWEEPS: readonly Sweep[] = [
  { axis: 'x', direction: 'increasing' },
  { axis: 'x', direction: 'decreasing' },
  { axis: 'y', direction: 'increasing' },
  { axis: 'y', direction: 'decreasing' },
];

/**
 * Can a continuous function get from `from` to `to` along any of the four
 * sweeps?
 *
 * `radius` is the target's hitbox: the curve has to reach it, not its centre.
 */
export function reachableByAnySweep(
  from: Vec2,
  to: Vec2,
  bounds: Aabb,
  obstacles: readonly Obstacle[],
  radius: number,
): boolean {
  return ALL_SWEEPS.some((sweep) => reachableBySweep(from, to, bounds, obstacles, radius, sweep));
}

export function reachableBySweep(
  from: Vec2,
  to: Vec2,
  bounds: Aabb,
  obstacles: readonly Obstacle[],
  radius: number,
  sweep: Sweep,
): boolean {
  // Everything below walks towards increasing x. The other three sweeps are the
  // same walk on a world turned, mirrored, or both.
  const turn = sweep.axis === 'y';
  let a = turn ? transposePoint(from) : from;
  let b = turn ? transposePoint(to) : to;
  let box = turn ? transposeBox(bounds) : bounds;
  let shapes = turn ? obstacles.map(transposeObstacle) : obstacles;

  if (sweep.direction === 'decreasing') {
    a = mirrorPoint(a);
    b = mirrorPoint(b);
    box = mirrorBox(box);
    shapes = shapes.map(mirrorObstacle);
  }

  // The walk only moves forward: a target behind the shooter is out of reach on
  // this sweep, whatever the obstacles do.
  if (b.x <= a.x) return false;

  return sweepConnects(a, b, box, shapes, radius);
}

function sweepConnects(
  a: Vec2,
  b: Vec2,
  bounds: Aabb,
  obstacles: readonly Obstacle[],
  radius: number,
): boolean {
  const step = (b.x - a.x) / COLUMNS;
  if (!(step > 0)) return false;

  let reached = freeIntervalsAt(a.x, bounds, obstacles).filter(
    (interval) => interval.low <= a.y && a.y <= interval.high,
  );
  // The shooter stands inside an obstacle, or off the field: nothing to do.
  if (reached.length === 0) return false;

  for (let column = 1; column <= COLUMNS; column += 1) {
    const x = column === COLUMNS ? b.x : a.x + column * step;
    const free = freeIntervalsAt(x, bounds, obstacles);
    const next = free.filter((candidate) =>
      reached.some((previous) => overlaps(previous, candidate)),
    );
    if (next.length === 0) return false;
    reached = next;
  }

  return reached.some((interval) => interval.low - radius <= b.y && b.y <= interval.high + radius);
}

/** What is left of this column once the obstacles have taken their share. */
function freeIntervalsAt(x: number, bounds: Aabb, obstacles: readonly Obstacle[]): Interval[] {
  const blocked: Interval[] = [];
  for (const obstacle of obstacles) {
    const span = crossSection(obstacle, x);
    if (span !== null) blocked.push(span);
  }
  blocked.sort((p, q) => p.low - q.low);

  const free: Interval[] = [];
  let cursor = bounds.min.y;
  for (const span of blocked) {
    if (span.low > cursor) free.push({ low: cursor, high: Math.min(span.low, bounds.max.y) });
    cursor = Math.max(cursor, span.high);
    if (cursor >= bounds.max.y) break;
  }
  if (cursor < bounds.max.y) free.push({ low: cursor, high: bounds.max.y });

  return free.filter((interval) => interval.high - interval.low > OVERLAP_EPSILON);
}

/** The slice an obstacle takes out of the vertical line at `x`, if any. */
function crossSection(obstacle: Obstacle, x: number): Interval | null {
  switch (obstacle.kind) {
    case 'rect':
      if (x < obstacle.box.min.x || x > obstacle.box.max.x) return null;
      return { low: obstacle.box.min.y, high: obstacle.box.max.y };

    case 'disc': {
      const dx = x - obstacle.center.x;
      const half = obstacle.radius * obstacle.radius - dx * dx;
      if (half <= 0) return null;
      const reach = Math.sqrt(half);
      return { low: obstacle.center.y - reach, high: obstacle.center.y + reach };
    }

    case 'polygon': {
      let low = Infinity;
      let high = -Infinity;
      for (let i = 0; i < obstacle.vertices.length; i += 1) {
        const p = obstacle.vertices[i];
        const q = obstacle.vertices[(i + 1) % obstacle.vertices.length];
        if (p === undefined || q === undefined) continue;
        if (p.x === q.x) {
          if (Math.abs(p.x - x) > 1e-9) continue;
          low = Math.min(low, p.y, q.y);
          high = Math.max(high, p.y, q.y);
          continue;
        }
        const t = (x - p.x) / (q.x - p.x);
        if (t < 0 || t > 1) continue;
        const y = p.y + (q.y - p.y) * t;
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
      return low <= high ? { low, high } : null;
    }
  }
}

const overlaps = (p: Interval, q: Interval): boolean =>
  Math.min(p.high, q.high) - Math.max(p.low, q.low) > OVERLAP_EPSILON;

const mirrorPoint = (point: Vec2): Vec2 => ({ x: -point.x, y: point.y });

const mirrorBox = (box: Aabb): Aabb => ({
  min: { x: -box.max.x, y: box.min.y },
  max: { x: -box.min.x, y: box.max.y },
});

function mirrorObstacle(obstacle: Obstacle): Obstacle {
  switch (obstacle.kind) {
    case 'rect':
      return { ...obstacle, box: mirrorBox(obstacle.box) };
    case 'disc':
      return { ...obstacle, center: mirrorPoint(obstacle.center) };
    case 'polygon':
      return { ...obstacle, vertices: [...obstacle.vertices].reverse().map(mirrorPoint) };
  }
}
