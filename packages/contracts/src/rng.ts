import type { Seed } from './ids.js';

/**
 * Deterministic randomness.
 *
 * This lives in @fw/contracts, not in an implementation package, because the
 * exact bit pattern of the generator is part of the compatibility surface: a
 * replay recorded today must reproduce on tomorrow's build. Changing the
 * algorithm is a breaking contract change and needs an ADR (see ADR 0004).
 *
 * `Math.random` is banned repository-wide by the lint config.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  nextFloat(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number;
  /** Uniform in [min, max). */
  nextRange(min: number, max: number): number;
  /**
   * A child generator, independent of this one and of its siblings.
   *
   * Use one stream per concern — map generation, turn order, bot decisions — so
   * that adding a draw in one place does not shift every other sequence.
   */
  fork(label: string): Rng;
}

/** xmur3: string -> 32-bit seed state. */
function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: 32-bit state, period 2^32, fast and adequate for game content. */
function mulberry32(state: number): () => number {
  let s = state >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fromState(state: number, provenance: string): Rng {
  const next = mulberry32(state);
  return {
    nextFloat: next,
    nextInt(minInclusive, maxExclusive) {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
        throw new Error('nextInt expects integer bounds');
      }
      if (maxExclusive <= minInclusive) {
        throw new Error(`nextInt: empty range [${String(minInclusive)}, ${String(maxExclusive)})`);
      }
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    nextRange(min, max) {
      if (!(max > min)) {
        throw new Error(`nextRange: empty range [${String(min)}, ${String(max)})`);
      }
      return min + next() * (max - min);
    },
    fork(label) {
      return fromState(hashString(`${provenance}/${label}`), `${provenance}/${label}`);
    },
  };
}

/** The root generator for a match. Every other stream is a `fork` of it. */
export function createRng(seed: Seed | string): Rng {
  return fromState(hashString(seed), seed);
}
