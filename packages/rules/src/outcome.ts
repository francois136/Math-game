import type { MatchOutcome, MatchState, Player } from '@fw/contracts';

/**
 * Is the match over, and who won?
 *
 * `null` means play on. A mode is an entry in the switch below and nothing
 * else: adding one must not require touching the others.
 */
export function outcomeOf(state: MatchState): MatchOutcome | null {
  const living = state.players.filter((player) => player.alive);

  switch (state.config.rules.mode) {
    case 'ffa': {
      if (living.length === 0) return { kind: 'draw' };
      const [survivor] = living;
      if (living.length === 1 && survivor !== undefined) {
        return { kind: 'solo', winnerId: survivor.id };
      }
      return null;
    }

    case 'teams': {
      const teams = new Set(living.map(teamKeyOf));
      if (teams.size === 0) return { kind: 'draw' };
      if (teams.size > 1) return null;

      const [last] = living;
      if (last === undefined) return { kind: 'draw' };
      // A player with no team in teams mode is their own side; there is no team
      // to award the win to, so it reads as a solo victory.
      return last.teamId === null
        ? { kind: 'solo', winnerId: last.id }
        : { kind: 'team', teamId: last.teamId };
    }
  }
}

/** Teamless players each count as their own side, so they cannot share a win. */
function teamKeyOf(player: Player): string {
  return player.teamId ?? `solo:${player.id}`;
}
