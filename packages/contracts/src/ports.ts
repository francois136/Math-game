import type { Result } from './result.js';
import type { FwError } from './errors.js';
import type { EvalOutcome, ExprNode, ParsedExpression } from './expression.js';
import type { GameMap, Vec2 } from './geometry.js';
import type { MapParams, MatchConfig, TraceParams } from './config.js';
import type { Direction, TraceResult } from './shot.js';
import type { MatchCommand, MatchEvent, MatchState } from './match.js';
import type { MatchId, PlayerId, Seed, TeamId } from './ids.js';
import type { Rng } from './rng.js';

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
  /** Source → AST, enforcing every static limit. Never throws, never executes. */
  parse(source: string): Result<ParsedExpression, FwError>;
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

export interface MapValidation {
  readonly ok: boolean;
  /** Pairs a trivial curve connects with nothing in the way — a free first kill. */
  readonly exposedPairs: readonly (readonly [number, number])[];
  /**
   * Pairs no curve of the wide family can connect at all — a match nobody can
   * win. Sealing the trivial curves too hard produces these, so the generator
   * checks for both (ADR 0011).
   */
  readonly unreachablePairs: readonly (readonly [number, number])[];
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
  readonly continuity: ContinuityCheckerPort;
  readonly tracer: TracerPort;
  readonly maps: MapGeneratorPort;
  readonly rng: Rng;
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

// — Ambient capabilities, always injected ——————————————————————————

export interface ClockPort {
  /** Epoch milliseconds. The only place the wall clock is read. */
  nowMs(): number;
}

export interface IdFactoryPort {
  matchId(): MatchId;
  playerId(): PlayerId;
}
