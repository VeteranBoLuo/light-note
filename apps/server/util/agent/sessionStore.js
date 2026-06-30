/**
 * 会话存储（Redis 持久化 + 内存 Map 兜底）
 *
 * - Redis SETEX 存储序列化 JSON，30 分钟自动过期
 * - Redis 不可用时自动回退内存 Map
 * - 保留最近 N 轮对话摘要
 */
import redisClient from '../redisClient.js';

const MAX_TURNS = 10;
const MAX_TEXT_LENGTH = 700;
const TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 100;
const REDIS_PREFIX = 'chat:sess:';
const REDIS_TTL = 30 * 60;

const sessions = new Map();
let redisOk = true;

redisClient.on('error', () => { redisOk = false; });
redisClient.on('ready', () => { redisOk = true; });

// ---- 工具函数 ----

function truncate(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_TEXT_LENGTH ? s.slice(0, MAX_TEXT_LENGTH) + '...' : s;
}

function now() {
  return Date.now();
}

function isExpired(session) {
  return now() - session.updatedAt > TTL_MS;
}

function cleanupExpired() {
  for (const [id, session] of sessions) {
    if (isExpired(session)) sessions.delete(id);
  }
}

function evictOldest() {
  while (sessions.size > MAX_SESSIONS) {
    let oldest = null;
    for (const [id, s] of sessions) {
      if (!oldest || s.updatedAt < oldest.updatedAt) oldest = s;
    }
    if (oldest) sessions.delete(oldest.id);
  }
}

function makeSession(id) {
  return {
    id,
    turns: [],
    lastTool: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

// ---- Redis 操作 ----

async function redisGet(key) {
  if (!redisOk) return null;
  try {
    const raw = await redisClient.get(REDIS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function redisSet(key, data) {
  if (!redisOk) return;
  try {
    await redisClient.setEx(REDIS_PREFIX + key, REDIS_TTL, JSON.stringify(data));
  } catch { /* ignore */ }
}

// ---- 公开 API ----

export async function getOrCreateSession(sessionId) {
  cleanupExpired();

  const id = sessionId?.trim();
  if (id) {
    // 先尝试 Redis
    const redisSession = await redisGet(id);
    if (redisSession && !isExpired(redisSession)) {
      redisSession.updatedAt = now();
      sessions.set(id, redisSession);
      return redisSession;
    }
    // Redis 没有或过期，查内存
    if (sessions.has(id)) {
      const session = sessions.get(id);
      if (!isExpired(session)) {
        session.updatedAt = now();
        return session;
      }
      sessions.delete(id);
    }
  }

  const newId = id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session = makeSession(newId);
  sessions.set(newId, session);
  evictOldest();

  // 异步写 Redis
  redisSet(newId, session);

  return session;
}

export async function recordTurn(session, userMsg, assistantMsg, toolResults = []) {
  session.turns = [
    ...session.turns,
    {
      user: truncate(userMsg),
      assistant: truncate(assistantMsg),
      tools: toolResults.map((r) => ({
        name: r.name,
        status: r.status,
        params: r.params,
        error: r.error,
      })),
      createdAt: now(),
    },
  ].slice(-MAX_TURNS);

  const lastSuccess = [...toolResults].reverse().find((r) => r.status === 'success');
  if (lastSuccess) {
    session.lastTool = {
      name: lastSuccess.name,
      params: lastSuccess.params,
      dataSummary: lastSuccess.dataSummary,
    };
  }

  session.updatedAt = now();

  // 异步写 Redis
  redisSet(session.id, session);
}

export function buildContext(session) {
  if (!session.turns.length && !session.lastTool) return '';

  const ctx = {
    recentTurns: session.turns.map((t) => ({
      user: t.user,
      assistant: t.assistant,
      tools: t.tools,
    })),
    lastSuccessfulTool: session.lastTool || null,
  };

  return [
    '以下是当前会话的历史上下文（最近对话 + 最后一次工具调用），供你理解用户追问和省略表达：',
    JSON.stringify(ctx, null, 2),
    '如果没有可用上下文，不能假装知道上一轮内容，必须按当前问题本身和默认规则处理。',
  ].join('\n');
}

export function getSessionId(session) {
  return session.id;
}
