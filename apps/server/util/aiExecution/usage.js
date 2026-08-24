export function normalizeAiUsage(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const safe = (candidate) => {
    const parsed = Number(candidate || 0);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  };
  const promptTokens = safe(value.promptTokens ?? value.prompt_tokens);
  const completionTokens = safe(value.completionTokens ?? value.completion_tokens);
  const reportedTotal = safe(value.totalTokens ?? value.total_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(reportedTotal, promptTokens + completionTokens),
  };
}

export function addAiUsage(target, input) {
  const usage = normalizeAiUsage(input);
  target.promptTokens = Math.max(0, Number(target.promptTokens || 0)) + usage.promptTokens;
  target.completionTokens = Math.max(0, Number(target.completionTokens || 0)) + usage.completionTokens;
  target.totalTokens = Math.max(0, Number(target.totalTokens || 0)) + usage.totalTokens;
  return target;
}

export function calculateChargedTokens({ usage, missingUsageSpans = 0, missingUsageTokens, reservedTokens = 0 } = {}) {
  const normalized = normalizeAiUsage(usage);
  const missing = Math.max(0, Math.floor(Number(missingUsageSpans || 0)));
  const reserved = Math.max(0, Math.floor(Number(reservedTokens || 0)));
  const conservativeMissing = Number.isFinite(Number(missingUsageTokens))
    ? Math.max(0, Math.floor(Number(missingUsageTokens)))
    : missing * reserved;
  const calculated = normalized.totalTokens + conservativeMissing;
  // 真实 usage 异常大于请求前保守预算时，超出部分由平台承担。用户额度绝不能在事后
  // 被扣成负数；下一次 Provider 调用会在请求前重新按可用余额门禁。
  return reserved > 0 ? Math.min(calculated, reserved) : calculated;
}
