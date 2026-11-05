import { describe, expect, it } from 'vitest';
import { SECURITY_HANDLED_STATUSES, excludesSecurityEventRisk } from './handledStatus.js';

describe('安全事件处理状态', () => {

  it.each(['false_positive', 'authorized_test'])('%s 会排除事件风险', (status) => {
    expect(excludesSecurityEventRisk(status)).toBe(true);
  });

  it.each(['unhandled', 'processed'])('%s 会保留事件风险', (status) => {
    expect(excludesSecurityEventRisk(status)).toBe(false);
  });
});
