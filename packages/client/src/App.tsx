import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  LobbyCodeSchema,
  PROTOCOL_VERSION,
  SessionTokenSchema,
  type Axis,
  type ClientMessage,
  type Direction,
  type Replay,
} from '@fw/contracts';
import { connect, type Transport } from './net/connection.js';
import { initialState, reduce } from './state.js';
import { preview as computePreview } from './preview.js';
import { stateAt } from './replayView.js';
import { Board } from './canvas/Board.js';
import { Connect } from './ui/Connect.js';
import { Lobby } from './ui/Lobby.js';
import { ReplayViewer } from './ui/ReplayViewer.js';
import { ShotComposer } from './ui/ShotComposer.js';

const SERVER_URL =
  (import.meta.env['VITE_FW_SERVER'] as string | undefined) ?? 'ws://localhost:8787';

/**
 * Whether the preview is drawn is the player's choice, and it is remembered.
 *
 * `sessionStorage`, not `localStorage`: the setting outlives a reload and dies
 * with the tab. Nothing about a player leaves their machine, and a preference
 * is still something about a player.
 */
const PREVIEW_KEY = 'fw:preview';

/**
 * The seat, so a reload does not cost a match.
 *
 * The server holds a dropped seat for two minutes; without this the client
 * would never use that, and refreshing the page would end your game. Session
 * storage again: the token dies with the tab, as it should.
 */
const SEAT_KEY = 'fw:seat';

/**
 * Save a replay to a file.
 *
 * A few kilobytes of JSON, built in the page and never sent anywhere: the
 * document came from the server already, and downloading it is between the
 * browser and the disk.
 */
function downloadReplay(replay: Replay | null): void {
  if (replay === null) return;
  const blob = new Blob([JSON.stringify(replay)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `functionwars-${replay.matchId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // A browser that refuses storage still plays, it just forgets on reload.
  }
}

function recall(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadPreviewPreference(): boolean {
  return recall(PREVIEW_KEY) !== 'off';
}

interface Seat {
  readonly name: string;
  readonly token: string;
}

function loadSeat(): Seat | null {
  const raw = recall(SEAT_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'name' in parsed &&
      'token' in parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.token === 'string'
    ) {
      return { name: parsed.name, token: parsed.token };
    }
  } catch {
    // Nonsense in storage is the same as nothing in storage.
  }
  return null;
}

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [source, setSource] = useState('');
  const [direction, setDirection] = useState<Direction>('increasing');
  const [axis, setAxis] = useState<Axis>('x');
  const [previewEnabled, setPreviewEnabled] = useState(loadPreviewPreference);
  const transport = useRef<Transport | null>(null);

  useEffect(() => {
    remember(PREVIEW_KEY, previewEnabled ? 'on' : 'off');
  }, [previewEnabled]);

  const send = useCallback((message: ClientMessage): void => {
    transport.current?.send(message);
  }, []);

  const open = useCallback(
    (
      name: string,
      then: (send: (message: ClientMessage) => void) => void,
      token: string | null = null,
    ): void => {
      dispatch({ kind: 'connecting' });
      const socket = connect(SERVER_URL, {
        onOpen: () => {
          socket.send({
            type: 'hello',
            protocolVersion: PROTOCOL_VERSION,
            name,
            token: token === null ? null : SessionTokenSchema.parse(token),
          });
          then((message) => {
            socket.send(message);
          });
        },
        onMessage: (message) => {
          dispatch({ kind: 'server', message });
        },
        onClose: () => {
          dispatch({ kind: 'closed' });
        },
      });
      transport.current = socket;
    },
    [],
  );

  // Resume the seat on the way back from a reload. Once: a failed resume drops
  // to the front page rather than retrying against a server that said no.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const seat = loadSeat();
    if (seat !== null) {
      open(seat.name, () => undefined, seat.token);
    }
  }, [open]);

  useEffect(() => {
    if (state.token !== null && state.lobby !== null) {
      const name =
        state.lobby.members.find((member) => member.playerId === state.playerId)?.name ?? '';
      remember(SEAT_KEY, JSON.stringify({ name, token: state.token }));
    }
  }, [state.token, state.lobby, state.playerId]);

  const me = state.match?.players.find((player) => player.id === state.playerId) ?? null;
  const myTurn = state.match?.turn?.playerId === state.playerId;

  const preview = useMemo(() => {
    if (state.match === null || me === null) return { kind: 'off' as const };
    return computePreview(
      { source, origin: me.origin, axis, direction, bounds: state.match.map.bounds },
      previewEnabled,
    );
  }, [state.match, me, source, axis, direction, previewEnabled]);

  if (state.status === 'offline' && state.lobby === null) {
    return (
      <main className="application">
        <Connect
          onCreate={(name) => {
            open(name, (send) => {
              send({ type: 'lobby:create', config: null });
            });
          }}
          onJoin={(name, code) => {
            const parsed = LobbyCodeSchema.safeParse(code);
            if (!parsed.success) return;
            open(name, (send) => {
              send({ type: 'lobby:join', code: parsed.data, asSpectator: false });
            });
          }}
        />
      </main>
    );
  }

  return (
    <main className="application">
      {state.error !== null && (
        <p className="alerte" data-testid="alerte" role="alert">
          {state.error.message}
          <button
            type="button"
            onClick={() => {
              dispatch({ kind: 'dismiss-error' });
            }}
          >
            ×
          </button>
        </p>
      )}

      {state.match === null && state.lobby !== null && (
        <Lobby
          lobby={state.lobby}
          selfId={state.playerId}
          onReady={(ready) => {
            send({ type: 'lobby:ready', ready });
          }}
          onDifficulty={(difficulty) => {
            if (state.lobby === null) return;
            send({
              type: 'lobby:configure',
              config: {
                ...state.lobby.config,
                map: { ...state.lobby.config.map, difficulty },
              },
            });
          }}
          onAddBot={(level) => {
            send({ type: 'lobby:add-bot', level });
          }}
          onRemove={(playerId) => {
            send({ type: 'lobby:remove-player', playerId });
          }}
          onStart={() => {
            send({ type: 'match:start', seed: null });
          }}
        />
      )}

      {state.watching !== null && (
        <>
          <Board
            match={stateAt(state.watching.match, state.watching.at)}
            preview={{ kind: 'off' }}
            selfId={state.playerId}
            animate={false}
          />
          <ReplayViewer
            match={state.watching.match}
            at={state.watching.at}
            onSeek={(to) => {
              dispatch({ kind: 'seek', to });
            }}
            onClose={() => {
              dispatch({ kind: 'stop-watching' });
            }}
          />
        </>
      )}

      {state.watching === null && state.match !== null && (
        <>
          <Board
            match={state.match}
            preview={preview}
            selfId={state.playerId}
            animate={state.match.history.length > 0}
          />

          <p className="tour" data-testid="tour">
            {state.match.phase === 'ended'
              ? 'Partie terminée.'
              : myTurn
                ? 'À toi de tirer.'
                : `Au tour de ${
                    state.match.players.find((p) => p.id === state.match?.turn?.playerId)?.name ??
                    '…'
                  }.`}
          </p>

          <ShotComposer
            source={source}
            axis={axis}
            direction={direction}
            preview={preview}
            previewEnabled={previewEnabled}
            disabled={!myTurn || state.match.phase === 'ended'}
            validation={state.validation}
            onSource={setSource}
            onAxis={setAxis}
            onDirection={setDirection}
            onPreviewEnabled={setPreviewEnabled}
            onValidate={() => {
              send({ type: 'shot:validate', source, axis, direction });
            }}
            onFire={() => {
              send({ type: 'shot:fire', shot: { source, axis, direction } });
              dispatch({ kind: 'dismiss-error' });
            }}
            onPass={() => {
              send({ type: 'turn:pass' });
            }}
          />

          {state.replay !== null && (
            <div className="rangee">
              <button
                type="button"
                data-testid="telecharger-rejeu"
                onClick={() => {
                  downloadReplay(state.replay);
                }}
              >
                Télécharger le rejeu
              </button>
              <button
                type="button"
                data-testid="revoir-rejeu"
                onClick={() => {
                  if (state.replay !== null) send({ type: 'replay:load', replay: state.replay });
                }}
              >
                Revoir la partie
              </button>
            </div>
          )}

          <ol className="journal" data-testid="journal">
            {state.log.map((line, index) => (
              <li key={`${String(index)}-${line}`}>{line}</li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
