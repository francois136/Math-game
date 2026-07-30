import type { GameMap, TraceResult, Vec2 } from '@fw/contracts';
import { distanceToObstacle } from '@fw/physics';

/** Character grid the map is drawn into. Two columns per row keeps it square. */
const COLUMNS = 110;
const ROWS = 34;

const EMPTY = ' ';
const OBSTACLE = '▓';
const CURVE = '·';
const PLAYER = '@';
const SHOOTER = 'O';
const STOP = '×';

/**
 * Draw a map and a shot as text.
 *
 * Deliberately crude: this exists so a human can look at the engine's output
 * before any of it is rendered properly, and catch the kind of mistake no
 * assertion thinks to make — a curve on the wrong side, a map with no cover.
 */
export function render(
  map: GameMap,
  trace: TraceResult | null,
  shooter: Vec2,
  others: readonly Vec2[],
): string {
  const grid: string[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => EMPTY),
  );

  const toColumn = (x: number): number =>
    Math.round(((x - map.bounds.min.x) / (map.bounds.max.x - map.bounds.min.x)) * (COLUMNS - 1));
  // Row 0 is the top of the screen and the top of the world, hence the flip.
  const toRow = (y: number): number =>
    Math.round(((map.bounds.max.y - y) / (map.bounds.max.y - map.bounds.min.y)) * (ROWS - 1));

  const put = (p: Vec2, character: string): void => {
    const row = toRow(p.y);
    const column = toColumn(p.x);
    const line = grid[row];
    if (line === undefined || column < 0 || column >= COLUMNS) return;
    line[column] = character;
  };

  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const point: Vec2 = {
        x: map.bounds.min.x + (column / (COLUMNS - 1)) * (map.bounds.max.x - map.bounds.min.x),
        y: map.bounds.max.y - (row / (ROWS - 1)) * (map.bounds.max.y - map.bounds.min.y),
      };
      if (map.obstacles.some((o) => distanceToObstacle(point, o) === 0)) put(point, OBSTACLE);
    }
  }

  if (trace !== null) {
    // Join consecutive samples so a steep curve stays a line rather than dots.
    let previous: Vec2 | null = null;
    for (const point of trace.polyline) {
      if (previous !== null) {
        const steps = Math.max(
          Math.abs(toColumn(point.x) - toColumn(previous.x)),
          Math.abs(toRow(point.y) - toRow(previous.y)),
        );
        for (let i = 1; i < steps; i += 1) {
          const t = i / steps;
          put(
            {
              x: previous.x + (point.x - previous.x) * t,
              y: previous.y + (point.y - previous.y) * t,
            },
            CURVE,
          );
        }
      }
      put(point, CURVE);
      previous = point;
    }
  }

  for (const other of others) put(other, PLAYER);
  put(shooter, SHOOTER);
  if (trace !== null) put(trace.stop.at, STOP);

  const top = `┌${'─'.repeat(COLUMNS)}┐`;
  const bottom = `└${'─'.repeat(COLUMNS)}┘`;
  const body = grid.map((line) => `│${line.join('')}│`);
  return [top, ...body, bottom].join('\n');
}
