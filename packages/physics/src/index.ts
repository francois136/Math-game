/**
 * @fw/physics — how far a curve gets, and on what ground.
 *
 * Pure: no I/O, no DOM, no clock. Depends on @fw/contracts alone; the evaluator
 * it needs arrives in `TraceInput` (ADR 0009).
 */

import type { MapGeneratorPort, TracerPort } from '@fw/contracts';
import { trace } from './tracer.js';
import { generate, validate } from './mapgen.js';

export { trace } from './tracer.js';
export { generate, validate, requiredSeparation, GENERATOR_VERSION } from './mapgen.js';
export { reachableByAnySweep, reachableBySweep, ALL_SWEEPS } from './connectivity.js';
export type { Sweep } from './connectivity.js';
export {
  transposePoint,
  transposeBox,
  transposeObstacle,
  transposeMap,
  transposeResult,
} from './transpose.js';
export {
  segmentAabb,
  segmentDisc,
  segmentConvexPolygon,
  segmentObstacle,
  distanceToObstacle,
  insideBounds,
  boundsExit,
  obstacleArea,
  isConvexCounterClockwise,
  distance,
  lerp,
} from './geometry.js';

/** The ports this package implements, ready to drop into `RulesDeps`. */
export const tracer: TracerPort = { trace };
export const maps: MapGeneratorPort = { generate, validate };
