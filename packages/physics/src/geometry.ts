import type { Aabb, Obstacle, Vec2 } from '@fw/contracts';

/**
 * Segment-against-shape intersection.
 *
 * Every routine here answers the same question: walking from `a` to `b`, at
 * what fraction of the way do we first touch this shape? `null` means never.
 * A segment that starts inside answers 0.
 *
 * Segment, not point. Sampling a curve and testing each sample would let a
 * fast-moving curve step straight over a thin obstacle between two samples.
 */

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Guards a division by a direction component that is effectively zero. */
const PARALLEL_EPSILON = 1e-12;

export function segmentAabb(a: Vec2, b: Vec2, box: Aabb): number | null {
  const d = sub(b, a);
  let enter = 0;
  let exit = 1;

  for (const axis of ['x', 'y'] as const) {
    const origin = a[axis];
    const direction = d[axis];
    const low = box.min[axis];
    const high = box.max[axis];

    if (Math.abs(direction) < PARALLEL_EPSILON) {
      if (origin < low || origin > high) return null;
      continue;
    }
    const t1 = (low - origin) / direction;
    const t2 = (high - origin) / direction;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return null;
  }

  return enter <= exit ? enter : null;
}

export function segmentDisc(a: Vec2, b: Vec2, center: Vec2, radius: number): number | null {
  const d = sub(b, a);
  const f = sub(a, center);

  const A = d.x * d.x + d.y * d.y;
  const B = 2 * (f.x * d.x + f.y * d.y);
  const C = f.x * f.x + f.y * f.y - radius * radius;

  if (C <= 0) return 0; // already inside

  if (A < PARALLEL_EPSILON) return null; // degenerate segment, and `a` is outside

  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const t1 = (-B - root) / (2 * A);
  const t2 = (-B + root) / (2 * A);

  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

/**
 * Cyrus–Beck clipping against a convex polygon, vertices counter-clockwise.
 *
 * Convexity is a contract, not an assumption we can afford to be wrong about:
 * `validateMap` rejects any polygon that is not convex before this ever runs.
 */
export function segmentConvexPolygon(a: Vec2, b: Vec2, vertices: readonly Vec2[]): number | null {
  const d = sub(b, a);
  let enter = 0;
  let exit = 1;

  for (let i = 0; i < vertices.length; i += 1) {
    const p = vertices[i];
    const q = vertices[(i + 1) % vertices.length];
    if (p === undefined || q === undefined) return null;

    // Outward normal of edge p→q for a counter-clockwise polygon.
    const edge = sub(q, p);
    const normal = { x: edge.y, y: -edge.x };

    const denominator = normal.x * d.x + normal.y * d.y;
    const numerator = normal.x * (a.x - p.x) + normal.y * (a.y - p.y);

    if (Math.abs(denominator) < PARALLEL_EPSILON) {
      if (numerator > 0) return null; // parallel and outside this edge
      continue;
    }

    const t = -numerator / denominator;
    if (denominator < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
    if (enter > exit) return null;
  }

  return enter <= exit && enter <= 1 && exit >= 0 ? Math.max(enter, 0) : null;
}

export function segmentObstacle(a: Vec2, b: Vec2, obstacle: Obstacle): number | null {
  switch (obstacle.kind) {
    case 'rect':
      return segmentAabb(a, b, obstacle.box);
    case 'disc':
      return segmentDisc(a, b, obstacle.center, obstacle.radius);
    case 'polygon':
      return segmentConvexPolygon(a, b, obstacle.vertices);
  }
}

export function insideBounds(p: Vec2, bounds: Aabb): boolean {
  return p.x >= bounds.min.x && p.x <= bounds.max.x && p.y >= bounds.min.y && p.y <= bounds.max.y;
}

/**
 * Where a segment leaving the map crosses the edge.
 *
 * Called only when `a` is inside and `b` is outside, so the answer always
 * exists; it is found by bisection rather than by four line intersections
 * because that stays correct at the corners without special cases.
 */
export function boundsExit(a: Vec2, b: Vec2, bounds: Aabb): number {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40 && high - low > 1e-12; i += 1) {
    const middle = (low + high) / 2;
    if (insideBounds(lerp(a, b, middle), bounds)) low = middle;
    else high = middle;
  }
  return low;
}

/** Zero when the point is inside the shape. Used for spawn clearance. */
export function distanceToObstacle(p: Vec2, obstacle: Obstacle): number {
  switch (obstacle.kind) {
    case 'rect': {
      const dx = Math.max(obstacle.box.min.x - p.x, 0, p.x - obstacle.box.max.x);
      const dy = Math.max(obstacle.box.min.y - p.y, 0, p.y - obstacle.box.max.y);
      return Math.hypot(dx, dy);
    }
    case 'disc':
      return Math.max(0, distance(p, obstacle.center) - obstacle.radius);
    case 'polygon':
      return distanceToConvexPolygon(p, obstacle.vertices);
  }
}

function distanceToConvexPolygon(p: Vec2, vertices: readonly Vec2[]): number {
  let outside = false;
  let best = Infinity;

  for (let i = 0; i < vertices.length; i += 1) {
    const v = vertices[i];
    const w = vertices[(i + 1) % vertices.length];
    if (v === undefined || w === undefined) continue;

    const edge = sub(w, v);
    const toPoint = sub(p, v);
    if (edge.y * toPoint.x - edge.x * toPoint.y > 0) outside = true;

    const lengthSquared = edge.x * edge.x + edge.y * edge.y;
    const t =
      lengthSquared < PARALLEL_EPSILON
        ? 0
        : Math.max(0, Math.min(1, (toPoint.x * edge.x + toPoint.y * edge.y) / lengthSquared));
    best = Math.min(best, distance(p, lerp(v, w, t)));
  }

  return outside ? best : 0;
}

export function obstacleArea(obstacle: Obstacle): number {
  switch (obstacle.kind) {
    case 'rect':
      return (obstacle.box.max.x - obstacle.box.min.x) * (obstacle.box.max.y - obstacle.box.min.y);
    case 'disc':
      return Math.PI * obstacle.radius * obstacle.radius;
    case 'polygon': {
      let twiceArea = 0;
      for (let i = 0; i < obstacle.vertices.length; i += 1) {
        const v = obstacle.vertices[i];
        const w = obstacle.vertices[(i + 1) % obstacle.vertices.length];
        if (v === undefined || w === undefined) continue;
        twiceArea += v.x * w.y - w.x * v.y;
      }
      return Math.abs(twiceArea) / 2;
    }
  }
}

/** Counter-clockwise and convex, as the collision code requires. */
export function isConvexCounterClockwise(vertices: readonly Vec2[]): boolean {
  if (vertices.length < 3) return false;
  let sign = 0;

  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const c = vertices[(i + 2) % vertices.length];
    if (a === undefined || b === undefined || c === undefined) return false;

    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < PARALLEL_EPSILON) continue; // collinear, tolerated
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }

  return sign > 0; // counter-clockwise
}
