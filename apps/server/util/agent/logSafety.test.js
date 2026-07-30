import { describe, expect, it } from 'vitest';
import { stableAgentErrorCode } from './logSafety.js';

describe('agent 日志错误码', () => {
  it('重复归一化时保留已经稳定的字符串错误码', () => {
    expect(stableAgentErrorCode('ER_CANT_AGGREGATE_2COLLATIONS')).toBe('ER_CANT_AGGREGATE_2COLLATIONS');
    expect(stableAgentErrorCode('ATTACHMENT_NOT_FOUND')).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('未知文本仍归类为供应商错误', () => {
    expect(stableAgentErrorCode('private provider detail')).toBe('AI_PROVIDER_ERROR');
  });
});
