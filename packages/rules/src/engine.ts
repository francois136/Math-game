import {
  createRng,
  err,
  fwError,
  maxPlayerRadiusFor,
  maxSeatsFor,
  ok,
  sizedForSeats,
  type ContinuityInterval,
  type FwError,
  type MatchCommand,
  type MatchEvent,
  type MatchSetup,
  type MatchSetupPlayer,
  type MatchState,
  type Player,
  type PlayerId,
  type Result,
  type Rng,
  type RulesDeps,
  type ShotRequest,
  type SpawnPoint,
  type TurnRecord,
  type TurnSkipReason,
} from '@fw/contracts';
import { targetsFor } from './vulnerability.js';
import { outcomeOf } from './outcome.js';

/**
 * The rules of the game, as a pure function of state and command.
 *
 * Nothing here mutates: `apply` returns a new state and the list of what
 * happened. That is what makes a replay a `reduce` over the turn log, a
 * scripted test a list of commands, and hot-seat the same code as the server
 * with the network taken out.
 */

export function createMatch(setup: MatchSetup, deps: RulesDeps): Result<MatchState, FwError> {
  const { rules, map: mapParams } = setup.config;
  const count = setup.players.length;

  if (count < rules.minPlayers || count > rules.maxPlayers) {
    return err(fwError('ERR_NOT_ENOUGH_PLAYERS', { count, min: rules.minPlayers }));
  }

  // A player wider than the band the generator seals sticks out of it, and the
  // first flat shot wins — measured, and the cliff is sharp (ADR 0017).
  const radiusCeiling = maxPlayerRadiusFor(mapParams.bounds);
  if (mapParams.playerRadius > radiusCeiling) {
    return err(
      fwError('ERR_PLAYER_RADIUS_TOO_LARGE', {
        radius: mapParams.playerRadius,
        max: radiusCeiling,
      }),
    );
  }

  // A field of a given difficulty can only hold so many seats, and finding out
  // at generation time means a full lobby watching an error it cannot read
  // (ADR 0015). Only for a generated map: a hand-authored one has already
  // solved the problem by existing.
  const seatCeiling = maxSeatsFor(mapParams.difficulty);
  if (setup.map === null && count > seatCeiling) {
    return err(
      fwError('ERR_TOO_MANY_SEATS_FOR_DIFFICULTY', {
        count,
        max: seatCeiling,
        difficulty: mapParams.difficulty,
      }),
    );
  }

  if (rules.mode === 'teams') {
    // Every living player on one side means that side has won — so a match that
    // starts with a single side ends on its first resolution, before anyone has
    // played. Refuse it here rather than let the lobby discover it.
    const sides = new Set(setup.players.map((player) => player.teamId ?? `solo:${player.id}`));
    if (sides.size < 2) {
      return err(fwError('ERR_NOT_ENOUGH_TEAMS', { count: sides.size }));
    }
  }

  // The generator is told how many seats to place; the configured value is a
  // default for a lobby that has not filled yet (ADR 0008).
  // The generator is told how many seats and who is on whose side: two
  // team-mates may stand close, two enemies may not (ADR 0014).
  const teams = [...new Set(setup.players.map((player) => player.teamId))].filter(
    (team): team is NonNullable<typeof team> => team !== null,
  );
  const spawnTeams = setup.players.map((player) =>
    player.teamId === null ? null : teams.indexOf(player.teamId),
  );
  const map =
    setup.map !== null
      ? ok(setup.map)
      : deps.maps.generate(
          setup.seed,
          sizedForSeats({ ...mapParams, spawnCount: count, spawnTeams }, count),
        );
  if (!map.ok) return map;

  if (map.value.spawns.length < count) {
    // A hand-authored map with too few seats. Nothing to negotiate.
    return err(fwError('ERR_MAP_GENERATION_FAILED', { attempts: 0 }));
  }

  // Every draw comes from the match seed, so the state is its own reproduction
  // recipe: nothing outside it can change how the match was laid out (ADR 0004).
  const rng = createRng(setup.seed);
  const seats = shuffled(map.value.spawns, rng.fork('seats'));
  const players: Player[] = setup.players.map((player, index) =>
    seatPlayer(player, seats[index], mapParams.playerRadius, rules.shieldTurns),
  );
  const order = shuffled(players, rng.fork('order')).map((player) => player.id);

  const firstId = order[0];
  if (firstId === undefined) {
    return err(fwError('ERR_NOT_ENOUGH_PLAYERS', { count, min: rules.minPlayers }));
  }

  return ok({
    id: setup.id,
    seed: setup.seed,
    phase: 'running',
    config: setup.config,
    map: map.value,
    players,
    order,
    turn: {
      index: 0,
      playerId: firstId,
      deadlineAt: setup.startedAtMs + rules.turnDurationMs,
    },
    history: [],
    outcome: null,
  });
}

function seatPlayer(
  player: MatchSetupPlayer,
  seat: SpawnPoint | undefined,
  radius: number,
  shieldTurns: number,
): Player {
  if (seat === undefined) throw new Error('seatPlayer called with no seat left');
  return {
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    origin: seat.position,
    radius,
    alive: true,
    shieldTurnsLeft: shieldTurns,
    connected: true,
    isBot: player.isBot,
  };
}

/** Fisher–Yates, drawing from the injected generator. Never `Math.random`. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(0, i + 1);
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

export interface Applied {
  readonly state: MatchState;
  readonly events: readonly MatchEvent[];
}

const rejected = (state: MatchState, error: FwError): Applied => ({
  state,
  events: [{ kind: 'command-rejected', error }],
});

export function apply(
  state: MatchState,
  command: MatchCommand,
  deps: RulesDeps,
  nowMs: number,
): Applied {
  if (command.kind === 'disconnect' || command.kind === 'reconnect') {
    return applyConnection(state, command, nowMs);
  }

  if (state.phase !== 'running' || state.turn === null) {
    return rejected(state, fwError('ERR_MATCH_NOT_RUNNING', { phase: state.phase }));
  }

  switch (command.kind) {
    case 'fire':
      return applyFire(state, command.playerId, command.shot, deps, nowMs);

    case 'pass':
      if (command.playerId !== state.turn.playerId) {
        return rejected(
          state,
          fwError('ERR_NOT_YOUR_TURN', { activePlayerId: state.turn.playerId }),
        );
      }
      return endTurn(state, skipRecord(state, 'passed'), [], state.players, nowMs);

    case 'timeout':
      if (command.atMs < state.turn.deadlineAt) {
        // The clock fired early. Nothing in the match should move because of it.
        return rejected(state, fwError('ERR_INTERNAL', {}));
      }
      return endTurn(state, skipRecord(state, 'timeout'), [], state.players, nowMs);
  }
}

function applyConnection(
  state: MatchState,
  command: Extract<MatchCommand, { kind: 'disconnect' | 'reconnect' }>,
  nowMs: number,
): Applied {
  const connected = command.kind === 'reconnect';
  const players = state.players.map((player) =>
    player.id === command.playerId ? { ...player, connected } : player,
  );
  const next = { ...state, players };

  // A player who drops on their own turn does not hold the match up.
  if (!connected && state.phase === 'running' && state.turn?.playerId === command.playerId) {
    return endTurn(next, skipRecord(next, 'disconnected'), [], players, nowMs);
  }
  return { state: next, events: [] };
}

function skipRecord(state: MatchState, reason: TurnSkipReason): TurnRecord {
  if (state.turn === null) throw new Error('skipRecord outside a turn');
  return {
    index: state.turn.index,
    playerId: state.turn.playerId,
    shot: null,
    trace: null,
    skipped: reason,
    eliminated: [],
  };
}

function applyFire(
  state: MatchState,
  playerId: PlayerId,
  shot: ShotRequest,
  deps: RulesDeps,
  nowMs: number,
): Applied {
  if (state.turn === null) {
    return rejected(state, fwError('ERR_MATCH_NOT_RUNNING', { phase: state.phase }));
  }
  if (playerId !== state.turn.playerId) {
    return rejected(state, fwError('ERR_NOT_YOUR_TURN', { activePlayerId: state.turn.playerId }));
  }

  const shooter = state.players.find((player) => player.id === playerId);
  if (shooter === undefined || !shooter.alive) {
    return rejected(state, fwError('ERR_PLAYER_ELIMINATED', {}));
  }

  const parsed = deps.parser.parse(shot.source, shot.axis);
  if (!parsed.ok) return rejected(state, parsed.error);

  const budget = state.config.rules.complexityBudget;
  if (budget !== null && parsed.value.nodeCount > budget) {
    return rejected(
      state,
      fwError('ERR_COMPLEXITY_BUDGET', { nodeCount: parsed.value.nodeCount, budget }),
    );
  }

  const continuity = deps.continuity.check(
    parsed.value,
    intervalFor(state, shooter, shot),
    state.config.trace,
  );
  if (!continuity.ok) return rejected(state, continuity.error);

  const trace = deps.tracer.trace({
    expression: parsed.value,
    evaluator: deps.evaluator,
    origin: shooter.origin,
    axis: shot.axis,
    direction: shot.direction,
    map: state.map,
    targets: targetsFor(state, shooter),
    params: state.config.trace,
    pierce: state.config.rules.pierce,
  });

  const eliminated = trace.hits.filter((hit) => hit.lethal).map((hit) => hit.playerId);
  const players = state.players.map((player) =>
    eliminated.includes(player.id) ? { ...player, alive: false } : player,
  );

  const record: TurnRecord = {
    index: state.turn.index,
    playerId,
    shot,
    trace,
    skipped: null,
    eliminated,
  };
  const events: MatchEvent[] = eliminated.map((victim) => ({
    kind: 'player-eliminated',
    playerId: victim,
    byPlayerId: playerId,
  }));

  return endTurn(state, record, events, players, nowMs);
}

/**
 * The stretch of the shot's own variable the curve could possibly cover.
 *
 * Along `x` that is `x − x₀`, along `y` it is `y − y₀` (ADR 0013). The
 * continuity check only has to look where the curve would be drawn: a
 * discontinuity behind the shooter, or past the far edge of the map, costs the
 * player nothing and must not cost them their turn.
 */
function intervalFor(state: MatchState, shooter: Player, shot: ShotRequest): ContinuityInterval {
  const low = shot.axis === 'x' ? state.map.bounds.min.x : state.map.bounds.min.y;
  const high = shot.axis === 'x' ? state.map.bounds.max.x : state.map.bounds.max.y;
  const start = shot.axis === 'x' ? shooter.origin.x : shooter.origin.y;

  return shot.direction === 'increasing'
    ? { from: 0, to: high - start }
    : { from: low - start, to: 0 };
}

/**
 * Close the turn: log it, tick the shield down, and either end the match or
 * hand over to the next player still standing.
 *
 * The shield is counted in the player's *own* turns, not in rounds. It survives
 * an elimination anywhere else in the order, which a round counter would not,
 * and it means "you are safe for your first two turns" — which is what a player
 * reads it as.
 */
function endTurn(
  state: MatchState,
  record: TurnRecord,
  eliminationEvents: readonly MatchEvent[],
  playersAfterShot: readonly Player[],
  nowMs: number,
): Applied {
  const events: MatchEvent[] = [{ kind: 'shot-resolved', record }, ...eliminationEvents];

  const players = playersAfterShot.map((player) => {
    if (player.id !== record.playerId || player.shieldTurnsLeft === 0) return player;
    const shieldTurnsLeft = player.shieldTurnsLeft - 1;
    if (shieldTurnsLeft === 0) events.push({ kind: 'shield-expired', playerId: player.id });
    return { ...player, shieldTurnsLeft };
  });

  const history = [...state.history, record];
  const settled: MatchState = { ...state, players, history };

  const outcome = outcomeOf(settled);
  if (outcome !== null) {
    events.push({ kind: 'match-ended', outcome });
    return { state: { ...settled, phase: 'ended', turn: null, outcome }, events };
  }

  const nextPlayerId = nextAlive(settled, record.playerId);
  if (nextPlayerId === null) {
    // Every remaining player is dead, which `outcomeOf` should already have
    // caught. Reaching here means the two disagree.
    throw new Error('no player left to act, yet the match is not over');
  }

  const turn = {
    index: record.index + 1,
    playerId: nextPlayerId,
    deadlineAt: nowMs + state.config.rules.turnDurationMs,
  };
  events.push({ kind: 'turn-started', turn });
  return { state: { ...settled, turn }, events };
}

function nextAlive(state: MatchState, after: PlayerId): PlayerId | null {
  const start = state.order.indexOf(after);
  for (let step = 1; step <= state.order.length; step += 1) {
    const candidate = state.order[(start + step) % state.order.length];
    if (candidate === undefined) continue;
    const player = state.players.find((p) => p.id === candidate);
    if (player?.alive === true) return candidate;
  }
  return null;
}
