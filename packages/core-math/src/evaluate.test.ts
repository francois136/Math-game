import { describe, expect, it } from 'vitest';
import type { DomainFailure, ExprNode } from '@fw/contracts';
import { parse } from './parser.js';
import { evaluate, evaluateWithSignature } from './evaluate.js';

function ast(source: string): ExprNode {
  const result = parse(source);
  if (!result.ok) throw new Error(`${source} → ${result.error.message}`);
  return result.value.ast;
}

function value(source: string, x: number): number | DomainFailure {
  const outcome = evaluate(ast(source), x);
  return outcome.defined ? outcome.value : outcome.failure;
}

describe('domain', () => {
  it('treats every failure as a value, never an exception', () => {
    expect(value('1/x', 0)).toBe('division-by-zero');
    expect(value('ln(x)', 0)).toBe('log-of-non-positive');
    expect(value('ln(x)', -1)).toBe('log-of-non-positive');
    expect(value('log(x)', -1)).toBe('log-of-non-positive');
    expect(value('sqrt(x)', -4)).toBe('sqrt-of-negative');
    expect(value('asin(x)', 2)).toBe('arc-out-of-range');
    expect(value('acos(x)', -2)).toBe('arc-out-of-range');
  });

  it('declares the poles of the tangent out of domain', () => {
    // tan never returns Infinity in floating point; left alone it would return
    // 1.6e16 and the curve would leap the whole map in one segment.
    expect(value('tan(x)', Math.PI / 2)).toBe('tangent-pole');
    expect(value('tan(x)', 0)).toBe(0);
  });

  it('applies the rules of powers', () => {
    expect(value('x^0.5', -4)).toBe('power-undefined');
    expect(value('x^3', -2)).toBe(-8); // an integer exponent is fine
    expect(value('x^-1', 0)).toBe('division-by-zero');
    expect(value('x^2', 3)).toBe(9);
  });

  it('rejects a result that overflows to infinity', () => {
    expect(value('exp(x)', 1000)).toBe('not-finite');
  });

  it('propagates an undefined operand instead of masking it', () => {
    expect(value('0 * ln(x)', -1)).toBe('log-of-non-positive');
    expect(value('sqrt(x) + 1', -1)).toBe('sqrt-of-negative');
  });
});

describe('functions', () => {
  it('reads ln as natural and log as base ten', () => {
    expect(value('ln(e)', 0)).toBeCloseTo(1, 12);
    expect(value('log(100)', 0)).toBeCloseTo(2, 12);
  });

  it('computes the trigonometric and hyperbolic families', () => {
    expect(value('sin(pi/2)', 0)).toBeCloseTo(1, 12);
    expect(value('cos(0)', 0)).toBe(1);
    expect(value('atan(1)', 0)).toBeCloseTo(Math.PI / 4, 12);
    expect(value('cosh(0)', 0)).toBe(1);
    expect(value('tanh(x)', 100)).toBeCloseTo(1, 12);
  });

  it('computes abs', () => {
    expect(value('abs(x)', -3)).toBe(3);
  });
});

describe('piecewise guards', () => {
  it('skips a branch whose guard cannot be evaluated', () => {
    // `sqrt(x) > 1` has no truth value at x = -4, so the branch is not taken
    // and the next one is tried.
    expect(value('{ 1 si sqrt(x) > 1 ; 2 sinon }', -4)).toBe(2);
    expect(value('{ 1 si sqrt(x) > 1 ; 2 sinon }', 9)).toBe(1);
  });

  it('short-circuits et and ou around an unevaluable side', () => {
    expect(value('{ 1 si x > 100 et sqrt(x) > 1 ; 2 sinon }', -4)).toBe(2);
    expect(value('{ 1 si x < 0 ou sqrt(x) > 1 ; 2 sinon }', -4)).toBe(1);
  });

  it('reports which branch was taken', () => {
    const tree = ast('{ 1 si x < 0 ; 2 si x < 5 ; 3 sinon }');
    expect(evaluateWithSignature(tree, -1).signature).toBe('0');
    expect(evaluateWithSignature(tree, 1).signature).toBe('1');
    expect(evaluateWithSignature(tree, 9).signature).toBe('2');
  });

  it('marks the gap where no guard holds', () => {
    const tree = ast('{ 1 si x < 0 }');
    const { outcome, signature } = evaluateWithSignature(tree, 5);
    expect(outcome.defined).toBe(false);
    expect(signature).toBe('-1');
  });
});

describe('translation to the shooter', () => {
  it('is the caller who translates, so f(0) is all the engine needs', () => {
    // y = y₀ + f(x − x₀) − f(0): the engine only has to be able to evaluate f
    // at 0 for the curve to start at the player.
    const f = ast('x^2 + 5');
    const atZero = evaluate(f, 0);
    expect(atZero.defined && atZero.value).toBe(5);
  });
});
