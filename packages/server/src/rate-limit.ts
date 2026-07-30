/**
 * Per-connection rate limiting, by token bucket.
 *
 * The limits are in docs/PROTOCOL.md and they are deliberately generous for a
 * human and tight for a script: five validations a second is faster than anyone
 * types, and thirty frames a second is far more than a game of this shape ever
 * needs.
 *
 * The clock is a parameter here too. A limiter that reads the wall clock cannot
 * be tested without sleeping, and a test that sleeps is a test nobody runs.
 */
export interface Limits {
  readonly capacity: number;
  readonly perSecond: number;
}

export const FRAME_LIMIT: Limits = { capacity: 30, perSecond: 30 };
export const VALIDATE_LIMIT: Limits = { capacity: 5, perSecond: 5 };
export const PING_LIMIT: Limits = { capacity: 2, perSecond: 1 };

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly limits: Limits,
    startedAtMs: number,
  ) {
    this.tokens = limits.capacity;
    this.lastRefillMs = startedAtMs;
  }

  /** Take one token. Returns the wait in milliseconds when there is none. */
  take(nowMs: number): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const elapsed = Math.max(0, nowMs - this.lastRefillMs);
    this.tokens = Math.min(
      this.limits.capacity,
      this.tokens + (elapsed * this.limits.perSecond) / 1000,
    );
    this.lastRefillMs = nowMs;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true };
    }
    const missing = 1 - this.tokens;
    return { allowed: false, retryAfterMs: Math.ceil((missing * 1000) / this.limits.perSecond) };
  }
}
