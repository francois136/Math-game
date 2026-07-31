import { z } from 'zod';

/**
 * How hard a bot tries.
 *
 * A bot cannot aim: it has no more idea than a player which function passes
 * between two points on a field built so that nothing obvious does. What it can
 * do is try functions and look at where they went, so its level is how many it
 * tries and how carefully it reads the result.
 *
 * `debutant` — a handful of tries, keeps the best of them. Misses often, and
 *   the shots it fires look like something a person would write.
 * `confirme` — tries several dozen. Finds a way through when there is an easy
 *   one, still walks into obstacles.
 * `redoutable` — tries hundreds, then refines around the closest miss. On a
 *   `facile` field it will find the parabola; on a `difficile` one it is as
 *   stuck as anyone, which is the point of that difficulty.
 */
export const BotLevelSchema = z.enum(['debutant', 'confirme', 'redoutable']);
export type BotLevel = z.infer<typeof BotLevelSchema>;

/** Names shown in the lobby, so a seat reads as a bot and says how strong. */
export const BOT_LEVEL_LABELS: Readonly<Record<BotLevel, string>> = Object.freeze({
  debutant: 'Débutant',
  confirme: 'Confirmé',
  redoutable: 'Redoutable',
});
