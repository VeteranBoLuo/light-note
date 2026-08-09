import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import pool from '../../db/index.js';
import { getRequestSid } from '../auth.js';
import { getCommunityChatFeatureState } from '../communityChatFeature.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import {
  getActiveSecurityRestrictions,
  restrictionBlocksRequest,
} from '../security/services/securityRestrictionService.js';
import { getSession } from '../sessionStore.js';
import { assertCommunityChatReadAccess } from '../services/communityChatAccessService.js';
import { communityChatRealtimeBroker } from './realtimeBroker.js';
import {
  COMMUNITY_CHAT_REALTIME_MAX_CLIENT_PAYLOAD_BYTES,
  COMMUNITY_CHAT_REALTIME_PATH,
  COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
  CommunityChatRealtimeProtocolError,
  createCommunityChatServerEvent,
  parseCommunityChatClientMessage,
} from './realtimeProtocol.js';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;
const DEFAULT_REVALIDATE_AFTER_MS = 120_000;
const DEFAULT_MAX_BUFFERED_BYTES = 256 * 1024;
const DEFAULT_MAX_CONNECTIONS = 500;
const DEFAULT_UPGRADES_PER_MINUTE = 60;
const MAX_CLIENT_MESSAGES_PER_MINUTE = 12;

class CommunityChatRealtimeAccessError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.name = 'CommunityChatRealtimeAccessError';
    this.code = code;
    this.status = status;
  }
}

function firstForwardedValue(value) {
  return String(value || '')
    .split(',')[0]
    .trim();
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function explicitAllowedOrigins(env) {
  return new Set(
    String(env.COMMUNITY_CHAT_ALLOWED_ORIGINS || '')
      .split(/[\s,;]+/)
      .map(normalizeOrigin)
      .filter(Boolean),
  );
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function isCommunityChatRealtimeOriginAllowed(req, env = process.env) {
  const rawOrigin = String(req.headers?.origin || '').trim();
  if (!rawOrigin || rawOrigin === 'null') return false;
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) return false;
  if (explicitAllowedOrigins(env).has(origin)) return true;

  const parsedOrigin = new URL(origin);
  // raw upgrade 不经过 Express 的 trust proxy 处理。只有 TCP 对端本身是本机反代时才信任
  // x-forwarded-*，避免公网客户端自行伪造转发主机绕过 Origin 校验。
  const trustForwardedHeaders = isLoopbackAddress(req.socket?.remoteAddress);
  const forwardedHost = trustForwardedHeaders ? firstForwardedValue(req.headers?.['x-forwarded-host']) : '';
  const requestHost = forwardedHost || firstForwardedValue(req.headers?.host);
  const forwardedProtocol = trustForwardedHeaders
    ? firstForwardedValue(req.headers?.['x-forwarded-proto']).replace(/:$/, '')
    : '';
  const requestProtocol = forwardedProtocol || (req.socket?.encrypted ? 'https' : 'http');
  if (requestHost && parsedOrigin.host === requestHost && parsedOrigin.protocol === `${requestProtocol}:`) return true;

  // 本地 Vite 的 changeOrigin 会把 Host 改成后端端口，但浏览器 Origin 仍是前端端口。
  // 仅在非生产且请求两端都是回环地址时放行，绝不扩大到局域网或任意 http 来源。
  if (env.NODE_ENV !== 'production') {
    let requestHostname = '';
    try {
      requestHostname = new URL(`http://${requestHost}`).hostname;
    } catch {
      requestHostname = '';
    }
    if (isLoopbackHostname(parsedOrigin.hostname) && isLoopbackHostname(requestHostname)) return true;
  }
  return false;
}

function parsePositiveInteger(value, fallback, min, max) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function isLoopbackAddress(address) {
  const normalized = String(address || '').toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1';
}

export function getCommunityChatRealtimeClientIp(req) {
  const remoteAddress = String(req.socket?.remoteAddress || 'unknown');
  if (!isLoopbackAddress(remoteAddress)) return remoteAddress;
  return firstForwardedValue(req.headers?.['x-forwarded-for']) || remoteAddress;
}

export class CommunityChatRealtimeUpgradeLimiter {
  constructor({ max = DEFAULT_UPGRADES_PER_MINUTE, windowMs = 60_000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  consume(key, now = Date.now()) {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && this.buckets.size >= 10_000) {
        for (const [bucketKey, bucket] of this.buckets) {
          if (bucket.resetAt <= now) this.buckets.delete(bucketKey);
        }
        if (this.buckets.size >= 10_000) return false;
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.max) return false;
    current.count += 1;
    if (this.buckets.size > 5000) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(bucketKey);
      }
    }
    return true;
  }
}

function realtimePathMatches(req) {
  try {
    const url = new URL(String(req.url || ''), 'http://light-note.local');
    return url.pathname === COMMUNITY_CHAT_REALTIME_PATH && !url.search;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status = 403) {
  const reason =
    status === 401
      ? 'Unauthorized'
      : status === 429
        ? 'Too Many Requests'
        : status === 503
          ? 'Service Unavailable'
          : 'Forbidden';
  if (socket.destroyed) return;
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`,
  );
}

function guestUser() {
  return { id: '', alias: '', role: 'visitor', isAuthenticated: false };
}

export async function resolveCommunityChatRealtimeAccess({
  sid = '',
  env = process.env,
  db = pool,
  getSessionById = getSession,
  getRestrictions = getActiveSecurityRestrictions,
  assertReadAccess = assertCommunityChatReadAccess,
} = {}) {
  let user = guestUser();
  if (sid) {
    const session = await getSessionById(sid);
    if (!session?.user_id) throw new CommunityChatRealtimeAccessError('REALTIME_SESSION_INVALID', 401);
    const [rows] = await db.query(
      `SELECT id, alias, role, del_flag
         FROM user
        WHERE id = ?
        LIMIT 1`,
      [session.user_id],
    );
    const account = rows[0];
    if (!account || (account.role !== 'root' && Number(account.del_flag || 0) === 1)) {
      throw new CommunityChatRealtimeAccessError('REALTIME_ACCOUNT_UNAVAILABLE', 401);
    }
    user = {
      id: account.id,
      alias: account.alias || '',
      role: account.role || 'visitor',
      isAuthenticated: account.role !== 'visitor',
    };
    const restrictions = await getRestrictions(user.id);
    if (restrictionBlocksRequest(restrictions, { path: COMMUNITY_CHAT_REALTIME_PATH, method: 'GET' })) {
      throw new CommunityChatRealtimeAccessError('REALTIME_ACCOUNT_RESTRICTED', 403);
    }
  }
  await assertReadAccess({ user, env, db });
  return { sid, user };
}

function clientMessageRateAllowed(context, now = Date.now()) {
  if (!context.messageWindow || context.messageWindow.resetAt <= now) {
    context.messageWindow = { count: 1, resetAt: now + 60_000 };
    return true;
  }
  context.messageWindow.count += 1;
  return context.messageWindow.count <= MAX_CLIENT_MESSAGES_PER_MINUTE;
}

function safeClose(ws, code, reason) {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    try {
      ws.close(code, String(reason || '').slice(0, 100));
    } catch {
      ws.terminate();
    }
  }
}

export function registerCommunityChatRealtimeHub(server, options = {}) {
  if (!server?.on) throw new TypeError('A Node HTTP server is required for community chat realtime');
  const env = options.env || process.env;
  const db = options.db || pool;
  const broker = options.broker || communityChatRealtimeBroker;
  const logger = options.logger || console;
  const heartbeatIntervalMs = options.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS;
  const revalidateAfterMs = options.revalidateAfterMs || DEFAULT_REVALIDATE_AFTER_MS;
  const maxBufferedBytes = options.maxBufferedBytes || DEFAULT_MAX_BUFFERED_BYTES;
  const maxConnections = parsePositiveInteger(
    env.COMMUNITY_CHAT_REALTIME_MAX_CONNECTIONS,
    DEFAULT_MAX_CONNECTIONS,
    1,
    10_000,
  );
  const upgradesPerMinute = parsePositiveInteger(
    env.COMMUNITY_CHAT_REALTIME_UPGRADES_PER_MINUTE,
    DEFAULT_UPGRADES_PER_MINUTE,
    5,
    600,
  );
  const upgradeLimiter = options.upgradeLimiter || new CommunityChatRealtimeUpgradeLimiter({ max: upgradesPerMinute });
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    clientTracking: true,
    maxPayload: COMMUNITY_CHAT_REALTIME_MAX_CLIENT_PAYLOAD_BYTES,
  });
  let pendingUpgrades = 0;

  function sendEvent(ws, event) {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > maxBufferedBytes) {
      safeClose(ws, 1013, 'reconnect_required');
      return false;
    }
    try {
      ws.send(JSON.stringify(event), (error) => {
        if (error) safeClose(ws, 1011, 'send_failed');
      });
      return true;
    } catch {
      safeClose(ws, 1011, 'send_failed');
      return false;
    }
  }

  function sendProtocolError(ws, error) {
    sendEvent(
      ws,
      createCommunityChatServerEvent('error', {
        code: error?.code || 'REALTIME_PROTOCOL_ERROR',
      }),
    );
    safeClose(ws, error?.closeCode || 1008, 'protocol_error');
  }

  async function revalidateSocket(ws, context) {
    if (context.revalidating) return;
    context.revalidating = true;
    try {
      const resolved = await resolveCommunityChatRealtimeAccess({
        sid: context.sid,
        env,
        db,
        getSessionById: options.getSessionById,
        getRestrictions: options.getRestrictions,
        assertReadAccess: options.assertReadAccess,
      });
      context.user = resolved.user;
      context.nextRevalidateAt = Date.now() + revalidateAfterMs;
    } catch {
      sendEvent(
        ws,
        createCommunityChatServerEvent('access.changed', {
          reason: 'permissions_changed',
          disconnect: true,
        }),
      );
      safeClose(ws, 4403, 'access_changed');
    } finally {
      context.revalidating = false;
    }
  }

  function initializeConnection(ws, context) {
    context.rooms = new Set();
    context.messageWindow = null;
    context.nextRevalidateAt = Date.now() + revalidateAfterMs;
    context.revalidating = false;
    ws.communityChatContext = context;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', async (raw, isBinary) => {
      if (isBinary) {
        sendProtocolError(
          ws,
          new CommunityChatRealtimeProtocolError(
            'REALTIME_BINARY_UNSUPPORTED',
            'Binary payloads are unsupported',
            1003,
          ),
        );
        return;
      }
      if (!clientMessageRateAllowed(context)) {
        sendProtocolError(
          ws,
          new CommunityChatRealtimeProtocolError('REALTIME_MESSAGE_RATE_LIMITED', 'Too many realtime messages', 1008),
        );
        return;
      }
      try {
        const message = parseCommunityChatClientMessage(raw);
        await revalidateSocket(ws, context);
        if (ws.readyState !== WebSocket.OPEN) return;
        context.rooms.add(message.payload.roomSlug);
        sendEvent(
          ws,
          createCommunityChatServerEvent(
            'room.subscribed',
            { roomSlug: message.payload.roomSlug },
            { requestId: message.requestId },
          ),
        );
      } catch (error) {
        sendProtocolError(ws, error);
      }
    });
    sendEvent(
      ws,
      createCommunityChatServerEvent('hello', {
        connectionId: randomUUID(),
        heartbeatIntervalMs,
      }),
    );
  }

  const upgradeHandler = async (req, socket, head) => {
    if (!realtimePathMatches(req)) return;
    const feature = getCommunityChatFeatureState(env);
    if (!feature.realtimeEnabled) {
      rejectUpgrade(socket, 503);
      return;
    }
    if (!isCommunityChatRealtimeOriginAllowed(req, env)) {
      rejectUpgrade(socket, 403);
      return;
    }
    if (!upgradeLimiter.consume(getCommunityChatRealtimeClientIp(req))) {
      rejectUpgrade(socket, 429);
      return;
    }
    if (wss.clients.size + pendingUpgrades >= maxConnections) {
      rejectUpgrade(socket, 503);
      return;
    }
    pendingUpgrades += 1;
    socket.setTimeout?.(10_000, () => socket.destroy());
    try {
      const sid = getRequestSid(req);
      const context = await resolveCommunityChatRealtimeAccess({
        sid,
        env,
        db,
        getSessionById: options.getSessionById,
        getRestrictions: options.getRestrictions,
        assertReadAccess: options.assertReadAccess,
      });
      if (socket.destroyed) return;
      socket.setTimeout?.(0);
      wss.handleUpgrade(req, socket, head, (ws) => initializeConnection(ws, context));
    } catch (error) {
      rejectUpgrade(socket, Number(error?.status) === 401 ? 401 : 403);
    } finally {
      pendingUpgrades = Math.max(0, pendingUpgrades - 1);
    }
  };
  server.on('upgrade', upgradeHandler);

  const unsubscribeBroker = broker.subscribe((envelope) => {
    const { event, internal = {} } = envelope || {};
    if (!event) return;
    for (const ws of wss.clients) {
      const context = ws.communityChatContext;
      if (!context) continue;
      if (event.type === 'access.changed') {
        if (!internal.targetUserId || internal.targetUserId !== context.user?.id) continue;
      } else if (event.type === 'message.created' || event.type === 'message.removed') {
        if (!context.rooms.has(event.payload.roomSlug)) continue;
      } else if (!context.rooms.size) {
        continue;
      }
      if (!sendEvent(ws, event)) continue;
      if (event.type === 'access.changed' && event.payload.disconnect) {
        setTimeout(() => safeClose(ws, 4403, 'access_changed'), 25);
      }
    }
  });

  if (getCommunityChatFeatureState(env).realtimeEnabled) {
    void broker.startRedisBridge().catch((error) => {
      logger.error('[community-chat-realtime] 跨实例桥接未启动 code=%s', stableAgentErrorCode(error));
    });
  }

  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      const context = ws.communityChatContext;
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
        continue;
      }
      if (context && Date.now() >= context.nextRevalidateAt) void revalidateSocket(ws, context);
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    server.off?.('upgrade', upgradeHandler);
    unsubscribeBroker();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(() => resolve()));
    if (options.manageBrokerLifecycle !== false) await broker.close?.();
  };
  server.once?.('close', () => {
    void close();
  });

  return {
    close,
    protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
    wss,
  };
}

export const __test__ = {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_REVALIDATE_AFTER_MS,
  clientMessageRateAllowed,
  explicitAllowedOrigins,
  firstForwardedValue,
  guestUser,
  isLoopbackHostname,
  normalizeOrigin,
  realtimePathMatches,
};
