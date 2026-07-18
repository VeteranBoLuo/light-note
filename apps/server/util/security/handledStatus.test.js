import { describe, expect, it } from 'vitest';
import {
  SECURITY_HANDLED_STATUSES,
  excludesSecurityEventRisk,
  normalizeSecurityHandledStatus,
  securityHandledStatusSuccessMessage,
} from './handledStatus.js';

describe('安全事件处理状态', () => {
  it('兼容旧状态并允许授权测试状态', () => {
    expect(normalizeSecurityHandledStatus('confirmed')).toBe('processed');
    expect(normalizeSecurityHandledStatus('authorized_test')).toBe('authorized_test');
    expect(normalizeSecurityHandledStatus('unknown')).toBeUndefined();
    expect(SECURITY_HANDLED_STATUSES).toContain('authorized_test');
  });

  it.each(['false_positive', 'authorized_test'])('%s 会排除事件风险', (status) => {
    expect(excludesSecurityEventRisk(status)).toBe(true);
  });

  it.each(['unhandled', 'processed'])('%s 会保留事件风险', (status) => {
    expect(excludesSecurityEventRisk(status)).toBe(false);
  });

  it('为授权测试返回明确的风险排除提示', () => {
    expect(securityHandledStatusSuccessMessage('authorized_test')).toContain('授权测试');
    expect(securityHandledStatusSuccessMessage('authorized_test')).toContain('风险影响已排除');
  });
});
