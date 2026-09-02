import { describe, expect, it } from 'vitest';
import { AI_QUOTA_ERROR_CODES, classifyAiQuotaErrorCode, isAiQuotaErrorCode } from './aiQuotaProtocol.js';

describe('AI quota protocol', () => {
  it('区分额度耗尽与本次任务预算不足', () => {
    expect(classifyAiQuotaErrorCode(AI_QUOTA_ERROR_CODES.EXHAUSTED)).toBe('exhausted');
    expect(classifyAiQuotaErrorCode(AI_QUOTA_ERROR_CODES.INSUFFICIENT_FOR_REQUEST)).toBe(
      'insufficient_for_request',
    );
    expect(isAiQuotaErrorCode('AI_QUOTA_INSUFFICIENT_FOR_REQUEST')).toBe(true);
    expect(classifyAiQuotaErrorCode('AI_PROVIDER_ERROR')).toBeNull();
  });
});
