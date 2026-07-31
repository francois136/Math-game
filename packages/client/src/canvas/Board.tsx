import { useEffect, useRef } from 'react';
import type { MatchState, TraceResult } from '@fw/contracts';
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

/**
 * Every curve drawn on the last round.
 *
 * One in turn-based play; in simultaneous play, all of them — several shots
 * share a round index and they all left at the same instant, so drawing only
 * the last would hide what happened (ADR 0019).
 */
function lastRound(match: MatchState): readonly TraceResult[] {
  const index = match.history.at(-1)?.index;
  if (index === undefined) return [];
  return match.history
    .filter((record) => record.index === index && record.trace !== null)
    .map((record) => record.trace)
    .filter((trace): trace is TraceResult => trace !== null);
}

export function Board({ match, preview, selfId, animate }: Props): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shots = lastRound(match);
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
      for (const shot of shots) {
        drawShot(context, shot.polyline, shot.stop.at, view, progress);
      }
      drawPreview(context, preview, view);
      drawPlayers(context, match, view, selfId);

      if (progress < 1) frame = requestAnimationFrame(paint);
    };

    paint();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [match, preview, selfId, animate, shots, shotKey]);

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
