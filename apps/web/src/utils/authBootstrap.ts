export type ApplicationAuthStatus = 'pending' | 'ready' | 'error';

/** 只有这些业务状态能权威确认当前是登录账号或游客；其他结果都按暂时未知处理。 */
export function isDefinitiveAuthResultStatus(status: unknown): boolean {
  return status === 200 || status === 'visitor' || status === 401;
}
