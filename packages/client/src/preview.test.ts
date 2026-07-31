import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_PARAMS } from '@fw/contracts';
import { preview } from './preview.js';

const REQUEST = {
  source: 'x/2',
  origin: { x: -20, y: 0 },
  direction: 'increasing' as const,
  bounds: DEFAULT_MAP_PARAMS.bounds,
};

describe('the toggle', () => {
  it('draws nothing at all when it is off', () => {
    expect(preview(REQUEST, false)).toEqual({ kind: 'off' });
  });

  it('draws when it is on', () => {
    const result = preview(REQUEST, true);
    expect(result.kind).toBe('curve');
  });

  it('costs nothing when off, whatever the function', () => {
    // Off means off: not "computed and hidden". A player who turns it off on a
    // slow machine must actually get their machine back.
    const expensive = { ...REQUEST, source: '20*sin(x*50) + x^3/1000' };
    expect(preview(expensive, false)).toEqual({ kind: 'off' });
  });
});

describe('what it shows', () => {
  it('starts at the player, whatever f(0) is', () => {
    const result = preview({ ...REQUEST, source: 'x^2 + 5' }, true);
    expect(result.kind).toBe('curve');
    if (result.kind !== 'curve') return;
    expect(result.points[0]).toEqual(REQUEST.origin);
  });

  it('walks the way the player is aiming', () => {
    const right = preview(REQUEST, true);
    const left = preview({ ...REQUEST, direction: 'decreasing' }, true);
    if (right.kind !== 'curve' || left.kind !== 'curve') throw new Error('no curve');

    expect(right.points.at(-1)?.x).toBeGreaterThan(REQUEST.origin.x);
    expect(left.points.at(-1)?.x).toBeLessThan(REQUEST.origin.x);
  });

  it('stops where the function stops being defined', () => {
    // Defined only up to x − x₀ = 10, so the drawing ends at world x = −10.
    const result = preview({ ...REQUEST, source: 'sqrt(10 - x)' }, true);
    if (result.kind !== 'curve') throw new Error('no curve');
    expect(result.points.at(-1)?.x).toBeLessThanOrEqual(-10);
  });

  it('stops when it leaves the field, rather than drawing off-screen', () => {
    const result = preview({ ...REQUEST, source: 'x^3' }, true);
    if (result.kind !== 'curve') throw new Error('no curve');
    const last = result.points.at(-1);
    expect(last).toBeDefined();
    // The point that leaves is kept, so the line reaches the edge; the ones
    // after it are not.
    expect(Math.abs(last?.y ?? 0)).toBeLessThan(2 * Math.abs(REQUEST.bounds.max.y));
  });
});

describe('what it says when it cannot draw', () => {
  it('asks for a function rather than showing an error', () => {
    expect(preview({ ...REQUEST, source: '   ' }, true)).toEqual({ kind: 'empty' });
  });

  it('passes the parser’s own words through', () => {
    const result = preview({ ...REQUEST, source: 'sinus(x)' }, true);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.message).toContain('sin');
  });

  it('says when the function has no value at the shooter', () => {
    const result = preview({ ...REQUEST, source: 'ln(x)' }, true);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;
    expect(result.message).toContain('point de départ');
  });
});

describe('what it deliberately does not know', () => {
  it('draws straight through everything, because it cannot see obstacles', () => {
    // The preview has no map beyond its bounds and no players at all: it cannot
    // tell a player where their shot will stop, and that is the whole of
    // ADR 0006. If this test ever needs an obstacle, the boundary has moved.
    const result = preview(REQUEST, true);
    if (result.kind !== 'curve') throw new Error('no curve');
    expect(result.points.length).toBeGreaterThan(100);
    expect(Object.keys(REQUEST)).toEqual(['source', 'origin', 'direction', 'bounds']);
  });
});
