import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_PARAMS, type Obstacle } from '@fw/contracts';
import { ALL_SWEEPS, reachableByAnySweep, reachableBySweep } from './connectivity.js';
import { obstacleIdOf } from './testing.js';

const BOUNDS = DEFAULT_MAP_PARAMS.bounds;
const LEFT = { x: -30, y: 0 };
const RIGHT = { x: 30, y: 0 };
const RADIUS = 1.5;

const wall = (name: string, minX: number, maxX: number, minY: number, maxY: number): Obstacle => ({
  kind: 'rect',
  id: obstacleIdOf(name),
  box: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } },
});

describe('is there a continuous function through this?', () => {
  it('an empty field: yes', () => {
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, [], RADIUS)).toBe(true);
  });

  it('a wall from floor to ceiling: no', () => {
    const sealed = [wall('mur', -2, 2, BOUNDS.min.y, BOUNDS.max.y)];
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, sealed, RADIUS)).toBe(false);
  });

  it('the same wall with a gap: yes', () => {
    const withDoor = [wall('bas', -2, 2, BOUNDS.min.y, -4), wall('haut', -2, 2, 4, BOUNDS.max.y)];
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, withDoor, RADIUS)).toBe(true);
  });

  it('a gap too narrow to be a gap: no', () => {
    // The two halves meet: what looks like a seam is not a way through.
    const shut = [wall('bas', -2, 2, BOUNDS.min.y, 0), wall('haut', -2, 2, 0, BOUNDS.max.y)];
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, shut, RADIUS)).toBe(false);
  });

  it('a staircase of walls that never quite closes: yes', () => {
    const maze = [
      wall('a', -20, -16, BOUNDS.min.y, 10),
      wall('b', -8, -4, -10, BOUNDS.max.y),
      wall('c', 6, 10, BOUNDS.min.y, 6),
    ];
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, maze, RADIUS)).toBe(true);
  });

  it('cares which way the sweep goes', () => {
    // Walking towards increasing x reaches a target to the right, and a walk in
    // x never reaches a target straight above.
    expect(
      reachableBySweep(LEFT, RIGHT, BOUNDS, [], RADIUS, { axis: 'x', direction: 'increasing' }),
    ).toBe(true);
    expect(
      reachableBySweep(LEFT, RIGHT, BOUNDS, [], RADIUS, { axis: 'x', direction: 'decreasing' }),
    ).toBe(false);

    const above = { x: -30, y: 20 };
    expect(
      reachableBySweep(LEFT, above, BOUNDS, [], RADIUS, { axis: 'x', direction: 'increasing' }),
    ).toBe(false);
    expect(
      reachableBySweep(LEFT, above, BOUNDS, [], RADIUS, { axis: 'y', direction: 'increasing' }),
    ).toBe(true);
  });

  it('offers all four sweeps, and no more', () => {
    expect(ALL_SWEEPS).toHaveLength(4);
  });

  it('a wall that stops a sweep in x can be walked around in y', () => {
    // Floor to ceiling blocks every function of x. But the two players are side
    // by side, so no function of y joins them either — the field really is cut.
    const sealed = [wall('mur', -2, 2, BOUNDS.min.y, BOUNDS.max.y)];
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, sealed, RADIUS)).toBe(false);

    // Move one player above the other and the same wall stops nothing.
    expect(reachableByAnySweep({ x: -30, y: -20 }, { x: -30, y: 20 }, BOUNDS, sealed, RADIUS)).toBe(
      true,
    );
  });

  it('says no when the shooter is buried in an obstacle', () => {
    const onTop = [wall('sur-lui', -34, -26, -4, 4)];
    expect(reachableByAnySweep(LEFT, RIGHT, BOUNDS, onTop, RADIUS)).toBe(false);
  });
});
