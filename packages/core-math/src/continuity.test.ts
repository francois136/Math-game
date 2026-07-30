import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACE_PARAMS, type FwError, type ParsedExpression } from '@fw/contracts';
import { parse } from './parser.js';
import { check } from './continuity.js';

const INTERVAL = { from: -20, to: 20 };

function parsed(source: string): ParsedExpression {
  const result = parse(source);
  if (!result.ok) throw new Error(`${source} → ${result.error.message}`);
  return result.value;
}

function accepted(source: string): boolean {
  return check(parsed(source), INTERVAL, DEFAULT_TRACE_PARAMS).ok;
}

function rejection(source: string): FwError {
  const result = check(parsed(source), INTERVAL, DEFAULT_TRACE_PARAMS);
  if (result.ok) throw new Error(`${source} was accepted but should not have been`);
  return result.error;
}

describe('single-branch functions', () => {
  it('accepts anything continuous on its domain, asymptotes included', () => {
    // tan and 1/x are continuous on their domain: the pole is not in it. The
    // trace stops there — the function is not refused. (ADR 0007)
    // `1/(x-5)` rather than `1/x`: the pole has to sit inside the interval but
    // away from the shooter, who needs a starting point.
    for (const source of ['x^2', '3*sin(x/2)', 'tan(x)', '1/(x-5)', 'ln(x+30)', 'abs(x)']) {
      expect(accepted(source), source).toBe(true);
    }
  });

  it('refuses a function with no value at the shooter', () => {
    const e = rejection('ln(x)');
    expect(e.code).toBe('ERR_UNDEFINED_AT_ORIGIN');
    expect(e.message).toContain('logarithme');

    expect(rejection('1/x').code).toBe('ERR_UNDEFINED_AT_ORIGIN');
    expect(rejection('sqrt(x - 1)').code).toBe('ERR_UNDEFINED_AT_ORIGIN');
  });
});

describe('piecewise junctions', () => {
  it('accepts branches that join up', () => {
    expect(accepted('{ x^2 si x < 2 ; 4 + 3*(x-2) si x >= 2 }')).toBe(true);
    expect(accepted('{ x si x < 0 ; x sinon }')).toBe(true);
    expect(accepted('{ sin(x) si x < 1 ; sin(x) si x >= 1 }')).toBe(true);
  });

  it('refuses a jump, and says where and by how much', () => {
    const e = rejection('{ x^2 si x < 2 ; 7 + 3*(x-2) si x >= 2 }');
    expect(e.code).toBe('ERR_DISCONTINUITY');
    expect(e.params).toMatchObject({ x: 2 });
    expect(e.message).toContain('x = 2');
    expect(e.message).toContain('4');
    expect(e.message).toContain('7');
  });

  it('finds a junction whose guard cannot be solved on paper', () => {
    // The guard is not of the form `x < c`, so the exact breakpoint list is
    // empty and only the numeric scan can find the junction.
    const source = '{ 0 si sin(x) < 0 ; 5 sinon }';
    expect(parsed(source).breakpoints).toEqual([]);
    expect(rejection(source).code).toBe('ERR_DISCONTINUITY');
  });

  it('refuses a branch that runs off to infinity at the junction', () => {
    const e = rejection('{ 1/(x-1) si x < 1 ; 0 sinon }');
    expect(e.code).toBe('ERR_DISCONTINUITY');
    expect(e.params).toMatchObject({ leftLimit: null });
    expect(e.message).toContain('aucune limite');
  });

  it('accepts a steep but continuous junction', () => {
    // A thousand units of rise per unit of x is not a jump, and must not be
    // mistaken for one by the numerical tolerance.
    expect(accepted('{ 1000*x si x < 1 ; 1000 + 1000*(x-1) si x >= 1 }')).toBe(true);
  });

  it('leaves a domain boundary alone', () => {
    // Undefined on (0, 1]: x = 1 is an edge of the domain, not a discontinuity.
    expect(accepted('{ ln(x) si x > 1 ; sqrt(-x) si x <= 1 }')).toBe(true);
  });

  it('leaves a removable hole alone', () => {
    // No guard holds at exactly 1; both sides agree. The trace simply stops.
    expect(accepted('{ x si x < 1 ; x si x > 1 }')).toBe(true);
  });

  it('only inspects the interval that would be drawn', () => {
    const source = '{ 0 si x < 100 ; 5 sinon }';
    expect(check(parsed(source), { from: -20, to: 20 }, DEFAULT_TRACE_PARAMS).ok).toBe(true);
    expect(check(parsed(source), { from: 0, to: 200 }, DEFAULT_TRACE_PARAMS).ok).toBe(false);
  });

  it('reads the interval the same way in either direction', () => {
    const source = '{ 0 si x < -5 ; 5 sinon }';
    expect(check(parsed(source), { from: -20, to: 0 }, DEFAULT_TRACE_PARAMS).ok).toBe(false);
    expect(check(parsed(source), { from: 0, to: -20 }, DEFAULT_TRACE_PARAMS).ok).toBe(false);
  });

  it('reports the first discontinuity along the interval, not a list', () => {
    const e = rejection('{ 9 si x < -3 ; 0 si x < 3 ; 9 sinon }');
    expect(e.params).toMatchObject({ x: -3 });
  });
});
