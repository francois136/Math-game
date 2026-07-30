import {
  err,
  fwError,
  ok,
  type ExprNode,
  type FwError,
  type ParsedExpression,
  type Result,
  type TraceParams,
} from '@fw/contracts';
import { evaluate, evaluateWithSignature } from './evaluate.js';

export interface ContinuityInterval {
  readonly from: number;
  readonly to: number;
}

/**
 * Why this only inspects piecewise junctions.
 *
 * Every primitive the language offers — the four operations, powers, exp, ln,
 * log, sqrt, abs, the trigonometric and hyperbolic families — is continuous on
 * its own domain, and sums, products, quotients and compositions of continuous
 * functions are continuous where they are defined. A single-branch expression
 * is therefore continuous on its domain as a matter of theorem, not of luck:
 * scanning it for jumps would only ever find false positives from steep slopes.
 *
 * A discontinuity can only appear where the *definition* changes, that is at a
 * junction between two branches of a piecewise function. Those are what this
 * module finds and checks.
 *
 * The theorem depends on the function list. Adding `floor`, `sign`, `round` or
 * a modulo would break it, and this file would have to change with it.
 */

/** How many points the junction scan samples across the traced interval. */
const SCAN_SAMPLES = 2000;

/** Bisection steps used to pin a junction down once the scan has bracketed it. */
const BISECTION_STEPS = 60;

/** Distances from the junction used to approach a one-sided limit. */
const LIMIT_DELTAS = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7] as const;

type SideLimit =
  | { readonly kind: 'value'; readonly value: number; readonly spread: number }
  | { readonly kind: 'divergent' }
  | { readonly kind: 'undefined' };

/**
 * Reject a function that is discontinuous anywhere it would be drawn.
 *
 * Returns the *first* discontinuity along the interval, because one clear
 * sentence teaches more than a list. Costs the player no turn.
 */
export function check(
  expression: ParsedExpression,
  interval: ContinuityInterval,
  params: TraceParams,
): Result<void, FwError> {
  const origin = evaluate(expression.ast, 0);
  if (!origin.defined) {
    return err(fwError('ERR_UNDEFINED_AT_ORIGIN', { x: 0, failure: origin.failure }));
  }

  if (!hasPiecewise(expression.ast)) return ok(undefined);

  const from = Math.min(interval.from, interval.to);
  const to = Math.max(interval.from, interval.to);
  if (!(to > from)) return ok(undefined);

  for (const junction of findJunctions(expression, from, to)) {
    const failure = checkJunction(expression.ast, junction, params);
    if (failure !== null) return err(failure);
  }
  return ok(undefined);
}

/**
 * Junction candidates, in increasing order.
 *
 * Two sources, deliberately overlapping. Guards of the shape `x < c` give the
 * junction exactly, at no cost. Everything else is found by sampling and
 * watching for the active branch to change, then bisecting.
 *
 * The scan can miss a branch narrower than the sample spacing whose guard is
 * too involved to solve exactly — `{ 1 si sin(100x) > 0.999 ; 0 sinon }` and
 * the like. That is a known and accepted limit: such a function is refused
 * nothing, it is merely traced as written, and the tracer's own step refinement
 * still stops it at the jump.
 */
function findJunctions(expression: ParsedExpression, from: number, to: number): number[] {
  const candidates = new Set<number>();

  for (const breakpoint of expression.breakpoints) {
    if (breakpoint > from && breakpoint < to) candidates.add(breakpoint);
  }

  const step = (to - from) / SCAN_SAMPLES;
  let previousX = from;
  let previousSignature = evaluateWithSignature(expression.ast, from).signature;

  for (let i = 1; i <= SCAN_SAMPLES; i += 1) {
    const x = i === SCAN_SAMPLES ? to : from + i * step;
    const { signature } = evaluateWithSignature(expression.ast, x);
    if (signature !== previousSignature) {
      candidates.add(bisectJunction(expression.ast, previousX, x, previousSignature));
    }
    previousX = x;
    previousSignature = signature;
  }

  return [...candidates].sort((a, b) => a - b);
}

/** Narrow [low, high] until it brackets the junction to floating-point width. */
function bisectJunction(ast: ExprNode, low: number, high: number, lowSignature: string): number {
  let a = low;
  let b = high;
  for (
    let i = 0;
    i < BISECTION_STEPS && b - a > Number.EPSILON * Math.max(1, Math.abs(a));
    i += 1
  ) {
    const middle = (a + b) / 2;
    if (evaluateWithSignature(ast, middle).signature === lowSignature) a = middle;
    else b = middle;
  }
  return b;
}

function checkJunction(ast: ExprNode, x: number, params: TraceParams): FwError | null {
  const left = oneSidedLimit(ast, x, -1);
  const right = oneSidedLimit(ast, x, 1);

  // The function has no value on one side: `x` is a boundary of the domain, not
  // a discontinuity. The trace stops there, and that is all.
  if (left.kind === 'undefined' || right.kind === 'undefined') return null;

  const at = evaluate(ast, x);
  // A removable hole: both sides agree but the point itself has no value. The
  // trace stops at the hole; nothing to refuse.
  if (!at.defined) return null;

  const report = (): FwError =>
    fwError('ERR_DISCONTINUITY', {
      x,
      leftLimit: left.kind === 'value' ? left.value : null,
      rightLimit: right.kind === 'value' ? right.value : null,
    });

  if (left.kind === 'divergent' || right.kind === 'divergent') return report();

  const tolerance = (value: number, spread: number): number =>
    params.continuityEpsilon + params.continuityRelativeEpsilon * Math.abs(value) + 10 * spread;

  const jump = Math.abs(left.value - right.value);
  if (
    jump >
    tolerance(Math.max(Math.abs(left.value), Math.abs(right.value)), left.spread + right.spread)
  ) {
    return report();
  }
  if (Math.abs(at.value - left.value) > tolerance(at.value, left.spread)) return report();
  if (Math.abs(at.value - right.value) > tolerance(at.value, right.spread)) return report();

  return null;
}

/**
 * Approach the limit from one side.
 *
 * `spread` is the gap between the last two approximations. Callers add a
 * multiple of it to their tolerance, so that a merely steep function — where
 * the samples are still moving at 1e-7 — is not mistaken for a jump.
 */
function oneSidedLimit(ast: ExprNode, x: number, sign: 1 | -1): SideLimit {
  const values: number[] = [];
  for (const delta of LIMIT_DELTAS) {
    const outcome = evaluate(ast, x + sign * delta);
    if (!outcome.defined) return { kind: 'undefined' };
    values.push(outcome.value);
  }

  const last = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const first = values[0] ?? 0;
  // A pole grows by four orders of magnitude across these deltas. A merely
  // large but continuous value — exp(50), say — barely moves, so the ratio
  // separates the two without a magnitude threshold that would catch both.
  if (Math.abs(last) > 1e3 && Math.abs(last) > 1e3 * (Math.abs(first) + 1)) {
    return { kind: 'divergent' };
  }

  return { kind: 'value', value: last, spread: Math.abs(last - previous) };
}

function hasPiecewise(node: ExprNode): boolean {
  switch (node.kind) {
    case 'piecewise':
      return true;
    case 'number':
    case 'constant':
    case 'variable':
      return false;
    case 'negate':
      return hasPiecewise(node.operand);
    case 'binary':
      return hasPiecewise(node.left) || hasPiecewise(node.right);
    case 'call':
      return hasPiecewise(node.arg);
  }
}
