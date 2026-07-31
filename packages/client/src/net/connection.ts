import {
  ClientFrameSchema,
  ServerFrameSchema,
  type ClientMessage,
  type ServerMessage,
} from '@fw/contracts';

/**
 * The socket, and nothing else.
 *
 * Frames go out through the contract schema and come back through it, so a
 * server that changed shape is caught here rather than three components deep.
 */
export interface Transport {
  send(message: ClientMessage): void;
  close(): void;
}

export interface TransportHandlers {
  onMessage(message: ServerMessage): void;
  onOpen(): void;
  onClose(): void;
}

export function connect(url: string, handlers: TransportHandlers): Transport {
  const socket = new WebSocket(url);
  let nextId = 0;

  socket.addEventListener('open', () => {
    handlers.onOpen();
  });
  socket.addEventListener('close', () => {
    handlers.onClose();
  });
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    let json: unknown;
    try {
      json = JSON.parse(event.data);
    } catch {
      return;
    }
    const frame = ServerFrameSchema.safeParse(json);
    if (frame.success) handlers.onMessage(frame.data.message);
  });

  return {
    send(message) {
      if (socket.readyState !== WebSocket.OPEN) return;
      nextId += 1;
      const frame = ClientFrameSchema.safeParse({ id: nextId, message });
      if (frame.success) socket.send(JSON.stringify(frame.data));
    },
    close() {
      socket.close();
    },
  };
}
