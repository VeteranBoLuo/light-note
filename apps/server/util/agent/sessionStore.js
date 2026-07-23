/**
 * 会话存储（Redis 持久化 + 内存 Map 兜底）
 *
 * - Redis SETEX 存储序列化 JSON，30 分钟自动过期
 * - Redis 不可用时自动回退内存 Map
 * - 保留最近 N 轮对话摘要
 */
import redisClient from '../redisClient.js';
import crypto from 'crypto';

const MAX_TURNS = 10;
const MAX_ACTION_BATCHES = 3;
const MAX_TEXT_LENGTH = 700;
const TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 100;
const REDIS_PREFIX = 'chat:sess:';
const REDIS_TTL = 30 * 60;

const sessions = new Map();
let redisOk = true;

redisClient.on('error', () => {
  redisOk = false;
});
redisClient.on('ready', () => {
  redisOk = true;
});

// ---- 工具函数 ----

function truncate(text) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
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
    for (const [key, s] of sessions) {
      if (!oldest || s.updatedAt < oldest.updatedAt) oldest = { key, updatedAt: s.updatedAt };
    }
    if (oldest) sessions.delete(oldest.key);
  }
}

function normalizeOwnerKey(ownerKey) {
  return crypto
    .createHash('sha256')
    .update(String(ownerKey || 'visitor:anonymous'))
    .digest('hex');
}

function storageKey(ownerKey, sessionId) {
  return `${normalizeOwnerKey(ownerKey)}:${sessionId}`;
}

function makeSession(id, ownerKey) {
  return {
    id,
    ownerKey: normalizeOwnerKey(ownerKey),
    turns: [],
    lastTool: null,
    actionBatches: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') return null;
  if (!Array.isArray(session.turns)) session.turns = [];
  if (!Array.isArray(session.actionBatches)) session.actionBatches = [];
  return session;
}

function cloneActionArgs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function persistSession(session) {
  session.updatedAt = now();
  return redisSet(`${session.ownerKey}:${session.id}`, session);
}

async function findSession(ownerKey, sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const key = storageKey(ownerKey, id);
  const ownerHash = normalizeOwnerKey(ownerKey);
  const redisSession = normalizeSession(await redisGet(key));
  if (redisSession && redisSession.ownerKey === ownerHash && !isExpired(redisSession)) {
    sessions.set(key, redisSession);
    return redisSession;
  }
  const memorySession = normalizeSession(sessions.get(key));
  if (memorySession && memorySession.ownerKey === ownerHash && !isExpired(memorySession)) {
    return memorySession;
  }
  sessions.delete(key);
  return null;
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
  } catch {
    /* ignore */
  }
}

// ---- 公开 API ----

export async function getOrCreateSession(ownerKey, sessionId) {
  cleanupExpired();

  const requestedId = String(sessionId || '').trim();
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)
    ? requestedId
    : '';
  if (id) {
    const existing = await findSession(ownerKey, id);
    if (existing) {
      existing.updatedAt = now();
      return existing;
    }
  }

  // 不接受客户端指定一个服务端不存在的 ID，避免会话固定；新会话始终由服务端生成。
  const newId = crypto.randomUUID();
  const key = storageKey(ownerKey, newId);
  const session = makeSession(newId, ownerKey);
  sessions.set(key, session);
  evictOldest();

  // 异步写 Redis
  redisSet(key, session);

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

  // 异步写 Redis
  persistSession(session);
}

/**
 * 记录一批“已经准备、尚未执行”的写操作。
 *
 * retryArgs 只保存服务端归一化后的公开参数，不保存 prepare 阶段生成的版本快照。
 * 因此用户重试时必须重新经过权限、归属、歧义和乐观锁预检，绝不会复用旧确认。
 */
export async function recordPendingActionBatch(session, { batchId, actions } = {}) {
  const normalizedActions = (Array.isArray(actions) ? actions : [])
    .filter((action) => action && String(action.confirmationId || '').trim() && String(action.toolName || '').trim())
    .map((action) => ({
      confirmationId: String(action.confirmationId).trim(),
      toolName: String(action.toolName).trim(),
      retryArgs: cloneActionArgs(action.retryArgs),
      state: 'pending',
      expiresAt: String(action.expiresAt || ''),
      summary: '',
      updatedAt: now(),
    }));
  if (!session || !normalizedActions.length) return false;
  normalizeSession(session);
  const id = String(batchId || crypto.randomUUID()).trim();
  const archivedBatches = session.actionBatches
    .filter((batch) => batch?.id !== id)
    .map((batch) => ({
      ...batch,
      actions: (batch.actions || []).map((action) => ({ ...action, retryArgs: {} })),
    }));
  session.actionBatches = [
    ...archivedBatches,
    {
      id,
      actions: normalizedActions,
      createdAt: now(),
      updatedAt: now(),
    },
  ].slice(-MAX_ACTION_BATCHES);
  await persistSession(session);
  return true;
}

export async function recordPendingActionBatchById({ ownerKey, sessionId, batchId, actions } = {}) {
  const session = await findSession(ownerKey, sessionId);
  if (!session) return false;
  return recordPendingActionBatch(session, { batchId, actions });
}

/**
 * 用服务端执行/取消结果推进动作状态。找不到会话或动作时失败关闭，不创建伪会话。
 */
export async function settleSessionAction({ ownerKey, sessionId, confirmationId, state, summary = '' } = {}) {
  const allowedStates = new Set(['cancelled', 'succeeded', 'failed', 'unknown']);
  if (!allowedStates.has(state)) return false;
  const session = await findSession(ownerKey, sessionId);
  if (!session) return false;
  const actionId = String(confirmationId || '').trim();
  let target = null;
  for (let index = session.actionBatches.length - 1; index >= 0 && !target; index -= 1) {
    target = session.actionBatches[index]?.actions?.find((action) => action.confirmationId === actionId) || null;
  }
  if (!target) return false;
  // 已成功是不可逆的权威终态，后到的取消/失败请求不能覆盖它。
  if (target.state === 'succeeded' && state !== 'succeeded') return false;
  target.state = state;
  target.summary = truncate(summary);
  target.updatedAt = now();
  if (state === 'succeeded' || state === 'unknown') target.retryArgs = {};
  await persistSession(session);
  return true;
}

function effectiveActionState(action) {
  if (
    action?.state === 'pending' &&
    action.expiresAt &&
    Number.isFinite(Date.parse(action.expiresAt)) &&
    Date.parse(action.expiresAt) <= now()
  ) {
    return 'expired';
  }
  return String(action?.state || '');
}

/**
 * 解析“重试/重新执行”所指向的最近一批可信动作。
 * 返回值只用于确定性控制流，绝不直接进入模型提示词。
 */
export function resolveSessionActionRetry(session) {
  const batches = Array.isArray(session?.actionBatches) ? session.actionBatches : [];
  const batch = batches[batches.length - 1];
  const actions = Array.isArray(batch?.actions) ? batch.actions : [];
  if (!actions.length) return { state: 'none' };

  const states = actions.map((action) => ({ action, state: effectiveActionState(action) }));
  const retryable = states.filter(({ state }) => ['cancelled', 'failed', 'expired'].includes(state));
  const pending = states.filter(({ state }) => state === 'pending');
  const unknown = states.filter(({ state }) => state === 'unknown');
  const succeeded = states.filter(({ state }) => state === 'succeeded');

  // 同一轮有多个未决/可重试动作时禁止猜目标。
  if (actions.length > 1 && pending.length + unknown.length + retryable.length > 1) {
    return { state: 'ambiguous', count: pending.length + unknown.length + retryable.length };
  }
  if (pending.length) return { state: 'pending', action: pending[0].action };
  if (unknown.length) return { state: 'unknown', action: unknown[0].action };
  if (retryable.length === 1) return { state: 'retryable', action: retryable[0].action };
  if (retryable.length > 1) return { state: 'ambiguous', count: retryable.length };
  if (succeeded.length === 1) return { state: 'succeeded', action: succeeded[0].action };
  if (succeeded.length > 1) return { state: 'succeeded_batch', count: succeeded.length };
  return { state: 'none' };
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
