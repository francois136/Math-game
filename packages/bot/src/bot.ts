import {
  createRng,
  type Aabb,
  type Axis,
  type BotLevel,
  type ContinuityCheckerPort,
  type EvaluatorPort,
  type ExpressionParserPort,
  type MatchState,
  type Player,
  type PlayerId,
  type Rng,
  type ShotRequest,
  type TraceResult,
  type TracerPort,
  type Vec2,
} from '@fw/contracts';
import { targetsFor } from '@fw/rules';
import { FAMILIES, shotOf, towards } from './candidates.js';

/**
 * A bot picks a shot the only way anyone can on this field: by trying.
 *
 * It writes a function, traces it, and looks at where the curve went. Nothing
 * here computes a trajectory analytically, and nothing could — the whole point
 * of the map generator is that no simple family joins two players. A bot able
 * to solve that would be reading the map in a way no player can.
 *
 * Pure and deterministic: every draw comes from the match seed and the turn
 * index, so a replayed match replays the bot's moves too (ADR 0004).
 */

export interface BotDeps {
  readonly parser: ExpressionParserPort;
  readonly evaluator: EvaluatorPort;
  readonly continuity: ContinuityCheckerPort;
  readonly tracer: TracerPort;
}

interface Effort {
  /** Candidates drawn from scratch. */
  readonly tries: number;
  /** Extra candidates drawn around the closest miss, after those. */
  readonly refinements: number;
}

const EFFORT: Readonly<Record<BotLevel, Effort>> = Object.freeze({
  debutant: { tries: 8, refinements: 0 },
  confirme: { tries: 45, refinements: 0 },
  redoutable: { tries: 160, refinements: 60 },
});

/** Something to fire when there is nothing to aim at. Never a good shot. */
const FALLBACK: ShotRequest = Object.freeze({
  source: '0.1*x^2',
  axis: 'x',
  direction: 'increasing',
});

/** What a candidate was worth. Lower distance is better; a kill is zero. */
interface Scored {
  readonly shot: ShotRequest;
  readonly distance: number;
  readonly kills: boolean;
}

/**
 * The shot this bot fires this turn.
 *
 * Never returns null: a turn ends with something, and a bot that passed because
 * it found nothing would be a bot that stalls the match. When every candidate
 * is hopeless it fires the least hopeless one.
 */
export function chooseShot(
  state: MatchState,
  botId: PlayerId,
  level: BotLevel,
  deps: BotDeps,
): ShotRequest {
  const shooter = state.players.find((player) => player.id === botId);
  if (shooter === undefined || !shooter.alive) return FALLBACK;

  const enemies = state.players.filter(
    (player) => player.alive && player.id !== botId && isEnemy(state, shooter, player),
  );
  if (enemies.length === 0) return FALLBACK;

  const effort = EFFORT[level];
  const rng = createRng(state.seed)
    .fork('bot')
    .fork(botId)
    .fork(`turn-${String(state.turn?.index ?? 0)}`);

  let best: Scored | null = null;

  for (let i = 0; i < effort.tries; i += 1) {
    const target = enemies[rng.nextInt(0, enemies.length)];
    const family = FAMILIES[rng.nextInt(0, FAMILIES.length)];
    if (target === undefined || family === undefined) continue;

    const aim = towards(shooter.origin, target.origin, rng);
    const scored = score(state, shooter, target.origin, shotOf(family, aim, rng), deps);
    if (scored === null) continue;
    if (scored.kills) return scored.shot;
    if (best === null || scored.distance < best.distance) best = scored;
  }

  // One pass of "the same thing again, only slightly different" around the
  // closest miss — which is what a player does on their next turn.
  for (let i = 0; best !== null && i < effort.refinements; i += 1) {
    const target = enemies[rng.nextInt(0, enemies.length)];
    if (target === undefined) continue;
    const scored = score(state, shooter, target.origin, nudge(best.shot, rng), deps);
    if (scored === null) continue;
    if (scored.kills) return scored.shot;
    if (scored.distance < best.distance) best = scored;
  }

  return best?.shot ?? FALLBACK;
}

/**
 * How close this shot came, or that it killed.
 *
 * Null when the function does not survive parsing or the continuity check: the
 * bot goes through exactly the gate a player does, so it can no more fire a
 * discontinuous function than they can.
 */
function score(
  state: MatchState,
  shooter: Player,
  aimedAt: Vec2,
  shot: ShotRequest,
  deps: BotDeps,
): Scored | null {
  const parsed = deps.parser.parse(shot.source, shot.axis);
  if (!parsed.ok) return null;

  const continuous = deps.continuity.check(
    parsed.value,
    reachOf(state.map.bounds, shooter.origin, shot),
    state.config.trace,
  );
  if (!continuous.ok) return null;

  const trace = deps.tracer.trace({
    expression: parsed.value,
    evaluator: deps.evaluator,
    origin: shooter.origin,
    axis: shot.axis,
    direction: shot.direction,
    map: state.map,
    targets: targetsFor(state, shooter),
    params: state.config.trace,
    pierce: state.config.rules.pierce,
  });

  const kills = trace.hits.some((hit) => hit.lethal && hit.playerId !== shooter.id);
  return { shot, kills, distance: kills ? 0 : closestApproach(trace, aimedAt) };
}

/** The span of the shot's own variable the curve can possibly cover. */
function reachOf(bounds: Aabb, origin: Vec2, shot: ShotRequest): { from: number; to: number } {
  const at = along(origin, shot.axis);
  const low = along(bounds.min, shot.axis);
  const high = along(bounds.max, shot.axis);
  return shot.direction === 'increasing' ? { from: 0, to: high - at } : { from: low - at, to: 0 };
}

const along = (point: Vec2, axis: Axis): number => (axis === 'x' ? point.x : point.y);

/** How near the curve ever came to the point it was aimed at. */
function closestApproach(trace: TraceResult, target: Vec2): number {
  let best = Infinity;
  for (const point of trace.polyline) {
    const d = Math.hypot(point.x - target.x, point.y - target.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The same shot with its numbers moved a little.
 *
 * Rewriting the source text rather than the parameters keeps one representation
 * of a candidate instead of two, and what comes out is still something a player
 * could have typed. Exponents are structure, not tuning: `x^2` must not become
 * `x^2.07`, so a number right after a `^` is left alone.
 */
function nudge(shot: ShotRequest, rng: Rng): ShotRequest {
  const source = shot.source.replace(/(\^\s*)?(\d+\.?\d*)/g, (match, caret: string | undefined) => {
    if (caret !== undefined) return match;
    const value = Number(match);
    if (!Number.isFinite(value) || value === 0) return match;
    const scaled = value * rng.nextRange(0.82, 1.22);
    return scaled.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  });
  return { ...shot, source };
}

function isEnemy(state: MatchState, shooter: Player, other: Player): boolean {
  if (state.config.rules.mode !== 'teams') return true;
  return other.teamId === null || other.teamId !== shooter.teamId;
}
