import { fwError, MAX_SOURCE_LENGTH, type FwError } from '@fw/contracts';

export type TokenKind =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'comparison'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'separator'
  | 'comma'
  | 'eof';

export interface Token {
  readonly kind: TokenKind;
  /** Exactly as it appears in the source, for error messages. */
  readonly text: string;
  /** Index of the first character in the source. */
  readonly start: number;
  /** Only set for `number` tokens. */
  readonly value: number | null;
}

/** Words the parser treats as syntax rather than as names. */
export const KEYWORDS = ['si', 'sinon', 'et', 'ou'] as const;
export type Keyword = (typeof KEYWORDS)[number];

export function isKeyword(text: string): text is Keyword {
  return (KEYWORDS as readonly string[]).includes(text);
}

const LETTER = /[a-zA-Z]/;
const DIGIT = /[0-9]/;

/**
 * Source → tokens.
 *
 * Two deliberate choices, both to keep the language unambiguous for a player
 * who is not thinking about lexing:
 *
 * - Identifiers are letters only. `x2` is not a name, so `2x` can never be
 *   read two ways.
 * - There is no scientific notation. `2e5` is 2·e·5, not 200000 — because a
 *   player who writes `e` means Euler's number, every time.
 *
 * A newline is a separator inside a piecewise block and whitespace everywhere
 * else, so it is emitted as a `separator` token like `;` and simply not
 * expected by the rest of the grammar.
 */
export function tokenize(source: string): Token[] | FwError {
  if (source.trim().length === 0) {
    return fwError('ERR_EMPTY_INPUT', {});
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    return fwError('ERR_INPUT_TOO_LONG', { length: source.length, max: MAX_SOURCE_LENGTH });
  }

  const tokens: Token[] = [];
  let i = 0;

  const push = (
    kind: TokenKind,
    text: string,
    start: number,
    value: number | null = null,
  ): void => {
    tokens.push({ kind, text, start, value });
  };

  while (i < source.length) {
    const c = source[i] ?? '';

    if (c === '\n') {
      push('separator', '\\n', i);
      i += 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
      continue;
    }

    if (DIGIT.test(c) || (c === '.' && DIGIT.test(source[i + 1] ?? ''))) {
      const start = i;
      while (DIGIT.test(source[i] ?? '')) i += 1;
      if (source[i] === '.') {
        i += 1;
        while (DIGIT.test(source[i] ?? '')) i += 1;
      }
      const text = source.slice(start, i);
      push('number', text, start, Number(text));
      continue;
    }

    if (LETTER.test(c)) {
      const start = i;
      while (LETTER.test(source[i] ?? '')) i += 1;
      push('identifier', source.slice(start, i), start);
      continue;
    }

    switch (c) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
        push('operator', c, i);
        i += 1;
        continue;
      case '(':
        push('lparen', c, i);
        i += 1;
        continue;
      case ')':
        push('rparen', c, i);
        i += 1;
        continue;
      case '{':
        push('lbrace', c, i);
        i += 1;
        continue;
      case '}':
        push('rbrace', c, i);
        i += 1;
        continue;
      case ';':
        push('separator', c, i);
        i += 1;
        continue;
      // Never valid, but tokenised so the parser can say "this function takes
      // one argument" instead of pointing at a character.
      case ',':
        push('comma', c, i);
        i += 1;
        continue;
      case '<':
      case '>': {
        const two = source[i + 1] === '=' ? `${c}=` : c;
        push('comparison', two, i);
        i += two.length;
        continue;
      }
      case '≤':
        push('comparison', '<=', i);
        i += 1;
        continue;
      case '≥':
        push('comparison', '>=', i);
        i += 1;
        continue;
      default:
        return fwError('ERR_SYNTAX', { position: i, found: c });
    }
  }

  push('eof', '', source.length);
  return tokens;
}
