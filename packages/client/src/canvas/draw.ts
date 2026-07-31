import type { Aabb, GameMap, MatchState, Vec2 } from '@fw/contracts';
import type { Preview } from '../preview.js';

/**
 * Everything drawn on the field.
 *
 * The two curves are deliberately unalike: the preview is a thin dashed line in
 * a cool colour, the confirmed shot a solid warm one with a marker where it
 * stopped. A player must never wonder which of the two they are looking at —
 * one is a guess about a shape, the other is what happened (ADR 0006).
 */

export interface Palette {
  readonly background: string;
  readonly grid: string;
  readonly axes: string;
  readonly obstacle: string;
  readonly preview: string;
  readonly shot: string;
  readonly stop: string;
  readonly self: string;
  readonly rival: string;
  readonly shield: string;
  readonly dead: string;
}

export const PALETTE: Palette = {
  background: '#0e1420',
  grid: '#182233',
  axes: '#243247',
  obstacle: '#3d4d68',
  preview: '#6fd3ff',
  shot: '#ffb454',
  stop: '#ff6b6b',
  self: '#7ee787',
  rival: '#e8eaed',
  shield: '#6fd3ff',
  dead: '#4a5568',
};

/** Maps world coordinates to canvas pixels, keeping the aspect ratio honest. */
export interface Viewport {
  readonly toScreen: (point: Vec2) => Vec2;
  readonly scale: number;
}

export function viewportFor(bounds: Aabb, width: number, height: number): Viewport {
  const worldWidth = bounds.max.x - bounds.min.x;
  const worldHeight = bounds.max.y - bounds.min.y;
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const offsetX = (width - worldWidth * scale) / 2;
  const offsetY = (height - worldHeight * scale) / 2;

  return {
    scale,
    // Screen y grows downwards, the world's grows up: the flip lives here and
    // nowhere else.
    toScreen: (point) => ({
      x: offsetX + (point.x - bounds.min.x) * scale,
      y: offsetY + (bounds.max.y - point.y) * scale,
    }),
  };
}

export function drawField(
  context: CanvasRenderingContext2D,
  map: GameMap,
  view: Viewport,
  width: number,
  height: number,
): void {
  context.fillStyle = PALETTE.background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = PALETTE.grid;
  context.lineWidth = 1;
  for (let x = Math.ceil(map.bounds.min.x / 10) * 10; x <= map.bounds.max.x; x += 10) {
    line(
      context,
      view.toScreen({ x, y: map.bounds.min.y }),
      view.toScreen({ x, y: map.bounds.max.y }),
    );
  }
  for (let y = Math.ceil(map.bounds.min.y / 10) * 10; y <= map.bounds.max.y; y += 10) {
    line(
      context,
      view.toScreen({ x: map.bounds.min.x, y }),
      view.toScreen({ x: map.bounds.max.x, y }),
    );
  }

  context.strokeStyle = PALETTE.axes;
  context.lineWidth = 1.5;
  line(
    context,
    view.toScreen({ x: map.bounds.min.x, y: 0 }),
    view.toScreen({ x: map.bounds.max.x, y: 0 }),
  );
  line(
    context,
    view.toScreen({ x: 0, y: map.bounds.min.y }),
    view.toScreen({ x: 0, y: map.bounds.max.y }),
  );

  context.fillStyle = PALETTE.obstacle;
  for (const obstacle of map.obstacles) {
    context.beginPath();
    if (obstacle.kind === 'rect') {
      const min = view.toScreen({ x: obstacle.box.min.x, y: obstacle.box.max.y });
      const max = view.toScreen({ x: obstacle.box.max.x, y: obstacle.box.min.y });
      context.rect(min.x, min.y, max.x - min.x, max.y - min.y);
    } else if (obstacle.kind === 'disc') {
      const centre = view.toScreen(obstacle.center);
      context.arc(centre.x, centre.y, obstacle.radius * view.scale, 0, Math.PI * 2);
    } else {
      obstacle.vertices.forEach((vertex, index) => {
        const point = view.toScreen(vertex);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
    }
    context.fill();
  }
}

export function drawPlayers(
  context: CanvasRenderingContext2D,
  match: MatchState,
  view: Viewport,
  selfId: string | null,
): void {
  for (const player of match.players) {
    const centre = view.toScreen(player.origin);
    const radius = Math.max(4, player.radius * view.scale);

    context.beginPath();
    context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    context.fillStyle = !player.alive
      ? PALETTE.dead
      : player.id === selfId
        ? PALETTE.self
        : PALETTE.rival;
    context.fill();

    if (player.alive && player.shieldTurnsLeft > 0) {
      context.beginPath();
      context.arc(centre.x, centre.y, radius + 5, 0, Math.PI * 2);
      context.strokeStyle = PALETTE.shield;
      context.lineWidth = 2;
      context.setLineDash([4, 4]);
      context.stroke();
      context.setLineDash([]);
    }

    context.fillStyle = player.alive ? '#c9d4e4' : PALETTE.dead;
    context.font = '13px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText(player.name, centre.x, centre.y - radius - 9);
  }
}

export function drawPreview(
  context: CanvasRenderingContext2D,
  preview: Preview,
  view: Viewport,
): void {
  if (preview.kind !== 'curve' || preview.points.length < 2) return;

  context.beginPath();
  preview.points.forEach((point, index) => {
    const screen = view.toScreen(point);
    if (index === 0) context.moveTo(screen.x, screen.y);
    else context.lineTo(screen.x, screen.y);
  });
  context.strokeStyle = PALETTE.preview;
  context.lineWidth = 1.5;
  context.setLineDash([5, 5]);
  context.stroke();
  context.setLineDash([]);
}

/**
 * The shot as the server resolved it.
 *
 * `progress` between 0 and 1 draws it being fired, which is the only animation
 * in the game and the only way to see *where* a curve failed rather than just
 * that it did.
 */
export function drawShot(
  context: CanvasRenderingContext2D,
  polyline: readonly Vec2[],
  stopAt: Vec2 | null,
  view: Viewport,
  progress: number,
): void {
  if (polyline.length < 2) return;
  const drawn = Math.max(2, Math.floor(polyline.length * Math.min(1, Math.max(0, progress))));

  context.beginPath();
  for (let i = 0; i < drawn; i += 1) {
    const point = polyline[i];
    if (point === undefined) continue;
    const screen = view.toScreen(point);
    if (i === 0) context.moveTo(screen.x, screen.y);
    else context.lineTo(screen.x, screen.y);
  }
  context.strokeStyle = PALETTE.shot;
  context.lineWidth = 2.5;
  context.stroke();

  if (stopAt !== null && drawn >= polyline.length) {
    const screen = view.toScreen(stopAt);
    context.beginPath();
    context.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
    context.fillStyle = PALETTE.stop;
    context.fill();
  }
}

function line(context: CanvasRenderingContext2D, from: Vec2, to: Vec2): void {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}
