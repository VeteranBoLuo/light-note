import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import pool from '../db/index.js';
import { getRequestSid } from './auth.js';
import { getSession } from './sessionStore.js';
import {
  CommunityChatRealtimeUpgradeLimiter,
  getCommunityChatRealtimeClientIp,
  isCommunityChatRealtimeOriginAllowed,
} from './communityChat/realtimeHub.js';
import { notificationRealtimeBroker } from './notificationRealtimeBroker.js';

export const NOTIFICATION_REALTIME_PATH = '/realtime/notifications';
const HEARTBEAT_MS = 25_000;
const REVALIDATE_MS = 120_000;
const MAX_CONNECTIONS = 500;
const MAX_BUFFERED_BYTES = 128 * 1024;

function pathMatches(req) {
  try {
    const url = new URL(String(req.url || ''), 'http://light-note.local');
    return url.pathname === NOTIFICATION_REALTIME_PATH && !url.search;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status = 403) {
  if (socket.destroyed) return;
  const reason = status === 401 ? 'Unauthorized' : status === 429 ? 'Too Many Requests' : 'Forbidden';
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

async function resolveRootAccessBySid(sid, { db = pool, getSessionById = getSession } = {}) {
  if (!sid) throw Object.assign(new Error('NOTIFICATION_REALTIME_LOGIN_REQUIRED'), { status: 401 });
  const session = await getSessionById(sid);
  if (!session?.user_id) throw Object.assign(new Error('NOTIFICATION_REALTIME_SESSION_INVALID'), { status: 401 });
  const [rows] = await db.query('SELECT id, role, del_flag FROM user WHERE id = ? LIMIT 1', [session.user_id]);
  const user = rows[0];
  if (!user || user.role !== 'root' || Number(user.del_flag || 0) !== 0) {
    throw Object.assign(new Error('NOTIFICATION_REALTIME_ROOT_REQUIRED'), { status: 403 });
  }
  return { sid, userId: user.id };
}

async function resolveRootAccess(req, dependencies) {
  return resolveRootAccessBySid(getRequestSid(req), dependencies);
}

export function registerNotificationRealtimeHub(server, options = {}) {
  const db = options.db || pool;
  const broker = options.broker || notificationRealtimeBroker;
  const limiter = options.upgradeLimiter || new CommunityChatRealtimeUpgradeLimiter({ max: 60 });
  const heartbeatMs = options.heartbeatMs || HEARTBEAT_MS;
  const revalidateMs = options.revalidateMs || REVALIDATE_MS;
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, clientTracking: true, maxPayload: 1024 });
  let pendingUpgrades = 0;
  let closed = false;

  function send(ws, event) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      ws.close(1013, 'reconnect_required');
      return;
    }
    try {
      ws.send(JSON.stringify(event));
    } catch {
      ws.terminate();
    }
  }

  function initialize(ws, context) {
    context.nextRevalidateAt = Date.now() + revalidateMs;
    context.revalidating = false;
    ws.notificationContext = context;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', () => ws.close(1008, 'client_messages_unsupported'));
    send(ws, {
      protocolVersion: 1,
      type: 'hello',
      eventId: randomUUID(),
      serverTime: new Date().toISOString(),
      payload: { heartbeatIntervalMs: heartbeatMs },
    });
  }

  async function revalidate(ws) {
    const context = ws.notificationContext;
    if (!context || context.revalidating) return;
    context.revalidating = true;
    try {
      const current = await resolveRootAccessBySid(context.sid, { db, getSessionById: options.getSessionById });
      context.userId = current.userId;
      context.nextRevalidateAt = Date.now() + revalidateMs;
    } catch {
      ws.close(4403, 'access_changed');
    } finally {
      context.revalidating = false;
    }
  }

  const upgradeHandler = async (req, socket, head) => {
    if (!pathMatches(req)) return;
    if (!isCommunityChatRealtimeOriginAllowed(req, options.env || process.env)) return rejectUpgrade(socket, 403);
    if (!limiter.consume(getCommunityChatRealtimeClientIp(req))) return rejectUpgrade(socket, 429);
    if (wss.clients.size + pendingUpgrades >= MAX_CONNECTIONS) return rejectUpgrade(socket, 429);
    pendingUpgrades += 1;
    socket.setTimeout?.(10_000, () => socket.destroy());
    try {
      const context = await resolveRootAccess(req, { db, getSessionById: options.getSessionById });
      if (socket.destroyed) return;
      socket.setTimeout?.(0);
      wss.handleUpgrade(req, socket, head, (ws) => initialize(ws, context));
    } catch (error) {
      rejectUpgrade(socket, Number(error?.status) === 401 ? 401 : 403);
    } finally {
      pendingUpgrades = Math.max(0, pendingUpgrades - 1);
    }
  };
  server.on('upgrade', upgradeHandler);

  const unsubscribe = broker.subscribe((event) => {
    for (const ws of wss.clients) {
      if (ws.notificationContext?.userId !== event.userId) continue;
      send(ws, {
        protocolVersion: 1,
        type: 'notification.changed',
        eventId: event.eventId,
        serverTime: event.serverTime,
        payload: { reason: event.reason },
      });
    }
  });
  void broker.startRedisBridge();

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
      if (ws.notificationContext && Date.now() >= ws.notificationContext.nextRevalidateAt) void revalidate(ws);
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    server.off?.('upgrade', upgradeHandler);
    unsubscribe();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(() => resolve()));
    await broker.close?.();
  };
  server.once?.('close', () => void close());
  return { close, wss };
}

export const __test__ = { pathMatches, resolveRootAccess, resolveRootAccessBySid };
