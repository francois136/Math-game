import {
  DEFAULT_MATCH_CONFIG,
  MatchIdSchema,
  PlayerIdSchema,
  SeedSchema,
  TeamIdSchema,
  type GameMap,
  type MapParams,
  type MatchConfig,
  type MatchSetup,
  type MatchSetupPlayer,
  type MatchState,
  type Player,
  type RulesDeps,
} from '@fw/contracts';
import { continuity, evaluator, parser } from '@fw/core-math';
import { maps, tracer } from '@fw/physics';

/**
 * Fixtures for this package's own tests. Not exported from `index.ts` and not
 * compiled into `dist`.
 *
 * The dependencies wired here are the real ones — the real parser, the real
 * tracer, the real generator. @fw/core-math and @fw/physics are devDependencies
 * of this package for exactly this reason: the rules ship depending on nothing
 * but the contracts, and are tested against the engine they will actually run
 * with.
 */

export const playerId = (name: string) => PlayerIdSchema.parse(name);
export const teamId = (name: string) => TeamIdSchema.parse(name);

export function deps(): RulesDeps {
  return { parser, evaluator, continuity, tracer, maps };
}

/**
 * A bare field with the seats face to face at the same height.
 *
 * No obstacles, so a flat shot from either seat reaches the other. It would
 * never pass `validate` — that is the point: a test that has to guess where the
 * curve goes is a test that will one day be wrong for a reason nobody finds.
 */
export function duelMap(): GameMap {
  return {
    name: 'duel de test',
    bounds: DEFAULT_MATCH_CONFIG.map.bounds,
    obstacles: [],
    spawns: [
      { index: 0, position: { x: -20, y: 0 } },
      { index: 1, position: { x: 20, y: 0 } },
    ],
    seed: null,
    generatorVersion: 0,
  };
}

export function setup(options: {
  players: readonly MatchSetupPlayer[];
  config?: Partial<MatchConfig>;
  map?: GameMap | null;
  seed?: string;
  startedAtMs?: number;
}): MatchSetup {
  return {
    id: MatchIdSchema.parse('match-test'),
    seed: SeedSchema.parse(options.seed ?? 'graine'),
    config: { ...DEFAULT_MATCH_CONFIG, ...options.config },
    players: options.players,
    map: options.map === undefined ? duelMap() : options.map,
    startedAtMs: 0,
  };
}

export function duellists(): MatchSetupPlayer[] {
  return [
    { id: playerId('anne'), name: 'Anne', teamId: null, isBot: false },
    { id: playerId('bob'), name: 'Bob', teamId: null, isBot: false },
  ];
}

/** Rules with the opening shield removed, for tests about hitting things. */
export function noShield(overrides: Partial<MatchConfig['rules']> = {}): Partial<MatchConfig> {
  return { rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0, ...overrides } };
}

/** A config that only says how hard the generated field should be. */
export function onField(difficulty: MapParams['difficulty']): Partial<MatchConfig> {
  return { ...noShield(), map: { ...DEFAULT_MATCH_CONFIG.map, difficulty } };
}

/**
 * A match built by hand, seats and all.
 *
 * `createMatch` shuffles the seating, which is right for a game and useless for
 * a test that needs to know who stands where. Everyone here shares `y = 0`, so
 * a flat shot from any of them reaches whoever is next along that line.
 */
export function stateWith(
  players: readonly {
    id: string;
    team?: string;
    x: number;
    shieldTurnsLeft?: number;
    alive?: boolean;
  }[],
  config: Partial<MatchConfig> = {},
): MatchState {
  const merged: MatchConfig = { ...DEFAULT_MATCH_CONFIG, ...config };
  const seated: Player[] = players.map((player) => ({
    id: playerId(player.id),
    name: player.id,
    teamId: player.team === undefined ? null : teamId(player.team),
    origin: { x: player.x, y: 0 },
    radius: merged.map.playerRadius,
    alive: player.alive ?? true,
    shieldTurnsLeft: player.shieldTurnsLeft ?? 0,
    connected: true,
    isBot: false,
  }));

  const first = seated[0];
  if (first === undefined) throw new Error('stateWith needs at least one player');

  return {
    id: MatchIdSchema.parse('match-hand-made'),
    seed: SeedSchema.parse('graine'),
    phase: 'running',
    config: merged,
    map: {
      ...duelMap(),
      spawns: seated.map((player, index) => ({ index, position: player.origin })),
    },
    players: seated,
    order: seated.map((player) => player.id),
    turn: { index: 0, playerId: first.id, deadlineAt: merged.rules.turnDurationMs },
    history: [],
    outcome: null,
  };
}
