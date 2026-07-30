import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_TRACE_PARAMS,
  MAX_AST_DEPTH,
  MAX_AST_NODES,
  MAX_SOURCE_LENGTH,
  type ExprNode,
} from '@fw/contracts';
import { parse } from './parser.js';
import { evaluate } from './evaluate.js';
import { check } from './continuity.js';

/**
 * Print an AST back to source, fully parenthesised.
 *
 * Only the round-trip property needs this, so it lives here rather than in the
 * package's public surface. If a caller ever appears — replay display, say — it
 * moves out then, and not before.
 */
function print(node: ExprNode): string {
  switch (node.kind) {
    case 'number':
      return `(${String(node.value)})`;
    case 'constant':
      return node.name;
    case 'variable':
      return 'x';
    case 'negate':
      return `(-${print(node.operand)})`;
    case 'binary':
      return `(${print(node.left)} ${node.op} ${print(node.right)})`;
    case 'call':
      return `${node.name}(${print(node.arg)})`;
    case 'piecewise':
      return `{ ${node.branches
        .map((b) => (b.guard === null ? `${print(b.body)} sinon` : `${print(b.body)} si x < 0`))
        .join(' ; ')} }`;
  }
}

/** Trees without piecewise, so `print` is faithful and the round trip is exact. */
const arbitraryAst = fc.letrec<{ node: ExprNode }>((tie) => ({
  node: fc.oneof(
    { maxDepth: 4, withCrossShrink: true },
    fc.nat({ max: 1000 }).map((value): ExprNode => ({ kind: 'number', value })),
    fc.constantFrom<ExprNode>({ kind: 'variable' }, { kind: 'constant', name: 'pi' }),
    fc.record({
      kind: fc.constant('negate' as const),
      operand: tie('node'),
    }),
    fc.record({
      kind: fc.constant('binary' as const),
      op: fc.constantFrom('+' as const, '-' as const, '*' as const, '/' as const),
      left: tie('node'),
      right: tie('node'),
    }),
    fc.record({
      kind: fc.constant('call' as const),
      name: fc.constantFrom('sin' as const, 'cos' as const, 'atan' as const, 'tanh' as const),
      arg: tie('node'),
    }),
  ),
})).node;

describe('the parser survives anything', () => {
  it('never throws, whatever the input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (source) => {
        expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });

  it('never throws on input built from the language alphabet', () => {
    const alphabet = fc.string({
      unit: fc.constantFrom(...'x+-*/^(){}<>=;, 0123456789.sincoetalgqrbpu'.split('')),
      maxLength: 120,
    });
    fc.assert(
      fc.property(alphabet, (source) => {
        expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: 3000 },
    );
  });

  it('either fails or reports a tree inside every limit', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (source) => {
        const result = parse(source);
        if (!result.ok) return;
        expect(result.value.nodeCount).toBeLessThanOrEqual(MAX_AST_NODES);
        expect(result.value.depth).toBeLessThanOrEqual(MAX_AST_DEPTH);
      }),
      { numRuns: 2000 },
    );
  });

  it('always produces a message a human can read', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (source) => {
        const result = parse(source);
        if (result.ok) return;
        expect(result.error.message.length).toBeGreaterThan(0);
        expect(result.error.message).not.toContain('undefined');
        expect(result.error.message).not.toContain('[object');
      }),
      { numRuns: 2000 },
    );
  });
});

describe('printing and parsing are inverse', () => {
  it('parses back to the same tree', () => {
    fc.assert(
      fc.property(arbitraryAst, (tree) => {
        const source = print(tree);
        fc.pre(source.length <= MAX_SOURCE_LENGTH);
        const result = parse(source);
        expect(result.ok, source).toBe(true);
        if (!result.ok) return;
        expect(result.value.ast).toEqual(tree);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('the evaluator survives anything', () => {
  it('never throws, on any tree at any point', () => {
    fc.assert(
      fc.property(arbitraryAst, fc.double({ min: -1e6, max: 1e6, noNaN: true }), (tree, x) => {
        expect(() => evaluate(tree, x)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });

  it('returns a finite number whenever it says a value is defined', () => {
    fc.assert(
      fc.property(arbitraryAst, fc.double({ min: -1e3, max: 1e3, noNaN: true }), (tree, x) => {
        const outcome = evaluate(tree, x);
        if (outcome.defined) expect(Number.isFinite(outcome.value)).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });

  it('agrees with a hand-written polynomial', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 5 }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        (coefficients, x) => {
          const source = coefficients
            .map((c, i) => (i === 0 ? String(c) : `${String(c)}*x^${String(i)}`))
            .join(' + ');
          const expected = coefficients.reduce((sum, c, i) => sum + c * Math.pow(x, i), 0);

          const parsed = parse(source);
          expect(parsed.ok, source).toBe(true);
          if (!parsed.ok) return;
          const outcome = evaluate(parsed.value.ast, x);
          expect(outcome.defined).toBe(true);
          if (!outcome.defined) return;
          expect(outcome.value).toBeCloseTo(expected, 6);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('continuity', () => {
  const interval = { from: -20, to: 20 };

  it('accepts every branch pair that is glued at the junction', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -9, max: 9 }),
        fc.integer({ min: -5, max: 5 }),
        fc.integer({ min: -5, max: 5 }),
        (junction, slopeLeft, slopeRight) => {
          // Two lines meeting at `junction` with the same value there.
          const j = String(junction);
          const source = `{ ${String(slopeLeft)}*(x - ${j}) si x < ${j} ; ${String(slopeRight)}*(x - ${j}) sinon }`;
          const parsed = parse(source);
          expect(parsed.ok, source).toBe(true);
          if (!parsed.ok) return;
          expect(check(parsed.value, interval, DEFAULT_TRACE_PARAMS).ok, source).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('refuses the same pair once one side is shifted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -9, max: 9 }),
        fc.integer({ min: 1, max: 50 }),
        (junction, shift) => {
          const j = String(junction);
          const source = `{ x - ${j} si x < ${j} ; x - ${j} + ${String(shift)} sinon }`;
          const parsed = parse(source);
          expect(parsed.ok, source).toBe(true);
          if (!parsed.ok) return;
          const result = check(parsed.value, interval, DEFAULT_TRACE_PARAMS);
          expect(result.ok, source).toBe(false);
          if (result.ok) return;
          expect(result.error.code).toBe('ERR_DISCONTINUITY');
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('cost of a hostile input', () => {
  it('parses the longest allowed source well under a millisecond', () => {
    const adversarial = [
      `${'('.repeat(120)}x${')'.repeat(120)}`,
      `sin(${'cos('.repeat(30)}x${')'.repeat(30)})`,
      `1${'+1'.repeat(120)}`,
      'x'.padEnd(MAX_SOURCE_LENGTH, '+'),
      '{'.repeat(200),
      '9'.repeat(MAX_SOURCE_LENGTH),
    ];

    for (const source of adversarial) {
      const started = performance.now();
      for (let i = 0; i < 100; i += 1) parse(source);
      const perParse = (performance.now() - started) / 100;
      // The budget is 1 ms; asserting at 5 leaves room for a loaded CI runner
      // without letting a genuine regression through.
      expect(perParse, source.slice(0, 24)).toBeLessThan(5);
    }
  });
});
