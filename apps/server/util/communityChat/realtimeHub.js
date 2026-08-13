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
import { issueCommunityChatPresenceAvatarToken } from './presenceAvatarToken.js';
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
const DEFAULT_PRESENCE_GRACE_MS = 45_000;
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
  const configuredPresenceGraceMs = Number(options.presenceGraceMs ?? DEFAULT_PRESENCE_GRACE_MS);
  const presenceGraceMs = Number.isFinite(configuredPresenceGraceMs) ? Math.max(0, configuredPresenceGraceMs) : 0;
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
  // Map 的键只在服务端内存中存在：登录账号按 user id，多标签页/多设备仍只计 1；
  // 游客按浏览器本地稳定标识去重。Set 为空但仍在宽限期时继续计为在线，避免切页抖动。
  const presenceConnections = new Map();
  const presenceOfflineTimers = new Map();
  let closed = false;

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

  function sendRequestError(ws, requestId, code) {
    sendEvent(
      ws,
      createCommunityChatServerEvent(
        'error',
        { code: String(code || 'REALTIME_REQUEST_FAILED').slice(0, 64) },
        { requestId },
      ),
    );
  }

  function currentOnlineCount() {
    return presenceConnections.size;
  }

  async function loadOnlineMembersSnapshot() {
    const accountIds = [];
    let guestCount = 0;
    for (const identityKey of presenceConnections.keys()) {
      if (identityKey.startsWith('user:')) {
        const accountId = identityKey.slice('user:'.length).trim();
        if (accountId) accountIds.push(accountId);
      } else {
        guestCount += 1;
      }
    }

    if (!accountIds.length) {
      return {
        onlineCount: currentOnlineCount(),
        memberCount: 0,
        guestCount,
        members: [],
      };
    }

    const placeholders = accountIds.map(() => '?').join(', ');
    const [rows] = await db.query(
      `SELECT account.id, COALESCE(NULLIF(account.alias, ''), '') AS alias, account.role,
              CASE
                WHEN account.head_picture LIKE 'https://%' OR account.head_picture LIKE 'http://%'
                  THEN account.head_picture
                WHEN account.head_picture LIKE 'data:image/%;base64,%'
                  AND OCTET_LENGTH(account.head_picture) <= 524288
                  THEN 'inline'
                ELSE ''
              END AS avatarSource,
              growth.equipped_frame AS frameId
         FROM user account
         LEFT JOIN user_growth growth ON growth.user_id = account.id
        WHERE account.id IN (${placeholders})
          AND (account.role = 'root' OR account.del_flag = 0)`,
      accountIds,
    );
    const accountOrder = new Map(accountIds.map((id, index) => [String(id), index]));
    const members = rows
      .map((row) => ({
        internalId: String(row.id || ''),
        alias: String(row.alias || '').slice(0, 80),
        role: ['root', 'user', 'visitor', 'test'].includes(String(row.role || ''))
          ? String(row.role)
          : 'user',
        avatar:
          row.avatarSource === 'inline'
            ? `/api/community-chat/presence/members/${encodeURIComponent(
                issueCommunityChatPresenceAvatarToken(row.id, { env }),
              )}/avatar`
            : String(row.avatarSource || '').slice(0, 512),
        frameId: String(row.frameId || '').slice(0, 64),
      }))
      .sort((left, right) => (accountOrder.get(left.internalId) ?? 0) - (accountOrder.get(right.internalId) ?? 0))
      .map(({ internalId: _internalId, ...member }) => member);

    return {
      onlineCount: currentOnlineCount(),
      memberCount: members.length,
      guestCount,
      members,
    };
  }

  function broadcastPresenceChanged() {
    if (closed) return;
    const event = createCommunityChatServerEvent('presence.changed', {
      onlineCount: currentOnlineCount(),
    });
    for (const client of wss.clients) {
      if (!client.communityChatContext?.rooms?.size) continue;
      sendEvent(client, event);
    }
  }

  function resolvePresenceIdentity(context, presenceClientId = '') {
    const accountId = String(context.user?.id || '').trim();
    if (accountId) return `user:${accountId}`;
    const clientId = String(presenceClientId || '').trim();
    if (clientId) return `guest:${clientId}`;
    // 兼容尚未升级的旧前端；新版都会提交稳定标识。该随机键不会对外返回。
    context.fallbackPresenceId ||= randomUUID();
    return `guest-connection:${context.fallbackPresenceId}`;
  }

  function attachPresenceConnection(ws, context, presenceClientId) {
    const identityKey = resolvePresenceIdentity(context, presenceClientId);
    if (context.presenceIdentityKey && context.presenceIdentityKey !== identityKey) {
      throw new CommunityChatRealtimeProtocolError(
        'REALTIME_PRESENCE_ID_CHANGED',
        'Realtime presence identity cannot change within one connection',
      );
    }
    context.presenceIdentityKey = identityKey;
    const offlineTimer = presenceOfflineTimers.get(identityKey);
    if (offlineTimer) {
      clearTimeout(offlineTimer);
      presenceOfflineTimers.delete(identityKey);
    }
    const existed = presenceConnections.has(identityKey);
    const connections = presenceConnections.get(identityKey) || new Set();
    connections.add(ws);
    presenceConnections.set(identityKey, connections);
    return !existed;
  }

  function detachPresenceConnection(ws, context) {
    const identityKey = context?.presenceIdentityKey;
    if (!identityKey) return;
    const connections = presenceConnections.get(identityKey);
    if (!connections) return;
    connections.delete(ws);
    if (connections.size) return;
    if (presenceOfflineTimers.has(identityKey)) return;
    const removePresence = () => {
      presenceOfflineTimers.delete(identityKey);
      const latestConnections = presenceConnections.get(identityKey);
      if (!latestConnections || latestConnections.size) return;
      presenceConnections.delete(identityKey);
      broadcastPresenceChanged();
    };
    if (presenceGraceMs === 0) {
      removePresence();
      return;
    }
    const timer = setTimeout(removePresence, presenceGraceMs);
    timer.unref?.();
    presenceOfflineTimers.set(identityKey, timer);
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
    context.presenceIdentityKey = '';
    ws.communityChatContext = context;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('close', () => detachPresenceConnection(ws, context));
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
        if (message.type === 'presence.members.request') {
          if (!context.rooms.size) {
            sendRequestError(ws, message.requestId, 'REALTIME_ROOM_SUBSCRIPTION_REQUIRED');
            return;
          }
          if (context.user?.role !== 'root') {
            sendRequestError(ws, message.requestId, 'REALTIME_ROOT_REQUIRED');
            return;
          }
          try {
            const snapshot = await loadOnlineMembersSnapshot();
            sendEvent(
              ws,
              createCommunityChatServerEvent('presence.members', snapshot, { requestId: message.requestId }),
            );
          } catch (error) {
            logger.error('[community-chat-realtime] 在线成员读取失败 code=%s', stableAgentErrorCode(error));
            sendRequestError(ws, message.requestId, 'REALTIME_PRESENCE_MEMBERS_FAILED');
          }
          return;
        }
        const presenceChanged = attachPresenceConnection(ws, context, message.payload.presenceClientId);
        // 新连接先只通知已有订阅者，再用 room.subscribed 把相同权威值交给自己，避免重复事件。
        if (presenceChanged) broadcastPresenceChanged();
        context.rooms.add(message.payload.roomSlug);
        sendEvent(
          ws,
          createCommunityChatServerEvent(
            'room.subscribed',
            { roomSlug: message.payload.roomSlug, onlineCount: currentOnlineCount() },
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
      } else if (
        event.type === 'message.created' ||
        event.type === 'message.updated' ||
        event.type === 'message.removed'
      ) {
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

  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    for (const timer of presenceOfflineTimers.values()) clearTimeout(timer);
    presenceOfflineTimers.clear();
    presenceConnections.clear();
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
    getOnlineCount: currentOnlineCount,
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
