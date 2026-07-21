import { recordFirstOwnResource } from '../conversion.js';
import { awardCreate, hashRef } from '../growth.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';

/**
 * 资源创建后的统一旁路副作用。业务事务已经提交后再调用；副作用失败不回滚资源。
 */
export function triggerResourceCreateEffects({
  request,
  userId,
  userRole,
  resourceType,
  resourceId,
  url,
  suppressUserRewards = false,
} = {}) {
  if (userId) void invalidatePersonalKnowledgeCache(userId);
  if (!userId || suppressUserRewards || request?.suppressUserRewards || request?.adminContext) return;
  if (request) recordFirstOwnResource(request, resourceType).catch(() => {});
  const refId = resourceType === 'bookmark' ? hashRef(url) : resourceId;
  awardCreate(userId, resourceType, refId, { userRole }).catch(() => {});
}
