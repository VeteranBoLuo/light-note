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
const MAX_SOURCE_SETS = 6;
const MAX_CLARIFICATIONS = 3;
const MAX_RESULT_SETS = 6;
const MAX_ARTIFACT_STATES = 4;
const CLARIFICATION_TTL_MS = 5 * 60 * 1000;
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
      activeResultSetIds: [],
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
    pendingArtifactId: String(session.discourseState.pendingArtifactId || ''),
    unresolvedReference: session.discourseState.unresolvedReference === true,
  };
  return session;
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

function sourceVersionDigest({ refs, scopeRefs, attachmentSourceIds }) {
  const canonical = JSON.stringify({ refs, scopeRefs, attachmentSourceIds });
  return crypto.createHash('sha256').update(`agent-source-set-v1\0${canonical}`).digest('hex');
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
 * 提交本轮结构化语义状态。只保存能力 ID、领域和主题纪元，不保存用户/助手正文。
 * V3 编译器只读取这个投影，历史消息仍仅供 legacy 链路兼容使用。
 */
export async function commitSessionTurnSpec(session, turnSpec) {
  if (!session || !turnSpec) return false;
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
  const priorResultSetIds = [...session.discourseState.activeResultSetIds];
  const startsFreshResultScope =
    turnSpec.topicEpochAction === 'advance' ||
    (Array.isArray(turnSpec.goals) && turnSpec.goals.some((goal) => goal?.kind === 'read'));
  session.discourseState = {
    ...session.discourseState,
    revision: session.discourseState.revision + 1,
    topicEpoch:
      turnSpec.topicEpochAction === 'advance'
        ? Math.max(0, Number(session.discourseState.topicEpoch) || 0) + 1
        : Math.max(0, Number(session.discourseState.topicEpoch) || 0),
    activeDomain: explicitDomains.length === 1 ? explicitDomains[0] : explicitDomains.length ? 'mixed' : '',
    lastCapabilityIds: capabilityIds,
    lastResultSetId: startsFreshResultScope ? '' : String(session.discourseState.lastResultSetId || ''),
    activeResultSetIds: startsFreshResultScope ? [] : priorResultSetIds,
    unresolvedReference: turnSpec.continuationMode === 'refer_last_result' && priorResultSetIds.length === 0,
  };
  await persistSession(session);
  return true;
}

/** 保存一次真实工具结果的稳定引用集合；不保存标题、URL、正文、摘要或模型输出。 */
export async function recordSessionResultSet(
  session,
  { capabilityId = '', domains = [], refs = [], status = 'success' } = {},
) {
  if (!session) return null;
  normalizeSession(session);
  const normalizedStatus = ['success', 'empty', 'error'].includes(status) ? status : 'success';
  const resultSet = {
    id: crypto.randomUUID(),
    capabilityId: String(capabilityId || '').slice(0, 120),
    domains: [...new Set((Array.isArray(domains) ? domains : []).map(String).filter(Boolean))].slice(0, 8),
    refs: normalizeResultRefs(refs),
    status: normalizedStatus,
    topicEpoch: Math.max(0, Number(session.discourseState.topicEpoch) || 0),
    createdAt: now(),
    expiresAt: now() + TTL_MS,
  };
  session.resultSets = [...session.resultSets.filter((item) => Number(item?.expiresAt) > now()), resultSet].slice(
    -MAX_RESULT_SETS,
  );
  session.discourseState = {
    ...session.discourseState,
    revision: session.discourseState.revision + 1,
    lastResultSetId: resultSet.id,
    activeResultSetIds: [...new Set([...session.discourseState.activeResultSetIds, resultSet.id])].slice(
      -MAX_RESULT_SETS,
    ),
    unresolvedReference: false,
  };
  await persistSession(session);
  return Object.freeze({
    id: resultSet.id,
    capabilityId: resultSet.capabilityId,
    domains: Object.freeze([...resultSet.domains]),
    refTypes: Object.freeze([...new Set(resultSet.refs.map((ref) => ref.type))]),
    refCount: resultSet.refs.length,
    status: resultSet.status,
  });
}

export function resolveSessionResultSet(session, { id = '', types = [], ordinal = null } = {}) {
  normalizeSession(session);
  const requestedId = String(id || '');
  const activeIds = requestedId
    ? [requestedId]
    : session.discourseState.activeResultSetIds.length
      ? session.discourseState.activeResultSetIds
      : [session.discourseState.lastResultSetId].filter(Boolean);
  const typeSet = new Set((Array.isArray(types) ? types : []).map(String).filter(Boolean));
  const candidates = activeIds
    .map((targetId) => session.resultSets.find((item) => item?.id === targetId))
    .filter((item) => item && Number(item.expiresAt) > now())
    .filter((item) => {
      if (!typeSet.size) return true;
      const refTypes = new Set(normalizeResultRefs(item.refs).map((ref) => ref.type));
      return [...typeSet].some((type) => refTypes.has(type) || (item.domains || []).includes(type));
    });
  if (candidates.length > 1) return { state: 'ambiguous', count: candidates.length, refs: [] };
  const resultSet = candidates[0];
  if (!resultSet) return { state: 'missing', refs: [] };
  if (Number(resultSet.expiresAt) <= now()) return { state: 'expired', refs: [] };
  let refs = normalizeResultRefs(resultSet.refs).filter((ref) => !typeSet.size || typeSet.has(ref.type));
  const position = Number(ordinal);
  if (Number.isSafeInteger(position) && position > 0) refs = refs.slice(position - 1, position);
  return {
    state: refs.length || resultSet.status === 'empty' ? 'ready' : 'empty',
    resultSet: {
      id: resultSet.id,
      capabilityId: String(resultSet.capabilityId || ''),
      domains: [...new Set((resultSet.domains || []).map(String))],
      status: String(resultSet.status || ''),
    },
    refs,
  };
}

/** 保存待确认产物的生命周期指针；正文继续只存在确认存储，不复制进 session。 */
export async function recordSessionArtifactState(
  session,
  { id = '', capabilityId = '', domain = '', state = 'pending' } = {},
) {
  if (!session || !String(id || '').trim()) return false;
  normalizeSession(session);
  const normalizedState = ['pending', 'confirmed', 'cancelled', 'expired', 'failed', 'unknown'].includes(state)
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
  session.artifactStates = [
    ...session.artifactStates.filter((item) => item?.id !== artifact.id && Number(item?.expiresAt) > now()),
    artifact,
  ].slice(-MAX_ARTIFACT_STATES);
  session.discourseState = {
    ...session.discourseState,
    revision: session.discourseState.revision + 1,
    pendingArtifactId:
      normalizedState === 'pending'
        ? artifact.id
        : session.discourseState.pendingArtifactId === artifact.id
          ? ''
          : session.discourseState.pendingArtifactId,
  };
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
    lastResultSet:
      activeResultSets.length === 1 && result.state === 'ready'
        ? Object.freeze({
            available: true,
            domains: Object.freeze([...result.resultSet.domains]),
            refTypes: Object.freeze([...new Set(result.refs.map((ref) => ref.type))]),
            refCount: result.refs.length,
          })
        : result.resultSet?.status === 'empty'
          ? Object.freeze({
              available: true,
              domains: Object.freeze([...result.resultSet.domains]),
              refTypes: Object.freeze([]),
              refCount: 0,
            })
          : null,
    resultSetCandidates: Object.freeze(activeResultSets),
    pendingArtifact: pendingArtifact
      ? Object.freeze({
          available: pendingArtifact.state === 'pending',
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
export async function recordSessionSourceSet(session, { refs = [], scopeRefs = [], attachmentSourceIds = [] } = {}) {
  if (!session) return null;
  normalizeSession(session);
  const normalized = {
    refs: normalizeSourceRefs(refs),
    scopeRefs: normalizeSourceRefs(scopeRefs, { scope: true }),
    attachmentSourceIds: normalizeAttachmentIds(attachmentSourceIds),
  };
  if (!normalized.refs.length && !normalized.scopeRefs.length && !normalized.attachmentSourceIds.length) {
    return null;
  }
  const digest = sourceVersionDigest(normalized);
  const reusable = [...session.sourceSets]
    .reverse()
    .find((sourceSet) => sourceSet?.sourceVersionDigest === digest && !sourceSetExpired(sourceSet));
  if (reusable) return publicSourceSet(reusable);

  const createdAt = now();
  const sourceSet = {
    id: crypto.randomUUID(),
    refs: normalized.refs,
    scopeRefs: normalized.scopeRefs,
    attachmentSourceIds: normalized.attachmentSourceIds,
    createdAt,
    expiresAt: createdAt + TTL_MS,
    sourceVersionDigest: digest,
  };
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
    const previousPendingArtifactId = session.discourseState.pendingArtifactId;
    artifact.state =
      state === 'succeeded'
        ? 'confirmed'
        : state === 'cancelled'
          ? 'cancelled'
          : state === 'failed'
            ? 'failed'
            : 'unknown';
    artifact.updatedAt = now();
    if (artifact.state !== 'pending' && session.discourseState.pendingArtifactId === artifact.id) {
      session.discourseState.pendingArtifactId = '';
    }
    if (artifact.state !== previousState || session.discourseState.pendingArtifactId !== previousPendingArtifactId) {
      session.discourseState.revision += 1;
    }
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
