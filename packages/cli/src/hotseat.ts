import { argv, exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import {
  DEFAULT_MATCH_CONFIG,
  fmt,
  MatchIdSchema,
  PlayerIdSchema,
  SeedSchema,
  TeamIdSchema,
  type Direction,
  type MatchEvent,
  type MatchSetupPlayer,
  type MatchState,
  type RulesDeps,
} from '@fw/contracts';
import { continuity, evaluator, parser } from '@fw/core-math';
import { maps, tracer } from '@fw/physics';
import { apply, createMatch } from '@fw/rules';
import { render } from './render.js';

/**
 * A whole match, on one keyboard.
 *
 * Same engine the server will run: @fw/rules decides everything, this file only
 * asks for a function and prints what came back. That is the point of the pure
 * core — hot-seat costs no second implementation.
 */

const DEPS: RulesDeps = { parser, evaluator, continuity, tracer, maps };

interface Options {
  seed: string;
  names: string[];
  teams: boolean;
  /** Shots played automatically, comma-separated. Empty means ask the player. */
  script: string[];
}

function parseOptions(args: string[]): Options {
  const read = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };
  const script = read('--script', '');
  return {
    seed: read('--seed', 'partie'),
    names: read('--players', 'Anne,Bob')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
    teams: args.includes('--teams'),
    script: script === '' ? [] : script.split(',').map((shot) => shot.trim()),
  };
}

function describe(event: MatchEvent, state: MatchState): string | null {
  const nameOf = (id: string): string =>
    state.players.find((player) => player.id === id)?.name ?? id;

  switch (event.kind) {
    case 'shot-resolved': {
      const { record } = event;
      if (record.skipped !== null) return `Tour passé (${record.skipped}).`;
      if (record.trace === null) return null;
      const absorbed = record.trace.hits
        .filter((hit) => !hit.lethal)
        .map((hit) => `${nameOf(hit.playerId)} encaisse sans dommage (${String(hit.absorbedBy)})`);
      return [
        `Le tir parcourt ${fmt(record.trace.arcLength)} unités et s’arrête : ${stopLabel(record.trace.stop.kind)}.`,
        ...absorbed,
      ].join('\n');
    }
    case 'player-eliminated':
      return `${nameOf(event.playerId)} est éliminé par ${nameOf(event.byPlayerId)}.`;
    case 'shield-expired':
      return `Le bouclier de ${nameOf(event.playerId)} vient de tomber.`;
    case 'match-ended':
      if (event.outcome.kind === 'solo') return `\n${nameOf(event.outcome.winnerId)} gagne.`;
      if (event.outcome.kind === 'team') return `\nL’équipe ${event.outcome.teamId} gagne.`;
      return '\nPartie nulle : plus personne ne tient debout.';
    case 'command-rejected':
      return `REFUSÉ — ${event.error.message}`;
    default:
      return null;
  }
}

function stopLabel(kind: string): string {
  switch (kind) {
    case 'obstacle':
      return 'un obstacle';
    case 'map-edge':
      return 'le bord de la carte';
    case 'domain-exit':
      return 'la fin du domaine de définition';
    case 'discontinuity':
      return 'une discontinuité';
    case 'player-hit':
      return 'un joueur touché';
    case 'arc-limit':
      return 'la longueur maximale';
    default:
      return 'le budget de pas';
  }
}

function board(state: MatchState): string {
  const shooter = state.players.find((player) => player.id === state.turn?.playerId);
  const others = state.players
    .filter((player) => player.alive && player.id !== shooter?.id)
    .map((player) => player.origin);
  const lastTrace = state.history.at(-1)?.trace ?? null;
  return render(state.map, lastTrace, shooter?.origin ?? { x: 0, y: 0 }, others);
}

async function main(): Promise<number> {
  const options = parseOptions(argv.slice(2));

  const players: MatchSetupPlayer[] = options.names.map((name, index) => ({
    id: PlayerIdSchema.parse(`joueur-${String(index)}`),
    name,
    teamId: options.teams ? TeamIdSchema.parse(index % 2 === 0 ? 'rouge' : 'bleu') : null,
    isBot: false,
  }));

  const created = createMatch(
    {
      id: MatchIdSchema.parse('hotseat'),
      seed: SeedSchema.parse(options.seed),
      config: options.teams
        ? { ...DEFAULT_MATCH_CONFIG, rules: { ...DEFAULT_MATCH_CONFIG.rules, mode: 'teams' } }
        : DEFAULT_MATCH_CONFIG,
      players,
      map: null,
      startedAtMs: 0,
    },
    DEPS,
  );

  if (!created.ok) {
    stdout.write(`\n${created.error.message}\n\n`);
    return 1;
  }

  let state = created.value;
  const rl = createInterface({ input: stdin, output: stdout });
  let scripted = 0;

  stdout.write(`\nPartie « ${options.seed} » — ${String(players.length)} joueurs, `);
  stdout.write(`bouclier ${String(state.config.rules.shieldTurns)} tours\n`);

  try {
    while (state.phase === 'running' && state.turn !== null) {
      const active = state.players.find((player) => player.id === state.turn?.playerId);
      if (active === undefined) break;

      stdout.write(`\n${board(state)}\n`);
      stdout.write(
        `\nTour ${String(state.turn.index + 1)} — ${active.name} en (${fmt(active.origin.x)} ; ${fmt(active.origin.y)})`,
      );
      stdout.write(
        active.shieldTurnsLeft > 0 ? ` · bouclier ${String(active.shieldTurnsLeft)}\n` : '\n',
      );

      let source: string;
      let direction: Direction;

      if (options.script.length > 0 && scripted >= options.script.length) {
        stdout.write('\nScript épuisé, la partie n’est pas finie.\n');
        break;
      }

      if (scripted < options.script.length) {
        source = options.script[scripted] ?? '0*x';
        scripted += 1;
        const others = state.players.filter((p) => p.alive && p.id !== active.id);
        const target = others[0];
        direction =
          target !== undefined && target.origin.x < active.origin.x ? 'decreasing' : 'increasing';
        stdout.write(`f(x) = ${source}  [${direction === 'increasing' ? '→' : '←'}]\n`);
      } else {
        // A closed stdin — a pipe that ran dry, a CI run — resolves to nothing.
        // Leaving the loop is the only sane answer; waiting forever is not.
        const typed = await rl.question('f(x) = ').catch(() => null);
        source = (typed ?? '').trim();
        if (typed === null || source === '' || source === 'quit') break;
        const answer = (await rl.question('sens [→/←] (entrée = →) : ').catch(() => '')).trim();
        direction =
          answer === '←' || answer.startsWith('d') || answer === '-' ? 'decreasing' : 'increasing';
      }

      const { state: next, events } = apply(
        state,
        { kind: 'fire', playerId: active.id, shot: { source, direction } },
        DEPS,
        state.turn.deadlineAt - state.config.rules.turnDurationMs + 1,
      );
      state = next;

      for (const event of events) {
        const line = describe(event, state);
        if (line !== null) stdout.write(`${line}\n`);
      }
    }

    if (state.phase === 'ended') stdout.write(`\n${board(state)}\n\n`);
  } finally {
    rl.close();
  }

  return 0;
}

exit(await main());
