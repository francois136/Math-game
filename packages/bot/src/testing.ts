import {
  DEFAULT_MATCH_CONFIG,
  MatchIdSchema,
  PlayerIdSchema,
  SeedSchema,
  type MatchConfig,
  type MatchSetupPlayer,
  type MatchState,
  type RulesDeps,
} from '@fw/contracts';
import { continuity, evaluator, parser } from '@fw/core-math';
import { maps, tracer } from '@fw/physics';
import { createMatch } from '@fw/rules';

/**
 * Fixtures for this package's own tests. Not exported from `index.ts` and not
 * compiled into `dist`.
 *
 * The dependencies are the real ones: a bot that only worked against a fake
 * tracer would tell us nothing about a bot that has to play.
 */

export const playerId = (name: string) => PlayerIdSchema.parse(name);

export function deps(): RulesDeps {
  return { parser, evaluator, continuity, tracer, maps };
}

/** A real match on a generated field, shields off so shots can land. */
export function matchOf(
  seed: string,
  count = 2,
  config: Partial<MatchConfig> = {},
): MatchState | null {
  const players: MatchSetupPlayer[] = Array.from({ length: count }, (_, i) => ({
    id: playerId(`joueur-${String(i)}`),
    name: `Joueur ${String(i)}`,
    teamId: null,
    isBot: i > 0,
  }));

  const created = createMatch(
    {
      id: MatchIdSchema.parse(`match-${seed}`),
      seed: SeedSchema.parse(seed),
      config: {
        ...DEFAULT_MATCH_CONFIG,
        rules: { ...DEFAULT_MATCH_CONFIG.rules, shieldTurns: 0 },
        ...config,
      },
      players,
      map: null,
      startedAtMs: 0,
    },
    deps(),
  );
  return created.ok ? created.value : null;
}
