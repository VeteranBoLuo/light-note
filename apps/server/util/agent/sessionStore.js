/**
 * 会话存储（Redis 持久化 + 内存 Map 兜底）
 *
 * - Redis SETEX 存储序列化 JSON，30 分钟自动过期
 * - Redis 不可用时自动回退内存 Map
 * - 保留最近 N 轮对话摘要
 */
import redisClient from '../redisClient.js';
import crypto from 'crypto';
import { normalizeAgentUuid } from './identifiers.js';

const MAX_TURNS = 10;
const MAX_ACTION_BATCHES = 3;
const MAX_SOURCE_SETS = 6;
const MAX_CLARIFICATIONS = 3;
const MAX_RESULT_SETS = 6;
const MAX_ARTIFACT_STATES = 4;
const CLARIFICATION_TTL_MS = 5 * 60 * 1000;
const MAX_TEXT_LENGTH = 700;
const TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 100;
const REDIS_PREFIX = 'chat:sess:';
const REDIS_FOCUS_PREFIX = 'chat:sess:focus:';
const REDIS_TTL = 30 * 60;
const SESSION_PERSISTENCE = Symbol('agentSessionPersistence');

const sessions = new Map();
const focusSnapshots = new Map();
const focusMutationQueues = new Map();
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
    if (isExpired(session)) {
      sessions.delete(id);
      focusSnapshots.delete(id);
    }
  }
}

function evictOldest() {
  while (sessions.size > MAX_SESSIONS) {
    let oldest = null;
    for (const [key, s] of sessions) {
      if (!oldest || s.updatedAt < oldest.updatedAt) oldest = { key, updatedAt: s.updatedAt };
    }
    if (oldest) {
      sessions.delete(oldest.key);
      focusSnapshots.delete(oldest.key);
    }
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
    sourceSets: [],
    clarifications: [],
    resultSets: [],
    artifactStates: [],
    discourseState: {
      schemaVersion: 3,
      revision: 0,
      topicEpoch: 0,
      activeDomain: '',
      lastCapabilityIds: [],
      lastResultSetId: '',
      activeSourceSetIds: [],
      activeResultSetIds: [],
      pendingFocus: null,
      activeReadRunId: '',
      lastRunState: 'idle',
      pendingArtifactId: '',
      unresolvedReference: false,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') return null;
  if (!Array.isArray(session.turns)) session.turns = [];
  if (!Array.isArray(session.actionBatches)) session.actionBatches = [];
  if (!Array.isArray(session.sourceSets)) session.sourceSets = [];
  if (!Array.isArray(session.clarifications)) session.clarifications = [];
  if (!Array.isArray(session.resultSets)) session.resultSets = [];
  if (!Array.isArray(session.artifactStates)) session.artifactStates = [];
  if (!session.discourseState || typeof session.discourseState !== 'object' || Array.isArray(session.discourseState)) {
    session.discourseState = {};
  }
  session.discourseState = {
    schemaVersion: 3,
    revision: Math.max(0, Number(session.discourseState.revision) || 0),
    topicEpoch: Math.max(0, Number(session.discourseState.topicEpoch) || 0),
    activeDomain: String(session.discourseState.activeDomain || ''),
    lastCapabilityIds: [...new Set((session.discourseState.lastCapabilityIds || []).map(String))].slice(0, 8),
    lastResultSetId: String(session.discourseState.lastResultSetId || ''),
    activeSourceSetIds: uniqueSessionIds(session.discourseState.activeSourceSetIds, MAX_SOURCE_SETS),
    activeResultSetIds: [
      ...new Set(
        (Array.isArray(session.discourseState.activeResultSetIds)
          ? session.discourseState.activeResultSetIds
          : [session.discourseState.lastResultSetId]
        )
          .map(String)
          .filter(Boolean),
      ),
    ].slice(-MAX_RESULT_SETS),
    pendingFocus:
      session.discourseState.pendingFocus && typeof session.discourseState.pendingFocus === 'object'
        ? {
            id: String(session.discourseState.pendingFocus.id || ''),
            topicEpochAction: session.discourseState.pendingFocus.topicEpochAction === 'advance' ? 'advance' : 'keep',
            activeDomain: String(session.discourseState.pendingFocus.activeDomain || ''),
            lastCapabilityIds: [
              ...new Set((session.discourseState.pendingFocus.lastCapabilityIds || []).map(String)),
            ].slice(0, 8),
            replaceResultScope: session.discourseState.pendingFocus.replaceResultScope === true,
            unresolvedReference: session.discourseState.pendingFocus.unresolvedReference === true,
          }
        : null,
    activeReadRunId: String(session.discourseState.activeReadRunId || ''),
    lastRunState: ['idle', 'pending', 'success', 'empty', 'failed', 'degraded'].includes(
      session.discourseState.lastRunState,
    )
      ? session.discourseState.lastRunState
      : 'idle',
    pendingArtifactId: String(session.discourseState.pendingArtifactId || ''),
    unresolvedReference: session.discourseState.unresolvedReference === true,
  };
  return session;
}

function uniqueSessionIds(values, max) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].slice(-max);
}

const SOURCE_REF_TYPES = new Set(['note', 'bookmark', 'file', 'todo', 'tag']);
const RESULT_REF_TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

function normalizeResultRefs(values, limit = 50) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const type = String(value?.type || '').trim();
    const id = String(value?.id || value?.resourceId || '').trim();
    if (!RESULT_REF_TYPE_PATTERN.test(type) || !id || id.length > 255) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ type, id });
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeResultSetMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const count = (input) => {
    const number = Number(input);
    return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
  };
  const resolvedRanges = Object.fromEntries(
    Object.entries(value.resolvedRanges || {})
      .slice(0, 8)
      .map(([name, record]) => [
        String(name).slice(0, 80),
        {
          expression: String(record?.expression || '').slice(0, 120),
          source: String(record?.source || '').slice(0, 40),
          range:
            record?.range && typeof record.range === 'object' && !Array.isArray(record.range)
              ? Object.fromEntries(
                  ['start', 'endExclusive', 'timeZone', 'storageTimeZone', 'localStart', 'localEndExclusive']
                    .filter((key) => record.range[key] != null)
                    .map((key) => [key, String(record.range[key]).slice(0, 100)]),
                )
              : null,
        },
      ]),
  );
  const completeness = ['complete', 'partial', 'unknown', 'empty'].includes(value.completeness)
    ? value.completeness
    : value.complete === true
      ? 'complete'
      : 'partial';
  return {
    version: String(value.version || '').slice(0, 20),
    totalCount: count(value.totalCount ?? value.total),
    total: count(value.totalCount ?? value.total),
    returned: count(value.returned) ?? 0,
    totalExact: value.totalExact === true,
    completeness,
    complete: completeness === 'complete' || completeness === 'empty',
    partial: completeness === 'partial' || completeness === 'unknown',
    truncated: value.truncated === true,
    truncationReason: value.truncationReason ? String(value.truncationReason).slice(0, 80) : null,
    nextCursor: value.nextCursor ? String(value.nextCursor).slice(0, 8_192) : null,
    resolvedRanges,
    stableReferenceCount: count(value.stableReferenceCount) ?? 0,
    stableIdCoverage: value.stableIdCoverage === 'complete' ? 'complete' : 'partial',
  };
}

function normalizeSourceRefs(values, { scope = false, limit = 20 } = {}) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const type = String(value?.type || '').trim();
    const id = String(value?.id || '').trim();
    if ((!scope && !SOURCE_REF_TYPES.has(type)) || (scope && type !== 'note_branch')) continue;
    if (!id || id.length > 255) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ type, id });
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeAttachmentIds(values, limit = 20) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || '').trim();
    if (!id || id.length > 255 || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeDialogueAnchor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const conversationId = String(value.conversationId || '').trim();
  const messageIds = normalizeAttachmentIds(value.messageIds, 40);
  const topicEpoch = Math.max(0, Number.isSafeInteger(Number(value.topicEpoch)) ? Number(value.topicEpoch) : 0);
  const digest = String(value.digest || '').trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId) ||
    !messageIds.length ||
    !/^[a-f0-9]{64}$/i.test(digest)
  ) {
    return null;
  }
  return Object.freeze({ conversationId, messageIds, topicEpoch, digest: digest.toLowerCase() });
}

function sourceVersionDigest({ refs, scopeRefs, attachmentSourceIds, dialogueAnchor }) {
  const canonical = JSON.stringify({ refs, scopeRefs, attachmentSourceIds, dialogueAnchor });
  return crypto.createHash('sha256').update(`agent-source-set-v2\0${canonical}`).digest('hex');
}

function sourceSetExpired(sourceSet) {
  return !Number.isFinite(Number(sourceSet?.expiresAt)) || Number(sourceSet.expiresAt) <= now();
}

function publicSourceSet(sourceSet) {
  if (!sourceSet) return null;
  return Object.freeze({
    id: sourceSet.id,
    contextRefCount: sourceSet.refs.length,
    scopeRefCount: sourceSet.scopeRefs.length,
    attachmentCount: sourceSet.attachmentSourceIds.length,
    dialogueMessageCount: sourceSet.dialogueAnchor?.messageIds?.length || 0,
    createdAt: new Date(sourceSet.createdAt).toISOString(),
    expiresAt: new Date(sourceSet.expiresAt).toISOString(),
  });
}

function cloneActionArgs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function sessionStorageKey(session) {
  return `${session.ownerKey}:${session.id}`;
}

function focusSnapshotFromSession(session) {
  normalizeSession(session);
  return {
    discourseState: structuredClone(session.discourseState),
    resultSets: structuredClone(session.resultSets),
  };
}

function applyPersistentSessionSnapshot(session, snapshot) {
  if (!session || !snapshot || typeof snapshot !== 'object') return session;
  if (snapshot.discourseState && typeof snapshot.discourseState === 'object') {
    session.discourseState = structuredClone(snapshot.discourseState);
  }
  if (Array.isArray(snapshot.sourceSets)) session.sourceSets = structuredClone(snapshot.sourceSets);
  if (Array.isArray(snapshot.resultSets)) session.resultSets = structuredClone(snapshot.resultSets);
  if (Array.isArray(snapshot.artifactStates)) session.artifactStates = structuredClone(snapshot.artifactStates);
  normalizeSession(session);
  const key = sessionStorageKey(session);
  focusSnapshots.set(key, focusSnapshotFromSession(session));
  sessions.set(key, session);
  return session;
}

function normalizeFocusSnapshot(value, fallbackSession) {
  const carrier = {
    discourseState: value?.discourseState || fallbackSession?.discourseState || {},
    resultSets: Array.isArray(value?.resultSets) ? value.resultSets : fallbackSession?.resultSets || [],
    turns: [],
    actionBatches: [],
    sourceSets: [],
    clarifications: [],
    artifactStates: [],
  };
  normalizeSession(carrier);
  return focusSnapshotFromSession(carrier);
}

function focusRevision(snapshot) {
  return Math.max(0, Number(snapshot?.discourseState?.revision) || 0);
}

function newestFocusSnapshot(...values) {
  return (
    values
      .filter(Boolean)
      .map((value) => normalizeFocusSnapshot(value))
      .sort((left, right) => focusRevision(right) - focusRevision(left))[0] || null
  );
}

function applyFocusSnapshot(session, snapshot) {
  if (!session || !snapshot) return session;
  session.discourseState = structuredClone(snapshot.discourseState);
  session.resultSets = structuredClone(snapshot.resultSets);
  normalizeSession(session);
  const key = sessionStorageKey(session);
  focusSnapshots.set(key, focusSnapshotFromSession(session));
  sessions.set(key, session);
  return session;
}

async function withFocusMutationQueue(key, task) {
  const previous = focusMutationQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  focusMutationQueues.set(key, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (focusMutationQueues.get(key) === current) focusMutationQueues.delete(key);
  }
}

function persistSession(session) {
  session.updatedAt = now();
  return redisSet(sessionStorageKey(session), session);
}

async function findSession(ownerKey, sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const key = storageKey(ownerKey, id);
  const ownerHash = normalizeOwnerKey(ownerKey);
  const redisSession = normalizeSession(await redisGet(key));
  if (redisSession && redisSession.ownerKey === ownerHash && !isExpired(redisSession)) {
    const focus = newestFocusSnapshot(
      await redisGetFocus(key),
      focusSnapshots.get(key),
      focusSnapshotFromSession(redisSession),
    );
    if (focus) applyFocusSnapshot(redisSession, focus);
    sessions.set(key, redisSession);
    return redisSession;
  }
  const memorySession = normalizeSession(sessions.get(key));
  if (memorySession && memorySession.ownerKey === ownerHash && !isExpired(memorySession)) {
    const focus = newestFocusSnapshot(focusSnapshots.get(key), focusSnapshotFromSession(memorySession));
    if (focus) applyFocusSnapshot(memorySession, focus);
    return memorySession;
  }
  sessions.delete(key);
  focusSnapshots.delete(key);
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

async function redisGetFocus(key) {
  if (!redisOk) return null;
  try {
    const raw = await redisClient.get(REDIS_FOCUS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function redisSetFocus(key, snapshot) {
  if (!redisOk) return;
  try {
    await redisClient.setEx(REDIS_FOCUS_PREFIX + key, REDIS_TTL, JSON.stringify(snapshot));
  } catch {
    /* MySQL enforce 模式下 Redis 只是热缓存，写入失败不能改写已提交的权威状态。 */
  }
}

const FOCUS_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local decoded = cjson.decode(current)
  local currentRevision = 0
  if decoded['discourseState'] and decoded['discourseState']['revision'] then
    currentRevision = tonumber(decoded['discourseState']['revision']) or 0
  end
  if currentRevision ~= tonumber(ARGV[1]) then
    return {0, current}
  end
end
redis.call('SETEX', KEYS[1], tonumber(ARGV[2]), ARGV[3])
return {1, ''}
`;

async function redisCompareAndSetFocus(key, expectedRevision, snapshot) {
  if (!redisOk || typeof redisClient.eval !== 'function') return { state: 'unavailable' };
  try {
    const result = await redisClient.eval(FOCUS_CAS_SCRIPT, {
      keys: [REDIS_FOCUS_PREFIX + key],
      arguments: [String(expectedRevision), String(REDIS_TTL), JSON.stringify(snapshot)],
    });
    if (Number(result?.[0]) === 1) return { state: 'committed' };
    const current = String(result?.[1] || '');
    return { state: 'conflict', snapshot: current ? JSON.parse(current) : null };
  } catch {
    return { state: 'unavailable' };
  }
}

async function mutateSessionFocus(session, mutation) {
  if (!session || typeof mutation !== 'function') return null;
  normalizeSession(session);
  const key = sessionStorageKey(session);
  const persistence = session[SESSION_PERSISTENCE];
  if (persistence?.authoritative === true && typeof persistence.commitFocus === 'function') {
    return withFocusMutationQueue(key, async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const base = focusSnapshotFromSession(session);
        const outcome = mutation(structuredClone(base));
        if (!outcome?.snapshot) return outcome?.value ?? null;
        const next = normalizeFocusSnapshot(outcome.snapshot, session);
        const committed = await persistence.commitFocus({
          expectedRevision: focusRevision(base),
          snapshot: next,
          durable: outcome.durable || null,
        });
        if (committed?.state === 'conflict') {
          const restored = await persistence.restore();
          if (restored) applyPersistentSessionSnapshot(session, restored);
          continue;
        }
        if (committed?.state !== 'committed') return null;
        applyFocusSnapshot(session, next);
        await redisSetFocus(key, next);
        await persistSession(session);
        return outcome.value ?? null;
      }
      return null;
    });
  }

  const mirrorFocus = async (base, next, durable) => {
    if (typeof persistence?.mirrorFocus !== 'function') return;
    try {
      await persistence.mirrorFocus({
        expectedRevision: focusRevision(base),
        snapshot: next,
        durable: durable || null,
      });
    } catch {
      // 非权威镜像只能用于观测和预热，任何故障都不能改变 Redis/内存主链路的结果。
    }
  };
  const mutateLocally = () =>
    withFocusMutationQueue(key, async () => {
      const base = newestFocusSnapshot(focusSnapshots.get(key), focusSnapshotFromSession(session));
      const outcome = mutation(structuredClone(base));
      if (!outcome?.snapshot) {
        applyFocusSnapshot(session, base);
        return outcome?.value ?? null;
      }
      const next = normalizeFocusSnapshot(outcome.snapshot, session);
      focusSnapshots.set(key, next);
      applyFocusSnapshot(session, next);
      await persistSession(session);
      await mirrorFocus(base, next, outcome.durable);
      return outcome.value ?? null;
    });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const base = newestFocusSnapshot(
      await redisGetFocus(key),
      focusSnapshots.get(key),
      focusSnapshotFromSession(session),
    );
    const outcome = mutation(structuredClone(base));
    if (!outcome?.snapshot) {
      applyFocusSnapshot(session, base);
      return outcome?.value ?? null;
    }
    const next = normalizeFocusSnapshot(outcome.snapshot, session);
    const persisted = await redisCompareAndSetFocus(key, focusRevision(base), next);
    if (persisted.state === 'unavailable') return mutateLocally();
    if (persisted.state === 'conflict') {
      if (persisted.snapshot) {
        const current = normalizeFocusSnapshot(persisted.snapshot, session);
        focusSnapshots.set(key, current);
        applyFocusSnapshot(session, current);
      }
      continue;
    }
    focusSnapshots.set(key, next);
    applyFocusSnapshot(session, next);
    await persistSession(session);
    await mirrorFocus(base, next, outcome.durable);
    return outcome.value ?? null;
  }
  return null;
}

// ---- 公开 API ----

/**
 * 给当前请求绑定可选的 MySQL 权威适配器。适配器使用 Symbol 挂载，不会被序列化进 Redis。
 * enforce 会先恢复权威快照；shadow 只接收后续镜像写，不改变当前会话行为。
 */
export async function configureAgentSessionPersistence(session, persistence) {
  if (!session || !persistence || typeof persistence !== 'object') return { restored: false };
  Object.defineProperty(session, SESSION_PERSISTENCE, {
    value: persistence,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  if (persistence.authoritative !== true || typeof persistence.restore !== 'function') {
    return { restored: false };
  }
  const snapshot = await persistence.restore();
  if (!snapshot) return { restored: false };
  applyPersistentSessionSnapshot(session, snapshot);
  await redisSetFocus(sessionStorageKey(session), focusSnapshotFromSession(session));
  await persistSession(session);
  return { restored: true, revision: session.discourseState.revision };
}

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
  focusSnapshots.set(key, focusSnapshotFromSession(session));
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
 * 提交本轮结构化语义状态。只保存能力 ID、领域和主题纪元，不保存用户/助手正文。
 * V3 编译器只读取这个投影，历史消息仍仅供 legacy 链路兼容使用。
 */
export async function commitSessionTurnSpec(session, turnSpec) {
  if (!session || !turnSpec) return null;
  normalizeSession(session);
  const capabilityIds = [
    ...new Set(
      (Array.isArray(turnSpec.goals) ? turnSpec.goals : [])
        .map((goal) => String(goal?.capabilityId || ''))
        .filter(Boolean),
    ),
  ].slice(0, 8);
  const explicitDomains = [
    ...new Set(
      (Array.isArray(turnSpec.goals) ? turnSpec.goals : [])
        .filter((goal) => goal?.implicit !== true)
        .map((goal) => String(goal?.capabilityDomain || ''))
        .filter(Boolean),
    ),
  ];
  const hasReadGoal = Array.isArray(turnSpec.goals) && turnSpec.goals.some((goal) => goal?.kind === 'read');
  const readRunId = hasReadGoal ? crypto.randomUUID() : '';
  if (hasReadGoal) {
    return mutateSessionFocus(session, (snapshot) => {
      const discourseState = snapshot.discourseState;
      const priorResultSetIds = [...discourseState.activeResultSetIds];
      return {
        snapshot: {
          ...snapshot,
          discourseState: {
            ...discourseState,
            revision: discourseState.revision + 1,
            pendingFocus: {
              id: readRunId,
              topicEpochAction: turnSpec.topicEpochAction === 'advance' ? 'advance' : 'keep',
              activeDomain: explicitDomains.length === 1 ? explicitDomains[0] : explicitDomains.length ? 'mixed' : '',
              lastCapabilityIds: capabilityIds,
              replaceResultScope: true,
              unresolvedReference: turnSpec.continuationMode === 'refer_last_result' && priorResultSetIds.length === 0,
            },
            lastRunState: 'pending',
          },
        },
        value: Object.freeze({ id: readRunId, state: 'pending' }),
      };
    });
  }
  return mutateSessionFocus(session, (snapshot) => {
    const discourseState = snapshot.discourseState;
    const priorResultSetIds = [...discourseState.activeResultSetIds];
    const startsFreshResultScope = turnSpec.topicEpochAction === 'advance';
    return {
      snapshot: {
        ...snapshot,
        discourseState: {
          ...discourseState,
          revision: discourseState.revision + 1,
          topicEpoch:
            turnSpec.topicEpochAction === 'advance'
              ? Math.max(0, Number(discourseState.topicEpoch) || 0) + 1
              : Math.max(0, Number(discourseState.topicEpoch) || 0),
          activeDomain: explicitDomains.length === 1 ? explicitDomains[0] : explicitDomains.length ? 'mixed' : '',
          lastCapabilityIds: capabilityIds,
          lastResultSetId: startsFreshResultScope ? '' : String(discourseState.lastResultSetId || ''),
          activeResultSetIds: startsFreshResultScope ? [] : priorResultSetIds,
          pendingFocus: null,
          activeReadRunId: '',
          lastRunState: 'success',
          unresolvedReference: turnSpec.continuationMode === 'refer_last_result' && priorResultSetIds.length === 0,
        },
      },
      value: Object.freeze({ id: '', state: 'committed' }),
    };
  });
}

/** 保存一次真实工具结果的稳定引用与有界查询元数据；不保存标题、URL、正文、摘要或模型输出。 */
export async function recordSessionResultSet(
  session,
  {
    capabilityId = '',
    domains = [],
    refs = [],
    status = 'success',
    focusId = '',
    goalId = '',
    handleId = '',
    filters = null,
    ordering = [],
    fieldMask = [],
    metadata = null,
  } = {},
) {
  if (!session) return null;
  normalizeSession(session);
  const normalizedStatus = ['success', 'empty', 'error'].includes(status) ? status : 'success';
  if (normalizedStatus === 'error') {
    await settleSessionResultFocus(session, { status: 'failed', focusId });
    return null;
  }
  const requestedFocusId = String(focusId || '');
  const normalizedMetadata = normalizeResultSetMetadata(metadata);
  const resultSet = {
    id: crypto.randomUUID(),
    handleId: String(handleId || `rsh-${crypto.randomUUID()}`).slice(0, 64),
    capabilityId: String(capabilityId || '').slice(0, 120),
    goalId: String(goalId || capabilityId || '').slice(0, 64),
    domains: [...new Set((Array.isArray(domains) ? domains : []).map(String).filter(Boolean))].slice(0, 8),
    refs: normalizeResultRefs(refs),
    filters:
      filters && typeof filters === 'object' && !Array.isArray(filters)
        ? structuredClone(filters)
        : normalizedMetadata?.resolvedRanges || {},
    ordering: Array.isArray(ordering) ? structuredClone(ordering.slice(0, 8)) : [],
    fieldMask: uniqueSessionIds(fieldMask, 32),
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
    status: normalizedStatus,
    topicEpoch: 0,
    createdAt: now(),
    expiresAt: now() + TTL_MS,
  };
  return mutateSessionFocus(session, (snapshot) => {
    const discourseState = snapshot.discourseState;
    const pendingFocus = discourseState.pendingFocus;
    const effectiveFocusId = requestedFocusId || String(pendingFocus?.id || '');
    const commitsPending = Boolean(pendingFocus && requestedFocusId && pendingFocus.id === requestedFocusId);
    const appendsCommitted =
      Boolean(effectiveFocusId) && !pendingFocus && discourseState.activeReadRunId === effectiveFocusId;
    if ((pendingFocus || requestedFocusId) && !commitsPending && !appendsCommitted) return { value: null };

    const targetTopicEpoch =
      commitsPending && pendingFocus?.topicEpochAction === 'advance'
        ? Math.max(0, Number(discourseState.topicEpoch) || 0) + 1
        : Math.max(0, Number(discourseState.topicEpoch) || 0);
    const committedResultSet = {
      ...resultSet,
      runId: effectiveFocusId || crypto.randomUUID(),
      topicEpoch: targetTopicEpoch,
    };
    const resultSets = [
      ...snapshot.resultSets.filter((item) => Number(item?.expiresAt) > now()),
      committedResultSet,
    ].slice(-MAX_RESULT_SETS);
    const activeResultSetIds = [
      ...new Set([
        ...(commitsPending && pendingFocus?.replaceResultScope === true ? [] : discourseState.activeResultSetIds),
        committedResultSet.id,
      ]),
    ].slice(-MAX_RESULT_SETS);
    return {
      snapshot: {
        resultSets,
        discourseState: {
          ...discourseState,
          revision: discourseState.revision + 1,
          topicEpoch: targetTopicEpoch,
          activeDomain: commitsPending ? pendingFocus?.activeDomain || '' : discourseState.activeDomain,
          lastCapabilityIds: commitsPending ? pendingFocus?.lastCapabilityIds || [] : discourseState.lastCapabilityIds,
          lastResultSetId: committedResultSet.id,
          activeResultSetIds,
          pendingFocus: null,
          activeReadRunId: effectiveFocusId || discourseState.activeReadRunId,
          lastRunState: normalizedStatus,
          unresolvedReference: false,
        },
      },
      durable: { resultSets: [committedResultSet] },
      value: Object.freeze({
        id: committedResultSet.id,
        handleId: committedResultSet.handleId,
        capabilityId: committedResultSet.capabilityId,
        domains: Object.freeze([...committedResultSet.domains]),
        refTypes: Object.freeze([...new Set(committedResultSet.refs.map((ref) => ref.type))]),
        refCount: committedResultSet.refs.length,
        status: committedResultSet.status,
      }),
    };
  });
}

export async function settleSessionResultFocus(session, { status = 'failed', focusId = '' } = {}) {
  if (!session) return false;
  normalizeSession(session);
  const normalizedStatus = ['success', 'failed', 'degraded'].includes(status) ? status : 'failed';
  const requestedFocusId = String(focusId || '');
  return mutateSessionFocus(session, (snapshot) => {
    const discourseState = snapshot.discourseState;
    const pendingFocus = discourseState.pendingFocus;
    const effectiveFocusId = requestedFocusId || String(pendingFocus?.id || '');
    const settlesPending = Boolean(pendingFocus && requestedFocusId && pendingFocus.id === requestedFocusId);
    const settlesCommitted =
      Boolean(effectiveFocusId) && !pendingFocus && discourseState.activeReadRunId === effectiveFocusId;
    if ((pendingFocus || requestedFocusId) && !settlesPending && !settlesCommitted) return { value: false };

    if (normalizedStatus === 'success' && settlesPending) {
      const targetTopicEpoch =
        pendingFocus.topicEpochAction === 'advance'
          ? Math.max(0, Number(discourseState.topicEpoch) || 0) + 1
          : Math.max(0, Number(discourseState.topicEpoch) || 0);
      return {
        snapshot: {
          ...snapshot,
          discourseState: {
            ...discourseState,
            revision: discourseState.revision + 1,
            topicEpoch: targetTopicEpoch,
            activeDomain: pendingFocus.activeDomain,
            lastCapabilityIds: pendingFocus.lastCapabilityIds,
            lastResultSetId: pendingFocus.replaceResultScope ? '' : discourseState.lastResultSetId,
            activeResultSetIds: pendingFocus.replaceResultScope ? [] : discourseState.activeResultSetIds,
            pendingFocus: null,
            activeReadRunId: effectiveFocusId,
            lastRunState: 'success',
            unresolvedReference: false,
          },
        },
        value: true,
      };
    }

    return {
      snapshot: {
        ...snapshot,
        discourseState: {
          ...discourseState,
          revision: discourseState.revision + 1,
          pendingFocus: settlesPending ? null : pendingFocus,
          lastRunState: normalizedStatus,
        },
      },
      value: true,
    };
  });
}

export function resolveSessionResultSet(
  session,
  { id = '', handleId = '', types = [], itemOrdinal = null, ordinal = null } = {},
) {
  normalizeSession(session);
  const requestedId = String(id || '');
  const requestedHandleId = String(handleId || '');
  const activeIds = requestedId
    ? [requestedId]
    : session.discourseState.activeResultSetIds.length
      ? session.discourseState.activeResultSetIds
      : [session.discourseState.lastResultSetId].filter(Boolean);
  const typeSet = new Set((Array.isArray(types) ? types : []).map(String).filter(Boolean));
  const candidates = activeIds
    .map((targetId) => session.resultSets.find((item) => item?.id === targetId))
    .filter((item) => item && Number(item.expiresAt) > now())
    .filter((item) => !requestedHandleId || String(item.handleId || '') === requestedHandleId)
    .filter((item) => {
      if (!typeSet.size) return true;
      const refTypes = new Set(normalizeResultRefs(item.refs).map((ref) => ref.type));
      return [...typeSet].some((type) => refTypes.has(type) || (item.domains || []).includes(type));
    });
  if (candidates.length > 1) return { state: 'ambiguous', count: candidates.length, refs: [] };
  const resultSet = candidates[0];
  if (!resultSet) return { state: 'missing', refs: [] };
  if (Number(resultSet.expiresAt) <= now()) return { state: 'expired', refs: [] };
  const normalizedMetadata = normalizeResultSetMetadata(resultSet.metadata);
  let refs = normalizeResultRefs(resultSet.refs).filter((ref) => !typeSet.size || typeSet.has(ref.type));
  const position = Number(itemOrdinal ?? ordinal);
  if (Number.isSafeInteger(position) && position > 0) refs = refs.slice(position - 1, position);
  return {
    state: refs.length || resultSet.status === 'empty' ? 'ready' : 'empty',
    resultSet: {
      id: resultSet.id,
      handleId: String(resultSet.handleId || ''),
      capabilityId: String(resultSet.capabilityId || ''),
      domains: [...new Set((resultSet.domains || []).map(String))],
      status: String(resultSet.status || ''),
      ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
    },
    refs,
  };
}

/**
 * 保存不可变产物版本；session 只保留版本指针和摘要，正文仅通过持久适配器进入 ArtifactVersion。
 * 新版本与被替换版本的 superseded 迁移和最新焦点共用同一次 revision CAS。
 */
export async function recordSessionArtifactVersion(
  session,
  {
    id = '',
    artifactChainId = '',
    parentVersionId = '',
    supersedesId = '',
    supersedes = null,
    capabilityId = '',
    domain = '',
    state = 'ready',
    version = 0,
    content = '',
    contentHash = '',
    sourceSetId = '',
    outputContract = null,
    validationReport = null,
  } = {},
) {
  if (!session || !String(capabilityId || '').trim()) return null;
  normalizeSession(session);
  const suppliedSupersededId = normalizeAgentUuid(supersedes?.id || supersedesId);
  const sessionSuperseded = session.artifactStates.find((item) => item?.id === suppliedSupersededId) || null;
  const superseded =
    sessionSuperseded ||
    (suppliedSupersededId
      ? {
          id: suppliedSupersededId,
          artifactChainId: normalizeAgentUuid(supersedes?.artifactChainId),
          version: Math.max(1, Math.trunc(Number(supersedes?.version) || 1)),
          state: ['draft', 'ready'].includes(supersedes?.state) ? supersedes.state : 'ready',
          contentHash: String(supersedes?.contentHash || '').toLowerCase(),
        }
      : null);
  const artifactId = normalizeAgentUuid(id) || crypto.randomUUID();
  const chainId = normalizeAgentUuid(artifactChainId) || superseded?.artifactChainId || crypto.randomUUID();
  const normalizedContent = String(content || '');
  const normalizedHash = /^[a-f0-9]{64}$/i.test(String(contentHash || ''))
    ? String(contentHash).toLowerCase()
    : crypto.createHash('sha256').update(normalizedContent).digest('hex');
  const normalizedState = ['draft', 'ready'].includes(state) ? state : 'ready';
  const artifact = {
    id: artifactId,
    artifactChainId: chainId,
    parentVersionId: normalizeAgentUuid(parentVersionId) || superseded?.id || '',
    capabilityId: String(capabilityId).slice(0, 120),
    domain: String(domain || '').slice(0, 40),
    state: normalizedState,
    version: Math.max(1, Math.trunc(Number(version) || Number(superseded?.version || 0) + 1)),
    contentHash: normalizedHash,
    sourceSetId: normalizeAgentUuid(sourceSetId),
    updatedAt: now(),
    expiresAt: now() + TTL_MS,
  };
  const artifactStates = [
    ...session.artifactStates
      .filter((item) => item?.id !== artifact.id && Number(item?.expiresAt) > now())
      .map((item) => (item.id === superseded?.id ? { ...item, state: 'superseded', updatedAt: now() } : item)),
    artifact,
  ].slice(-MAX_ARTIFACT_STATES);
  const artifactTransitions =
    superseded && ['draft', 'ready'].includes(superseded.state) && /^[a-f0-9]{64}$/i.test(superseded.contentHash)
      ? [
          {
            id: superseded.id,
            state: 'superseded',
            expectedStates: [superseded.state],
            contentHash: superseded.contentHash,
          },
        ]
      : [];
  const committed = await mutateSessionFocus(session, (snapshot) => ({
    snapshot: {
      ...snapshot,
      discourseState: {
        ...snapshot.discourseState,
        revision: snapshot.discourseState.revision + 1,
        pendingArtifactId: artifact.id,
      },
    },
    durable: {
      artifactVersions: [
        {
          ...artifact,
          content: normalizedContent,
          outputContract,
          validationReport,
        },
      ],
      artifactTransitions,
    },
    value: true,
  }));
  if (!committed) return null;
  session.artifactStates = artifactStates;
  await persistSession(session);
  return Object.freeze({
    id: artifact.id,
    artifactChainId: artifact.artifactChainId,
    parentVersionId: artifact.parentVersionId || null,
    capabilityId: artifact.capabilityId,
    domain: artifact.domain,
    state: artifact.state,
    version: artifact.version,
    contentHash: artifact.contentHash,
    sourceSetId: artifact.sourceSetId || null,
  });
}

export async function recordSessionArtifactVersionById({ ownerKey, sessionId, artifact } = {}) {
  const session = await findSession(ownerKey, sessionId);
  if (!session) return null;
  return recordSessionArtifactVersion(session, artifact);
}

/** 保存待确认产物的生命周期指针；正文继续只存在确认存储，不复制进 session。 */
export async function recordSessionArtifactState(
  session,
  { id = '', capabilityId = '', domain = '', state = 'pending' } = {},
) {
  if (!session || !String(id || '').trim()) return false;
  normalizeSession(session);
  const normalizedState = [
    'draft',
    'ready',
    'committed',
    'cancelled',
    'superseded',
    'failed',
    'unknown',
    // 兼容尚未迁移为 ArtifactVersion 的确认卡指针。
    'pending',
    'confirmed',
    'expired',
  ].includes(state)
    ? state
    : 'pending';
  const artifact = {
    id: String(id).trim().slice(0, 255),
    capabilityId: String(capabilityId || '').slice(0, 120),
    domain: String(domain || '').slice(0, 40),
    state: normalizedState,
    updatedAt: now(),
    expiresAt: now() + TTL_MS,
  };
  const artifactStates = [
    ...session.artifactStates.filter((item) => item?.id !== artifact.id && Number(item?.expiresAt) > now()),
    artifact,
  ].slice(-MAX_ARTIFACT_STATES);
  const keepsPendingFocus = ['draft', 'ready', 'pending'].includes(normalizedState);
  const committed = await mutateSessionFocus(session, (snapshot) => ({
    snapshot: {
      ...snapshot,
      discourseState: {
        ...snapshot.discourseState,
        revision: snapshot.discourseState.revision + 1,
        pendingArtifactId: keepsPendingFocus
          ? artifact.id
          : snapshot.discourseState.pendingArtifactId === artifact.id
            ? ''
            : snapshot.discourseState.pendingArtifactId,
      },
    },
    value: true,
  }));
  if (!committed) return false;
  session.artifactStates = artifactStates;
  await persistSession(session);
  return true;
}

/**
 * 通过 owner/session 绑定推进产物状态；找不到既有会话时失败关闭，禁止为确认卡伪造新会话。
 * 供确认卡替换、交互晋级等不持有 session 对象的入口复用。
 */
export async function recordSessionArtifactStateById({ ownerKey, sessionId, artifact } = {}) {
  const session = await findSession(ownerKey, sessionId);
  if (!session) return false;
  return recordSessionArtifactState(session, artifact);
}

export function getSessionDiscourseProjection(session) {
  normalizeSession(session);
  const result = resolveSessionResultSet(session);
  const activeResultSets = session.discourseState.activeResultSetIds
    .map((id) => session.resultSets.find((item) => item?.id === id))
    .filter((item) => item && Number(item.expiresAt) > now())
    .map((item) =>
      Object.freeze({
        available: true,
        handleId: String(item.handleId || ''),
        domains: Object.freeze([...new Set((item.domains || []).map(String))]),
        refTypes: Object.freeze([...new Set(normalizeResultRefs(item.refs).map((ref) => ref.type))]),
        refCount: normalizeResultRefs(item.refs).length,
        status: String(item.status || ''),
      }),
    );
  const pendingArtifact = session.artifactStates.find(
    (item) => item?.id === session.discourseState.pendingArtifactId && Number(item?.expiresAt) > now(),
  );
  return Object.freeze({
    schemaVersion: 3,
    revision: session.discourseState.revision,
    topicEpoch: session.discourseState.topicEpoch,
    activeDomain: session.discourseState.activeDomain,
    lastCapabilityIds: Object.freeze([...session.discourseState.lastCapabilityIds]),
    lastRunState: session.discourseState.lastRunState,
    lastResultSet:
      activeResultSets.length === 1 && result.state === 'ready'
        ? Object.freeze({
            available: true,
            handleId: String(result.resultSet.handleId || ''),
            domains: Object.freeze([...result.resultSet.domains]),
            refTypes: Object.freeze([...new Set(result.refs.map((ref) => ref.type))]),
            refCount: result.refs.length,
          })
        : result.resultSet?.status === 'empty'
          ? Object.freeze({
              available: true,
              handleId: String(result.resultSet.handleId || ''),
              domains: Object.freeze([...result.resultSet.domains]),
              refTypes: Object.freeze([]),
              refCount: 0,
            })
          : null,
    resultSetCandidates: Object.freeze(activeResultSets),
    pendingArtifact: pendingArtifact
      ? Object.freeze({
          available: ['draft', 'ready', 'pending'].includes(pendingArtifact.state),
          domain: String(pendingArtifact.domain || ''),
          state: String(pendingArtifact.state || ''),
        })
      : null,
    unresolvedReference: session.discourseState.unresolvedReference === true,
  });
}

/**
 * 保存本轮已经通过 owner 校验的材料锚点。只保存稳定引用和版本摘要，不保存标题、正文或模型输出。
 * 相同材料集合会复用现有 ID，避免连续追问制造无意义的多个候选集合。
 */
export async function recordSessionSourceSet(
  session,
  { refs = [], scopeRefs = [], attachmentSourceIds = [], dialogueAnchor = null } = {},
) {
  if (!session) return null;
  normalizeSession(session);
  const normalized = {
    refs: normalizeSourceRefs(refs),
    scopeRefs: normalizeSourceRefs(scopeRefs, { scope: true }),
    attachmentSourceIds: normalizeAttachmentIds(attachmentSourceIds),
    dialogueAnchor: normalizeDialogueAnchor(dialogueAnchor),
  };
  if (
    !normalized.refs.length &&
    !normalized.scopeRefs.length &&
    !normalized.attachmentSourceIds.length &&
    !normalized.dialogueAnchor
  ) {
    return null;
  }
  const digest = sourceVersionDigest(normalized);
  const reusable = [...session.sourceSets]
    .reverse()
    .find((sourceSet) => sourceSet?.sourceVersionDigest === digest && !sourceSetExpired(sourceSet));
  if (reusable) {
    if (!session.discourseState.activeSourceSetIds.includes(reusable.id)) {
      const activated = await mutateSessionFocus(session, (snapshot) => ({
        snapshot: {
          ...snapshot,
          discourseState: {
            ...snapshot.discourseState,
            revision: snapshot.discourseState.revision + 1,
            activeSourceSetIds: uniqueSessionIds(
              [...snapshot.discourseState.activeSourceSetIds, reusable.id],
              MAX_SOURCE_SETS,
            ),
          },
        },
        value: true,
      }));
      if (!activated) return null;
    }
    return publicSourceSet(reusable);
  }

  const createdAt = now();
  const sourceSet = {
    id: crypto.randomUUID(),
    runId: String(session.discourseState.activeReadRunId || ''),
    refs: normalized.refs,
    scopeRefs: normalized.scopeRefs,
    attachmentSourceIds: normalized.attachmentSourceIds,
    dialogueAnchor: normalized.dialogueAnchor,
    createdAt,
    expiresAt: createdAt + TTL_MS,
    sourceVersionDigest: digest,
  };
  const committed = await mutateSessionFocus(session, (snapshot) => ({
    snapshot: {
      ...snapshot,
      discourseState: {
        ...snapshot.discourseState,
        revision: snapshot.discourseState.revision + 1,
        activeSourceSetIds: uniqueSessionIds(
          [...snapshot.discourseState.activeSourceSetIds, sourceSet.id],
          MAX_SOURCE_SETS,
        ),
      },
    },
    durable: { sourceSets: [sourceSet] },
    value: true,
  }));
  if (!committed) return null;
  session.sourceSets = [...session.sourceSets.filter((item) => !sourceSetExpired(item)), sourceSet].slice(
    -MAX_SOURCE_SETS,
  );
  await persistSession(session);
  return publicSourceSet(sourceSet);
}

/**
 * 只从当前 owner 已解析出的 session 内查找 Source Set。返回的引用仍必须在本轮重新做归属解析。
 */
export function resolveSessionSourceSet(session, sourceSetId) {
  normalizeSession(session);
  const id = String(sourceSetId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { state: 'missing' };
  }
  const sourceSet = session.sourceSets.find((item) => item?.id === id);
  if (!sourceSet) return { state: 'missing' };
  if (sourceSetExpired(sourceSet)) return { state: 'expired' };
  return {
    state: 'ready',
    sourceSet: {
      id: sourceSet.id,
      refs: normalizeSourceRefs(sourceSet.refs),
      scopeRefs: normalizeSourceRefs(sourceSet.scopeRefs, { scope: true }),
      attachmentSourceIds: normalizeAttachmentIds(sourceSet.attachmentSourceIds),
      dialogueAnchor: normalizeDialogueAnchor(sourceSet.dialogueAnchor),
      sourceVersionDigest: String(sourceSet.sourceVersionDigest || ''),
      createdAt: Number(sourceSet.createdAt),
      expiresAt: Number(sourceSet.expiresAt),
    },
  };
}

export function listSessionSourceSets(session, { limit = MAX_SOURCE_SETS } = {}) {
  normalizeSession(session);
  return session.sourceSets
    .filter((sourceSet) => !sourceSetExpired(sourceSet))
    .slice(-Math.max(1, Math.min(MAX_SOURCE_SETS, Number(limit) || MAX_SOURCE_SETS)))
    .reverse()
    .map(publicSourceSet);
}

function clarificationTokenDigest(token) {
  return crypto.createHash('sha256').update(`agent-material-clarification-v1\0${token}`).digest('hex');
}

function publicClarification(clarification, sourceSets) {
  const byId = new Map(sourceSets.map((sourceSet) => [sourceSet.id, sourceSet]));
  return {
    type: 'material_source_set',
    token: clarification.token,
    question: '当前会话里有多组可能的材料。请说明使用“最近一组”“上一组”，或“两组都用”。',
    options: clarification.sourceSetIds.map((id, index) => {
      const sourceSet = byId.get(id);
      return {
        ordinal: index + 1,
        label: index === 0 ? '最近一组' : `往前第 ${index} 组`,
        itemCount:
          Number(sourceSet?.contextRefCount || 0) +
          Number(sourceSet?.scopeRefCount || 0) +
          Number(sourceSet?.attachmentCount || 0),
      };
    }),
    expiresAt: new Date(clarification.expiresAt).toISOString(),
  };
}

/** 创建私有澄清状态。公开部分只含短期令牌、序号和数量，不泄露 Source Set ID。 */
export async function createSessionMaterialClarification(session, { originalMessage, sourceSetIds } = {}) {
  if (!session) return null;
  normalizeSession(session);
  const available = listSessionSourceSets(session);
  const availableIds = new Set(available.map((item) => item.id));
  const ids = [...new Set((Array.isArray(sourceSetIds) ? sourceSetIds : []).map((id) => String(id || '').trim()))]
    .filter((id) => availableIds.has(id))
    .slice(0, MAX_SOURCE_SETS);
  if (ids.length < 2) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = now();
  const clarification = {
    id: crypto.randomUUID(),
    tokenDigest: clarificationTokenDigest(token),
    originalMessage: String(originalMessage || '').slice(0, 12_000),
    sourceSetIds: ids,
    createdAt,
    expiresAt: createdAt + CLARIFICATION_TTL_MS,
  };
  session.clarifications = [
    ...session.clarifications.filter((item) => Number(item?.expiresAt) > createdAt),
    clarification,
  ].slice(-MAX_CLARIFICATIONS);
  await persistSession(session);
  return publicClarification({ ...clarification, token }, available);
}

function parseClarificationSelection(message, size) {
  const text = String(message || '')
    .trim()
    .toLowerCase();
  if (!text) return [];
  if (/(?:两组|全部|都用|一起|对比|比较|both|all)/i.test(text)) {
    return Array.from({ length: size }, (_, index) => index);
  }
  if (/(?:最近(?:一组)?|第一组?|第一个|^\s*1\s*$|latest|first)/i.test(text)) return [0];
  if (size > 1 && /(?:上一组|前一组|第二组?|第二个|^\s*2\s*$|previous|second)/i.test(text)) return [1];
  const ordinal = text.match(/第\s*(\d+)\s*组?/u);
  if (ordinal) {
    const index = Number(ordinal[1]) - 1;
    if (Number.isSafeInteger(index) && index >= 0 && index < size) return [index];
  }
  return [];
}

/** 用下一条用户消息填充澄清槽位；无法识别时保持 pending，绝不默认选择更多材料。 */
export async function resolveSessionMaterialClarification(session, token, answer) {
  if (!session) return { state: 'missing' };
  normalizeSession(session);
  const normalizedToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,}$/.test(normalizedToken)) return { state: 'missing' };
  const digest = clarificationTokenDigest(normalizedToken);
  const clarification = session.clarifications.find((item) => item?.tokenDigest === digest);
  if (!clarification) return { state: 'missing' };
  if (Number(clarification.expiresAt) <= now()) return { state: 'expired' };
  const indexes = parseClarificationSelection(answer, clarification.sourceSetIds.length);
  if (!indexes.length) {
    return {
      state: 'pending',
      clarification: publicClarification({ ...clarification, token: normalizedToken }, listSessionSourceSets(session)),
    };
  }
  const selectedSourceSetIds = indexes.map((index) => clarification.sourceSetIds[index]).filter(Boolean);
  session.clarifications = session.clarifications.filter((item) => item.id !== clarification.id);
  await persistSession(session);
  return {
    state: 'ready',
    originalMessage: clarification.originalMessage,
    selectedSourceSetIds,
  };
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
  const artifact = session.artifactStates.find((item) => item?.id === actionId);
  if (artifact) {
    const previousState = artifact.state;
    const nextArtifactState =
      state === 'succeeded'
        ? 'confirmed'
        : state === 'cancelled'
          ? 'cancelled'
          : state === 'failed'
            ? 'failed'
            : 'unknown';
    const committed = await mutateSessionFocus(session, (snapshot) => {
      const clearsPendingArtifact =
        nextArtifactState !== 'pending' && snapshot.discourseState.pendingArtifactId === artifact.id;
      return {
        snapshot: {
          ...snapshot,
          discourseState: {
            ...snapshot.discourseState,
            revision:
              snapshot.discourseState.revision + (nextArtifactState !== previousState || clearsPendingArtifact ? 1 : 0),
            pendingArtifactId: clearsPendingArtifact ? '' : snapshot.discourseState.pendingArtifactId,
          },
        },
        value: true,
      };
    });
    if (!committed) return false;
    artifact.state = nextArtifactState;
    artifact.updatedAt = now();
    await persistSession(session);
    return true;
  }
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
