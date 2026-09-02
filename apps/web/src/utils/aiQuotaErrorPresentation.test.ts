import { describe, expect, it } from 'vitest';
import { extractAiQuotaError, getAiQuotaErrorPresentation } from './aiQuotaErrorPresentation';

const t = (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params || {})}`;

describe('AI quota error presentation', () => {
  it('识别统一请求层压平后的额度耗尽错误', () => {
    expect(
      getAiQuotaErrorPresentation({ code: 'HTTP_429', data: { code: 'AI_QUOTA_EXCEEDED' } }, t),
    ).toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
      kind: 'exhausted',
      title: 'aiQuotaErrors.exhaustedTitle:{}',
      retryable: false,
    });
  });

  it('保留本次任务预算不足的所需与可用额度', () => {
    const error = {
      response: {
        data: {
          data: {
            code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
            requiredTokens: 26_903,
            availableTokens: 21_700,
          },
        },
      },
    };
    expect(extractAiQuotaError(error)).toEqual({
      code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
      kind: 'insufficient_for_request',
      requiredTokens: 26_903,
      availableTokens: 21_700,
    });
    expect(getAiQuotaErrorPresentation(error, t)?.message).toContain('aiQuotaErrors.insufficientWithAmounts');
  });
});
