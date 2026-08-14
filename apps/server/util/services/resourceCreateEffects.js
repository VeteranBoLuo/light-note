import { recordFirstOwnResource } from '../conversion.js';
import { awardCreate, hashRef } from '../growth.js';
import { ensureMeaningfulCreateEvent } from '../meaningfulActivity.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';

function runDetached(effect) {
  void Promise.resolve()
    .then(effect)
    .catch(() => {});
}

/**
 * 资源创建后的统一旁路副作用。业务事务已经提交后再调用；副作用失败不回滚资源。
 */
export async function triggerResourceCreateEffects({
  request,
  userId,
  userRole,
  resourceType,
  resourceId,
  url,
  suppressUserRewards = false,
} = {}) {
  if (userId) runDetached(() => invalidatePersonalKnowledgeCache(userId));
  if (!userId || suppressUserRewards || request?.suppressUserRewards || request?.adminContext) return;
  if (request) runDetached(() => recordFirstOwnResource(request, resourceType));
  const refId = resourceType === 'bookmark' ? hashRef(url) : resourceId;
  try {
    // 每日任务需要在资源接口成功返回时即可看到，所以只等待这一条 INSERT IGNORE。
    // 经验、首次任务和成就聚合仍保持提交后旁路，避免把多次成长查询叠加到创建接口时延。
    await ensureMeaningfulCreateEvent(userId, resourceType, refId);
  } catch {
    // 主业务已经提交；成长旁路失败不能反向伪装成资源创建失败。
  }
  // 不可变行为事实和既有经验奖励相互隔离：一侧临时失败不能吞掉另一侧。
  runDetached(() => awardCreate(userId, resourceType, refId, { userRole }));
}
