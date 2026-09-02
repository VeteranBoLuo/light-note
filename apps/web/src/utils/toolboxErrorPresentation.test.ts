import { describe, expect, it } from 'vitest';
import { toolboxErrorMessageKey } from './toolboxErrorPresentation';

describe('toolboxErrorPresentation', () => {
  it('把稳定错误码映射为本地化文案键，而不是透传服务端消息', () => {
    expect(toolboxErrorMessageKey({ code: 'AI_SKILL_SCOPE_STALE' }, 'fallback')).toBe('toolbox.error.sourceChanged');
    expect(toolboxErrorMessageKey({ code: 'TOOLBOX_INPUT_INVALID' }, 'fallback')).toBe('toolbox.error.invalidInput');
    expect(toolboxErrorMessageKey({ code: 'AI_QUOTA_EXCEEDED' }, 'fallback')).toBe(
      'toolbox.error.aiQuotaExhausted',
    );
    expect(toolboxErrorMessageKey({ code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST' }, 'fallback')).toBe(
      'toolbox.error.aiQuotaTaskInsufficient',
    );
    expect(toolboxErrorMessageKey({ code: 'UNKNOWN_INTERNAL_FAILURE' }, 'fallback')).toBe('fallback');
  });
});
