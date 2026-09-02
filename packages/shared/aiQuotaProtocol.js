/**
 * AI 额度错误协议的前后端唯一事实源。
 *
 * EXHAUSTED 表示当前没有任何可用额度；INSUFFICIENT_FOR_REQUEST 表示仍有余额，
 * 但不足以覆盖本次 Provider 调用的保守预算。两者必须向用户提供不同的处理建议。
 */
export const AI_QUOTA_ERROR_CODES = Object.freeze({
  EXHAUSTED: 'AI_QUOTA_EXCEEDED',
  INSUFFICIENT_FOR_REQUEST: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
});

const AI_QUOTA_ERROR_CODE_SET = new Set(Object.values(AI_QUOTA_ERROR_CODES));

export function classifyAiQuotaErrorCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  if (code === AI_QUOTA_ERROR_CODES.EXHAUSTED) return 'exhausted';
  if (code === AI_QUOTA_ERROR_CODES.INSUFFICIENT_FOR_REQUEST) return 'insufficient_for_request';
  return null;
}

export function isAiQuotaErrorCode(value) {
  return AI_QUOTA_ERROR_CODE_SET.has(
    String(value || '')
      .trim()
      .toUpperCase(),
  );
}
