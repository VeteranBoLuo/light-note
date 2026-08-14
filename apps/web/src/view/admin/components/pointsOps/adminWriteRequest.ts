/**
 * 只有明确的网络中断、超时或 5xx 才属于“服务端可能已写入”的未知结果。
 * 调用方应保留同一 X-Request-Id，让用户重试时安全恢复原结果。
 */
export function isAmbiguousAdminWriteFailure(error: unknown) {
  const code = String((error as { code?: string })?.code || '');
  return (
    ['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'OFFLINE', 'ECONNRESET', 'ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(
      code,
    ) || code.startsWith('HTTP_5')
  );
}
