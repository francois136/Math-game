import { argv, exit, stdout } from 'node:process';
import {
  DEFAULT_MAP_PARAMS,
  DEFAULT_RULES,
  DEFAULT_TRACE_PARAMS,
  PlayerIdSchema,
  SeedSchema,
  fmt,
  type Direction,
  type TraceTarget,
  type Vec2,
} from '@fw/contracts';
import { evaluator, parse, check } from '@fw/core-math';
import { generate, trace } from '@fw/physics';
import { render } from './render.js';

/**
 * A map, a function, a trace — on a terminal.
 *
 * Not a game: no turns, no eliminations, no winner. That belongs to @fw/rules,
 * which does not exist yet, and writing a second copy of it here to make the
 * demo feel complete would be the first crack in the architecture.
 */

interface Options {
  seed: string;
  source: string;
  from: number;
  direction: Direction;
  spawns: number;
}

function parseOptions(args: string[]): Options {
  const read = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };

  const direction = read('--dir', 'increasing');
  return {
    seed: read('--seed', 'alpha'),
    source: read('--f', '2*sin(x/4)'),
    from: Number(read('--from', '0')),
    direction: direction === 'decreasing' ? 'decreasing' : 'increasing',
    spawns: Number(read('--spawns', '4')),
  };
}

function main(): number {
  const options = parseOptions(argv.slice(2));
  const params = { ...DEFAULT_MAP_PARAMS, spawnCount: options.spawns };

  const map = generate(SeedSchema.parse(options.seed), params);
  if (!map.ok) {
    stdout.write(`\n${map.error.message}\n\n`);
    return 1;
  }

  const spawns = map.value.spawns;
  const shooterSpawn = spawns[Math.min(Math.max(options.from, 0), spawns.length - 1)];
  if (shooterSpawn === undefined) {
    stdout.write('\nCette carte n’a pas de point de départ.\n\n');
    return 1;
  }
  const shooter: Vec2 = shooterSpawn.position;
  const others = spawns.filter((s) => s.index !== shooterSpawn.index).map((s) => s.position);

  stdout.write(`\nCarte « ${options.seed} » · ${String(map.value.obstacles.length)} obstacles · `);
  stdout.write(`${String(spawns.length)} joueurs\n`);
  stdout.write(`Tireur en (${fmt(shooter.x)} ; ${fmt(shooter.y)}), sens `);
  stdout.write(`${options.direction === 'increasing' ? 'croissant' : 'décroissant'}\n`);
  stdout.write(`Fonction : ${options.source}\n\n`);

  const parsed = parse(options.source);
  if (!parsed.ok) {
    stdout.write(`REFUSÉE — ${parsed.error.message}\n`);
    stdout.write('Le tour n’est pas consommé : corrige et retire.\n\n');
    stdout.write(`${render(map.value, null, shooter, others)}\n\n`);
    return 0;
  }

  const span = map.value.bounds.max.x - map.value.bounds.min.x;
  const interval =
    options.direction === 'increasing' ? { from: 0, to: span } : { from: -span, to: 0 };

  const continuity = check(parsed.value, interval, DEFAULT_TRACE_PARAMS);
  if (!continuity.ok) {
    stdout.write(`REFUSÉE — ${continuity.error.message}\n`);
    stdout.write('Le tour n’est pas consommé : corrige et retire.\n\n');
    stdout.write(`${render(map.value, null, shooter, others)}\n\n`);
    return 0;
  }

  // Vulnerability is a rules decision. With no rules engine yet, the demo takes
  // the simplest defensible stance: everyone else is a target, and the shooter
  // gets the immunity arc the default rules would have given them.
  const targets: TraceTarget[] = spawns.map((spawn) => ({
    playerId: PlayerIdSchema.parse(`joueur-${String(spawn.index)}`),
    center: spawn.position,
    radius: params.playerRadius,
    vulnerability: 'lethal',
    immuneUntilArc: spawn.index === shooterSpawn.index ? DEFAULT_RULES.selfImmunityArc : 0,
  }));

  const result = trace({
    expression: parsed.value,
    evaluator,
    origin: shooter,
    direction: options.direction,
    map: map.value,
    targets,
    params: DEFAULT_TRACE_PARAMS,
    pierce: DEFAULT_RULES.pierce,
  });

  stdout.write(`${render(map.value, result, shooter, others)}\n\n`);
  stdout.write(`Arrêt : ${describeStop(result)}\n`);
  stdout.write(
    `Parcours : ${fmt(result.arcLength)} unités en ${String(result.steps)} pas, ` +
      `${String(result.polyline.length)} points\n`,
  );
  for (const hit of result.hits) {
    const outcome = hit.lethal ? 'éliminé' : `absorbé (${String(hit.absorbedBy)})`;
    stdout.write(
      `Touché : ${hit.playerId} en (${fmt(hit.at.x)} ; ${fmt(hit.at.y)}) — ${outcome}\n`,
    );
  }
  stdout.write('\n');
  return 0;
}

function describeStop(result: { stop: { kind: string; at: Vec2 } }): string {
  const where = `(${fmt(result.stop.at.x)} ; ${fmt(result.stop.at.y)})`;
  switch (result.stop.kind) {
    case 'obstacle':
      return `obstacle en ${where}`;
    case 'map-edge':
      return `bord de la carte en ${where}`;
    case 'domain-exit':
      return `sortie du domaine de définition en ${where}`;
    case 'discontinuity':
      return `discontinuité en ${where}`;
    case 'player-hit':
      return `joueur touché en ${where}`;
    case 'arc-limit':
      return `longueur maximale atteinte en ${where}`;
    default:
      return `budget de pas épuisé en ${where}`;
  }
}

exit(main());
