import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerFrame } from '@fw/contracts';
import type { Connection, GameServer } from './server.js';

/** Longest frame accepted from a client, in bytes. */
const MAX_FRAME_BYTES = 8 * 1024;

/** How often the clock is given a chance to expire a turn. */
export const TICK_INTERVAL_MS = 1000;

/**
 * The only file that knows a WebSocket exists.
 *
 * Everything above it works on `Connection`, which is why the protocol can be
 * exercised end to end without opening a socket.
 */
export function listen(game: GameServer, port: number): { close: () => Promise<void> } {
  const wss = new WebSocketServer({ port, maxPayload: MAX_FRAME_BYTES });
  const timer = setInterval(() => {
    game.tick();
  }, TICK_INTERVAL_MS);

  wss.on('connection', (socket: WebSocket) => {
    const connection: Connection = {
      send: (frame: ServerFrame) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
      },
      close: (reason: string) => {
        socket.close(1008, reason.slice(0, 120));
      },
    };

    game.open(connection);
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const text = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : Array.isArray(data)
          ? Buffer.concat(data).toString('utf8')
          : Buffer.from(data).toString('utf8');
      game.receive(connection, text);
    });
    socket.on('close', () => {
      game.close(connection);
    });
    socket.on('error', () => {
      game.close(connection);
    });
  });

  return {
    close: async () => {
      clearInterval(timer);
      await new Promise<void>((resolve) => {
        wss.close(() => {
          resolve();
        });
      });
    },
  };
}
