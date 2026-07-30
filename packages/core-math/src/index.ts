/**
 * @fw/core-math — the player's function, turned into something evaluable, or
 * into an error that says what to correct.
 *
 * Pure: no I/O, no DOM, no clock. And no execution of player text, ever
 * (ADR 0002).
 */

import type { ContinuityCheckerPort, EvaluatorPort, ExpressionParserPort } from '@fw/contracts';
import { parse } from './parser.js';
import { evaluate } from './evaluate.js';
import { check } from './continuity.js';

export { parse } from './parser.js';
export { evaluate, evaluateWithSignature, containsVariable } from './evaluate.js';
export { check } from './continuity.js';
export type { ContinuityInterval } from './continuity.js';
export { tokenize, isKeyword, KEYWORDS } from './lexer.js';
export type { Token, TokenKind, Keyword } from './lexer.js';

/** The ports this package implements, ready to drop into `RulesDeps`. */
export const parser: ExpressionParserPort = { parse };
export const evaluator: EvaluatorPort = { evaluate };
export const continuity: ContinuityCheckerPort = { check };
