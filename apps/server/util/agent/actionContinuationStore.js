import crypto from 'node:crypto';
import redisClient from '../redisClient.js';

const PREFIX = 'agent:action-continuation:';
const TTL_SECONDS = 15 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,}$/;
const CAS_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), ARGV[2])
return 1
`;
const STORED_KEY = Symbol('actionContinuationKey');
const STORED_RAW = Symbol('actionContinuationRaw');

const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
const stableHash = (value) => hash(JSON.stringify(value ?? null));
const tokenKey = (token) => `${PREFIX}${hash(token)}`;
const ownerHash = (ownerKey) => hash(`owner:${ownerKey}`);

export class ActionContinuationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function cleanText(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function normalizeAction(action) {
  const kind = String(action?.kind || '').trim();
  const id = String(action?.id || '').trim();
  if (!['confirmation', 'interaction'].includes(kind) || !id || id.length > 120) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '续答动作绑定无效。');
  }
  return { kind, id };
}

function normalizeToolFacts(rawTools) {
  return (Array.isArray(rawTools) ? rawTools : []).slice(0, 16).map((tool) => ({
    name: cleanText(tool?.name, 100),
    status: cleanText(tool?.status, 40),
    summary: cleanText(tool?.summary, 1600),
    dataSummary: cleanText(tool?.dataSummary, 800),
  }));
}

function normalizeSnapshot(snapshot = {}) {
  const normalized = {
    question: cleanText(snapshot.question, 12_000),
    locale: cleanText(snapshot.locale, 32),
    leadIn: cleanText(snapshot.leadIn, 1600),
    originRequestId: cleanText(snapshot.originRequestId, 80),
    tools: normalizeToolFacts(snapshot.tools),
  };
  if (!normalized.question) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '续答缺少原始问题。');
  }
  return normalized;
}

function normalizeOutcome(outcome = {}) {
  const receipt =
    outcome.receipt && typeof outcome.receipt === 'object' && !Array.isArray(outcome.receipt)
      ? {
          actionId: cleanText(outcome.receipt.actionId, 120),
          capabilityId: cleanText(outcome.receipt.capabilityId, 160),
          toolName: cleanText(outcome.receipt.toolName, 100),
          status: cleanText(outcome.receipt.status, 40),
          summary: cleanText(outcome.receipt.summary, 1600),
          completedAt: cleanText(outcome.receipt.completedAt, 80),
        }
      : null;
  if (!receipt?.actionId || !receipt.toolName || receipt.status !== 'succeeded') {
    throw new ActionContinuationError('ACTION_CONTINUATION_OUTCOME_INVALID', '续答缺少可信操作回执。');
  }
  return {
    receipt,
    summary: cleanText(outcome.summary || receipt.summary, 1600),
    dataSummary: cleanText(outcome.dataSummary, 1000),
  };
}

function remainingTtl(record) {
  const remaining = Math.ceil((Date.parse(record.expiresAt || '') - Date.now()) / 1000);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new ActionContinuationError('ACTION_CONTINUATION_EXPIRED', '这次操作续答已过期，请直接继续提问。', 410);
  }
  return Math.min(TTL_SECONDS, Math.max(1, remaining));
}

function assertToken(token) {
  if (!TOKEN_PATTERN.test(String(token || ''))) {
    throw new ActionContinuationError('ACTION_CONTINUATION_REQUIRED', '缺少有效的操作续答令牌。');
  }
}

function validateRecord(record, ownerKey, sessionId) {
  if (!record || record.version !== 1 || !['pending', 'ready', 'running', 'settled'].includes(record.state)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '操作续答数据无效。');
  }
  if (record.ownerHash !== ownerHash(ownerKey) || !sessionId || record.sessionId !== sessionId) {
    throw new ActionContinuationError('ACTION_CONTINUATION_FORBIDDEN', '这次操作续答不属于当前用户或会话。', 403);
  }
  normalizeAction(record.action);
  if (record.snapshotHash !== stableHash(record.snapshot)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '操作续答上下文校验失败。');
  }
  if (record.outcome && record.outcomeHash !== stableHash(record.outcome)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '操作续答回执校验失败。');
  }
  if (record.state === 'settled' && record.answerHash !== stableHash(record.answer)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '操作续答结果校验失败。');
  }
  remainingTtl(record);
  return record;
}

function parseRecord(raw, ownerKey, sessionId) {
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '操作续答数据无效。');
  }
  return validateRecord(record, ownerKey, sessionId);
}

function sameAction(left, right) {
  return left?.kind === right?.kind && left?.id === right?.id;
}

function attachStored(record, key, raw) {
  Object.defineProperties(record, {
    [STORED_KEY]: { value: key },
    [STORED_RAW]: { value: raw },
  });
  return record;
}

function publicContinuation(token, record) {
  return {
    schemaVersion: 1,
    token: String(token),
    policy: record.policy === 'final_reply' ? 'final_reply' : 'terminal',
    expiresAt: record.expiresAt,
  };
}

async function readRecord(token, ownerKey, sessionId) {
  assertToken(token);
  const key = tokenKey(token);
  const raw = await redisClient.get(key);
  if (!raw) {
    throw new ActionContinuationError('ACTION_CONTINUATION_EXPIRED', '这次操作续答已过期，请直接继续提问。', 410);
  }
  return { key, raw, record: parseRecord(raw, ownerKey, sessionId) };
}

async function compareAndSet(key, previousRaw, nextRecord) {
  if (typeof redisClient.eval !== 'function') {
    throw new ActionContinuationError('ACTION_CONTINUATION_UNAVAILABLE', '操作已经完成，但暂时无法继续生成回答。', 503);
  }
  let updated;
  try {
    updated = await redisClient.eval(CAS_SCRIPT, {
      keys: [key],
      arguments: [previousRaw, JSON.stringify(nextRecord), String(remainingTtl(nextRecord))],
    });
  } catch {
    throw new ActionContinuationError('ACTION_CONTINUATION_UNAVAILABLE', '操作已经完成，但暂时无法继续生成回答。', 503);
  }
  if (Number(updated) !== 1) {
    throw new ActionContinuationError('ACTION_CONTINUATION_CONFLICT', '操作续答状态已经变化，请稍后安全重试。', 409);
  }
  return nextRecord;
}

export async function createActionContinuation({ ownerKey, sessionId, action, snapshot }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const record = {
    version: 1,
    state: 'pending',
    policy: 'final_reply',
    snapshotReady: false,
    ownerHash: ownerHash(ownerKey),
    sessionId: String(sessionId || ''),
    action: normalizeAction(action),
    snapshot: normalizedSnapshot,
    snapshotHash: stableHash(normalizedSnapshot),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  };
  if (!record.sessionId) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '续答缺少所属会话。');
  }
  await redisClient.setEx(tokenKey(token), TTL_SECONDS, JSON.stringify(record));
  return publicContinuation(token, record);
}

export async function finalizeActionContinuation({ token, ownerKey, sessionId, action, snapshot }) {
  const expectedAction = normalizeAction(action);
  const current = await readRecord(token, ownerKey, sessionId);
  if (current.record.state !== 'pending' || !sameAction(current.record.action, expectedAction)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_CONFLICT', '操作续答绑定已经变化。', 409);
  }
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const next = {
    ...current.record,
    snapshotReady: true,
    snapshot: normalizedSnapshot,
    snapshotHash: stableHash(normalizedSnapshot),
    updatedAt: new Date().toISOString(),
  };
  await compareAndSet(current.key, current.raw, next);
  return publicContinuation(token, next);
}

export async function rebindActionContinuation({ token, ownerKey, sessionId, fromAction, toAction }) {
  const expectedFrom = normalizeAction(fromAction);
  const normalizedTo = normalizeAction(toAction);
  const current = await readRecord(token, ownerKey, sessionId);
  if (current.record.state !== 'pending' || !sameAction(current.record.action, expectedFrom)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_CONFLICT', '操作续答绑定已经变化。', 409);
  }
  const next = {
    ...current.record,
    action: normalizedTo,
    updatedAt: new Date().toISOString(),
  };
  await compareAndSet(current.key, current.raw, next);
  return publicContinuation(token, next);
}

export async function discardActionContinuation({ token, ownerKey, sessionId, action }) {
  if (!token) return false;
  const expectedAction = normalizeAction(action);
  const current = await readRecord(token, ownerKey, sessionId);
  if (!sameAction(current.record.action, expectedAction)) return false;
  await redisClient.del(current.key);
  return true;
}

export async function completeActionContinuation({ token, ownerKey, sessionId, action, outcome }) {
  if (!token) return null;
  const expectedAction = normalizeAction(action);
  const current = await readRecord(token, ownerKey, sessionId);
  if (!sameAction(current.record.action, expectedAction)) {
    throw new ActionContinuationError('ACTION_CONTINUATION_FORBIDDEN', '操作回执与续答令牌不匹配。', 403);
  }
  if (!current.record.snapshotReady || current.record.policy !== 'final_reply') return null;
  if (['ready', 'running', 'settled'].includes(current.record.state)) {
    return publicContinuation(token, current.record);
  }
  const normalizedOutcome = normalizeOutcome(outcome);
  if (normalizedOutcome.receipt.actionId !== expectedAction.id) {
    throw new ActionContinuationError('ACTION_CONTINUATION_OUTCOME_INVALID', '操作回执与续答动作不匹配。');
  }
  const next = {
    ...current.record,
    state: 'ready',
    outcome: normalizedOutcome,
    outcomeHash: stableHash(normalizedOutcome),
    completedAt: new Date().toISOString(),
  };
  await compareAndSet(current.key, current.raw, next);
  return publicContinuation(token, next);
}

export async function inspectActionContinuation(token, ownerKey, sessionId) {
  const current = await readRecord(token, ownerKey, sessionId);
  if (current.record.state === 'pending') {
    throw new ActionContinuationError('ACTION_CONTINUATION_PENDING', '原操作尚未完成，不能提前续答。', 409);
  }
  if (current.record.state === 'running') {
    throw new ActionContinuationError(
      'ACTION_CONTINUATION_IN_PROGRESS',
      '正在根据操作结果生成回答，请稍后安全重试。',
      409,
    );
  }
  if (!current.record.outcome || !current.record.snapshotReady) {
    throw new ActionContinuationError('ACTION_CONTINUATION_INVALID', '操作续答缺少可信结果。');
  }
  return {
    state: current.record.state,
    continuation: attachStored({ ...current.record }, current.key, current.raw),
    publicContinuation: publicContinuation(token, current.record),
  };
}

export async function claimActionContinuation(continuation) {
  const key = continuation?.[STORED_KEY];
  const raw = continuation?.[STORED_RAW];
  if (!key || !raw || continuation.state !== 'ready') {
    throw new ActionContinuationError('ACTION_CONTINUATION_CONFLICT', '操作续答状态已经变化。', 409);
  }
  const next = {
    ...continuation,
    state: 'running',
    startedAt: new Date().toISOString(),
  };
  delete next[STORED_KEY];
  delete next[STORED_RAW];
  await compareAndSet(key, raw, next);
  return attachStored(next, key, JSON.stringify(next));
}

export async function settleActionContinuation(continuation, { answer, usage }) {
  const key = continuation?.[STORED_KEY];
  const raw = continuation?.[STORED_RAW];
  if (!key || !raw || continuation.state !== 'running') {
    throw new ActionContinuationError('ACTION_CONTINUATION_CONFLICT', '操作续答状态已经变化。', 409);
  }
  const normalizedAnswer = cleanText(answer, 32_000);
  if (!normalizedAnswer) {
    throw new ActionContinuationError('ACTION_CONTINUATION_RESULT_INVALID', '没有生成可用的操作续答。', 503);
  }
  const normalizedUsage = {
    promptTokens: Math.max(0, Number(usage?.promptTokens || 0)),
    completionTokens: Math.max(0, Number(usage?.completionTokens || 0)),
    totalTokens: Math.max(0, Number(usage?.totalTokens || 0)),
  };
  const next = {
    ...continuation,
    state: 'settled',
    answer: normalizedAnswer,
    answerHash: stableHash(normalizedAnswer),
    usage: normalizedUsage,
    settledAt: new Date().toISOString(),
  };
  delete next[STORED_KEY];
  delete next[STORED_RAW];
  await compareAndSet(key, raw, next);
  return next;
}

export async function releaseActionContinuation(continuation) {
  const key = continuation?.[STORED_KEY];
  const raw = continuation?.[STORED_RAW];
  if (!key || !raw || continuation.state !== 'running') return false;
  const next = { ...continuation, state: 'ready' };
  delete next.startedAt;
  delete next[STORED_KEY];
  delete next[STORED_RAW];
  try {
    await compareAndSet(key, raw, next);
    return true;
  } catch {
    return false;
  }
}

export const actionContinuationInternals = Object.freeze({ TTL_SECONDS, ownerHash, stableHash, tokenKey });
