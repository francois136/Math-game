import type { MatchState } from '@fw/contracts';

/**
 * The match as it stood after `at` turns.
 *
 * This is drawing, not deciding. Everything here is copied from what the server
 * already said: `history[i].eliminated` records who fell on turn `i`, so who is
 * standing after turn `at` is a matter of reading, not of applying rules. The
 * client still has no engine (ADR 0006).
 *
 * `at` is clamped, so a cursor that runs off either end shows the first or the
 * last position rather than nothing.
 */
export function stateAt(match: MatchState, at: number): MatchState {
  const cut = Math.min(Math.max(0, at), match.history.length);
  const history = match.history.slice(0, cut);

  const fallen = new Set(history.flatMap((record) => record.eliminated));
  const players = match.players.map((player) => ({
    ...player,
    alive: !fallen.has(player.id),
    // Shields are not reconstructed: they are a rule, and reading a replay is
    // not playing one. Nothing is drawn from them here.
    shieldTurnsLeft: 0,
  }));

  const next = history.length;
  const whose = match.history[next]?.playerId ?? null;

  return {
    ...match,
    players,
    history,
    phase: next === match.history.length ? match.phase : 'running',
    outcome: next === match.history.length ? match.outcome : null,
    turn: whose === null ? null : { index: next, playerId: whose, deadlineAt: 0 },
  };
}

/** One line per turn, for the list beside the board. */
export function narrateTurn(match: MatchState, index: number): string {
  const record = match.history[index];
  if (record === undefined) return '';

  const name = (id: string): string =>
    match.players.find((player) => player.id === id)?.name ?? '?';
  const who = name(record.playerId);

  if (record.skipped !== null) {
    const why = { timeout: 'temps écoulé', passed: 'passe', disconnected: 'déconnecté' }[
      record.skipped
    ];
    return `${who} — ${why}`;
  }

  const shot = record.shot;
  const written = shot === null ? '' : `${shot.axis === 'x' ? 'y = ' : 'x = '}${shot.source}`;
  const killed = record.eliminated.map(name).join(', ');
  return killed === '' ? `${who} : ${written}` : `${who} : ${written} — élimine ${killed}`;
}
