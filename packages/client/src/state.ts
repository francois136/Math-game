import type { FwErrorWire, LobbyState, MatchState, ServerMessage } from '@fw/contracts';

/**
 * Everything the client knows, and it knows only what it was told.
 *
 * The reducer is pure and lives apart from React so it can be tested without a
 * renderer — and so that "what does the client believe?" has one answer in one
 * place rather than a belief per component.
 */
export interface AppState {
  readonly status: 'offline' | 'connecting' | 'identified';
  readonly playerId: string | null;
  readonly token: string | null;
  readonly lobby: LobbyState | null;
  readonly match: MatchState | null;
  /** The last thing that went wrong, shown until the next action clears it. */
  readonly error: FwErrorWire | null;
  /** Answer to the last `shot:validate`, or null while nothing is pending. */
  readonly validation: { ok: boolean; message: string | null } | null;
  /** Narration of the match, newest last. */
  readonly log: readonly string[];
}

export const initialState: AppState = {
  status: 'offline',
  playerId: null,
  token: null,
  lobby: null,
  match: null,
  error: null,
  validation: null,
  log: [],
};

export type Action =
  | { kind: 'connecting' }
  | { kind: 'closed' }
  | { kind: 'server'; message: ServerMessage }
  | { kind: 'dismiss-error' };

export function reduce(state: AppState, action: Action): AppState {
  switch (action.kind) {
    case 'connecting':
      return { ...initialState, status: 'connecting' };
    case 'closed':
      return { ...state, status: 'offline' };
    case 'dismiss-error':
      return { ...state, error: null, validation: null };
    case 'server':
      return applyServer(state, action.message);
  }
}

function applyServer(state: AppState, message: ServerMessage): AppState {
  switch (message.type) {
    case 'welcome':
      return { ...state, status: 'identified', playerId: message.playerId, token: message.token };

    case 'lobby:state':
      return { ...state, lobby: message.lobby, error: null };

    case 'match:state':
      return { ...state, match: message.match, log: [] };

    case 'match:events': {
      if (state.match === null) return state;
      const log = [...state.log];
      let match = state.match;

      for (const event of message.events) {
        const line = narrate(event, match);
        if (line !== null) log.push(line);
        match = applyEvent(match, event);
      }
      return { ...state, match, log };
    }

    case 'shot:validation':
      return {
        ...state,
        validation: { ok: message.ok, message: message.error?.message ?? null },
      };

    case 'error':
      return { ...state, error: message.error };

    case 'pong':
      return state;
  }
}

type MatchEvent = Extract<ServerMessage, { type: 'match:events' }>['events'][number];

/**
 * Fold an event into the local view of the match.
 *
 * Only what the client needs to draw: whose turn it is, who is still standing,
 * and the last trace. It never decides any of that — it copies what it is told.
 */
function applyEvent(match: MatchState, event: MatchEvent): MatchState {
  switch (event.kind) {
    case 'turn-started':
      return { ...match, turn: event.turn };
    case 'shot-resolved':
      return { ...match, history: [...match.history, event.record] };
    case 'player-eliminated':
      return {
        ...match,
        players: match.players.map((player) =>
          player.id === event.playerId ? { ...player, alive: false } : player,
        ),
      };
    case 'shield-expired':
      return {
        ...match,
        players: match.players.map((player) =>
          player.id === event.playerId ? { ...player, shieldTurnsLeft: 0 } : player,
        ),
      };
    case 'match-ended':
      return { ...match, phase: 'ended', turn: null, outcome: event.outcome };
    default:
      return match;
  }
}

function narrate(event: MatchEvent, match: MatchState): string | null {
  const nameOf = (id: string): string =>
    match.players.find((player) => player.id === id)?.name ?? id;

  switch (event.kind) {
    case 'shot-resolved': {
      if (event.record.skipped !== null) {
        return `${nameOf(event.record.playerId)} passe son tour.`;
      }
      const stop = event.record.trace?.stop.kind;
      return `${nameOf(event.record.playerId)} tire — ${stopLabel(stop)}.`;
    }
    case 'player-eliminated':
      return `${nameOf(event.playerId)} est éliminé par ${nameOf(event.byPlayerId)}.`;
    case 'shield-expired':
      return `Le bouclier de ${nameOf(event.playerId)} est tombé.`;
    case 'match-ended':
      if (event.outcome.kind === 'solo') return `${nameOf(event.outcome.winnerId)} gagne.`;
      if (event.outcome.kind === 'team') return `L’équipe ${event.outcome.teamId} gagne.`;
      return 'Partie nulle.';
    case 'command-rejected':
      return event.error.message;
    default:
      return null;
  }
}

function stopLabel(kind: string | undefined): string {
  switch (kind) {
    case 'obstacle':
      return 'arrêté par un obstacle';
    case 'map-edge':
      return 'sorti de la carte';
    case 'domain-exit':
      return 'hors du domaine de définition';
    case 'discontinuity':
      return 'arrêté sur une discontinuité';
    case 'player-hit':
      return 'il a touché quelqu’un';
    case 'arc-limit':
      return 'à bout de course';
    default:
      return 'arrêté';
  }
}
