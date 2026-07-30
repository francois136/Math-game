import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from './rng.js';

describe('createRng', () => {
  it('reproduces the same sequence for the same seed', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 32 }), (seed) => {
        const first = createRng(seed);
        const second = createRng(seed);
        const a = Array.from({ length: 64 }, () => first.nextFloat());
        const b = Array.from({ length: 64 }, () => second.nextFloat());
        // The whole stream replays, not just the first draw.
        expect(a).toEqual(b);
      }),
    );
  });

  it('stays in [0, 1)', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 10_000; i += 1) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('draws integers inside the requested half-open range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 500 }),
        (min, span) => {
          const rng = createRng(`int-${String(min)}-${String(span)}`);
          for (let i = 0; i < 100; i += 1) {
            const v = rng.nextInt(min, min + span);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThan(min + span);
          }
        },
      ),
    );
  });

  it('rejects empty ranges rather than returning a silent NaN', () => {
    const rng = createRng('empty');
    expect(() => rng.nextInt(5, 5)).toThrow();
    expect(() => rng.nextRange(2, 1)).toThrow();
  });

  it('gives independent streams to independent forks', () => {
    const root = createRng('fork');
    const a = root.fork('map');
    const b = root.fork('order');
    const seqA = Array.from({ length: 16 }, () => a.nextFloat());
    const seqB = Array.from({ length: 16 }, () => b.nextFloat());
    expect(seqA).not.toEqual(seqB);

    // A fork is reproducible from the seed alone, whatever the parent did after.
    const replay = createRng('fork').fork('map');
    expect(Array.from({ length: 16 }, () => replay.nextFloat())).toEqual(seqA);
  });
});
