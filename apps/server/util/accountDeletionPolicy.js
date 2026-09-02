export const ACCOUNT_DELETION_STALE_PROCESSING_MINUTES = 15;

export const ACCOUNT_RESOURCE_CLEANUP_STATE = Object.freeze({
  MISSING: 'missing',
  FORMALLY_DELETED: 'formally_deleted',
  DISABLED: 'disabled',
  ACTIVE: 'active',
  INCONSISTENT: 'inconsistent',
});

/**
 * 管理员停用与正式注销都会写入 del_flag=1，物理资源清理不能只依赖该字段。
 * user 行不存在，或同时满足 role=deleted 与 del_flag=1，才允许进入账号级清理。
 */
export function classifyAccountResourceCleanup(account) {
  if (!account) {
    return { state: ACCOUNT_RESOURCE_CLEANUP_STATE.MISSING, eligible: true };
  }

  const role = String(account.role || '').trim();
  const deletedFlag = Number(account.del_flag ?? account.delFlag ?? 0) === 1;
  if (role === 'deleted' && deletedFlag) {
    return { state: ACCOUNT_RESOURCE_CLEANUP_STATE.FORMALLY_DELETED, eligible: true };
  }
  if (role === 'deleted') {
    return { state: ACCOUNT_RESOURCE_CLEANUP_STATE.INCONSISTENT, eligible: false };
  }
  if (deletedFlag) {
    return { state: ACCOUNT_RESOURCE_CLEANUP_STATE.DISABLED, eligible: false };
  }
  return { state: ACCOUNT_RESOURCE_CLEANUP_STATE.ACTIVE, eligible: false };
}

export function isAccountDeletionRequestStalled(request, { now = Date.now() } = {}) {
  const status = String(request?.status || '');
  if (status === 'retry_wait') return true;
  if (status !== 'processing') return false;

  const startedAt = new Date(request?.processing_started_at ?? request?.processingStartedAt ?? '').getTime();
  const nowTime = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(startedAt) || !Number.isFinite(nowTime)) return true;
  return startedAt < nowTime - ACCOUNT_DELETION_STALE_PROCESSING_MINUTES * 60 * 1000;
}
