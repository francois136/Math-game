import {
  DEFAULT_MAP_PARAMS,
  ObstacleIdSchema,
  PlayerIdSchema,
  type EvaluatorPort,
  type GameMap,
  type ObstacleId,
  type ParsedExpression,
  type PlayerId,
} from '@fw/contracts';

/**
 * Fixtures for this package's own tests. Not exported from `index.ts` and not
 * compiled into `dist`; it exists so that three test files do not each grow
 * their own copy of the same scaffolding.
 */

export const obstacleIdOf = (name: string): ObstacleId => ObstacleIdSchema.parse(name);
export const playerIdOf = (name: string): PlayerId => PlayerIdSchema.parse(name);

/**
 * A function the tracer can walk, without going through @fw/core-math.
 *
 * The AST is a placeholder: this evaluator ignores it and calls the JavaScript
 * function it was given. That is the point of injecting the evaluator (ADR
 * 0009) — a failing tracer test cannot be blamed on the parser.
 */
export function functionUnderTest(f: (x: number) => number | null): {
  expression: ParsedExpression;
  evaluator: EvaluatorPort;
} {
  return {
    expression: {
      source: '(test)',
      ast: { kind: 'variable' },
      nodeCount: 1,
      depth: 1,
      breakpoints: [],
    },
    evaluator: {
      evaluate: (_ast, x) => {
        const value = f(x);
        return value === null || !Number.isFinite(value)
          ? { defined: false, failure: 'not-finite' }
          : { defined: true, value };
      },
    },
  };
}

/** An empty field, for tests that care about one obstacle and nothing else. */
export function emptyMap(): GameMap {
  return {
    name: 'test',
    bounds: DEFAULT_MAP_PARAMS.bounds,
    obstacles: [],
    spawns: [
      { index: 0, position: { x: -30, y: 0 } },
      { index: 1, position: { x: 30, y: 0 } },
    ],
    seed: null,
    generatorVersion: 0,
  };
}
