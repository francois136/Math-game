import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_CONFIG,
  MatchStateSchema,
  maxPlayerRadiusFor,
  type MapParams,
  type MatchCommand,
  type MatchState,
  type PlayerId,
  type RulesDeps,
  type Seed,
} from '@fw/contracts';
import { apply, createMatch } from './engine.js';
import {
  deps,
  duellists,
  noShield,
  onField,
  playerId,
  setup,
  stateWith,
  teamId,
} from './testing.js';

const TURN = DEFAULT_MATCH_CONFIG.rules.turnDurationMs;

function started(options: Parameters<typeof setup>[0] = { players: duellists() }): MatchState {
  const result = createMatch(setup(options), deps());
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Fire a flat shot towards the other seat. */
function flatShotAt(state: MatchState): MatchCommand {
  const shooter = state.players.find((p) => p.id === state.turn?.playerId);
  const other = state.players.find((p) => p.id !== shooter?.id);
  if (shooter === undefined || other === undefined) throw new Error('no duel');
  return {
    kind: 'fire',
    playerId: shooter.id,
    shot: {
      source: '0*x',
      axis: 'x',
      direction: other.origin.x > shooter.origin.x ? 'increasing' : 'decreasing',
    },
  };
}

describe('createMatch', () => {
  it('produces a state its own schema accepts', () => {
    expect(MatchStateSchema.safeParse(started()).success).toBe(true);
  });

  it('seats everyone, arms the shields and opens the first turn', () => {
    const state = started();
    expect(state.phase).toBe('running');
    expect(state.players).toHaveLength(2);
    expect(state.order).toHaveLength(2);
    expect(state.turn?.index).toBe(0);
    expect(state.turn?.deadlineAt).toBe(TURN);
    for (const player of state.players) {
      expect(player.alive).toBe(true);
      expect(player.shieldTurnsLeft).toBe(DEFAULT_MATCH_CONFIG.rules.shieldTurns);
      expect(player.radius).toBe(DEFAULT_MATCH_CONFIG.map.playerRadius);
    }
    expect(
      new Set(state.players.map((p) => `${String(p.origin.x)},${String(p.origin.y)}`)).size,
    ).toBe(2);
  });

  it('is deterministic in the seed', () => {
    expect(started()).toEqual(started());
  });

  it('does not lay the same match out for every seed', () => {
    // With two players there are only two seatings, so a single pair of seeds
    // colliding proves nothing. Across a handful, both must appear.
    const layouts = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const result = createMatch(setup({ players: duellists(), seed }), deps());
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      layouts.add(JSON.stringify([result.value.order, result.value.players.map((p) => p.origin)]));
    }
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('refuses a teams match with only one side', () => {
    const players = duellists().map((player) => ({ ...player, teamId: playerId('rouge') }));
    const result = createMatch(setup({ players, config: noShield({ mode: 'teams' }) }), deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ERR_NOT_ENOUGH_TEAMS');
    expect(result.error.message).toContain('deux équipes');
  });

  it('refuses a match with too few players', () => {
    const result = createMatch(
      setup({ players: [duellists()[0]!], config: { rules: DEFAULT_MATCH_CONFIG.rules } }),
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ERR_NOT_ENOUGH_PLAYERS');
  });

  it('generates a map when none is supplied', () => {
    const result = createMatch(setup({ players: duellists(), map: null }), deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map.obstacles.length).toBeGreaterThan(0);
    expect(result.value.map.spawns).toHaveLength(2);
  });
});

describe('a refused function costs nothing', () => {
  const cases: Array<[string, string, Partial<Parameters<typeof setup>[0]['config']>]> = [
    ['a syntax error', '2 +* 3', {}],
    ['an unknown function', 'sinus(x)', {}],
    ['no value at the shooter', 'ln(x)', {}],
    ['a discontinuity', '{ 0 si x < 5 ; 9 sinon }', {}],
  ];

  for (const [label, source] of cases) {
    it(`leaves the turn open on ${label}`, () => {
      const state = started();
      const before = state.turn;
      const { state: after, events } = apply(
        state,
        { kind: 'fire', playerId: state.turn!.playerId, shot: { source, direction: 'increasing' } },
        deps(),
        1000,
      );

      expect(after).toBe(state); // not merely equal: untouched
      expect(after.turn).toEqual(before);
      expect(after.history).toHaveLength(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.kind).toBe('command-rejected');
    });
  }

  it('enforces the complexity budget when one is set', () => {
    const state = started({
      players: duellists(),
      config: { rules: { ...DEFAULT_MATCH_CONFIG.rules, complexityBudget: 3 } },
    });
    const { state: after, events } = apply(
      state,
      {
        kind: 'fire',
        playerId: state.turn!.playerId,
        shot: { source: 'sin(x) + cos(x) + x^2', axis: 'x', direction: 'increasing' },
      },
      deps(),
      1000,
    );
    expect(after.history).toHaveLength(0);
    expect(events[0]).toMatchObject({ kind: 'command-rejected' });
  });
});

describe('turn taking', () => {
  it('refuses a shot from anyone but the active player', () => {
    const state = started();
    const idle = state.players.find((p) => p.id !== state.turn?.playerId);
    const { state: after, events } = apply(
      state,
      {
        kind: 'fire',
        playerId: idle!.id,
        shot: { source: 'x', axis: 'x', direction: 'increasing' },
      },
      deps(),
      1000,
    );
    expect(after).toBe(state);
    expect(events[0]).toMatchObject({ kind: 'command-rejected' });
  });

  it('hands over on a pass, and sets a fresh deadline', () => {
    const state = started();
    const first = state.turn!.playerId;
    const { state: after, events } = apply(state, { kind: 'pass', playerId: first }, deps(), 5000);

    expect(after.turn?.playerId).not.toBe(first);
    expect(after.turn?.index).toBe(1);
    expect(after.turn?.deadlineAt).toBe(5000 + TURN);
    expect(after.history).toHaveLength(1);
    expect(after.history[0]?.skipped).toBe('passed');
    expect(events.map((e) => e.kind)).toContain('turn-started');
  });

  it('passes the turn when the clock runs out', () => {
    const state = started();
    const { state: after } = apply(state, { kind: 'timeout', atMs: TURN }, deps(), TURN);
    expect(after.history[0]?.skipped).toBe('timeout');
    expect(after.turn?.index).toBe(1);
  });

  it('ignores a clock that fires early', () => {
    const state = started();
    const { state: after, events } = apply(state, { kind: 'timeout', atMs: 10 }, deps(), 10);
    expect(after).toBe(state);
    expect(events[0]).toMatchObject({ kind: 'command-rejected' });
  });

  it('does not let a disconnection hold the match up', () => {
    const state = started();
    const active = state.turn!.playerId;
    const { state: after } = apply(state, { kind: 'disconnect', playerId: active }, deps(), 1000);

    expect(after.players.find((p) => p.id === active)?.connected).toBe(false);
    expect(after.history[0]?.skipped).toBe('disconnected');
    expect(after.turn?.playerId).not.toBe(active);

    const { state: back } = apply(after, { kind: 'reconnect', playerId: active }, deps(), 2000);
    expect(back.players.find((p) => p.id === active)?.connected).toBe(true);
    expect(back.turn).toEqual(after.turn); // the seat is kept, the turn is not given back
  });
});

describe('shields', () => {
  it('absorb a hit without stopping the curve', () => {
    const state = started();
    const { state: after, events } = apply(state, flatShotAt(state), deps(), 1000);

    const record = after.history[0];
    expect(record?.trace?.hits).toHaveLength(1);
    expect(record?.trace?.hits[0]?.lethal).toBe(false);
    expect(record?.trace?.hits[0]?.absorbedBy).toBe('shield');
    expect(record?.trace?.stop.kind).toBe('map-edge');
    expect(after.players.every((p) => p.alive)).toBe(true);
    expect(events.some((e) => e.kind === 'player-eliminated')).toBe(false);
  });

  it('count down over the player’s own turns and announce their end', () => {
    let state = started();
    const first = state.turn!.playerId;

    for (let turn = 0; turn < 4; turn += 1) {
      const applied = apply(state, { kind: 'pass', playerId: state.turn!.playerId }, deps(), 0);
      state = applied.state;
    }

    // Two turns each, so both shields are spent.
    expect(state.players.every((p) => p.shieldTurnsLeft === 0)).toBe(true);
    expect(state.history).toHaveLength(4);
    expect(state.history[0]?.playerId).toBe(first);
  });

  it('emit shield-expired exactly once, on the turn it runs out', () => {
    let state = started();
    const seen: PlayerId[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      const applied = apply(state, { kind: 'pass', playerId: state.turn!.playerId }, deps(), 0);
      state = applied.state;
      for (const event of applied.events) {
        if (event.kind === 'shield-expired') seen.push(event.playerId);
      }
    }
    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(2);
  });
});

describe('eliminations and victory', () => {
  it('kills, ends the match and names the winner', () => {
    const state = started({ players: duellists(), config: noShield() });
    const shooter = state.turn!.playerId;
    const { state: after, events } = apply(state, flatShotAt(state), deps(), 1000);

    expect(after.phase).toBe('ended');
    expect(after.turn).toBeNull();
    expect(after.outcome).toEqual({ kind: 'solo', winnerId: shooter });
    expect(after.players.filter((p) => p.alive)).toHaveLength(1);
    expect(events.map((e) => e.kind)).toEqual([
      'shot-resolved',
      'player-eliminated',
      'match-ended',
    ]);
  });

  it('refuses every move once it is over', () => {
    const state = started({ players: duellists(), config: noShield() });
    const { state: ended } = apply(state, flatShotAt(state), deps(), 1000);

    for (const command of [
      {
        kind: 'fire' as const,
        playerId: ended.players[0]!.id,
        shot: { source: 'x', axis: 'x', direction: 'increasing' as const },
      },
      { kind: 'pass' as const, playerId: ended.players[0]!.id },
      { kind: 'timeout' as const, atMs: 10 ** 9 },
    ]) {
      const { state: after, events } = apply(ended, command, deps(), 10 ** 9);
      expect(after).toBe(ended);
      expect(events[0]).toMatchObject({ kind: 'command-rejected' });
    }
  });

  it('lets a curve pass through a team-mate and kill the enemy behind them', () => {
    // Anne shoots along the line: Bob is a team-mate, Cléo is not.
    const state = stateWith(
      [
        { id: 'anne', team: 'rouge', x: -30 },
        { id: 'bob', team: 'rouge', x: -10 },
        { id: 'cleo', team: 'bleu', x: 10 },
        { id: 'dan', team: 'bleu', x: 30 },
      ],
      noShield({ mode: 'teams', friendlyFire: false }),
    );

    const { state: after } = apply(
      state,
      {
        kind: 'fire',
        playerId: playerId('anne'),
        shot: { source: '0*x', axis: 'x', direction: 'increasing' },
      },
      deps(),
      1000,
    );

    const hits = after.history[0]?.trace?.hits ?? [];
    expect(hits.map((h) => [h.playerId, h.lethal, h.absorbedBy])).toEqual([
      ['bob', false, 'friendly-fire'],
      ['cleo', true, null],
    ]);
    expect(after.players.find((p) => p.id === 'cleo')?.alive).toBe(false);
    expect(after.players.find((p) => p.id === 'bob')?.alive).toBe(true);
    expect(after.phase).toBe('running');
  });

  it('kills the team-mate instead when friendly fire is on', () => {
    const state = stateWith(
      [
        { id: 'anne', team: 'rouge', x: -30 },
        { id: 'bob', team: 'rouge', x: -10 },
        { id: 'cleo', team: 'bleu', x: 10 },
        { id: 'dan', team: 'bleu', x: 30 },
      ],
      noShield({ mode: 'teams', friendlyFire: true }),
    );

    const { state: after } = apply(
      state,
      {
        kind: 'fire',
        playerId: playerId('anne'),
        shot: { source: '0*x', axis: 'x', direction: 'increasing' },
      },
      deps(),
      1000,
    );

    expect(after.history[0]?.trace?.hits).toHaveLength(1);
    expect(after.players.find((p) => p.id === 'bob')?.alive).toBe(false);
    expect(after.players.find((p) => p.id === 'cleo')?.alive).toBe(true);
  });

  it('awards a team win when only one side is left standing', () => {
    const state = stateWith(
      [
        { id: 'anne', team: 'rouge', x: -30 },
        { id: 'bob', team: 'bleu', x: 10 },
      ],
      noShield({ mode: 'teams' }),
    );
    const { state: after } = apply(
      state,
      {
        kind: 'fire',
        playerId: playerId('anne'),
        shot: { source: '0*x', axis: 'x', direction: 'increasing' },
      },
      deps(),
      1000,
    );

    expect(after.phase).toBe('ended');
    expect(after.outcome).toEqual({ kind: 'team', teamId: 'rouge' });
  });
});

describe('replay', () => {
  it('reproduces a whole match from the seed and the commands', () => {
    const commands: MatchCommand[] = [];
    let state = started({ players: duellists(), config: noShield() });

    // Two passes, then a kill: enough turns to move the order along.
    for (let i = 0; i < 2; i += 1) {
      const command: MatchCommand = { kind: 'pass', playerId: state.turn!.playerId };
      commands.push(command);
      state = apply(state, command, deps(), i * 1000).state;
    }
    const shot = flatShotAt(state);
    commands.push(shot);
    state = apply(state, shot, deps(), 2000).state;

    let replayed = started({ players: duellists(), config: noShield() });
    commands.forEach((command, i) => {
      replayed = apply(replayed, command, deps(), i === 2 ? 2000 : i * 1000).state;
    });

    expect(replayed).toEqual(state);
    expect(replayed.phase).toBe('ended');
  });
});

/** Real dependencies, plus a note of what the generator was handed. */
function watchingTheGenerator(): { deps: RulesDeps; params: () => MapParams | null } {
  const real = deps();
  let seen: MapParams | null = null;
  return {
    deps: {
      ...real,
      maps: {
        generate: (seedValue: Seed, params: MapParams) => {
          seen = params;
          return real.maps.generate(seedValue, params);
        },
        validate: (map, params) => real.maps.validate(map, params),
      },
    },
    params: () => seen,
  };
}

describe('what the generator is told about the players', () => {
  it('hands it the sides, so team-mates may stand close and enemies may not', () => {
    // The rules engine is the only thing that knows who is on whose team, so it
    // is the only thing that can tell the generator (ADR 0014).
    const spying = watchingTheGenerator();

    const players = [
      { id: playerId('anne'), name: 'Anne', teamId: teamId('rouge'), isBot: false },
      { id: playerId('bob'), name: 'Bob', teamId: teamId('rouge'), isBot: false },
      { id: playerId('cleo'), name: 'Cléo', teamId: teamId('bleu'), isBot: false },
      { id: playerId('dan'), name: 'Dan', teamId: teamId('bleu'), isBot: false },
    ];

    const result = createMatch(
      setup({ players, map: null, config: noShield({ mode: 'teams' }) }),
      spying.deps,
    );
    expect(result.ok).toBe(true);

    const params = spying.params();
    expect(params?.spawnCount).toBe(4);
    // Two sides, in the order the players were seated.
    expect(params?.spawnTeams).toEqual([0, 0, 1, 1]);
  });

  it('marks everyone as their own side in a free-for-all', () => {
    const spying = watchingTheGenerator();

    createMatch(setup({ players: duellists(), map: null }), spying.deps);
    const params = spying.params();
    expect(params?.spawnTeams).toEqual([null, null]);
  });

  it('asks for a bigger board when there are more players', () => {
    // Six players on the two-player field cannot be kept apart at all, so the
    // field grows instead of the distance shrinking (ADR 0015).
    const spying = watchingTheGenerator();
    const crowd = Array.from({ length: 6 }, (_, i) => ({
      id: playerId(`joueur-${String(i)}`),
      name: `Joueur ${String(i)}`,
      teamId: null,
      isBot: false,
    }));

    const result = createMatch(
      setup({ players: crowd, map: null, config: onField('moderee') }),
      spying.deps,
    );
    expect(result.ok).toBe(true);

    const params = spying.params();
    const width = (p: MapParams): number => p.bounds.max.x - p.bounds.min.x;
    expect(params).not.toBeNull();
    if (params === null) return;
    expect(width(params)).toBeGreaterThan(width(DEFAULT_MATCH_CONFIG.map));
    // …and the enemy distance is untouched: it is the room that changed.
    expect(params.spawnMinDistanceEnemies).toBe(DEFAULT_MATCH_CONFIG.map.spawnMinDistanceEnemies);
  });
});

describe('a player too wide for the field', () => {
  it('is refused, because the first flat shot would win', () => {
    // The generator seals a band 5% of the field's height. A hitbox wider than
    // that band sticks out of it. Measured: radius 3 plays normally on the
    // default field — 2% of shots land — and radius 3.5 makes every shot land
    // and every match end on turn one (ADR 0017).
    const ceiling = maxPlayerRadiusFor(DEFAULT_MATCH_CONFIG.map.bounds);
    expect(ceiling).toBe(3);

    const tooBig = createMatch(
      setup({
        players: duellists(),
        map: null,
        config: { map: { ...DEFAULT_MATCH_CONFIG.map, playerRadius: ceiling + 0.5 } },
      }),
      deps(),
    );
    expect(tooBig.ok).toBe(false);
    if (tooBig.ok) return;
    expect(tooBig.error.code).toBe('ERR_PLAYER_RADIUS_TOO_LARGE');
    expect(tooBig.error.message).toContain('trop gros');

    // Right at the ceiling is allowed: the bound is where the cliff is, not
    // one cautious step before it.
    const exact = createMatch(
      setup({
        players: duellists(),
        map: null,
        config: { map: { ...DEFAULT_MATCH_CONFIG.map, playerRadius: ceiling } },
      }),
      deps(),
    );
    expect(exact.ok).toBe(true);
  });
});

describe('a field that cannot hold the lobby', () => {
  it('refuses six players on an easy field before generating anything', () => {
    // `facile` promises a parabola between every pair, and there are fifteen
    // pairs at six seats. Refusing here beats a full lobby watching an error
    // it cannot read (ADR 0015).
    const spying = watchingTheGenerator();
    const crowd = Array.from({ length: 6 }, (_, i) => ({
      id: playerId(`joueur-${String(i)}`),
      name: `Joueur ${String(i)}`,
      teamId: null,
      isBot: false,
    }));

    const result = createMatch(
      setup({ players: crowd, map: null, config: onField('facile') }),
      spying.deps,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ERR_TOO_MANY_SEATS_FOR_DIFFICULTY');
    // Refused *before* the generator was asked to do the impossible.
    expect(spying.params()).toBeNull();
  });
});
