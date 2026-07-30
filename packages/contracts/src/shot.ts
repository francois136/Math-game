import { z } from 'zod';
import { ObstacleIdSchema, PlayerIdSchema } from './ids.js';
import { Vec2Schema } from './geometry.js';
import { MAX_SOURCE_LENGTH } from './limits.js';

/** Which way the curve is walked from the player's origin. */
export const DirectionSchema = z.enum(['increasing', 'decreasing']);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * What a player submits. The curve actually drawn is
 *
 *     y = y₀ + f(x − x₀) − f(0)
 *
 * so it always passes through the player's origin whatever `f(0)` is.
 */
export const ShotRequestSchema = z.object({
  source: z.string().min(1).max(MAX_SOURCE_LENGTH),
  direction: DirectionSchema,
});
export type ShotRequest = z.infer<typeof ShotRequestSchema>;

/** Why the trace stopped. Exactly one of these ends every shot. */
export const StopReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('obstacle'), obstacleId: ObstacleIdSchema, at: Vec2Schema }),
  z.object({ kind: z.literal('map-edge'), at: Vec2Schema }),
  z.object({ kind: z.literal('domain-exit'), at: Vec2Schema, x: z.number() }),
  z.object({ kind: z.literal('discontinuity'), at: Vec2Schema, x: z.number() }),
  z.object({ kind: z.literal('player-hit'), playerId: PlayerIdSchema, at: Vec2Schema }),
  z.object({ kind: z.literal('arc-limit'), at: Vec2Schema }),
  z.object({ kind: z.literal('step-limit'), at: Vec2Schema }),
]);
export type StopReason = z.infer<typeof StopReasonSchema>;

export const HitSchema = z.object({
  playerId: PlayerIdSchema,
  at: Vec2Schema,
  /** False when a shield or a friendly-fire rule absorbed the hit. */
  lethal: z.boolean(),
  /** Present when the hit was absorbed, so the client can say why. */
  absorbedBy: z.enum(['shield', 'friendly-fire', 'self-immunity']).nullable(),
});
export type Hit = z.infer<typeof HitSchema>;

/**
 * The full outcome of one shot. Deterministic: same map, same rules, same
 * source string, same result — no timing, no wall clock, nothing ambient.
 */
export const TraceResultSchema = z.object({
  /** Polyline in world coordinates, starting at the player's origin. */
  polyline: z.array(Vec2Schema).min(1).max(20000),
  stop: StopReasonSchema,
  hits: z.array(HitSchema),
  /** Integration steps actually taken — a performance signal, not a game rule. */
  steps: z.number().int().nonnegative(),
  /** Total arc length travelled, used by the self-immunity rule. */
  arcLength: z.number().nonnegative(),
});
export type TraceResult = z.infer<typeof TraceResultSchema>;
