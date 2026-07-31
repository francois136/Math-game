import {
  TRIVIAL_CURVE_FRACTION,
  createRng,
  err,
  fwError,
  ObstacleIdSchema,
  ok,
  type Aabb,
  type Axis,
  type Difficulty,
  type FwError,
  type GameMap,
  type MapParams,
  type MapValidation,
  type Obstacle,
  type Result,
  type Rng,
  type Seed,
  type SpawnPair,
  type SpawnPoint,
  type Vec2,
} from '@fw/contracts';
import {
  distance,
  distanceToObstacle,
  insideBounds,
  isConvexCounterClockwise,
  obstacleArea,
  segmentObstacle,
} from './geometry.js';
import { reachableByAnySweep } from './connectivity.js';

/**
 * Bumped whenever the generator's output changes shape for a given seed.
 * Recorded on every map so that an old replay keeps the map it was played on.
 */
export const GENERATOR_VERSION = 2;

/** How many points each candidate curve is sampled at. */
const CURVE_RESOLUTION = 64;

/** Attempts at placing one obstacle or one spawn before giving up on the map. */
const PLACEMENT_ATTEMPTS = 200;

/**
 * Attempts at placing a *blocker*, each of which costs a full check that the
 * map is still crossable. Far fewer than the above, and deliberately so.
 */
const BLOCKER_ATTEMPTS = 16;

/** Blockers the sealing pass may add before it declares the layout hopeless. */
const MAX_SEALING_ROUNDS = 240;

/**
 * Share of the coverage budget the decorative scatter may spend.
 *
 * The rest is reserved for the sealing pass. Letting the scatter fill the map
 * first leaves nothing to close sight lines with, and at four players the
 * generator then fails outright.
 */
const SCATTER_BUDGET_SHARE = 0.35;

/**
 * Two families of curves, and the map has to sit between them.
 *
 * TRIVIAL — the straight line and barely-bent arcs. This is what a player types
 * in their first thirty seconds. None of it may connect two players, at any
 * difficulty: that rule is not a setting.
 *
 * WIDE — arcs up to a full map height either way. Whether one of these must get
 * through, may get through, or must not, is exactly what the difficulty says
 * (ADR 0014).
 */
const WIDE_SAGITTA_FRACTION = 1;
const WIDE_SAMPLES = 41;

/**
 * A map, from a seed.
 *
 * Deterministic: same seed and same params, same map, down to the last
 * coordinate. Each attempt draws from its own stream, so a rejected map does
 * not shift the next one's numbers.
 */
export function generate(seed: Seed, params: MapParams): Result<GameMap, FwError> {
  const root = createRng(seed).fork('map');

  for (let attempt = 0; attempt < params.maxGenerationAttempts; attempt += 1) {
    const rng = root.fork(`attempt-${String(attempt)}`);
    const spawns = placeSpawns(rng, params);
    if (spawns === null) continue;

    const scattered = scatterObstacles(rng, params, spawns);
    const obstacles = seal(rng, params, spawns, scattered);

    const map: GameMap = {
      name: 'Terrain généré',
      bounds: params.bounds,
      obstacles,
      spawns,
      seed,
      generatorVersion: GENERATOR_VERSION,
    };

    if (validate(map, params).ok) return ok(map);
  }

  return err(fwError('ERR_MAP_GENERATION_FAILED', { attempts: params.maxGenerationAttempts }));
}

/** The decorative pass: a scatter of cover that owes nothing to the players. */
function scatterObstacles(rng: Rng, params: MapParams, spawns: SpawnPoint[]): Obstacle[] {
  const { bounds } = params;
  const budget =
    (bounds.max.x - bounds.min.x) *
    (bounds.max.y - bounds.min.y) *
    params.maxCoverage *
    SCATTER_BUDGET_SHARE;

  const wanted = rng.nextInt(params.obstacleCount.min, params.obstacleCount.max + 1);
  const obstacles: Obstacle[] = [];
  let used = 0;

  for (let i = 0; i < wanted; i += 1) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
      const candidate = randomObstacle(rng, params, obstacles.length + 1);
      const area = obstacleArea(candidate);
      if (used + area > budget) continue;
      if (obstacles.some((other) => overlaps(boundingBox(candidate), boundingBox(other)))) continue;
      if (spawns.some((s) => distanceToObstacle(s.position, candidate) < params.spawnClearance)) {
        continue;
      }

      obstacles.push(candidate);
      used += area;
      break;
    }
  }

  return obstacles;
}

function randomObstacle(rng: Rng, params: MapParams, index: number): Obstacle {
  const { bounds } = params;
  const id = ObstacleIdSchema.parse(`obstacle-${String(index)}`);

  if (rng.nextFloat() < 0.5) {
    const w = rng.nextRange(4, 16);
    const h = rng.nextRange(3, 12);
    const x = rng.nextRange(bounds.min.x, bounds.max.x - w);
    const y = rng.nextRange(bounds.min.y, bounds.max.y - h);
    return { kind: 'rect', id, box: { min: { x, y }, max: { x: x + w, y: y + h } } };
  }

  const radius = rng.nextRange(2, 7);
  return {
    kind: 'disc',
    id,
    center: {
      x: rng.nextRange(bounds.min.x + radius, bounds.max.x - radius),
      y: rng.nextRange(bounds.min.y + radius, bounds.max.y - radius),
    },
    radius,
  };
}

/**
 * How far apart two seats have to stand, in world units.
 *
 * Team-mates may share a corner; enemies may not. A duel decided by who started
 * nearer is not a duel (ADR 0014).
 *
 * Both distances are absolute, and the board is what changes with the seat
 * count (`sizedForSeats`). Eight enemies 45 units apart do not fit on the
 * two-player field and no amount of retrying will make them; on the field eight
 * players actually get, they fit with room to spare (ADR 0015).
 */
export function requiredSeparation(params: MapParams, i: number, j: number): number {
  const a = params.spawnTeams[i] ?? null;
  const b = params.spawnTeams[j] ?? null;
  const sameSide = a !== null && a === b;
  return sameSide
    ? params.spawnMinDistanceAllies
    : Math.max(params.spawnMinDistanceAllies, params.spawnMinDistanceEnemies);
}

/**
 * Spawn points, by rejection sampling.
 *
 * Returns null rather than relaxing a constraint when it cannot satisfy them
 * all: a crowded map is the caller's problem to retry with another attempt, not
 * something to paper over by moving two enemies closer than the rules allow.
 */
function placeSpawns(rng: Rng, params: MapParams): SpawnPoint[] | null {
  const { bounds, spawnClearance } = params;
  const spawns: SpawnPoint[] = [];

  for (let index = 0; index < params.spawnCount; index += 1) {
    let placed = false;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && !placed; attempt += 1) {
      const position: Vec2 = {
        x: rng.nextRange(bounds.min.x + spawnClearance, bounds.max.x - spawnClearance),
        y: rng.nextRange(bounds.min.y + spawnClearance, bounds.max.y - spawnClearance),
      };

      const tooClose = spawns.some(
        (seated) =>
          distance(seated.position, position) < requiredSeparation(params, seated.index, index),
      );
      if (tooClose) continue;

      spawns.push({ index, position });
      placed = true;
    }

    if (!placed) return null;
  }

  return spawns;
}

// — Curves, in both orientations ————————————————————————————————

interface Candidate {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly axis: Axis;
  readonly sagitta: number;
}

/**
 * A point of the parabola from `a` to `b` that bulges by `sagitta` at its
 * middle. Along `y`, the same shape read with the coordinates swapped — which
 * is exactly what a shot along `y` draws (ADR 0013).
 */
function curvePoint(candidate: Candidate, t: number): Vec2 {
  const { a, b, sagitta, axis } = candidate;
  const bulge = sagitta * 4 * t * (1 - t);
  return axis === 'x'
    ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + bulge }
    : { x: a.x + (b.x - a.x) * t + bulge, y: a.y + (b.y - a.y) * t };
}

/** Is this curve a function of its axis at all, and does it get through? */
function curveIsClear(candidate: Candidate, bounds: Aabb, obstacles: readonly Obstacle[]): boolean {
  const spread =
    candidate.axis === 'x'
      ? Math.abs(candidate.a.x - candidate.b.x)
      : Math.abs(candidate.a.y - candidate.b.y);
  // Two points on the same vertical are joined by no function of x — but they
  // may well be joined by a function of y, which is the other orientation.
  if (spread < 1e-9) return false;

  let previous = candidate.a;
  for (let i = 1; i <= CURVE_RESOLUTION; i += 1) {
    const point = curvePoint(candidate, i / CURVE_RESOLUTION);
    if (!insideBounds(point, bounds)) return false;
    if (obstacles.some((o) => segmentObstacle(previous, point, o) !== null)) return false;
    previous = point;
  }
  return true;
}

/** The first curve of a family that gets through, or null if all are blocked. */
function firstClearCurve(
  a: Vec2,
  b: Vec2,
  bounds: Aabb,
  obstacles: readonly Obstacle[],
  halfSpan: number,
  samples: number,
): Candidate | null {
  for (const axis of ['x', 'y'] as const) {
    for (let s = 0; s < samples; s += 1) {
      const sagitta = samples === 1 ? 0 : -halfSpan + (s * 2 * halfSpan) / (samples - 1);
      const candidate: Candidate = { a, b, axis, sagitta };
      if (curveIsClear(candidate, bounds, obstacles)) return candidate;
    }
  }
  return null;
}

const trivialSpan = (params: MapParams): number =>
  (params.bounds.max.y - params.bounds.min.y) * TRIVIAL_CURVE_FRACTION;

const wideSpan = (params: MapParams): number =>
  (params.bounds.max.y - params.bounds.min.y) * WIDE_SAGITTA_FRACTION;

// — Sealing ————————————————————————————————————————————————————

/**
 * Close the curves the difficulty forbids, without closing the field.
 *
 * The target family and the invariant both depend on the difficulty:
 *
 * - `facile` seals the trivial curves and keeps a wide parabola open.
 * - `moderee` seals the same, and keeps only "some continuous function gets
 *   through" — a far weaker promise, so far more fields qualify.
 * - `difficile` seals the *wide* family too, and still keeps a continuous
 *   function through. Every kill has to be invented.
 *
 * Blockers land in the middle third. Near a player they close more curves at
 * once, and wall that player in — every shot they fire dies within a few units,
 * whatever they write (ADR 0011).
 */
function seal(
  rng: Rng,
  params: MapParams,
  spawns: SpawnPoint[],
  scattered: Obstacle[],
): Obstacle[] {
  const obstacles = [...scattered];
  const area =
    (params.bounds.max.x - params.bounds.min.x) * (params.bounds.max.y - params.bounds.min.y);
  const budget = area * params.maxCoverage;
  let used = obstacles.reduce((sum, o) => sum + obstacleArea(o), 0);

  const target = params.difficulty === 'difficile' ? wideSpan(params) : trivialSpan(params);
  const samples = params.difficulty === 'difficile' ? WIDE_SAMPLES : params.sightLineSamples;

  for (let round = 0; round < MAX_SEALING_ROUNDS; round += 1) {
    const opening = findOpening(spawns, obstacles, params, target, samples);
    if (opening === null) return obstacles;

    const blocker = placeBlocker(rng, params, spawns, opening, obstacles);
    if (blocker === null) return obstacles;

    const blockerArea = obstacleArea(blocker);
    if (used + blockerArea > budget) return obstacles;

    obstacles.push(blocker);
    used += blockerArea;
  }

  return obstacles;
}

function findOpening(
  spawns: SpawnPoint[],
  obstacles: Obstacle[],
  params: MapParams,
  halfSpan: number,
  samples: number,
): Candidate | null {
  for (const [i, j] of pairsOf(spawns.length)) {
    const a = spawns[i];
    const b = spawns[j];
    if (a === undefined || b === undefined) continue;
    const open = firstClearCurve(
      a.position,
      b.position,
      params.bounds,
      obstacles,
      halfSpan,
      samples,
    );
    if (open !== null) return open;
  }
  return null;
}

function placeBlocker(
  rng: Rng,
  params: MapParams,
  spawns: SpawnPoint[],
  opening: Candidate,
  obstacles: readonly Obstacle[],
): Obstacle | null {
  const index = obstacles.length + 1;

  for (let attempt = 0; attempt < BLOCKER_ATTEMPTS; attempt += 1) {
    // Middle third: far enough from both players to leave them room to shoot.
    const t = attempt < BLOCKER_ATTEMPTS / 2 ? rng.nextRange(0.35, 0.65) : rng.nextRange(0.2, 0.8);
    const center = curvePoint(opening, t);
    const radius = rng.nextRange(2.5, 5);

    const candidate: Obstacle = {
      kind: 'disc',
      id: ObstacleIdSchema.parse(`blocker-${String(index)}-${String(attempt)}`),
      center,
      radius,
    };

    if (
      center.x - radius < params.bounds.min.x ||
      center.x + radius > params.bounds.max.x ||
      center.y - radius < params.bounds.min.y ||
      center.y + radius > params.bounds.max.y
    ) {
      continue;
    }
    if (spawns.some((s) => distanceToObstacle(s.position, candidate) < params.spawnClearance)) {
      continue;
    }
    if (!stillCrossable(spawns, [...obstacles, candidate], params)) continue;

    return candidate;
  }
  return null;
}

/** The invariant the sealing pass must not break, whichever it is. */
function stillCrossable(
  spawns: SpawnPoint[],
  obstacles: readonly Obstacle[],
  params: MapParams,
): boolean {
  return pairsOf(spawns.length).every(([i, j]) => {
    const a = spawns[i];
    const b = spawns[j];
    if (a === undefined || b === undefined) return true;

    if (params.difficulty === 'facile') {
      return (
        firstClearCurve(
          a.position,
          b.position,
          params.bounds,
          obstacles,
          wideSpan(params),
          WIDE_SAMPLES,
        ) !== null
      );
    }
    return reachableByAnySweep(
      a.position,
      b.position,
      params.bounds,
      obstacles,
      params.playerRadius,
    );
  });
}

// — Validation ————————————————————————————————————————————————

/**
 * The same checks for a generated map and for one written by hand in JSON.
 *
 * Four questions, asked separately, so that a refused map can say which of them
 * it failed rather than just "no".
 */
export function validate(map: GameMap, params: MapParams): MapValidation {
  const area = (map.bounds.max.x - map.bounds.min.x) * (map.bounds.max.y - map.bounds.min.y);
  const coverage = map.obstacles.reduce((sum, o) => sum + obstacleArea(o), 0) / area;

  const shapesAreSound = map.obstacles.every(
    (o) => o.kind !== 'polygon' || isConvexCounterClockwise(o.vertices),
  );
  const clearOfObstacles = map.spawns.every(
    (spawn) =>
      !map.obstacles.some((o) => distanceToObstacle(spawn.position, o) < params.spawnClearance),
  );

  const exposedPairs: SpawnPair[] = [];
  const unreachablePairs: SpawnPair[] = [];
  const parabolaPairs: SpawnPair[] = [];
  const tooClosePairs: SpawnPair[] = [];

  for (const [i, j] of pairsOf(map.spawns.length)) {
    const a = map.spawns[i];
    const b = map.spawns[j];
    if (a === undefined || b === undefined) continue;

    if (distance(a.position, b.position) < requiredSeparation(params, i, j)) {
      tooClosePairs.push([i, j]);
    }
    if (
      firstClearCurve(
        a.position,
        b.position,
        map.bounds,
        map.obstacles,
        trivialSpan(params),
        params.sightLineSamples,
      ) !== null
    ) {
      exposedPairs.push([i, j]);
    }
    if (
      firstClearCurve(
        a.position,
        b.position,
        map.bounds,
        map.obstacles,
        wideSpan(params),
        WIDE_SAMPLES,
      ) !== null
    ) {
      parabolaPairs.push([i, j]);
    }
    if (
      !reachableByAnySweep(a.position, b.position, map.bounds, map.obstacles, params.playerRadius)
    ) {
      unreachablePairs.push([i, j]);
    }
  }

  const everyPair = pairsOf(map.spawns.length).length;

  return {
    ok:
      exposedPairs.length === 0 &&
      tooClosePairs.length === 0 &&
      unreachablePairs.length === 0 &&
      meetsDifficulty(params.difficulty, parabolaPairs.length, everyPair) &&
      coverage <= params.maxCoverage &&
      shapesAreSound &&
      clearOfObstacles,
    exposedPairs,
    unreachablePairs,
    parabolaPairs,
    tooClosePairs,
    coverage,
  };
}

function meetsDifficulty(difficulty: Difficulty, withParabola: number, pairs: number): boolean {
  switch (difficulty) {
    case 'facile':
      return withParabola === pairs;
    case 'moderee':
      return true;
    case 'difficile':
      return withParabola === 0;
  }
}

function pairsOf(count: number): SpawnPair[] {
  const pairs: SpawnPair[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) pairs.push([i, j]);
  }
  return pairs;
}

function boundingBox(obstacle: Obstacle): Aabb {
  switch (obstacle.kind) {
    case 'rect':
      return obstacle.box;
    case 'disc':
      return {
        min: { x: obstacle.center.x - obstacle.radius, y: obstacle.center.y - obstacle.radius },
        max: { x: obstacle.center.x + obstacle.radius, y: obstacle.center.y + obstacle.radius },
      };
    case 'polygon': {
      const xs = obstacle.vertices.map((v) => v.x);
      const ys = obstacle.vertices.map((v) => v.y);
      return {
        min: { x: Math.min(...xs), y: Math.min(...ys) },
        max: { x: Math.max(...xs), y: Math.max(...ys) },
      };
    }
  }
}

function overlaps(a: Aabb, b: Aabb): boolean {
  return a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y;
}
