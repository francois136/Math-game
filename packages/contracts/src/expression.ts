/**
 * The abstract syntax tree of a player's function.
 *
 * The AST never crosses the network: the client sends the source string, the
 * server parses it. Parsing is deterministic, so a replay only needs the source.
 * These are therefore plain TypeScript types with no wire schema.
 *
 * User input is *never* executed. There is no `eval`, no `new Function`, no
 * template compilation anywhere in this repository (ADR 0002).
 */

/** Named functions a player may call. Anything else is a parse error. */
export const FUNCTION_NAMES = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'exp',
  'ln',
  'log',
  'sqrt',
  'abs',
] as const;
export type FunctionName = (typeof FUNCTION_NAMES)[number];

/** Every listed function takes exactly one argument. `log` is base 10, `ln` is natural. */
export const FUNCTION_ARITY: Readonly<Record<FunctionName, 1>> = Object.freeze({
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  sinh: 1,
  cosh: 1,
  tanh: 1,
  exp: 1,
  ln: 1,
  log: 1,
  sqrt: 1,
  abs: 1,
});

export const CONSTANT_NAMES = ['pi', 'e'] as const;
export type ConstantName = (typeof CONSTANT_NAMES)[number];

export const BINARY_OPERATORS = ['+', '-', '*', '/', '^'] as const;
export type BinaryOperator = (typeof BINARY_OPERATORS)[number];

export const COMPARISON_OPERATORS = ['<', '<=', '>', '>='] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export type NumberNode = { readonly kind: 'number'; readonly value: number };
export type ConstantNode = { readonly kind: 'constant'; readonly name: ConstantName };
export type VariableNode = { readonly kind: 'variable' };
export type NegateNode = { readonly kind: 'negate'; readonly operand: ExprNode };
export type BinaryNode = {
  readonly kind: 'binary';
  readonly op: BinaryOperator;
  readonly left: ExprNode;
  readonly right: ExprNode;
};
export type CallNode = {
  readonly kind: 'call';
  readonly name: FunctionName;
  readonly arg: ExprNode;
};

/**
 * One branch of a piecewise function. Guards are tried in order, first match
 * wins. `guard: null` marks the optional final catch-all branch (`sinon`).
 *
 * Where no guard holds, the function is simply undefined — a domain exit that
 * stops the trace, not a parse error. A piecewise function is therefore free to
 * cover only part of the real line.
 */
export type PiecewiseBranch = {
  readonly body: ExprNode;
  readonly guard: GuardNode | null;
};

export type PiecewiseNode = {
  readonly kind: 'piecewise';
  readonly branches: readonly PiecewiseBranch[];
};

export type ExprNode =
  NumberNode | ConstantNode | VariableNode | NegateNode | BinaryNode | CallNode | PiecewiseNode;

/** Guards compare `x` against an expression; they combine with `et` / `ou`. */
export type ComparisonGuard = {
  readonly kind: 'comparison';
  readonly op: ComparisonOperator;
  readonly left: ExprNode;
  readonly right: ExprNode;
};
export type LogicalGuard = {
  readonly kind: 'and' | 'or';
  readonly left: GuardNode;
  readonly right: GuardNode;
};
export type GuardNode = ComparisonGuard | LogicalGuard;

/** What the parser hands back once the input has passed every static limit. */
export interface ParsedExpression {
  /** The source exactly as the player typed it, kept for replays and display. */
  readonly source: string;
  readonly ast: ExprNode;
  readonly nodeCount: number;
  readonly depth: number;
  /** Sorted, de-duplicated x values where a piecewise branch changes. */
  readonly breakpoints: readonly number[];
}

/** Why an evaluation produced no value at a given x. */
export type DomainFailure =
  | 'division-by-zero'
  | 'log-of-non-positive'
  | 'sqrt-of-negative'
  | 'arc-out-of-range'
  | 'tangent-pole'
  | 'power-undefined'
  | 'not-finite';

export type EvalOutcome =
  | { readonly defined: true; readonly value: number }
  | { readonly defined: false; readonly failure: DomainFailure };
