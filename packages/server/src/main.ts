import { env, stdout } from 'node:process';
import type { ClockPort, RulesDeps } from '@fw/contracts';
import { continuity, evaluator, parser } from '@fw/core-math';
import { maps, tracer } from '@fw/physics';
import { replays, rules } from '@fw/rules';
import { bot } from '@fw/bot';
import { cryptoIds } from './ids.js';
import { GameServer } from './server.js';
import { listen } from './transport.js';

/** The only place in the repository that reads the wall clock. */
const clock: ClockPort = { nowMs: () => Date.now() };

const engine: RulesDeps = { parser, evaluator, continuity, tracer, maps };
const port = Number(env['FW_PORT'] ?? '8787');

const game = new GameServer({ rules, replays, bot, engine, ids: cryptoIds, clock });
listen(game, port);

stdout.write(`FunctionWars écoute sur le port ${String(port)}\n`);
