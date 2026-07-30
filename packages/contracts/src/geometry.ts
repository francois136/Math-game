import { z } from 'zod';
import { ObstacleIdSchema } from './ids.js';
import { MAX_PLAYERS } from './limits.js';

/** Game-world coordinates, in abstract units. The client maps them to pixels. */
export const Vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

/** Axis-aligned bounding box, `min` strictly below-left of `max`. */
export const AabbSchema = z
  .object({ min: Vec2Schema, max: Vec2Schema })
  .refine((b) => b.min.x < b.max.x && b.min.y < b.max.y, {
    message: 'AABB dégénérée : min doit être strictement inférieur à max',
  });
export type Aabb = z.infer<typeof AabbSchema>;

export const RectObstacleSchema = z.object({
  kind: z.literal('rect'),
  id: ObstacleIdSchema,
  box: AabbSchema,
});
export type RectObstacle = z.infer<typeof RectObstacleSchema>;

export const DiscObstacleSchema = z.object({
  kind: z.literal('disc'),
  id: ObstacleIdSchema,
  center: Vec2Schema,
  radius: z.number().positive(),
});
export type DiscObstacle = z.infer<typeof DiscObstacleSchema>;

/**
 * Convex polygon, vertices in counter-clockwise order. Convexity is a contract,
 * not a suggestion: the collision code relies on it. @fw/physics validates it
 * when a map is loaded and rejects the map otherwise.
 */
export const PolygonObstacleSchema = z.object({
  kind: z.literal('polygon'),
  id: ObstacleIdSchema,
  vertices: z.array(Vec2Schema).min(3).max(16),
});
export type PolygonObstacle = z.infer<typeof PolygonObstacleSchema>;

export const ObstacleSchema = z.discriminatedUnion('kind', [
  RectObstacleSchema,
  DiscObstacleSchema,
  PolygonObstacleSchema,
]);
export type Obstacle = z.infer<typeof ObstacleSchema>;

/** A seat on the map. Which player takes which slot is a rules decision. */
export const SpawnPointSchema = z.object({
  index: z.number().int().nonnegative(),
  position: Vec2Schema,
});
export type SpawnPoint = z.infer<typeof SpawnPointSchema>;

/**
 * A playable map. Fully described by its `seed` and `generatorVersion` when
 * procedurally generated; hand-authored maps carry `seed: null`.
 */
export const GameMapSchema = z.object({
  name: z.string().min(1).max(64),
  bounds: AabbSchema,
  obstacles: z.array(ObstacleSchema).max(128),
  spawns: z.array(SpawnPointSchema).min(2).max(MAX_PLAYERS),
  seed: z.string().max(64).nullable(),
  /** Bumped whenever the generator changes shape; old replays keep their maps. */
  generatorVersion: z.number().int().nonnegative(),
});
export type GameMap = z.infer<typeof GameMapSchema>;
