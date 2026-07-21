import { normalizeAiMemoryInfluenceMetadata } from './memoryRuntime.js';

const DEFAULT_HEARTBEAT_MS = 10_000;
const MAX_ACTIVITY_ITEMS = 200;

export const AGENT_SSE_PROTOCOL_VERSION = '2.0';

function cloneSerializable(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeSessionId(payload, current) {
  return String(payload?.output?.session_id || payload?.sessionId || current || '').trim();
}

/**
 * Agent SSE 生命周期。
 *
 * 所有协议事件都在这里获得单调递增的 eventId，同时聚合一个可短期恢复的结果快照。
 * onTerminal 只会在 completed/failed 终态调用一次；即使客户端已经断开，终态仍会被聚合并尝试持久化。
 */
export function createAgentSseLifecycle({
  res,
  requestId,
  sessionId = '',
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  onTerminal,
  onPersistenceError,
}) {
  const startedAt = Date.now();
  let started = false;
  let terminal = false;
  let stage = 'accepted';
  let heartbeatTimer = null;
  let nextEventId = 1;
  let terminalPromise = Promise.resolve();
  const events = [];
  const snapshot = {
    protocolVersion: AGENT_SSE_PROTOCOL_VERSION,
    requestId,
    sessionId: String(sessionId || '').trim(),
    answer: '',
    sources: [],
    citations: [],
    evidence: [],
    citationAudit: null,
    coverage: null,
    activity: [],
    stage,
    status: 'running',
    terminal: null,
    lastEventId: 0,
    startedAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt).toISOString(),
  };

  const writable = () => !res.writableEnded && !res.destroyed;
  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  const ensureHeaders = () => {
    if (res.headersSent || !writable()) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  };
  const appendActivity = (event, eventId, payload) => {
    if (event === 'heartbeat' || event === 'delta' || event === 'start' || event === 'done') return;
    const item = {
      eventId,
      event,
      stage: String(payload?.stage || payload?.phase || stage || ''),
      at: new Date().toISOString(),
    };
    const activityKeys =
      event === 'memory_context'
        ? ['status', 'count', 'types', 'scopes', 'reason']
        : ['round', 'tool', 'status', 'error', 'message'];
    for (const key of activityKeys) {
      if (payload?.[key] != null) item[key] = payload[key];
    }
    snapshot.activity.push(item);
    if (snapshot.activity.length > MAX_ACTIVITY_ITEMS) {
      snapshot.activity.splice(0, snapshot.activity.length - MAX_ACTIVITY_ITEMS);
    }
  };
  const aggregate = (event, eventId, payload) => {
    const resolvedSessionId = normalizeSessionId(payload, snapshot.sessionId);
    if (resolvedSessionId) snapshot.sessionId = resolvedSessionId;
    if (event === 'delta' && typeof payload?.output?.text === 'string') snapshot.answer += payload.output.text;
    if (event === 'sources') {
      if (Array.isArray(payload.sources)) snapshot.sources = cloneSerializable(payload.sources, []);
      if (Array.isArray(payload.evidence)) {
        snapshot.evidence = cloneSerializable(payload.evidence, []);
        snapshot.citations = cloneSerializable(payload.evidence, []);
      }
      if (payload.coverage != null) snapshot.coverage = cloneSerializable(payload.coverage, null);
      if (payload.citationAudit != null) snapshot.citationAudit = cloneSerializable(payload.citationAudit, null);
    }
    if (event === 'citations' && Array.isArray(payload.evidence)) {
      snapshot.evidence = cloneSerializable(payload.evidence, []);
      snapshot.citations = cloneSerializable(payload.evidence, []);
      if (payload.citationAudit != null) snapshot.citationAudit = cloneSerializable(payload.citationAudit, null);
    }
    if (event === 'coverage' && payload.coverage != null) {
      snapshot.coverage = cloneSerializable(payload.coverage, null);
    }
    if (event === 'stage.changed' && payload.stage) {
      stage = String(payload.stage);
      snapshot.stage = stage;
    }
    appendActivity(event, eventId, payload);
    snapshot.lastEventId = eventId;
    snapshot.updatedAt = new Date().toISOString();
  };
  const send = (event, payload = {}, { force = false } = {}) => {
    if (!started || (terminal && !force)) return false;
    const eventId = nextEventId++;
    // 记忆影响事件是隐私边界：即使调用方误传正文、ID 或错误详情，也只允许固定枚举和数量出流/落快照。
    const normalizedPayload =
      event === 'memory_context' ? normalizeAiMemoryInfluenceMetadata(payload) : cloneSerializable(payload, {});
    const envelope = {
      ...normalizedPayload,
      event,
      requestId,
      protocolVersion: AGENT_SSE_PROTOCOL_VERSION,
      eventId,
    };
    aggregate(event, eventId, normalizedPayload);
    events.push(cloneSerializable(envelope, { event, requestId, eventId }));
    if (!writable()) return false;
    // 分两次 write，兼容只解析 data 行的旧客户端，同时提供标准 SSE Last-Event-ID 语义。
    res.write(`id: ${eventId}\n`);
    res.write(`data: ${JSON.stringify(envelope)}\n\n`);
    return true;
  };
  const persistTerminal = (terminalStatus, terminalEventId, payload) => {
    snapshot.status = terminalStatus;
    snapshot.stage = terminalStatus;
    snapshot.terminal = {
      status: terminalStatus,
      eventId: terminalEventId,
      error: payload?.error || null,
      message: payload?.message || null,
      at: new Date().toISOString(),
    };
    snapshot.updatedAt = snapshot.terminal.at;
    if (payload?.coverage != null) snapshot.coverage = cloneSerializable(payload.coverage, null);
    if (payload?.citationAudit != null) snapshot.citationAudit = cloneSerializable(payload.citationAudit, null);
    const terminalSnapshot = cloneSerializable(snapshot, null);
    const terminalEvents = cloneSerializable(events, []);
    if (!terminalSnapshot || typeof onTerminal !== 'function') return Promise.resolve();
    return Promise.resolve(onTerminal({ snapshot: terminalSnapshot, events: terminalEvents })).catch((error) => {
      onPersistenceError?.(error);
    });
  };

  return {
    start(payload = {}) {
      if (started || !writable()) return;
      started = true;
      ensureHeaders();
      const output = { session_id: snapshot.sessionId, ...(payload.output || {}) };
      send('response.started', { ...payload, output });
      send('start', { ...payload, output });
      heartbeatTimer = setInterval(
        () => {
          send('heartbeat', { stage, phase: stage, elapsedMs: Date.now() - startedAt });
        },
        Math.max(1000, Number(heartbeatMs) || DEFAULT_HEARTBEAT_MS),
      );
      heartbeatTimer.unref?.();
    },
    stage(nextStage, payload = {}) {
      if (!started || terminal || !nextStage || nextStage === stage) return;
      const previousStage = stage;
      stage = String(nextStage);
      send('stage.changed', { stage, phase: stage, previousStage, ...payload });
    },
    send,
    async complete(payload = {}) {
      if (!started || terminal) return terminalPromise;
      stopHeartbeat();
      stage = 'completed';
      const { snapshotAnswer, ...publicPayload } = payload;
      if (typeof snapshotAnswer === 'string') snapshot.answer = snapshotAnswer;
      const output = { session_id: snapshot.sessionId, ...(publicPayload.output || {}) };
      send('response.completed', { ...publicPayload, stage, phase: stage, output }, { force: true });
      send('done', { ...publicPayload, output }, { force: true });
      terminal = true;
      const terminalEventId = snapshot.lastEventId;
      terminalPromise = persistTerminal('completed', terminalEventId, publicPayload);
      await terminalPromise;
      if (writable()) res.write('data: [DONE]\n\n');
      if (writable()) res.end();
    },
    async fail({ error = 'AI_SERVICE_ERROR', message = 'AI 服务暂时不可用，请稍后重试。', ...payload } = {}) {
      if (!started || terminal) return terminalPromise;
      stopHeartbeat();
      stage = 'failed';
      const terminalPayload = { error, message, stage, phase: stage, ...payload };
      send('response.failed', terminalPayload, { force: true });
      send('error', { error, message, ...payload }, { force: true });
      terminal = true;
      const terminalEventId = snapshot.lastEventId;
      terminalPromise = persistTerminal('failed', terminalEventId, terminalPayload);
      await terminalPromise;
      if (writable()) res.end();
    },
    getSnapshot() {
      return cloneSerializable(snapshot, null);
    },
    getEvents() {
      return cloneSerializable(events, []);
    },
    async flush() {
      await terminalPromise;
    },
    dispose() {
      stopHeartbeat();
    },
  };
}
