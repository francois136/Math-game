import {
  err,
  FUNCTION_NAMES,
  fwError,
  MAX_AST_DEPTH,
  MAX_AST_NODES,
  MAX_PIECEWISE_BRANCHES,
  ok,
  type BinaryOperator,
  type ComparisonOperator,
  type ConstantName,
  type ExprNode,
  type FunctionName,
  type FwError,
  type GuardNode,
  type ParsedExpression,
  type PiecewiseBranch,
  type Result,
} from '@fw/contracts';
import { isKeyword, tokenize, type Token } from './lexer.js';
import { containsVariable, evaluate } from './evaluate.js';

/**
 * Internal control flow only. Recursive descent with a `Result` at every step
 * would bury the grammar under plumbing, so a failure unwinds by throwing and
 * `parse` — the only public entry point — turns it back into a `Result`.
 * Nothing of this type ever escapes this module.
 */
class ParseAbort extends Error {
  constructor(readonly failure: FwError) {
    super('parse aborted');
    this.name = 'ParseAbort';
  }
}

const CONSTANTS: Readonly<Record<string, ConstantName>> = { pi: 'pi', e: 'e' };

function isFunctionName(name: string): name is FunctionName {
  return (FUNCTION_NAMES as readonly string[]).includes(name);
}

/** Levenshtein distance, capped: we only care whether it is 1 or 2. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

function suggestFunction(name: string): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of FUNCTION_NAMES) {
    const d = editDistance(name, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

class Parser {
  private pos = 0;
  private nodes = 0;
  /** Was the primary just parsed a bare literal — a number, `pi` or `e`? */
  private lastPrimaryIsLiteral = false;
  private readonly breakpoints = new Set<number>();

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    const token = this.tokens[this.pos + offset];
    if (token === undefined) {
      // The lexer always terminates the stream with `eof`, so this is a bug.
      throw new Error('token stream ran past eof');
    }
    return token;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.pos += 1;
    return token;
  }

  private fail(token: Token): never {
    throw new ParseAbort(
      fwError('ERR_SYNTAX', {
        position: token.start,
        found: token.kind === 'eof' ? 'fin de la formule' : token.text,
      }),
    );
  }

  private expect(kind: Token['kind'], text?: string): Token {
    const token = this.peek();
    if (token.kind !== kind || (text !== undefined && token.text !== text)) this.fail(token);
    return this.advance();
  }

  private count(): void {
    this.nodes += 1;
    if (this.nodes > MAX_AST_NODES) {
      throw new ParseAbort(
        fwError('ERR_AST_TOO_LARGE', { nodeCount: this.nodes, max: MAX_AST_NODES }),
      );
    }
  }

  private skipSeparators(): number {
    let seen = 0;
    while (this.peek().kind === 'separator') {
      this.advance();
      seen += 1;
    }
    return seen;
  }

  parseProgram(): { ast: ExprNode; nodes: number; breakpoints: number[] } {
    this.skipSeparators();
    const ast = this.parseExpression();
    this.skipSeparators();
    const trailing = this.peek();
    if (trailing.kind !== 'eof') this.fail(trailing);
    return {
      ast,
      nodes: this.nodes,
      breakpoints: [...this.breakpoints].sort((a, b) => a - b),
    };
  }

  // expression = term , { ("+" | "-") , term }
  private parseExpression(): ExprNode {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'operator' || (token.text !== '+' && token.text !== '-')) return left;
      this.advance();
      const right = this.parseTerm();
      this.count();
      left = { kind: 'binary', op: token.text as BinaryOperator, left, right };
    }
  }

  // term = factor , { ("*" | "/" | implicit) , factor }
  private parseTerm(): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'operator' && (token.text === '*' || token.text === '/')) {
        this.advance();
        const right = this.parseUnary();
        this.count();
        left = { kind: 'binary', op: token.text as BinaryOperator, left, right };
        continue;
      }
      // Implicit multiplication, allowed only straight after a literal — a
      // number, `pi` or `e`: `2x`, `2(x+1)`, `3sin(x)`, `2pi`, `2e5`. Never
      // after anything else, because `x(2)` and `x x` read too easily as
      // something they are not.
      const implicit =
        this.lastPrimaryIsLiteral &&
        ((token.kind === 'identifier' && !isKeyword(token.text)) ||
          token.kind === 'lparen' ||
          token.kind === 'number');
      if (!implicit) return left;
      const right = this.parseUnary();
      this.count();
      left = { kind: 'binary', op: '*', left, right };
    }
  }

  // unary = { "-" | "+" } , power
  private parseUnary(): ExprNode {
    const token = this.peek();
    if (token.kind === 'operator' && (token.text === '-' || token.text === '+')) {
      this.advance();
      const operand = this.parseUnary();
      if (token.text === '+') return operand;
      this.count();
      return { kind: 'negate', operand };
    }
    return this.parsePower();
  }

  // power = primary , [ "^" , unary ]   — right associative, and `-x^2` is `-(x^2)`
  private parsePower(): ExprNode {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token.kind === 'operator' && token.text === '^') {
      this.advance();
      const exponent = this.parseUnary();
      this.count();
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parsePrimary(): ExprNode {
    const token = this.peek();
    this.lastPrimaryIsLiteral = false;

    if (token.kind === 'number') {
      this.advance();
      this.count();
      this.lastPrimaryIsLiteral = true;
      return { kind: 'number', value: token.value ?? 0 };
    }

    if (token.kind === 'lparen') {
      this.advance();
      const inner = this.parseExpression();
      this.expect('rparen');
      return inner;
    }

    if (token.kind === 'lbrace') return this.parsePiecewise();

    if (token.kind === 'identifier') {
      const name = token.text;
      if (isKeyword(name)) this.fail(token);

      if (name === 'x') {
        this.advance();
        this.count();
        return { kind: 'variable' };
      }

      const constant = CONSTANTS[name];
      if (constant !== undefined) {
        this.advance();
        this.count();
        this.lastPrimaryIsLiteral = true;
        return { kind: 'constant', name: constant };
      }

      if (isFunctionName(name)) {
        this.advance();
        this.expect('lparen');
        const arg = this.parseExpression();
        // Every function takes one argument; a comma is the giveaway that the
        // player expected otherwise, so say so rather than pointing at a token.
        if (this.peek().kind === 'comma') {
          throw new ParseAbort(
            fwError('ERR_ARITY', { name, expected: 1, received: this.countArguments() }),
          );
        }
        this.expect('rparen');
        this.count();
        return { kind: 'call', name, arg };
      }

      // An unknown word followed by `(` was meant as a function.
      if (this.peek(1).kind === 'lparen') {
        throw new ParseAbort(
          fwError('ERR_UNKNOWN_FUNCTION', {
            name,
            position: token.start,
            suggestion: suggestFunction(name),
          }),
        );
      }
      throw new ParseAbort(fwError('ERR_UNKNOWN_IDENTIFIER', { name, position: token.start }));
    }

    this.fail(token);
  }

  /** How many arguments the player actually wrote, for the arity message. */
  private countArguments(): number {
    let commas = 0;
    let depth = 0;
    for (let i = this.pos; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];
      if (token === undefined) break;
      if (token.kind === 'lparen') depth += 1;
      else if (token.kind === 'rparen') {
        if (depth === 0) break;
        depth -= 1;
      } else if (token.kind === 'comma' && depth === 0) commas += 1;
    }
    return commas + 1;
  }

  // piecewise = "{" , branch , { separator , branch } , "}"
  private parsePiecewise(): ExprNode {
    this.expect('lbrace');
    const branches: PiecewiseBranch[] = [];

    for (;;) {
      this.skipSeparators();
      if (this.peek().kind === 'rbrace') break;

      const body = this.parseExpression();
      const keyword = this.peek();
      if (keyword.kind !== 'identifier' || (keyword.text !== 'si' && keyword.text !== 'sinon')) {
        this.fail(keyword);
      }
      this.advance();

      if (keyword.text === 'sinon') {
        branches.push({ body, guard: null });
        this.skipSeparators();
        break;
      }
      branches.push({ body, guard: this.parseGuard() });

      const next = this.peek();
      if (next.kind === 'rbrace') break;
      if (next.kind !== 'separator') this.fail(next);
    }

    this.expect('rbrace');

    if (branches.length === 0) this.fail(this.peek());
    if (branches.length > MAX_PIECEWISE_BRANCHES) {
      throw new ParseAbort(
        fwError('ERR_TOO_MANY_BRANCHES', {
          count: branches.length,
          max: MAX_PIECEWISE_BRANCHES,
        }),
      );
    }

    this.count();
    return { kind: 'piecewise', branches };
  }

  // guard = andGuard , { "ou" , andGuard }
  private parseGuard(): GuardNode {
    let left = this.parseAndGuard();
    while (this.peek().kind === 'identifier' && this.peek().text === 'ou') {
      this.advance();
      const right = this.parseAndGuard();
      this.count();
      left = { kind: 'or', left, right };
    }
    return left;
  }

  private parseAndGuard(): GuardNode {
    let left = this.parseComparison();
    while (this.peek().kind === 'identifier' && this.peek().text === 'et') {
      this.advance();
      const right = this.parseComparison();
      this.count();
      left = { kind: 'and', left, right };
    }
    return left;
  }

  private parseComparison(): GuardNode {
    const left = this.parseExpression();
    const token = this.peek();
    if (token.kind !== 'comparison') this.fail(token);
    this.advance();
    const right = this.parseExpression();
    this.count();

    this.recordBreakpoint(left, right);
    return { kind: 'comparison', op: token.text as ComparisonOperator, left, right };
  }

  /**
   * When a guard reads `x < c` or `c < x` with `c` free of `x`, the junction is
   * known exactly. Anything more elaborate is found later by the numeric scan
   * in `continuity.ts` — this is a precision improvement, never a requirement.
   */
  private recordBreakpoint(left: ExprNode, right: ExprNode): void {
    const constantSide = left.kind === 'variable' ? right : right.kind === 'variable' ? left : null;
    if (constantSide === null || containsVariable(constantSide)) return;
    const outcome = evaluate(constantSide, 0);
    if (outcome.defined) this.breakpoints.add(outcome.value);
  }
}

function measureDepth(node: ExprNode, depth = 1): number {
  switch (node.kind) {
    case 'number':
    case 'constant':
    case 'variable':
      return depth;
    case 'negate':
      return measureDepth(node.operand, depth + 1);
    case 'binary':
      return Math.max(measureDepth(node.left, depth + 1), measureDepth(node.right, depth + 1));
    case 'call':
      return measureDepth(node.arg, depth + 1);
    case 'piecewise': {
      let deepest = depth;
      for (const branch of node.branches) {
        deepest = Math.max(deepest, measureDepth(branch.body, depth + 1));
        if (branch.guard !== null)
          deepest = Math.max(deepest, measureGuardDepth(branch.guard, depth + 1));
      }
      return deepest;
    }
  }
}

function measureGuardDepth(guard: GuardNode, depth: number): number {
  if (guard.kind === 'comparison') {
    return Math.max(measureDepth(guard.left, depth + 1), measureDepth(guard.right, depth + 1));
  }
  return Math.max(
    measureGuardDepth(guard.left, depth + 1),
    measureGuardDepth(guard.right, depth + 1),
  );
}

/**
 * Source → AST. Never throws, never executes anything, and enforces every
 * static limit before handing back a tree (ADR 0002).
 */
export function parse(source: string): Result<ParsedExpression, FwError> {
  const tokens = tokenize(source);
  if (!Array.isArray(tokens)) return err(tokens);

  try {
    const parser = new Parser(tokens);
    const { ast, nodes, breakpoints } = parser.parseProgram();
    const depth = measureDepth(ast);
    if (depth > MAX_AST_DEPTH) {
      return err(fwError('ERR_AST_TOO_DEEP', { depth, max: MAX_AST_DEPTH }));
    }
    return ok({ source, ast, nodeCount: nodes, depth, breakpoints });
  } catch (caught: unknown) {
    if (caught instanceof ParseAbort) return err(caught.failure);
    throw caught;
  }
}
