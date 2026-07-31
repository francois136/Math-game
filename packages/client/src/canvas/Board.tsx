import { useEffect, useRef } from 'react';
import type { MatchState } from '@fw/contracts';
import type { Preview } from '../preview.js';
import { drawField, drawPlayers, drawPreview, drawShot, viewportFor } from './draw.js';

const WIDTH = 960;
const HEIGHT = 576;

/** How long a shot takes to draw itself, in milliseconds. */
const SHOT_ANIMATION_MS = 700;

interface Props {
  readonly match: MatchState;
  readonly preview: Preview;
  readonly selfId: string | null;
  readonly animate: boolean;
}

export function Board({ match, preview, selfId, animate }: Props): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastShot = match.history.at(-1)?.trace ?? null;
  const shotKey = match.history.length;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (element === null || context === null || context === undefined) return;

    const view = viewportFor(match.map.bounds, WIDTH, HEIGHT);
    const started = performance.now();
    let frame = 0;

    const paint = (): void => {
      const progress = animate ? (performance.now() - started) / SHOT_ANIMATION_MS : 1;

      drawField(context, match.map, view, WIDTH, HEIGHT);
      if (lastShot !== null) {
        drawShot(context, lastShot.polyline, lastShot.stop.at, view, progress);
      }
      drawPreview(context, preview, view);
      drawPlayers(context, match, view, selfId);

      if (progress < 1) frame = requestAnimationFrame(paint);
    };

    paint();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [match, preview, selfId, animate, lastShot, shotKey]);

  return (
    <canvas
      ref={canvas}
      width={WIDTH}
      height={HEIGHT}
      className="plateau"
      data-testid="plateau"
      aria-label="Terrain de jeu"
    />
  );
}
