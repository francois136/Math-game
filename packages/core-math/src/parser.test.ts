import { describe, expect, it } from 'vitest';
import { MAX_AST_NODES, MAX_SOURCE_LENGTH, type ExprNode, type FwError } from '@fw/contracts';
import { parse } from './parser.js';
import { evaluate } from './evaluate.js';

/** Parse, or fail the test with the message a player would have seen. */
function ast(source: string): ExprNode {
  const result = parse(source);
  if (!result.ok) throw new Error(`${source} → ${result.error.message}`);
  return result.value.ast;
}

/** The error a source produces, or fail the test if it unexpectedly parsed. */
function failure(source: string): FwError {
  const result = parse(source);
  if (result.ok) throw new Error(`${source} parsed but should not have`);
  return result.error;
}

/** Value at x, or NaN when out of domain — convenient for precedence checks. */
function at(source: string, x: number): number {
  const outcome = evaluate(ast(source), x);
  return outcome.defined ? outcome.value : NaN;
}

describe('precedence', () => {
  it('multiplies before adding', () => {
    expect(at('2 + 3 * 4', 0)).toBe(14);
    expect(at('(2 + 3) * 4', 0)).toBe(20);
  });

  it('makes ^ right associative', () => {
    expect(at('2^3^2', 0)).toBe(512); // 2^(3^2), not (2^3)^2 = 64
  });

  it('binds ^ tighter than unary minus', () => {
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('(-x)^2', 3)).toBe(9);
  });

  it('accepts a negative exponent without parentheses', () => {
    expect(at('2^-2', 0)).toBe(0.25);
  });

  it('subtracts left to right', () => {
    expect(at('10 - 3 - 2', 0)).toBe(5);
  });

  it('divides left to right', () => {
    expect(at('12 / 3 / 2', 0)).toBe(2);
  });
});

describe('implicit multiplication', () => {
  it('applies after a number', () => {
    expect(at('2x', 5)).toBe(10);
    expect(at('2(x + 1)', 4)).toBe(10);
    expect(at('3sin(0)', 0)).toBe(0);
    expect(at('2x^2', 3)).toBe(18); // 2·(x²), not (2x)²
  });

  it('does not apply anywhere else', () => {
    // `x(2)` would read as a function call, `x x` as a typo. Both are refused
    // rather than silently reinterpreted.
    expect(failure('x(2)').code).toBe('ERR_SYNTAX');
    expect(failure('x x').code).toBe('ERR_SYNTAX');
  });

  it('does not swallow a keyword', () => {
    expect(at('{ 4 si x < 2 ; 9 sinon }', 0)).toBe(4);
  });
});

describe('numbers', () => {
  it('reads decimals with or without a leading digit', () => {
    expect(at('1.5', 0)).toBe(1.5);
    expect(at('.5', 0)).toBe(0.5);
  });

  it('has no scientific notation, so 2e5 is 2·e·5', () => {
    expect(at('2e5', 0)).toBeCloseTo(2 * Math.E * 5, 12);
  });
});

describe('piecewise', () => {
  it('takes the first branch whose guard holds', () => {
    const source = '{ x^2 si x < 2 ; 4 + 3*(x-2) si x >= 2 }';
    expect(at(source, 1)).toBe(1);
    expect(at(source, 2)).toBe(4);
    expect(at(source, 3)).toBe(7);
  });

  it('accepts newlines as separators, like the brief writes them', () => {
    const source = '{ x^2         si x < 2\n  4 + 3*(x-2) si x >= 2 }';
    expect(at(source, 3)).toBe(7);
  });

  it('accepts an optional final sinon', () => {
    expect(at('{ 1 si x < 0 ; 2 sinon }', 5)).toBe(2);
  });

  it('is undefined where no guard holds, which is a domain hole not an error', () => {
    const outcome = evaluate(ast('{ 1 si x < 0 }'), 5);
    expect(outcome.defined).toBe(false);
  });

  it('supports et and ou in guards', () => {
    const source = '{ 1 si x > 0 et x < 10 ; 0 sinon }';
    expect(at(source, 5)).toBe(1);
    expect(at(source, 20)).toBe(0);

    const either = '{ 1 si x < 0 ou x > 10 ; 0 sinon }';
    expect(at(either, -5)).toBe(1);
    expect(at(either, 5)).toBe(0);
    expect(at(either, 15)).toBe(1);
  });

  it('refuses more branches than the limit', () => {
    const branches = Array.from({ length: 9 }, (_, i) => `${String(i)} si x < ${String(i)}`);
    expect(failure(`{ ${branches.join(' ; ')} }`).code).toBe('ERR_TOO_MANY_BRANCHES');
  });

  it('records exact junctions for simple guards', () => {
    const parsed = parse('{ 1 si x < 2 ; 2 si x < pi ; 3 sinon }');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.breakpoints).toEqual([2, Math.PI]);
  });
});

describe('errors a player can act on', () => {
  it('names an unknown function and suggests the nearest', () => {
    const e = failure('sinus(x)');
    expect(e.code).toBe('ERR_UNKNOWN_FUNCTION');
    expect(e.message).toContain('sin');
  });

  it('names an unknown identifier', () => {
    const e = failure('y + 1');
    expect(e.code).toBe('ERR_UNKNOWN_IDENTIFIER');
    expect(e.message).toContain('y');
  });

  it('points at the offending character', () => {
    const e = failure('2 + * 3');
    expect(e.code).toBe('ERR_SYNTAX');
    expect(e.message).toContain('caractère 5');
  });

  it('reports a second argument as an arity mistake', () => {
    expect(failure('sin(x, 2)').code).toBe('ERR_ARITY');
  });

  it('refuses an empty function', () => {
    expect(failure('   ').code).toBe('ERR_EMPTY_INPUT');
  });

  it('refuses a source longer than the limit', () => {
    const e = failure(`1+${'1+'.repeat(MAX_SOURCE_LENGTH)}1`);
    expect(e.code).toBe('ERR_INPUT_TOO_LONG');
  });

  it('refuses a tree with too many nodes', () => {
    // Under the character limit, over the node limit.
    const e = failure(`1${'+1'.repeat(300)}`);
    expect(['ERR_AST_TOO_LARGE', 'ERR_INPUT_TOO_LONG']).toContain(e.code);
  });

  it('refuses a tree that nests too deeply', () => {
    const depth = 40;
    const e = failure(`${'('.repeat(depth)}x${')'.repeat(depth)}`.replace(/\(/g, '(-'));
    expect(e.code).toBe('ERR_AST_TOO_DEEP');
  });

  it('refuses an unbalanced parenthesis', () => {
    expect(failure('sin(x').code).toBe('ERR_SYNTAX');
    expect(failure('(x + 1))').code).toBe('ERR_SYNTAX');
  });
});

describe('reported shape', () => {
  it('counts nodes and depth', () => {
    const parsed = parse('sin(x) + 1');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.nodeCount).toBe(4); // x, sin, 1, +
    expect(parsed.value.depth).toBe(3); // + → sin → x
    expect(parsed.value.nodeCount).toBeLessThanOrEqual(MAX_AST_NODES);
  });

  it('keeps the source verbatim, for replays and for display', () => {
    const source = '  3*sin( x/2 )  ';
    const parsed = parse(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.source).toBe(source);
  });
});
