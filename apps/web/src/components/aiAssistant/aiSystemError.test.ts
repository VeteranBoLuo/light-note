import { describe, expect, it } from 'vitest';
import { resolveAiSystemError, resolveLegacyAiSystemErrorCode } from './aiSystemError';

describe('resolveAiSystemError', () => {
  it.each([
    ['AI_QUOTA_EXHAUSTED', 'quota', false],
    ['AI_STREAM_TERMINAL_MISSING', 'timeout', true],
    ['PROVIDER_UNAVAILABLE', 'network', true],
    ['ADMIN_PREVIEW_READONLY', 'permission', false],
    ['CONTENT_FILTERED', 'content', false],
    ['unexpected raw provider detail', 'generic', true],
  ])('maps %s to a stable system error card', (code, kind, retryable) => {
    const result = resolveAiSystemError(code);
    expect(result.kind).toBe(kind);
    expect(result.retryable).toBe(retryable);
    expect(result.referenceCode).toMatch(/^[A-Z0-9_]+$/);
  });

  it('maps legacy provider failure bodies without exposing their raw detail', () => {
    expect(resolveLegacyAiSystemErrorCode('Provider error: upstream secret detail')).toBe('PROVIDER_UNAVAILABLE');
    expect(resolveLegacyAiSystemErrorCode('AI 请求失败：429 quota exhausted')).toBe('AI_QUOTA_EXHAUSTED');
    expect(resolveLegacyAiSystemErrorCode('这是一段正常回答，其中讨论了 Provider error 的治理方案。\n\n还有更多内容。')).toBeNull();
  });
});
