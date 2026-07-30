/**
 * @fw/rules — the state of a match and the only ways it can change.
 *
 * Pure: no I/O, no DOM, no clock. `apply` never mutates the state it is given;
 * it returns a new one alongside the list of what happened.
 */

import type { RulesEnginePort } from '@fw/contracts';
import { apply, createMatch } from './engine.js';

export { createMatch, apply } from './engine.js';
export type { Applied } from './engine.js';
export { targetsFor } from './vulnerability.js';
export { outcomeOf } from './outcome.js';

/** The port this package implements. */
export const rules: RulesEnginePort = { createMatch, apply };
