import crypto from 'node:crypto';

export const GROUNDING_SCOPE_MODE = Object.freeze({
  CURRENT_EXPLICIT_ONLY: 'current_explicit_only',
  INHERITED_SOURCE_SET: 'inherited_source_set',
  WORKSPACE_QUERY: 'workspace_query',
  GENERAL_KNOWLEDGE: 'general_knowledge',
  NONE: 'none',
});

function asBoolean(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function stableBucket(subjectId) {
  const digest = crypto.createHash('sha256').update(`agent-grounding-scope-v2\0${subjectId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function isGroundingScopeV2Enabled({ userId, userRole, env = process.env } = {}) {
  const explicit = asBoolean(env.AI_GROUNDING_SCOPE_V2_ENABLED);
  if (explicit === false) return false;
  if (explicit === true) return true;
  if (String(env.NODE_ENV || '') !== 'production') return true;
  if (userRole === 'root') return true;
  const testUsers = new Set(
    String(env.AI_GROUNDING_SCOPE_V2_TEST_USER_IDS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (userId && testUsers.has(String(userId))) return true;
  const percent = Math.max(0, Math.min(100, Math.trunc(Number(env.AI_GROUNDING_SCOPE_V2_ROLLOUT_PERCENT) || 0)));
  return Boolean(userId) && stableBucket(String(userId)) < percent;
}

function canonicalRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = String(value.type || value.resourceType || value.sourceType || '').trim();
  const id = String(value.id || value.resourceId || value.documentId || value.attachmentId || '').trim();
  if (!type || !id) return null;
  return { type, id };
}

function uniqueRefs(values) {
  const output = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const ref = canonicalRef(value);
    if (!ref) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }
  return output;
}

function safeWebUrls(values) {
  const urls = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    try {
      const parsed = new URL(String(value || '').trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      urls.push(parsed.href);
    } catch {
      // 非法 URL 不能进入显式网页白名单。
    }
  }
  return urls;
}

export function resolveGroundingScope({
  requestedMode,
  inheritedDecision,
  contentScope,
  resolvedContexts,
  resolvedAttachments,
  resolvedScopes,
  sourceSetId = '',
} = {}) {
  const explicitRefs = uniqueRefs([
    ...(resolvedContexts?.sources || []),
    ...(resolvedAttachments?.sources || []),
    ...(resolvedScopes?.noteIds || []).map((id) => ({ type: 'note', id })),
  ]);
  const explicitRequested = requestedMode === 'explicit';
  const inherited = inheritedDecision === 'continue_with_materials';
  const workspace = contentScope?.mode === 'workspace';
  const mode = explicitRequested
    ? GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY
    : inherited
      ? GROUNDING_SCOPE_MODE.INHERITED_SOURCE_SET
      : workspace
        ? GROUNDING_SCOPE_MODE.WORKSPACE_QUERY
        : GROUNDING_SCOPE_MODE.GENERAL_KNOWLEDGE;

  return Object.freeze({
    mode,
    // 显式材料成功解析后同样签发 Source Set，供下一轮只传 ID 承接；workspace/none 没有 ID。
    sourceSetId: String(sourceSetId || '') || null,
    allowedRefs: Object.freeze(explicitRefs),
    allowExternalWeb: false,
    allowedWebUrls: Object.freeze(safeWebUrls(resolvedContexts?.allowedWebUrls)),
    generalKnowledgeAllowed: mode === GROUNDING_SCOPE_MODE.GENERAL_KNOWLEDGE,
  });
}

function sourceKey(source) {
  const ref = canonicalRef(source);
  return ref ? `${ref.type}:${ref.id}` : '';
}

function normalizedWebUrl(source) {
  try {
    return new URL(String(source?.url || '')).href;
  } catch {
    return '';
  }
}

export function inspectGroundingSubset(sources, groundingScope) {
  if (
    ![GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY, GROUNDING_SCOPE_MODE.INHERITED_SOURCE_SET].includes(
      groundingScope?.mode,
    )
  ) {
    return { valid: true, allowed: Array.isArray(sources) ? sources : [], violations: [] };
  }
  const allowedKeys = new Set((groundingScope.allowedRefs || []).map(sourceKey).filter(Boolean));
  const allowedUrls = new Set(groundingScope.allowedWebUrls || []);
  const allowed = [];
  const violations = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const key = sourceKey(source);
    const webAllowed = source?.type === 'web' && allowedUrls.has(normalizedWebUrl(source));
    if ((key && allowedKeys.has(key)) || webAllowed) allowed.push(source);
    else violations.push(source);
  }
  return { valid: violations.length === 0, allowed, violations };
}

/**
 * 只投影对话状态，不复制旧用户/助手正文。事实内容必须来自 GroundingScope 对应 evidence。
 */
export function buildDiscourseProjection(historyMessages = []) {
  const messages = Array.isArray(historyMessages) ? historyMessages : [];
  const lastAssistant = [...messages].reverse().find((item) => item?.role === 'assistant');
  return Object.freeze({
    lastAssistantOutcome: lastAssistant ? 'answered' : undefined,
    referencedSourceSetIds: Object.freeze([]),
    unresolvedReferences: Object.freeze([]),
    recentTurnCount: Math.min(messages.length, 40),
  });
}

export function selectGroundedAnswerMessages({ messages, historyMessageCount, groundingScope, enabled }) {
  const all = Array.isArray(messages) ? messages : [];
  if (
    !enabled ||
    ![GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY, GROUNDING_SCOPE_MODE.INHERITED_SOURCE_SET].includes(
      groundingScope?.mode,
    )
  ) {
    return all.slice(1);
  }
  // system 后先放历史，再放本轮 user；切片后只保留本轮消息和本轮产生的工具资料。
  return all.slice(1 + Math.max(0, Number(historyMessageCount) || 0));
}

export function publicResolvedGrounding({ groundingScope, enabled, subsetValid, sourcesUsed = [] } = {}) {
  return {
    schemaVersion: 2,
    enabled: Boolean(enabled),
    mode: groundingScope?.mode || GROUNDING_SCOPE_MODE.NONE,
    historyPolicy:
      enabled &&
      [GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY, GROUNDING_SCOPE_MODE.INHERITED_SOURCE_SET].includes(
        groundingScope?.mode,
      )
        ? 'discourse_projection_only'
        : 'legacy_conversation',
    allowedSourceCount: Array.isArray(groundingScope?.allowedRefs) ? groundingScope.allowedRefs.length : 0,
    sourcesUsedCount: Array.isArray(sourcesUsed) ? sourcesUsed.length : 0,
    sourceSubsetValid: subsetValid !== false,
    sourceSetId: groundingScope?.sourceSetId || null,
    materialMode:
      groundingScope?.mode === GROUNDING_SCOPE_MODE.CURRENT_EXPLICIT_ONLY
        ? 'current_explicit'
        : groundingScope?.mode === GROUNDING_SCOPE_MODE.INHERITED_SOURCE_SET
          ? 'inherited'
          : groundingScope?.mode === GROUNDING_SCOPE_MODE.WORKSPACE_QUERY
            ? 'workspace'
            : 'none',
  };
}

export const __testing = Object.freeze({ asBoolean, canonicalRef, stableBucket });
