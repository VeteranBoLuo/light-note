const RETRYABLE_CONFIRMATION_CODES = new Set([
  'TOOL_CONFIRMATION_IN_PROGRESS',
  'TOOL_CONFIRMATION_RESULT_PENDING',
  'TOOL_CONFIRMATION_UNAVAILABLE',
]);

const NETWORK_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'ERR_NETWORK',
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  // 确认接口被限流时 token 仍有效；等待后用同一 token 重试才是正确恢复方式。
  'HTTP_429',
]);

export function confirmationErrorCode(error: any): string {
  return String(error?.response?.data?.data?.code || error?.code || '').trim();
}

/**
 * 只把「响应是否到达未知」和后端明确标记的执行中状态视为可安全重试。
 * 业务 4xx（重名、额度不足、令牌过期等）仍按确定失败结算。
 */
export function isRetryableConfirmationError(error: any): boolean {
  const code = confirmationErrorCode(error);
  if (RETRYABLE_CONFIRMATION_CODES.has(code) || NETWORK_ERROR_CODES.has(code)) return true;
  const status = Number(error?.response?.status || error?.status || 0);
  if (status === 408 || status === 429 || status >= 500) return true;
  return !error?.response && Boolean(error?.request || /network|timeout|连接|超时/i.test(String(error?.message || '')));
}

/** 结果不确定后只能重试查询同一结果，不能再取消或改参消费已认领的 token。 */
export function canAlterPendingConfirmation(hasUncertainResult: boolean): boolean {
  return !hasUncertainResult;
}
