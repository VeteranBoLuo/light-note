import { classifyAiQuotaErrorCode } from '@lightnote/shared/ai-quota-protocol';

type Translate = (key: string, params?: Record<string, unknown>) => string;

const FALLBACK_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  'aiQuotaErrors.exhaustedTitle': 'AI 额度已用完',
  'aiQuotaErrors.exhaustedMessage':
    '当前 AI 额度已用完。可前往「AI 用量与计费」补充永久额度，或等待每日额度重置。',
  'aiQuotaErrors.insufficientTitle': '本次任务所需额度不足',
  'aiQuotaErrors.insufficientMessage':
    '当前仍有 AI 额度，但不足以完成本次任务。请减少处理内容、分段执行或补充额度后重试。',
  'aiQuotaErrors.insufficientWithAmounts':
    '本次任务预计最多需要约 {required} tokens，当前可用约 {available}。请减少处理内容、分段执行或补充额度后重试。',
});

function fallbackTranslate(key: string, params: Record<string, unknown> = {}) {
  return String(FALLBACK_MESSAGES[key] || key).replace(/\{(\w+)\}/gu, (_match, name) => String(params[name] ?? ''));
}

function nestedErrorValues(error: any) {
  return [error, error?.data, error?.response?.data, error?.response?.data?.data].filter(Boolean);
}

export function extractAiQuotaError(error: unknown) {
  const values = nestedErrorValues(error as any);
  const coded = values.find((value) => classifyAiQuotaErrorCode(value?.code));
  const kind = classifyAiQuotaErrorCode(coded?.code);
  if (!coded || !kind) return null;
  const numberFromValues = (key: 'requiredTokens' | 'availableTokens') => {
    const raw = values.find((value) => value?.[key] != null)?.[key];
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
  };
  return {
    code: String(coded.code),
    kind,
    requiredTokens: numberFromValues('requiredTokens'),
    availableTokens: numberFromValues('availableTokens'),
  } as const;
}

export function getAiQuotaErrorPresentation(error: unknown, translate: Translate = fallbackTranslate) {
  const quotaError = extractAiQuotaError(error);
  if (!quotaError) return null;
  if (quotaError.kind === 'exhausted') {
    return {
      ...quotaError,
      title: translate('aiQuotaErrors.exhaustedTitle'),
      message: translate('aiQuotaErrors.exhaustedMessage'),
      retryable: false,
    };
  }
  const hasAmounts = quotaError.requiredTokens != null && quotaError.availableTokens != null;
  return {
    ...quotaError,
    title: translate('aiQuotaErrors.insufficientTitle'),
    message: hasAmounts
      ? translate('aiQuotaErrors.insufficientWithAmounts', {
          required: quotaError.requiredTokens?.toLocaleString(),
          available: quotaError.availableTokens?.toLocaleString(),
        })
      : translate('aiQuotaErrors.insufficientMessage'),
    retryable: false,
  };
}
