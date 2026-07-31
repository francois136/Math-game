import type { Aabb, Axis, Direction, Vec2 } from '@fw/contracts';
import { evaluate, parse } from '@fw/core-math';

/**
 * The curve the player is typing, before they fire it.
 *
 * This is the one thing the client computes for itself (ADR 0006), and its
 * limits are the point: it evaluates the function and stops at the edge of the
 * map, and it knows nothing about obstacles, hitboxes or collisions. It cannot
 * tell you where your shot will stop, only what shape you are drawing.
 *
 * Evaluating a function is not a decision about the game. Deciding who dies is.
 */

/** Samples across the visible width. Enough to look smooth, cheap enough to run per keystroke. */
const SAMPLES = 400;

export interface PreviewRequest {
  readonly source: string;
  readonly origin: Vec2;
  /** `x` draws `y = f(x)`, `y` draws `x = f(y)` (ADR 0013). */
  readonly axis: Axis;
  readonly direction: Direction;
  readonly bounds: Aabb;
}

export type Preview =
  | { readonly kind: 'off' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'curve'; readonly points: readonly Vec2[] };

/**
 * Sample the curve, or say why there is nothing to draw.
 *
 * `enabled` is a first-class argument rather than a caller's `if`: the switch
 * in the interface and the shape of this function are the same decision, and
 * splitting them is how one of them ends up out of date.
 */
export function preview(request: PreviewRequest, enabled: boolean): Preview {
  if (!enabled) return { kind: 'off' };
  if (request.source.trim() === '') return { kind: 'empty' };

  const parsed = parse(request.source, request.axis);
  if (!parsed.ok) return { kind: 'invalid', message: parsed.error.message };

  const atZero = evaluate(parsed.value.ast, 0);
  if (!atZero.defined) {
    return {
      kind: 'invalid',
      message: 'La fonction n’a pas de valeur à ton point de départ.',
    };
  }

  // Along `x` the walk is in x and the value is a y; along `y`, the other way
  // round. Naming them `along` and `across` keeps the two cases one piece of
  // code instead of two.
  const along = request.axis === 'x' ? 'x' : ('y' as const);
  const across = request.axis === 'x' ? 'y' : ('x' as const);
  const sign = request.direction === 'increasing' ? 1 : -1;
  const reach =
    sign === 1
      ? request.bounds.max[along] - request.origin[along]
      : request.origin[along] - request.bounds.min[along];

  const points: Vec2[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const u = sign * (i / SAMPLES) * Math.max(reach, 0);
    const value = evaluate(parsed.value.ast, u);
    if (!value.defined) break; // out of domain: the drawing stops, like the shot would

    const point =
      along === 'x'
        ? { x: request.origin.x + u, y: request.origin.y + value.value - atZero.value }
        : { x: request.origin.x + value.value - atZero.value, y: request.origin.y + u };

    // Off the side of the field: keep the point that leaves, drop the rest.
    if (point[across] < request.bounds.min[across] || point[across] > request.bounds.max[across]) {
      points.push(point);
      break;
    }
    points.push(point);
  }

  return { kind: 'curve', points };
}
