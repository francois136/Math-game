import {
  REPLAY_FORMAT,
  REPLAY_VERSION,
  ReplaySchema,
  err,
  fwError,
  ok,
  type FwError,
  type MatchState,
  type Replay,
  type Result,
  type RulesDeps,
} from '@fw/contracts';
import { createMatch, apply } from './engine.js';

/**
 * A match as a document, and a document back as a match.
 *
 * The document holds what people did — seed, configuration, map, one line per
 * turn — and not what the engine drew. The curves are recomputed when it is
 * read, which is why a thirty-turn duel is four kilobytes rather than two
 * hundred and seventy (ADR 0018).
 *
 * `replay(export(state))` returns a state equal to `state`, field for field.
 * That is a property test, and it is the only thing that makes a replay worth
 * keeping: a recording that does not reproduce is a recording of nothing.
 */

export function toReplay(state: MatchState): Replay {
  return {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    matchId: state.id,
    seed: state.seed,
    config: state.config,
    // The map travels with the replay rather than being regenerated from the
    // seed: two kilobytes buys independence from the generator's version.
    map: state.map,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      teamId: player.teamId,
      isBot: player.isBot,
    })),
    startedAtMs: startOf(state),
    turns: state.history.map((record) => ({
      playerId: record.playerId,
      shot: record.shot,
      skipped: record.skipped,
      atMs: record.atMs,
    })),
    outcome: state.outcome,
  };
}

/**
 * The first deadline minus one turn's worth of time — which is what
 * `createMatch` was given, and the only way back to it from a finished state.
 */
function startOf(state: MatchState): number {
  const first = state.history[0]?.atMs ?? state.turn?.deadlineAt ?? 0;
  const guess = first - state.config.rules.turnDurationMs;
  return Math.max(0, state.turn === null ? Math.max(0, guess) : guess);
}

export interface ReplayOptions {
  /** Stop after this many turns. Undefined plays the whole thing. */
  readonly upToTurn?: number;
}

/**
 * Play a document back.
 *
 * Every rejected command is an error, not a shrug: a replay whose shots the
 * engine refuses is a replay recorded by another build, and saying so beats
 * returning a match that quietly diverged.
 */
export function replay(
  document: unknown,
  deps: RulesDeps,
  options: ReplayOptions = {},
): Result<MatchState, FwError> {
  const parsed = ReplaySchema.safeParse(document);
  if (!parsed.success) {
    return err(
      fwError('ERR_BAD_REPLAY', { detail: parsed.error.issues[0]?.message ?? 'illisible' }),
    );
  }
  const doc = parsed.data;

  const created = createMatch(
    {
      id: doc.matchId,
      seed: doc.seed,
      config: doc.config,
      players: doc.players.map((player) => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        isBot: player.isBot,
      })),
      map: doc.map,
      startedAtMs: doc.startedAtMs,
    },
    deps,
  );
  if (!created.ok) return created;

  let state = created.value;
  const wanted = options.upToTurn ?? doc.turns.length;

  for (const [index, turn] of doc.turns.entries()) {
    if (index >= wanted) break;

    const applied = apply(
      state,
      turn.shot === null
        ? { kind: 'pass', playerId: turn.playerId }
        : { kind: 'fire', playerId: turn.playerId, shot: turn.shot },
      deps,
      turn.atMs,
    );

    if (applied.state === state) {
      return err(
        fwError('ERR_BAD_REPLAY', { detail: `tour ${String(index)} refusé par le moteur` }),
      );
    }
    state = applied.state;
  }

  return ok(state);
}

/** Every state of the match, from the start to the end. For a step-by-step viewer. */
export function replayFrames(document: unknown, deps: RulesDeps): Result<MatchState[], FwError> {
  const parsed = ReplaySchema.safeParse(document);
  if (!parsed.success) {
    return err(
      fwError('ERR_BAD_REPLAY', { detail: parsed.error.issues[0]?.message ?? 'illisible' }),
    );
  }

  const frames: MatchState[] = [];
  for (let turn = 0; turn <= parsed.data.turns.length; turn += 1) {
    const at = replay(document, deps, { upToTurn: turn });
    if (!at.ok) return at;
    frames.push(at.value);
  }
  return ok(frames);
}
