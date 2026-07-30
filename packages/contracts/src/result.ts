/**
 * A explicit success/failure value. Nothing in FunctionWars throws for an
 * expected outcome — a malformed function, a discontinuity, an illegal move are
 * all values, because they must survive serialisation to the client.
 *
 * `throw` stays reserved for programmer errors (invariant violations).
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Narrowing helper for callers that have already checked `ok`. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) {
    throw new Error(`unwrap() on an Err: ${JSON.stringify(r.error)}`);
  }
  return r.value;
}
