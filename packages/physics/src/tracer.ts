import type { Hit, ObstacleId, StopReason, TraceInput, TraceResult, Vec2 } from '@fw/contracts';
import {
  boundsExit,
  distance,
  insideBounds,
  lerp,
  segmentDisc,
  segmentObstacle,
} from './geometry.js';
import { transposeMap, transposePoint, transposeResult } from './transpose.js';

/**
 * Walk the curve until it stops.
 *
 * The curve drawn is `y = y₀ + f(x − x₀) − f(0)`: the player's function
 * translated to pass through their own point, whatever `f(0)` happens to be.
 * `u` below is that `x − x₀`, walked from 0 in the chosen direction.
 *
 * A shot along `y` is the same walk on a transposed world (ADR 0013): turn the
 * field a quarter turn, trace, turn the answer back. There is no second tracer.
 *
 * Pure and deterministic. Same input, same polyline, to the last coordinate —
 * which is what makes a replay a replay and a contested elimination checkable.
 */
export function trace(input: TraceInput): TraceResult {
  if (input.axis === 'y') {
    return transposeResult(
      traceAlongX({
        ...input,
        axis: 'x',
        origin: transposePoint(input.origin),
        map: transposeMap(input.map),
        targets: input.targets.map((target) => ({
          ...target,
          center: transposePoint(target.center),
        })),
      }),
    );
  }
  return traceAlongX(input);
}

function traceAlongX(input: TraceInput): TraceResult {
  const { expression, evaluator, origin, params, pierce } = input;
  const sign = input.direction === 'increasing' ? 1 : -1;

  let evaluations = 0;
  const valueAt = (u: number): number | null => {
    evaluations += 1;
    const outcome = evaluator.evaluate(expression.ast, u);
    return outcome.defined ? outcome.value : null;
  };

  const zero = valueAt(0);
  if (zero === null) {
    // The rules engine refuses this before firing; a direct caller might not.
    return {
      polyline: [origin],
      stop: { kind: 'domain-exit', at: origin, x: origin.x },
      hits: [],
      steps: 0,
      arcLength: 0,
    };
  }

  const pointAt = (u: number): Vec2 | null => {
    const y = valueAt(u);
    return y === null ? null : { x: origin.x + u, y: origin.y + y - zero };
  };

  const polyline: Vec2[] = [origin];
  const hits: Hit[] = [];
  const alreadyHit = new Set<string>();

  let current = origin;
  let u = 0;
  let step = params.baseStep;
  let arcLength = 0;
  let steps = 0;

  const finish = (stop: StopReason): TraceResult => ({
    polyline,
    stop,
    hits,
    steps,
    arcLength,
  });

  while (steps < params.maxSteps) {
    if (evaluations >= params.maxEvaluations) return finish({ kind: 'step-limit', at: current });
    if (arcLength >= params.maxArcLength) return finish({ kind: 'arc-limit', at: current });

    const nextU = u + sign * step;
    const candidate = pointAt(nextU);

    if (candidate === null) {
      // The function stops being defined somewhere in (u, nextU). Walk up to
      // the last point that still has a value, so the curve ends on the
      // asymptote rather than short of it.
      const edge = lastDefinedPoint(pointAt, u, nextU, params.minStep);
      if (edge !== null) {
        polyline.push(edge.point);
        arcLength += distance(current, edge.point);
        steps += 1;
        return finish({ kind: 'domain-exit', at: edge.point, x: edge.point.x });
      }
      return finish({ kind: 'domain-exit', at: current, x: current.x });
    }

    const rise = Math.abs(candidate.y - current.y);
    if (rise > params.maxSegmentRise && step > params.minStep) {
      step = Math.max(step / 2, params.minStep);
      continue;
    }

    const outcome = firstEvent(input, current, candidate, arcLength, alreadyHit);

    if (outcome?.kind === 'obstacle') {
      const at = lerp(current, candidate, outcome.t);
      polyline.push(at);
      arcLength += distance(current, at);
      steps += 1;
      return finish({ kind: 'obstacle', obstacleId: outcome.obstacleId, at });
    }

    if (outcome?.kind === 'edge') {
      const at = lerp(current, candidate, outcome.t);
      polyline.push(at);
      arcLength += distance(current, at);
      steps += 1;
      return finish({ kind: 'map-edge', at });
    }

    if (outcome?.kind === 'players') {
      for (const player of outcome.players) {
        const at = lerp(current, candidate, player.t);
        hits.push({
          playerId: player.playerId,
          at,
          lethal: player.lethal,
          absorbedBy: player.absorbedBy,
        });
        alreadyHit.add(player.playerId);
        if (player.lethal && !pierce) {
          polyline.push(at);
          arcLength += distance(current, at);
          steps += 1;
          return finish({ kind: 'player-hit', playerId: player.playerId, at });
        }
      }
    }

    // A jump the continuity check could not see — a branch narrower than its
    // scan — with both ends still on the map. The step cannot shrink further,
    // so the curve genuinely breaks here.
    if (rise > params.maxSegmentRise && step <= params.minStep) {
      return finish({ kind: 'discontinuity', at: current, x: current.x });
    }

    polyline.push(candidate);
    const segment = distance(current, candidate);
    arcLength += segment;
    current = candidate;
    u = nextU;
    steps += 1;

    // Aim for segments of roughly the target length: fine where the curve
    // turns, coarse where it is flat, and never outside [minStep, maxStep].
    const ratio = segment > 1e-9 ? params.targetSegmentLength / segment : 2;
    step = Math.min(
      params.maxStep,
      Math.max(params.minStep, step * Math.min(2, Math.max(0.5, ratio))),
    );
  }

  return finish({ kind: 'step-limit', at: current });
}

type Event =
  | { kind: 'obstacle'; t: number; obstacleId: ObstacleId }
  | { kind: 'edge'; t: number }
  | {
      kind: 'players';
      players: {
        t: number;
        playerId: Hit['playerId'];
        lethal: boolean;
        absorbedBy: Hit['absorbedBy'];
      }[];
    };

/**
 * What the segment meets first.
 *
 * Order matters and is decided by distance along the segment, not by category:
 * a curve that grazes a player and then buries itself in a wall kills; the same
 * curve entering the wall first does not.
 *
 * Non-lethal hits — a shield, a team-mate — do not stop anything, so they are
 * returned together with any lethal hit that follows them.
 */
function firstEvent(
  input: TraceInput,
  a: Vec2,
  b: Vec2,
  arcLength: number,
  alreadyHit: ReadonlySet<string>,
): Event | null {
  let blocker: { t: number; obstacleId: ObstacleId } | null = null;
  for (const obstacle of input.map.obstacles) {
    const t = segmentObstacle(a, b, obstacle);
    if (t === null) continue;
    if (blocker === null || t < blocker.t) blocker = { t, obstacleId: obstacle.id };
  }

  const edgeT = insideBounds(b, input.map.bounds) ? null : boundsExit(a, b, input.map.bounds);

  const players: Extract<Event, { kind: 'players' }>['players'] = [];
  for (const target of input.targets) {
    if (alreadyHit.has(target.playerId)) continue;
    const t = segmentDisc(a, b, target.center, target.radius);
    if (t === null) continue;
    // The shooter's own immunity, and any other arc-based grace, is measured in
    // distance travelled — which is why a curve that comes back round can kill
    // the player who fired it.
    if (arcLength + distance(a, lerp(a, b, t)) < target.immuneUntilArc) continue;

    players.push({
      t,
      playerId: target.playerId,
      lethal: target.vulnerability === 'lethal',
      absorbedBy: target.vulnerability === 'lethal' ? null : target.vulnerability,
    });
  }
  players.sort((p, q) => p.t - q.t);

  const firstLethal = players.find((p) => p.lethal);
  const candidates: { t: number; event: Event }[] = [];
  if (blocker !== null) {
    candidates.push({ t: blocker.t, event: { kind: 'obstacle', ...blocker } });
  }
  if (edgeT !== null) candidates.push({ t: edgeT, event: { kind: 'edge', t: edgeT } });
  if (firstLethal !== undefined) {
    candidates.push({ t: firstLethal.t, event: { kind: 'players', players } });
  }

  if (candidates.length === 0) {
    return players.length > 0 ? { kind: 'players', players } : null;
  }

  candidates.sort((p, q) => p.t - q.t);
  const winner = candidates[0];
  if (winner === undefined) return null;

  // Absorbed hits that happen before whatever stops the curve still count: the
  // shooter learns they aimed true, and the shielded player learns they are
  // being aimed at.
  if (winner.event.kind !== 'players') {
    const before = players.filter((p) => p.t <= winner.t && !p.lethal);
    if (before.length > 0) return { kind: 'players', players: before };
  }
  return winner.event;
}

/**
 * The last point of (from, to) where the function still has a value.
 *
 * Bisection on "is it defined", down to `minStep`. This is what puts the end of
 * the curve on the asymptote instead of a step short of it.
 */
function lastDefinedPoint(
  pointAt: (u: number) => Vec2 | null,
  from: number,
  to: number,
  minStep: number,
): { point: Vec2; u: number } | null {
  let defined = from;
  let undefinedAt = to;
  let best: Vec2 | null = null;

  for (let i = 0; i < 60 && Math.abs(undefinedAt - defined) > minStep / 16; i += 1) {
    const middle = (defined + undefinedAt) / 2;
    const point = pointAt(middle);
    if (point === null) undefinedAt = middle;
    else {
      defined = middle;
      best = point;
    }
  }
  return best === null ? null : { point: best, u: defined };
}
