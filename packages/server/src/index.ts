/**
 * @fw/server — the authoritative server.
 *
 * `GameServer` knows nothing about sockets; `listen` is the only place that
 * does. That separation is what makes the protocol testable.
 */

export { GameServer, RECONNECT_GRACE_MS } from './server.js';
export type { Connection, ServerDeps } from './server.js';
export { listen, TICK_INTERVAL_MS } from './transport.js';
export { cryptoIds } from './ids.js';
export { MAX_LOBBY_MEMBERS } from './lobby.js';
export { FRAME_LIMIT, PING_LIMIT, VALIDATE_LIMIT, TokenBucket } from './rate-limit.js';
