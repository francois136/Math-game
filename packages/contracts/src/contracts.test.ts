import { describe, expect, it } from 'vitest';
import { fwError } from './messages.fr.js';
import { errorCategory, isRecoverable, type FwErrorCode } from './errors.js';
import { DEFAULT_MATCH_CONFIG, MatchConfigSchema } from './config.js';
import { ClientFrameSchema, PROTOCOL_VERSION, ServerFrameSchema } from './protocol.js';
import { GameMapSchema } from './geometry.js';
import { FUNCTION_ARITY, FUNCTION_NAMES } from './expression.js';

describe('errors', () => {
  it('renders a French sentence for every code', () => {
    const samples: Array<ReturnType<typeof fwError>> = [
      fwError('ERR_EMPTY_INPUT', {}),
      fwError('ERR_SYNTAX', { position: 3, found: ')' }),
      fwError('ERR_DISCONTINUITY', { x: 2, leftLimit: 4, rightLimit: 7 }),
      fwError('ERR_UNDEFINED_AT_ORIGIN', { x: -4, failure: 'log-of-non-positive' }),
      fwError('ERR_LOBBY_FULL', { max: 8 }),
    ];
    for (const e of samples) {
      expect(e.message.length).toBeGreaterThan(0);
      expect(e.message).not.toContain('undefined');
      expect(e.message).not.toContain('[object');
    }
  });

  it('spells numbers the French way', () => {
    const e = fwError('ERR_DISCONTINUITY', { x: 2.5, leftLimit: -1.25, rightLimit: null });
    expect(e.message).toContain('x = 2,5');
    expect(e.message).toContain('−1,25');
    expect(e.message).toContain('aucune limite');
  });

  it('treats parse and validation failures as costing no turn', () => {
    const recoverable: FwErrorCode[] = ['ERR_SYNTAX', 'ERR_DISCONTINUITY', 'ERR_AST_TOO_DEEP'];
    for (const code of recoverable) {
      expect(isRecoverable(code)).toBe(true);
    }
    expect(isRecoverable('ERR_NOT_YOUR_TURN')).toBe(false);
    expect(errorCategory('ERR_RATE_LIMITED')).toBe('transport');
    expect(errorCategory('ERR_MAP_GENERATION_FAILED')).toBe('rules');
  });
});

describe('config', () => {
  it('accepts its own defaults', () => {
    expect(MatchConfigSchema.safeParse(DEFAULT_MATCH_CONFIG).success).toBe(true);
  });

  it('refuses a turn duration outside the playable range', () => {
    const tooShort = {
      ...DEFAULT_MATCH_CONFIG,
      rules: { ...DEFAULT_MATCH_CONFIG.rules, turnDurationMs: 100 },
    };
    expect(MatchConfigSchema.safeParse(tooShort).success).toBe(false);
  });
});

describe('geometry', () => {
  it('refuses a degenerate bounding box', () => {
    const map = {
      name: 'flat',
      bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 10 } },
      obstacles: [],
      spawns: [
        { index: 0, position: { x: 1, y: 1 } },
        { index: 1, position: { x: 2, y: 2 } },
      ],
      seed: null,
      generatorVersion: 0,
    };
    expect(GameMapSchema.safeParse(map).success).toBe(false);
  });
});

describe('protocol', () => {
  it('rejects a frame whose message type is unknown', () => {
    const frame = { id: 0, message: { type: 'shot:cheat', source: 'x' } };
    expect(ClientFrameSchema.safeParse(frame).success).toBe(false);
  });

  it('rejects a function source longer than the hard limit', () => {
    const frame = {
      id: 1,
      message: { type: 'shot:fire', shot: { source: 'x'.repeat(10_000), direction: 'increasing' } },
    };
    expect(ClientFrameSchema.safeParse(frame).success).toBe(false);
  });

  it('round-trips a well-formed frame in each direction', () => {
    const client = { id: 7, message: { type: 'ping' } };
    expect(ClientFrameSchema.safeParse(client).success).toBe(true);

    const server = {
      replyTo: 7,
      message: { type: 'shot:validation', ok: false, error: fwError('ERR_EMPTY_INPUT', {}) },
    };
    expect(ServerFrameSchema.safeParse(server).success).toBe(true);
  });

  it('pins the protocol version so a bump is a deliberate diff', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe('expression surface', () => {
  it('declares an arity for every callable function', () => {
    for (const name of FUNCTION_NAMES) {
      expect(FUNCTION_ARITY[name]).toBe(1);
    }
    expect(Object.keys(FUNCTION_ARITY)).toHaveLength(FUNCTION_NAMES.length);
  });

  it('excludes every discontinuous built-in', () => {
    for (const banned of ['floor', 'ceil', 'round', 'sign', 'mod']) {
      expect(FUNCTION_NAMES).not.toContain(banned);
    }
  });
});
