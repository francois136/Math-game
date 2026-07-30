import {
  createRng,
  err,
  fwError,
  ObstacleIdSchema,
  ok,
  type Aabb,
  type FwError,
  type GameMap,
  type MapParams,
  type MapValidation,
  type Obstacle,
  type Result,
  type Rng,
  type Seed,
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

/**
 * Bumped whenever the generator's output changes shape for a given seed.
 * Recorded on every map so that an old replay keeps the map it was played on.
 */
export const GENERATOR_VERSION = 1;

/** How many points each candidate sight line is sampled at. */
const SIGHT_LINE_RESOLUTION = 64;

/**
 * Two families of curves, and the map has to sit between them.
 *
 * TRIVIAL — the straight line and barely-bent arcs, ±5 % of the map's height.
 * This is what a player types in their first thirty seconds. None of it may
 * connect two players: that is the anti-first-turn-kill rule.
 *
 * REACHABLE — arcs up to a full map height either way. At least one of these
 * must connect every pair, or the map is thrown away.
 *
 * The second family is not decoration. Sealing the first one too enthusiastically
 * seals reachability along with it — measured, it took the hit rate of a
 * determined player from eleven percent to under one, with a third of maps where
 * nobody could ever hit anybody. See docs/adr/0011.
 */
const TRIVIAL_SAGITTA_FRACTION = 0.05;
const REACHABLE_SAGITTA_FRACTION = 1;
const REACHABLE_SAMPLES = 41;

/** Attempts at placing one obstacle or one spawn before giving up on the map. */
const PLACEMENT_ATTEMPTS = 200;

/** Blockers the sealing pass may add before it declares the layout hopeless. */
const MAX_SEALING_ROUNDS = 240;

/**
 * Share of the coverage budget the decorative scatter may spend.
 *
 * The rest is reserved for the sealing pass. Letting the scatter fill the map
 * first leaves nothing to close sight lines with, and at eight players — where
 * twenty-eight pairs need closing — the generator then fails outright.
 */
const SCATTER_BUDGET_SHARE = 0.35;

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
    const obstacles = sealSightLines(rng, params, spawns, scattered);

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
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const budget = width * height * params.maxCoverage * SCATTER_BUDGET_SHARE;

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
 * Spawn points, by rejection sampling.
 *
 * Returns null rather than relaxing a constraint when it cannot satisfy them
 * all: a crowded map is the caller's problem to retry with another attempt, not
 * something to paper over by moving two players closer than the rules allow.
 */
function placeSpawns(rng: Rng, params: MapParams): SpawnPoint[] | null {
  const { bounds, spawnClearance, spawnMinDistance } = params;
  const spawns: SpawnPoint[] = [];

  for (let index = 0; index < params.spawnCount; index += 1) {
    let placed = false;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && !placed; attempt += 1) {
      const position: Vec2 = {
        x: rng.nextRange(bounds.min.x + spawnClearance, bounds.max.x - spawnClearance),
        y: rng.nextRange(bounds.min.y + spawnClearance, bounds.max.y - spawnClearance),
      };

      if (spawns.some((s) => distance(s.position, position) < spawnMinDistance)) continue;

      spawns.push({ index, position });
      placed = true;
    }

    if (!placed) return null;
  }

  return spawns;
}

/**
 * Close every remaining sight line by putting something in the way.
 *
 * Scattering obstacles at random and hoping no simple curve survives does not
 * work: between two points twenty-five units apart, a dozen random shapes
 * almost never block all two dozen parabolas at once, and the generator would
 * spend two hundred attempts to find out.
 *
 * So the pass is constructive. Find a pair that is still exposed, find the
 * curve that exposes it, and drop a disc onto that curve. Repeat: each round
 * removes at least one line.
 *
 * Where the disc lands matters more than it looks. Near an endpoint the whole
 * family of curves is still bunched together, so one disc closes many at once —
 * which is why the first version put them there. It also walls the player in:
 * every shot they fire dies within a few units, whatever they write. Blockers
 * therefore land in the middle third, further from anyone's field of fire. It
 * costs more discs and the field is busier, but the map stays playable, which
 * is the whole point of the rule.
 */
function sealSightLines(
  rng: Rng,
  params: MapParams,
  spawns: SpawnPoint[],
  scattered: Obstacle[],
): Obstacle[] {
  const obstacles = [...scattered];
  // Per pair, the last arc known to get through. Trying it first turns the
  // reachability check from a family scan into a single curve, almost always.
  const reachable = new Map<string, number>();
  const area =
    (params.bounds.max.x - params.bounds.min.x) * (params.bounds.max.y - params.bounds.min.y);
  const budget = area * params.maxCoverage;
  let used = obstacles.reduce((sum, o) => sum + obstacleArea(o), 0);

  for (let round = 0; round < MAX_SEALING_ROUNDS; round += 1) {
    const opening = findOpening(spawns, obstacles, params);
    if (opening === null) return obstacles;

    const blocker = placeBlocker(rng, params, spawns, opening, obstacles, reachable);
    if (blocker === null) return obstacles;

    const blockerArea = obstacleArea(blocker);
    if (used + blockerArea > budget) return obstacles;

    obstacles.push(blocker);
    used += blockerArea;
  }

  return obstacles;
}

interface Opening {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly sagitta: number;
}

function findOpening(
  spawns: SpawnPoint[],
  obstacles: Obstacle[],
  params: MapParams,
): Opening | null {
  for (let i = 0; i < spawns.length; i += 1) {
    for (let j = i + 1; j < spawns.length; j += 1) {
      const a = spawns[i];
      const b = spawns[j];
      if (a === undefined || b === undefined) continue;
      if (Math.abs(a.position.x - b.position.x) < 1e-9) continue;

      const sagitta = firstClearSagitta(
        a.position,
        b.position,
        params.bounds,
        obstacles,
        TRIVIAL_SAGITTA_FRACTION,
        params.sightLineSamples,
      );
      if (sagitta !== null) return { a: a.position, b: b.position, sagitta };
    }
  }
  return null;
}

/**
 * Drop a disc onto the open curve — without closing the map.
 *
 * `t` is kept away from both endpoints so that no player ends up boxed in, and
 * never inside a spawn's clearance. The candidate is then tried on for size:
 * if adding it would leave any pair with no way through at all, it is rejected
 * and another position is tried. Sealing that fights reachability is how the
 * first version produced maps nobody could win (ADR 0011).
 */
function placeBlocker(
  rng: Rng,
  params: MapParams,
  spawns: SpawnPoint[],
  opening: Opening,
  obstacles: readonly Obstacle[],
  reachable: Map<string, number>,
): Obstacle | null {
  const index = obstacles.length + 1;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
    // Middle third: far enough from both players to leave them room to shoot.
    const t =
      attempt < PLACEMENT_ATTEMPTS / 2 ? rng.nextRange(0.35, 0.65) : rng.nextRange(0.2, 0.8);
    const center = curvePoint(opening.a, opening.b, opening.sagitta, t);
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
    if (!everyPairStillReachable(spawns, [...obstacles, candidate], params.bounds, reachable)) {
      continue;
    }
    return candidate;
  }
  return null;
}

/** Does every pair keep at least one arc that gets through? */
function everyPairStillReachable(
  spawns: SpawnPoint[],
  obstacles: readonly Obstacle[],
  bounds: Aabb,
  reachable: Map<string, number>,
): boolean {
  for (let i = 0; i < spawns.length; i += 1) {
    for (let j = i + 1; j < spawns.length; j += 1) {
      const a = spawns[i];
      const b = spawns[j];
      if (a === undefined || b === undefined) continue;
      if (Math.abs(a.position.x - b.position.x) < 1e-9) continue;

      const key = `${String(i)}-${String(j)}`;
      const remembered = reachable.get(key);
      if (
        remembered !== undefined &&
        curveIsClear(a.position, b.position, remembered, bounds, obstacles)
      ) {
        continue;
      }

      const found = firstClearSagitta(
        a.position,
        b.position,
        bounds,
        obstacles,
        REACHABLE_SAGITTA_FRACTION,
        REACHABLE_SAMPLES,
      );
      if (found === null) return false;
      reachable.set(key, found);
    }
  }
  return true;
}

function curvePoint(a: Vec2, b: Vec2, sagitta: number, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t + sagitta * 4 * t * (1 - t),
  };
}

/**
 * The same checks for a generated map and for one written by hand in JSON.
 *
 * The sight-line rule is the important one, and it is the one garde-fou that
 * works on the cause rather than the symptom: if no simple curve joins two
 * players, no one wins on the first turn by typing `x`.
 */
export function validate(map: GameMap, params: MapParams): MapValidation {
  const area = (map.bounds.max.x - map.bounds.min.x) * (map.bounds.max.y - map.bounds.min.y);
  const coverage = map.obstacles.reduce((sum, o) => sum + obstacleArea(o), 0) / area;

  const shapesAreSound = map.obstacles.every(
    (o) => o.kind !== 'polygon' || isConvexCounterClockwise(o.vertices),
  );

  const spacingIsSound = map.spawns.every((spawn, i) => {
    if (map.obstacles.some((o) => distanceToObstacle(spawn.position, o) < params.spawnClearance)) {
      return false;
    }
    return map.spawns.every(
      (other, j) => i === j || distance(spawn.position, other.position) >= params.spawnMinDistance,
    );
  });

  const exposedPairs: [number, number][] = [];
  const unreachablePairs: [number, number][] = [];
  for (let i = 0; i < map.spawns.length; i += 1) {
    for (let j = i + 1; j < map.spawns.length; j += 1) {
      const a = map.spawns[i];
      const b = map.spawns[j];
      if (a === undefined || b === undefined) continue;
      if (isExposed(a.position, b.position, map, params)) exposedPairs.push([i, j]);
      else if (!isReachable(a.position, b.position, map)) unreachablePairs.push([i, j]);
    }
  }

  return {
    ok:
      exposedPairs.length === 0 &&
      unreachablePairs.length === 0 &&
      coverage <= params.maxCoverage &&
      shapesAreSound &&
      spacingIsSound,
    exposedPairs,
    unreachablePairs,
    coverage,
  };
}

/**
 * Is there a simple curve from `a` to `b` with nothing in the way?
 *
 * The family sampled is the straight line and the parabolas through both
 * points, from a deep sag to a high arc. It is not every function a player
 * could type — nothing could be — but it is what a player finds in their first
 * thirty seconds, which is exactly what the rule is there to prevent.
 */
function isExposed(a: Vec2, b: Vec2, map: GameMap, params: MapParams): boolean {
  // A curve is a function of x: two players on the same vertical are already
  // unreachable, whatever the obstacles do.
  if (Math.abs(a.x - b.x) < 1e-9) return false;

  return (
    firstClearSagitta(
      a,
      b,
      map.bounds,
      map.obstacles,
      TRIVIAL_SAGITTA_FRACTION,
      params.sightLineSamples,
    ) !== null
  );
}

/** Can any curve of the wide family get from `a` to `b`? */
function isReachable(a: Vec2, b: Vec2, map: GameMap): boolean {
  if (Math.abs(a.x - b.x) < 1e-9) return false;
  return (
    firstClearSagitta(
      a,
      b,
      map.bounds,
      map.obstacles,
      REACHABLE_SAGITTA_FRACTION,
      REACHABLE_SAMPLES,
    ) !== null
  );
}

/** The first unobstructed arc of a family, or null if the family is sealed. */
function firstClearSagitta(
  a: Vec2,
  b: Vec2,
  bounds: Aabb,
  obstacles: readonly Obstacle[],
  fraction: number,
  samples: number,
): number | null {
  const span = (bounds.max.y - bounds.min.y) * fraction * 2;
  for (let s = 0; s < samples; s += 1) {
    const sagitta = samples === 1 ? 0 : -span / 2 + (s * span) / (samples - 1);
    if (curveIsClear(a, b, sagitta, bounds, obstacles)) return sagitta;
  }
  return null;
}

/** Does this parabola get from `a` to `b` without meeting anything? */
function curveIsClear(
  a: Vec2,
  b: Vec2,
  sagitta: number,
  bounds: Aabb,
  obstacles: readonly Obstacle[],
): boolean {
  let previous = a;

  for (let i = 1; i <= SIGHT_LINE_RESOLUTION; i += 1) {
    const point = curvePoint(a, b, sagitta, i / SIGHT_LINE_RESOLUTION);
    if (!insideBounds(point, bounds)) return false;
    if (obstacles.some((o) => segmentObstacle(previous, point, o) !== null)) return false;
    previous = point;
  }

  return true;
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
