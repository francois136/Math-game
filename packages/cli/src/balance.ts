/**
 * A stopwatch, not a clock.
 *
 * `Date.now` is banned repository-wide because time read ambiently ends up in
 * game state and breaks replays. `performance.now` measures how long the
 * campaign took to run; nothing it returns reaches a match, and the campaign
 * would be useless without it — "how long does a bot turn cost" is one of the
 * questions it exists to answer.
 */
import { performance } from 'node:perf_hooks';
import { argv, stdout } from 'node:process';
import {
  DEFAULT_MATCH_CONFIG,
  MatchIdSchema,
  PlayerIdSchema,
  SeedSchema,
  maxSeatsFor,
  type BotLevel,
  type Difficulty,
  type MatchConfig,
  type MatchSetupPlayer,
  type MatchState,
  type RulesDeps,
} from '@fw/contracts';
import { chooseShot } from '@fw/bot';
import { continuity, evaluator, parser } from '@fw/core-math';
import { maps, tracer } from '@fw/physics';
import { apply, createMatch } from '@fw/rules';

/**
 * The balancing campaign: play a lot of matches and print what happened.
 *
 * Bots against bots, every draw from a seed, so a number printed here can be
 * reproduced by anyone with the same command. This is the tool that answers
 * "how long is a match" and "does the shield matter" with a measurement rather
 * than an impression — see docs/GAME_DESIGN.md §7 for what it has answered so
 * far.
 *
 *   pnpm run balance -- --matches 200 --difficulty moderee --level confirme
 */

const DEPS: RulesDeps = { parser, evaluator, continuity, tracer, maps };

/** A match that has not ended by here is called a draw; nobody plays 200 turns. */
const TURN_CEILING = 200;

interface Options {
  matches: number;
  difficulties: Difficulty[];
  levels: BotLevel[];
  seats: number;
  shieldTurns: number;
  playerRadius: number;
  seed: string;
}

interface Tally {
  built: number;
  ended: number;
  turns: number[];
  /** Turn index of the first elimination, per match that had one. */
  firstKill: number[];
  shots: number;
  hits: number;
  refused: number;
  ms: number;
}

function parseOptions(args: string[]): Options {
  const value = (flag: string): string | undefined => {
    const at = args.indexOf(flag);
    return at === -1 ? undefined : args[at + 1];
  };
  const list = <T extends string>(flag: string, fallback: readonly T[]): T[] => {
    const raw = value(flag);
    return raw === undefined ? [...fallback] : (raw.split(',') as T[]);
  };

  return {
    matches: Number(value('--matches') ?? 60),
    difficulties: list<Difficulty>('--difficulty', ['facile', 'moderee', 'difficile']),
    levels: list<BotLevel>('--level', ['debutant', 'confirme', 'redoutable']),
    seats: Number(value('--seats') ?? 2),
    shieldTurns: Number(value('--shield') ?? 0),
    playerRadius: Number(value('--radius') ?? DEFAULT_MATCH_CONFIG.map.playerRadius),
    seed: value('--seed') ?? 'campagne',
  };
}

function configFor(options: Options, difficulty: Difficulty): MatchConfig {
  return {
    ...DEFAULT_MATCH_CONFIG,
    rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: options.shieldTurns },
    map: {
      ...DEFAULT_MATCH_CONFIG.map,
      difficulty,
      playerRadius: options.playerRadius,
    },
  };
}

function playOne(seed: string, config: MatchConfig, seats: number, level: BotLevel, into: Tally) {
  const players: MatchSetupPlayer[] = Array.from({ length: seats }, (_, i) => ({
    id: PlayerIdSchema.parse(`bot-${String(i)}`),
    name: `Bot ${String(i)}`,
    teamId: null,
    isBot: true,
  }));

  const created = createMatch(
    {
      id: MatchIdSchema.parse(`match-${seed}`),
      seed: SeedSchema.parse(seed),
      config,
      players,
      map: null,
      startedAtMs: 0,
    },
    DEPS,
  );
  // A field the generator could not build is not a balance result; it is
  // counted nowhere rather than counted as a draw.
  if (!created.ok) return;

  into.built += 1;
  let state: MatchState = created.value;
  let alive = state.players.length;
  let firstKill: number | null = null;

  for (let turn = 0; turn < TURN_CEILING && state.phase === 'running'; turn += 1) {
    const active = state.turn?.playerId;
    if (active === undefined) break;

    const shot = chooseShot(state, active, level, DEPS);
    const applied = apply(state, { kind: 'fire', playerId: active, shot }, DEPS, turn * 1000);

    if (applied.state === state) {
      into.refused += 1;
      state = apply(state, { kind: 'pass', playerId: active }, DEPS, turn * 1000).state;
      continue;
    }

    into.shots += 1;
    state = applied.state;
    const stillAlive = state.players.filter((player) => player.alive).length;
    if (stillAlive < alive) {
      into.hits += 1;
      firstKill ??= turn;
      alive = stillAlive;
    }
  }

  if (state.phase === 'ended') {
    into.ended += 1;
    into.turns.push(state.history.length);
  }
  if (firstKill !== null) into.firstKill.push(firstKill);
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1] ?? sorted[middle] ?? NaN;
  const high = sorted[middle] ?? NaN;
  return sorted.length % 2 === 0 ? (low + high) / 2 : high;
};

const round = (value: number, digits = 1): string =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

function main(): void {
  const options = parseOptions(argv.slice(2));

  stdout.write(
    `Campagne : ${String(options.matches)} parties par case, ${String(options.seats)} joueurs, ` +
      `bouclier ${String(options.shieldTurns)}, rayon ${String(options.playerRadius)}, ` +
      `graine « ${options.seed} ».\n` +
      `Une partie non finie en ${String(TURN_CEILING)} tours est comptée comme nulle.\n\n`,
  );
  stdout.write(
    'terrain     niveau       parties  finies  tours méd.  1er kill méd.  tirs touchés  refusés  ms/partie\n',
  );
  stdout.write(
    '----------  -----------  -------  ------  ----------  -------------  ------------  -------  ---------\n',
  );

  for (const difficulty of options.difficulties) {
    if (options.seats > maxSeatsFor(difficulty)) {
      stdout.write(
        `${difficulty.padEnd(10)}  — ${String(options.seats)} joueurs dépassent ce que ce terrain tient ` +
          `(${String(maxSeatsFor(difficulty))})\n`,
      );
      continue;
    }
    for (const level of options.levels) {
      const tally: Tally = {
        built: 0,
        ended: 0,
        turns: [],
        firstKill: [],
        shots: 0,
        hits: 0,
        refused: 0,
        ms: 0,
      };
      const started = performance.now();
      for (let i = 0; i < options.matches; i += 1) {
        playOne(
          `${options.seed}-${difficulty}-${level}-${String(i)}`,
          configFor(options, difficulty),
          options.seats,
          level,
          tally,
        );
      }
      tally.ms = performance.now() - started;

      const hitRate = tally.shots === 0 ? NaN : (100 * tally.hits) / tally.shots;
      stdout.write(
        `${difficulty.padEnd(10)}  ${level.padEnd(11)}  ` +
          `${String(tally.built).padStart(7)}  ${String(tally.ended).padStart(6)}  ` +
          `${round(median(tally.turns), 0).padStart(10)}  ` +
          `${round(median(tally.firstKill), 0).padStart(13)}  ` +
          `${(round(hitRate, 2) + ' %').padStart(12)}  ` +
          `${String(tally.refused).padStart(7)}  ` +
          `${String(Math.round(tally.ms / Math.max(1, tally.built))).padStart(9)}\n`,
      );
    }
  }
}

main();
