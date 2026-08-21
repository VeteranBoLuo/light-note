import { normalizeCapabilityScope } from './v3/capabilityManifest.js';
import { normalizeAgentCapabilityPolicyProfile } from './v3/capabilityPolicy.js';

const REQUEST_SCOPE_MODES = new Set(['explicit', 'inherit_candidate', 'workspace', 'none']);

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function normalizeRequestedMode(value) {
  const mode = String(value || '').trim();
  return REQUEST_SCOPE_MODES.has(mode) ? mode : null;
}

/**
 * 把新旧客户端请求统一为 V2 本轮信封。客户端只能陈述它本轮携带了什么；最终范围仍由
 * 服务端在 owner 校验和材料解析后生成，客户端声明不能把空请求升级为更宽的范围。
 */
export function adaptAgentTurnEnvelope(body = {}) {
  const contextRefs = Array.isArray(body.grounding?.contextRefs)
    ? body.grounding.contextRefs
    : Array.isArray(body.contexts)
      ? body.contexts
      : [];
  const scopeRefs = Array.isArray(body.grounding?.scopeRefs)
    ? body.grounding.scopeRefs
    : Array.isArray(body.scopeRefs)
      ? body.scopeRefs
      : [];
  const attachmentIds = Array.isArray(body.grounding?.attachmentIds)
    ? body.grounding.attachmentIds
    : Array.isArray(body.attachmentIds)
      ? body.attachmentIds
      : [];
  const explicit = nonEmptyArray(contextRefs) || nonEmptyArray(scopeRefs) || nonEmptyArray(attachmentIds);
  const sourceSetId = String(body.grounding?.sourceSetId || '').trim();
  const clientCapabilities = Array.isArray(body.clientCapabilities) ? body.clientCapabilities : [];
  const acceptsLegacyFollowUpMaterials = !clientCapabilities.includes('grounding_scope_v2');
  const inherited =
    Boolean(sourceSetId) ||
    (acceptsLegacyFollowUpMaterials &&
      body.followUpMaterials &&
      typeof body.followUpMaterials === 'object' &&
      !Array.isArray(body.followUpMaterials));
  const workspace = String(body.scope?.mode || '').trim() === 'workspace';
  const derivedMode = explicit ? 'explicit' : inherited ? 'inherit_candidate' : workspace ? 'workspace' : 'none';
  const clientMode = normalizeRequestedMode(body.grounding?.mode);

  return Object.freeze({
    schemaVersion: 2,
    conversationId: String(body.conversationId || ''),
    sessionId: String(body.sessionId || ''),
    message: String(body.message || ''),
    locale: String(body.locale || ''),
    grounding: Object.freeze({
      mode: derivedMode,
      contextRefs,
      scopeRefs,
      attachmentIds,
      sourceSetId,
      legacyRequest: !body.grounding || typeof body.grounding !== 'object',
      clientModeMismatch: Boolean(clientMode && clientMode !== derivedMode),
    }),
    discourse: Object.freeze({
      recentTurns: Array.isArray(body.history) ? body.history : [],
    }),
    capabilityScope: normalizeCapabilityScope(body.capabilityScope),
    capabilityPolicyProfile: normalizeAgentCapabilityPolicyProfile(body.capabilityPolicyProfile),
    clientCapabilities,
  });
}

export const __testing = Object.freeze({ normalizeCapabilityScope });
