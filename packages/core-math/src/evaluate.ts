import type { DomainFailure, EvalOutcome, ExprNode, GuardNode } from '@fw/contracts';

const undefinedAt = (failure: DomainFailure): EvalOutcome => ({ defined: false, failure });
const definedAt = (value: number): EvalOutcome =>
  Number.isFinite(value) ? { defined: true, value } : undefinedAt('not-finite');

/**
 * How close to a pole of the tangent counts as being on it.
 *
 * `tan` never returns Infinity in floating point — it returns 1.6e16 and the
 * curve would jump the map in one segment. Declaring the pole out of domain is
 * both truer to the mathematics and what makes the trace stop there.
 */
const TANGENT_POLE_EPSILON = 1e-9;

/**
 * Evaluate at a single point.
 *
 * Out of domain is a value, never an exception: `1/0`, `ln(-1)` and `sqrt(-4)`
 * all come back as `{ defined: false }`. The tracer turns that into a stop, the
 * continuity checker into a domain boundary.
 */
export function evaluate(node: ExprNode, x: number): EvalOutcome {
  return evalNode(node, x, null);
}

/**
 * Evaluate, and record which piecewise branch was taken at each piecewise node
 * encountered, in traversal order.
 *
 * Two points with different signatures sit on either side of a junction. That
 * is how `continuity.ts` finds the junctions of a function whose guards are too
 * involved to solve on paper — without restricting what a player may write.
 */
export function evaluateWithSignature(
  node: ExprNode,
  x: number,
): { outcome: EvalOutcome; signature: string } {
  const branches: number[] = [];
  const outcome = evalNode(node, x, branches);
  return { outcome, signature: branches.join('.') };
}

function evalNode(node: ExprNode, x: number, signature: number[] | null): EvalOutcome {
  switch (node.kind) {
    case 'number':
      return definedAt(node.value);

    case 'constant':
      return definedAt(node.name === 'pi' ? Math.PI : Math.E);

    case 'variable':
      return definedAt(x);

    case 'negate': {
      const operand = evalNode(node.operand, x, signature);
      return operand.defined ? definedAt(-operand.value) : operand;
    }

    case 'binary': {
      const left = evalNode(node.left, x, signature);
      if (!left.defined) return left;
      const right = evalNode(node.right, x, signature);
      if (!right.defined) return right;
      return applyBinary(node.op, left.value, right.value);
    }

    case 'call': {
      const arg = evalNode(node.arg, x, signature);
      return arg.defined ? applyFunction(node.name, arg.value) : arg;
    }

    case 'piecewise': {
      for (let i = 0; i < node.branches.length; i += 1) {
        const branch = node.branches[i];
        if (branch === undefined) continue;
        if (branch.guard === null || evalGuard(branch.guard, x, signature) === true) {
          signature?.push(i);
          return evalNode(branch.body, x, signature);
        }
      }
      // No guard holds: the function simply has no value here. Not an error —
      // a domain hole, which stops the trace if the curve reaches it.
      signature?.push(-1);
      return undefinedAt('not-finite');
    }
  }
}

function applyBinary(op: string, a: number, b: number): EvalOutcome {
  switch (op) {
    case '+':
      return definedAt(a + b);
    case '-':
      return definedAt(a - b);
    case '*':
      return definedAt(a * b);
    case '/':
      return b === 0 ? undefinedAt('division-by-zero') : definedAt(a / b);
    case '^': {
      if (a === 0 && b < 0) return undefinedAt('division-by-zero');
      if (a < 0 && !Number.isInteger(b)) return undefinedAt('power-undefined');
      return definedAt(Math.pow(a, b));
    }
    default:
      // The parser only ever builds the operators above.
      throw new Error(`unknown operator ${op}`);
  }
}

function applyFunction(name: string, a: number): EvalOutcome {
  switch (name) {
    case 'sin':
      return definedAt(Math.sin(a));
    case 'cos':
      return definedAt(Math.cos(a));
    case 'tan': {
      const cos = Math.cos(a);
      if (Math.abs(cos) < TANGENT_POLE_EPSILON) return undefinedAt('tangent-pole');
      return definedAt(Math.sin(a) / cos);
    }
    case 'asin':
      return Math.abs(a) > 1 ? undefinedAt('arc-out-of-range') : definedAt(Math.asin(a));
    case 'acos':
      return Math.abs(a) > 1 ? undefinedAt('arc-out-of-range') : definedAt(Math.acos(a));
    case 'atan':
      return definedAt(Math.atan(a));
    case 'sinh':
      return definedAt(Math.sinh(a));
    case 'cosh':
      return definedAt(Math.cosh(a));
    case 'tanh':
      return definedAt(Math.tanh(a));
    case 'exp':
      return definedAt(Math.exp(a));
    case 'ln':
      return a <= 0 ? undefinedAt('log-of-non-positive') : definedAt(Math.log(a));
    case 'log':
      return a <= 0 ? undefinedAt('log-of-non-positive') : definedAt(Math.log10(a));
    case 'sqrt':
      return a < 0 ? undefinedAt('sqrt-of-negative') : definedAt(Math.sqrt(a));
    case 'abs':
      return definedAt(Math.abs(a));
    default:
      // The parser only ever builds the names above.
      throw new Error(`unknown function ${name}`);
  }
}

/** `null` when an operand is out of domain: the guard is then simply not met. */
function evalGuard(guard: GuardNode, x: number, signature: number[] | null): boolean | null {
  if (guard.kind === 'comparison') {
    const left = evalNode(guard.left, x, signature);
    if (!left.defined) return null;
    const right = evalNode(guard.right, x, signature);
    if (!right.defined) return null;
    switch (guard.op) {
      case '<':
        return left.value < right.value;
      case '<=':
        return left.value <= right.value;
      case '>':
        return left.value > right.value;
      case '>=':
        return left.value >= right.value;
    }
  }
  const left = evalGuard(guard.left, x, signature);
  const right = evalGuard(guard.right, x, signature);
  if (guard.kind === 'and') {
    if (left === false || right === false) return false;
    return left === null || right === null ? null : true;
  }
  if (left === true || right === true) return true;
  return left === null || right === null ? null : false;
}

/** Does this subtree mention `x`? Used to spot guards with an exact junction. */
export function containsVariable(node: ExprNode): boolean {
  switch (node.kind) {
    case 'variable':
      return true;
    case 'number':
    case 'constant':
      return false;
    case 'negate':
      return containsVariable(node.operand);
    case 'binary':
      return containsVariable(node.left) || containsVariable(node.right);
    case 'call':
      return containsVariable(node.arg);
    case 'piecewise':
      return true;
  }
}
