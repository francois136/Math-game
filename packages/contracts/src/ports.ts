import type { Result } from './result.js';
import type { FwError } from './errors.js';
import type { EvalOutcome, ExprNode, ParsedExpression } from './expression.js';
import type { GameMap, Vec2 } from './geometry.js';
import type { MapParams, MatchConfig, TraceParams } from './config.js';
import type { BotLevel } from './bot.js';
import type { Replay } from './replay.js';
import type { Axis, Direction, ShotRequest, TraceResult } from './shot.js';
import type { MatchCommand, MatchEvent, MatchState } from './match.js';
import type { LobbyCode, MatchId, PlayerId, Seed, SessionToken, TeamId } from './ids.js';

/**
 * The seams between packages.
 *
 * Every port is implemented by exactly one package and consumed by others
 * through this file alone. An agent can therefore build against a neighbour
 * that does not exist yet, and swapping an implementation (a faster tracer, a
 * hand-authored map source) touches no caller.
 *
 * Owner of each port is recorded in CODEOWNERS and docs/ARCHITECTURE.md.
 */

// — @fw/core-math ————————————————————————————————————————————

export interface ExpressionParserPort {
  /**
   * Source → AST, enforcing every static limit. Never throws, never executes.
   *
   * `variable` is the letter the player writes, which follows the axis of the
   * shot: `x` for `y = f(x)`, `y` for `x = f(y)`. A player told they are
   * writing a function of `y` should be able to write `y` (ADR 0013).
   */
  parse(source: string, variable?: Axis): Result<ParsedExpression, FwError>;
}

export interface EvaluatorPort {
  /** Evaluate at a single point. Out-of-domain is a value, not an exception. */
  evaluate(ast: ExprNode, x: number): EvalOutcome;
}

export interface ContinuityInterval {
  readonly from: number;
  readonly to: number;
}

export interface ContinuityCheckerPort {
  /**
   * Reject a function that is discontinuous anywhere it would be drawn.
   *
   * Only the junctions between piecewise branches can be discontinuous: every
   * function in the language is continuous on its own domain, so a single-branch
   * expression is continuous by theorem. Left and right limits are compared
   * there within the tolerances carried by `params`. Returns the first
   * discontinuity found, so the player gets one clear message rather than a
   * list.
   */
  check(
    expression: ParsedExpression,
    interval: ContinuityInterval,
    params: TraceParams,
  ): Result<void, FwError>;
}

// — @fw/physics ——————————————————————————————————————————————

/** A player as the tracer sees them: a circle plus a rules verdict. */
export interface TraceTarget {
  readonly playerId: PlayerId;
  readonly center: Vec2;
  readonly radius: number;
  /** Decided by @fw/rules before the trace runs. */
  readonly vulnerability: 'lethal' | 'shield' | 'friendly-fire';
  /** Arc length below which this target cannot be hit. Non-zero for the shooter. */
  readonly immuneUntilArc: number;
}

export interface TraceInput {
  readonly expression: ParsedExpression;
  /**
   * How to evaluate that expression.
   *
   * Injected rather than imported so that @fw/physics never depends on
   * @fw/core-math: the two are siblings, not a stack (ADR 0009).
   */
  readonly evaluator: EvaluatorPort;
  /** The shooter's position; the curve is translated to pass through it. */
  readonly origin: Vec2;
  /** `x` for `y = f(x)`, `y` for `x = f(y)` (ADR 0013). */
  readonly axis: Axis;
  readonly direction: Direction;
  readonly map: GameMap;
  readonly targets: readonly TraceTarget[];
  readonly params: TraceParams;
  /** When true the curve continues after a lethal hit. */
  readonly pierce: boolean;
}

export interface TracerPort {
  /**
   * Walk the curve from the origin until it stops. Pure and deterministic:
   * same input, same polyline, down to the last coordinate.
   */
  trace(input: TraceInput): TraceResult;
}

export type SpawnPair = readonly [number, number];

/**
 * What each pair of seats can and cannot do to each other.
 *
 * Three separate families, because the difficulty settings need to ask three
 * different questions of the same map (ADR 0014).
 */
export interface MapValidation {
  readonly ok: boolean;
  /** A trivial curve connects them with nothing in the way — a free first kill. */
  readonly exposedPairs: readonly SpawnPair[];
  /** No continuous function joins them at all — a match nobody can win. */
  readonly unreachablePairs: readonly SpawnPair[];
  /** A parabola of the wide family gets through: the shot is findable by trying. */
  readonly parabolaPairs: readonly SpawnPair[];
  /** Seats standing closer than their side allows. */
  readonly tooClosePairs: readonly SpawnPair[];
  readonly coverage: number;
}

export interface MapGeneratorPort {
  /** Deterministic in `seed`: same seed and params, same map. */
  generate(seed: Seed, params: MapParams): Result<GameMap, FwError>;
  /** Also applied to hand-authored maps loaded from JSON. */
  validate(map: GameMap, params: MapParams): MapValidation;
}

// — @fw/rules ————————————————————————————————————————————————

export interface MatchSetupPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly teamId: TeamId | null;
  readonly isBot: boolean;
}

export interface MatchSetup {
  readonly id: MatchId;
  readonly seed: Seed;
  readonly config: MatchConfig;
  readonly players: readonly MatchSetupPlayer[];
  /** Supply a map to skip generation, e.g. for a scripted test or a replay. */
  readonly map: GameMap | null;
  /** Epoch milliseconds for the first turn deadline. */
  readonly startedAtMs: number;
}

/** Everything the rules engine needs from the outside. No globals, no clock. */
export interface RulesDeps {
  readonly parser: ExpressionParserPort;
  /** Handed straight to the tracer in `TraceInput` (ADR 0009). */
  readonly evaluator: EvaluatorPort;
  readonly continuity: ContinuityCheckerPort;
  readonly tracer: TracerPort;
  readonly maps: MapGeneratorPort;
}

export interface RulesEnginePort {
  createMatch(setup: MatchSetup, deps: RulesDeps): Result<MatchState, FwError>;
  /**
   * Apply one command. Pure: returns the next state and what happened. A
   * rejected command yields the unchanged state and a `command-rejected` event.
   */
  apply(
    state: MatchState,
    command: MatchCommand,
    deps: RulesDeps,
    nowMs: number,
  ): { readonly state: MatchState; readonly events: readonly MatchEvent[] };
}

// — @fw/rules, replays ————————————————————————————————————————

export interface ReplayPort {
  /** A finished match as a document small enough to send in an email. */
  toReplay(state: MatchState): Replay;
  /**
   * A document back as a match. Fails rather than diverge: a replay whose
   * shots this build refuses is a replay from another build, and saying so
   * beats returning a match that quietly went elsewhere (ADR 0018).
   */
  replay(document: unknown, deps: RulesDeps): Result<MatchState, FwError>;
}

// — @fw/bot ——————————————————————————————————————————————————

export interface BotPort {
  /**
   * What this bot fires this turn. Never null: a turn has to end with
   * something, and a bot that passed for want of a good shot would stall the
   * match.
   *
   * Pure and deterministic in the match state — the draw comes from the seed
   * and the turn index, so a replay replays the bot's moves too.
   */
  chooseShot(state: MatchState, botId: PlayerId, level: BotLevel, deps: RulesDeps): ShotRequest;
}

// — Ambient capabilities, always injected ——————————————————————————

export interface ClockPort {
  /** Epoch milliseconds. The only place the wall clock is read. */
  nowMs(): number;
}

export interface IdFactoryPort {
  matchId(): MatchId;
  playerId(): PlayerId;
  lobbyCode(): LobbyCode;
  /**
   * Unguessable, and never derived from the PlayerId: holding one is what
   * proves a returning client owns a seat.
   */
  sessionToken(): SessionToken;
}
