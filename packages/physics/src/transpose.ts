import type { Aabb, GameMap, Obstacle, TraceResult, Vec2 } from '@fw/contracts';

/**
 * A quarter turn: swap the two coordinates.
 *
 * This is how `x = f(y)` is drawn (ADR 0013). Transpose the world, trace it the
 * only way the tracer knows how, transpose the answer back. Not one line of
 * collision, step adaptation or asymptote handling is written twice, and the
 * curve along `y` is exactly as correct as the curve along `x` — because it is
 * the same code.
 *
 * `transpose` is an involution: applying it twice gives back what you started
 * with. There is a property test for that, because the whole scheme rests on it.
 */

export const transposePoint = (point: Vec2): Vec2 => ({ x: point.y, y: point.x });

export function transposeBox(box: Aabb): Aabb {
  // Swapping the coordinates of the corners can put them the wrong way round on
  // neither axis — min stays min — but writing it out is clearer than trusting it.
  const a = transposePoint(box.min);
  const b = transposePoint(box.max);
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
  };
}

export function transposeObstacle(obstacle: Obstacle): Obstacle {
  switch (obstacle.kind) {
    case 'rect':
      return { ...obstacle, box: transposeBox(obstacle.box) };
    case 'disc':
      return { ...obstacle, center: transposePoint(obstacle.center) };
    case 'polygon':
      // Mirroring reverses the winding, and the collision code requires
      // counter-clockwise. Reversing the list puts it back.
      return { ...obstacle, vertices: [...obstacle.vertices].reverse().map(transposePoint) };
  }
}

export function transposeMap(map: GameMap): GameMap {
  return {
    ...map,
    bounds: transposeBox(map.bounds),
    obstacles: map.obstacles.map(transposeObstacle),
    spawns: map.spawns.map((spawn) => ({ ...spawn, position: transposePoint(spawn.position) })),
  };
}

export function transposeResult(result: TraceResult): TraceResult {
  return {
    ...result,
    polyline: result.polyline.map(transposePoint),
    hits: result.hits.map((hit) => ({ ...hit, at: transposePoint(hit.at) })),
    stop: transposeStop(result.stop),
  };
}

function transposeStop(stop: TraceResult['stop']): TraceResult['stop'] {
  const at = transposePoint(stop.at);
  switch (stop.kind) {
    case 'domain-exit':
    case 'discontinuity':
      // `x` on these is the value of the *variable* the shot is a function of,
      // which the turn has not changed — only the point it maps to.
      return { ...stop, at };
    default:
      return { ...stop, at };
  }
}
