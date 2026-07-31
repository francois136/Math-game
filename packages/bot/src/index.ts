/**
 * @fw/bot — a shot for a seat nobody is sitting in.
 *
 * Pure: no I/O, no clock, no globals. It goes through the same parser and the
 * same continuity check as a player, and it cannot see anything a player cannot.
 */

import type { BotPort } from '@fw/contracts';
import { chooseShot } from './bot.js';

export { chooseShot, type BotDeps } from './bot.js';
export { FAMILIES, sourceFor, towards, shotOf, type Family } from './candidates.js';

/** The port this package implements. */
export const bot: BotPort = { chooseShot };
