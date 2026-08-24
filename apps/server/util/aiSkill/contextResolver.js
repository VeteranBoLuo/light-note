import crypto from 'node:crypto';
import { resolvePersonalKnowledgeResourceVersions } from '../personalKnowledgeSearch.js';
import { resolveAiIdentity } from '../aiIdentity.js';
import { aiSkillError } from './errors.js';

export function resolveAiSkillIdentity(req) {
  return resolveAiIdentity(req);
}

function scopeDigest({ skill, identity, refs }) {
  const canonical = {
    skillId: skill.id,
    skillVersion: skill.version,
    actorUserId: identity.actorUserId,
    subjectUserId: identity.subjectUserId,
    adminContextMode: identity.adminContextMode,
    adminContextId: identity.adminContextId,
    refs: refs.map((ref) => `${ref.type}:${ref.id}:${ref.version || 'current'}`),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function resolveAiSkillContext({
  skill,
  request,
  req,
  database,
  resolveResourceVersions = resolvePersonalKnowledgeResourceVersions,
}) {
  const identity = resolveAiSkillIdentity(req);
  if (!skill.allowedRoles.includes(identity.actorRole)) {
    throw aiSkillError('AI_SKILL_ROLE_FORBIDDEN', '当前账号不能使用该 AI 能力', 403);
  }
  const policy = skill.contextPolicy;
  const refs = request.scope.resourceRefs;
  if (refs.length < policy.minResources || refs.length > policy.maxResources) {
    throw aiSkillError(
      'AI_SKILL_SCOPE_SIZE_INVALID',
      `该能力需要选择 ${policy.minResources}～${policy.maxResources} 项材料`,
    );
  }
  const unsupported = refs.find((ref) => !policy.resourceTypes.includes(ref.type));
  if (unsupported) {
    throw aiSkillError('AI_SKILL_SCOPE_TYPE_FORBIDDEN', `该能力不能读取 ${unsupported.type} 类型材料`, 403);
  }
  let authoritativeRefs = [];
  if (refs.length) {
    authoritativeRefs = await resolveResourceVersions({
      userId: identity.subjectUserId,
      resourceRefs: refs,
      database,
    });
    if (authoritativeRefs.length !== refs.length) {
      throw aiSkillError('AI_SKILL_SCOPE_RESOURCE_UNAVAILABLE', '部分材料不存在、已删除或不属于当前账号', 404);
    }
    for (let index = 0; index < refs.length; index += 1) {
      if (refs[index].version && refs[index].version !== authoritativeRefs[index].version) {
        throw aiSkillError('AI_SKILL_SCOPE_STALE', '材料已更新，请基于最新内容重新发起', 409);
      }
    }
  }
  const normalizedRefs = authoritativeRefs.map(Object.freeze);
  return Object.freeze({
    identity,
    resourceRefs: Object.freeze(normalizedRefs),
    scopeDigest: scopeDigest({ skill, identity, refs: normalizedRefs }),
  });
}

export const aiSkillContextInternals = { resolveIdentity: resolveAiSkillIdentity, scopeDigest };
