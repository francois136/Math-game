import type { Axis, Direction, Rng, ShotRequest, Vec2 } from '@fw/contracts';

/**
 * The functions a bot is willing to write.
 *
 * It writes *source text*, not an AST, and hands it to the same parser a player
 * types into. That is not a detour: a bot that could submit shots no player
 * could write would be a different game, and the shots it fires end up in the
 * match log where a human reads them.
 *
 * The families are deliberately the ones a person reaches for first — a
 * parabola, a sine, a cubic. Nothing here searches cleverly; the bot's whole
 * skill is how many of these it tries and how well it reads the result.
 */

/** Three decimals is what a player would type, and what the parser reads back. */
function number(value: number): string {
  const rounded = value.toFixed(3);
  // Trim trailing zeros, then a bare trailing dot: 1.500 -> 1.5, 2.000 -> 2.
  return rounded.replace(/0+$/, '').replace(/\.$/, '');
}

/** Never emit `+ -0.5`: a player would write `- 0.5`, and so does the bot. */
function term(coefficient: number, body: string): string {
  const sign = coefficient < 0 ? '-' : '+';
  return ` ${sign} ${number(Math.abs(coefficient))}${body}`;
}

export type Family = 'ligne' | 'parabole' | 'cubique' | 'sinus' | 'racine';

export const FAMILIES: readonly Family[] = [
  'ligne',
  'parabole',
  'cubique',
  'sinus',
  'racine',
] as const;

/**
 * One function of the given family, with its parameters drawn from `rng`.
 *
 * `v` is the variable letter, which follows the axis of the shot (ADR 0013).
 * The ranges are tuned for the default field: a curve has to rise tens of units
 * over tens of units, so coefficients are small and frequencies are low.
 */
export function sourceFor(family: Family, variable: Axis, rng: Rng): string {
  const v = variable;
  switch (family) {
    case 'ligne': {
      const slope = rng.nextRange(-3, 3);
      return `${number(slope)}*${v}`;
    }
    case 'parabole': {
      const a = rng.nextRange(-0.4, 0.4);
      const b = rng.nextRange(-2, 2);
      return `${number(a)}*${v}^2${term(b, `*${v}`)}`;
    }
    case 'cubique': {
      const a = rng.nextRange(-0.02, 0.02);
      const b = rng.nextRange(-1, 1);
      return `${number(a)}*${v}^3${term(b, `*${v}`)}`;
    }
    case 'sinus': {
      const amplitude = rng.nextRange(1, 18);
      const frequency = rng.nextRange(0.05, 0.6);
      return `${number(amplitude)}*sin(${number(frequency)}*${v})`;
    }
    case 'racine': {
      // `abs` keeps it inside the domain whichever way the curve is walked.
      const a = rng.nextRange(-6, 6);
      return `${number(a)}*sqrt(abs(${v}))`;
    }
  }
}

/**
 * Which way to walk to have any chance of reaching `target`.
 *
 * The curve only moves away from its origin in the shot's own variable, so a
 * target behind the shooter is unreachable on that axis whatever the function.
 * Picking the axis and the direction from the geometry is not aiming — it is
 * refusing to fire at a wall.
 */
export function towards(from: Vec2, target: Vec2, rng: Rng): { axis: Axis; direction: Direction } {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  // Along the axis the target is further away on, unless the two are close, in
  // which case either will do and the draw decides.
  const axis: Axis =
    Math.abs(dx) > Math.abs(dy) * 1.2
      ? 'x'
      : Math.abs(dy) > Math.abs(dx) * 1.2
        ? 'y'
        : rng.nextFloat() < 0.5
          ? 'x'
          : 'y';
  const along = axis === 'x' ? dx : dy;
  return { axis, direction: along >= 0 ? 'increasing' : 'decreasing' };
}

export function shotOf(
  family: Family,
  aim: { axis: Axis; direction: Direction },
  rng: Rng,
): ShotRequest {
  return { source: sourceFor(family, aim.axis, rng), axis: aim.axis, direction: aim.direction };
}
