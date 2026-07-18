import { describe, expect, it } from 'vitest';
import {
  excludesSecurityEventRisk,
  securityHandledStatusConfirmText,
  securityHandledStatusOptions,
  statusPillClass,
  statusText,
} from './securityShared';

describe('security handled status helpers', () => {
  it('shows authorized test as an available status', () => {
    expect(securityHandledStatusOptions).toContainEqual({ value: 'authorized_test', label: '授权测试' });
    expect(statusText('authorized_test')).toBe('授权测试');
    expect(statusPillClass('authorized_test')).toBe('is-authorized-test');
  });

  it('excludes false positives and authorized tests from risk', () => {
    expect(excludesSecurityEventRisk('false_positive')).toBe(true);
    expect(excludesSecurityEventRisk('authorized_test')).toBe(true);
    expect(excludesSecurityEventRisk('processed')).toBe(false);
  });

  it('explains the reversible risk behavior before changing status', () => {
    expect(securityHandledStatusConfirmText('authorized_test', 3)).toContain('不会计入 IP 和账号风险');
    expect(securityHandledStatusConfirmText('processed')).toContain('风险将重新计入');
  });
});
