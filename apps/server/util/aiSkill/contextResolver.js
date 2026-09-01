import crypto from 'node:crypto';
import { resolvePersonalKnowledgeResourceVersions } from '../personalKnowledgeSearch.js';
import { resolveAiIdentity } from '../aiIdentity.js';
import { resolveTagAnalysisScope } from '../services/tagAnalysisScopeService.js';
import { aiSkillError } from './errors.js';

export function resolveAiSkillIdentity(req) {
  return resolveAiIdentity(req);
}

function scopeDigest({ skill, identity, refs, selector = null, tag = null }) {
  const canonical = {
    skillId: skill.id,
    skillVersion: skill.version,
    actorUserId: identity.actorUserId,
    subjectUserId: identity.subjectUserId,
    adminContextMode: identity.adminContextMode,
    adminContextId: identity.adminContextId,
    selector: selector ? `${selector.type}:${selector.id}` : null,
    tag: tag ? { id: tag.id, name: tag.name, description: tag.description } : null,
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
  resolveTagScope = resolveTagAnalysisScope,
}) {
  const identity = resolveAiSkillIdentity(req);
  if (!skill.allowedRoles.includes(identity.actorRole)) {
    throw aiSkillError('AI_SKILL_ROLE_FORBIDDEN', '当前账号不能使用该 AI 能力', 403);
  }
  const policy = skill.contextPolicy;
  const refs = request.scope.resourceRefs;
  if (policy.scopeMode === 'tag_resources') {
    if (refs.length !== 1) {
      throw aiSkillError('AI_SKILL_SCOPE_SIZE_INVALID', '标签分析需要且只能指定一个标签');
    }
    const selector = refs[0];
    if (selector.type !== 'tag') {
      throw aiSkillError('AI_SKILL_SCOPE_TYPE_FORBIDDEN', '标签分析只能使用标签作为范围入口', 403);
    }
    const resolved = await resolveTagScope(database, {
      userId: identity.subjectUserId,
      tagId: selector.id,
    });
    if (!resolved) {
      throw aiSkillError('AI_SKILL_SCOPE_RESOURCE_UNAVAILABLE', '标签不存在、已删除或不属于当前账号', 404);
    }
    const candidates = resolved.resourceRefs;
    if (candidates.length < policy.minExpandedResources || candidates.length > policy.maxExpandedResources) {
      throw aiSkillError(
        'AI_SKILL_SCOPE_SIZE_INVALID',
        candidates.length
          ? `当前标签关联资源超过 ${policy.maxExpandedResources} 项安全上限，请拆分标签后再分析`
          : '当前标签没有可分析的资源',
      );
    }
    const unsupportedCandidate = candidates.find((ref) => !policy.expandedResourceTypes.includes(ref.type));
    if (unsupportedCandidate) {
      throw aiSkillError('AI_SKILL_SCOPE_TYPE_FORBIDDEN', '标签包含当前能力不支持的资源类型', 403);
    }
    const authoritativeRefs = await resolveResourceVersions({
      userId: identity.subjectUserId,
      resourceRefs: candidates,
      database,
    });
    if (authoritativeRefs.length !== candidates.length) {
      throw aiSkillError('AI_SKILL_SCOPE_RESOURCE_UNAVAILABLE', '标签资源刚刚发生变化，请重试分析', 409);
    }
    const normalizedRefs = authoritativeRefs.map(Object.freeze);
    const normalizedTag = Object.freeze({
      id: String(resolved.tag.id),
      name: String(resolved.tag.name || ''),
      description: String(resolved.tag.description || ''),
    });
    return Object.freeze({
      identity,
      resourceRefs: Object.freeze(normalizedRefs),
      scopeSelector: Object.freeze({ type: 'tag', id: selector.id }),
      tag: normalizedTag,
      scopeDigest: scopeDigest({ skill, identity, refs: normalizedRefs, selector, tag: normalizedTag }),
    });
  }
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
