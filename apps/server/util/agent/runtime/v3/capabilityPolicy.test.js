import { describe, expect, it } from 'vitest';
import {
  capabilityMatchesPolicyProfile,
  evaluateAgentCapabilityPolicy,
  normalizeAgentCapabilityPolicyProfile,
} from './capabilityPolicy.js';

const productHelp = { effect: 'read', scopePolicy: 'public_product' };
const personalRead = { effect: 'read', scopePolicy: 'owner_bound' };
const personalWrite = { effect: 'write', scopePolicy: 'confirmation_owner_bound' };

describe('Agent Capability Policy Profile', () => {
  it('无效 profile 失败关闭到兼容的 auto，不扩大 Manifest 本身权限', () => {
    expect(normalizeAgentCapabilityPolicyProfile('EXECUTE_EVERYTHING')).toBe('auto');
    expect(capabilityMatchesPolicyProfile(personalWrite, 'auto')).toBe(true);
    expect(capabilityMatchesPolicyProfile(null, 'auto')).toBe(false);
  });

  it('chat_only 只保留公开产品知识读取', () => {
    expect(capabilityMatchesPolicyProfile(productHelp, 'chat_only')).toBe(true);
    expect(evaluateAgentCapabilityPolicy(personalRead, 'chat_only')).toMatchObject({
      allowed: false,
      reason: 'chat_only',
    });
    expect(capabilityMatchesPolicyProfile(personalWrite, 'chat_only')).toBe(false);
  });

  it('read_only 保留读取并统一移除所有写能力', () => {
    expect(capabilityMatchesPolicyProfile(productHelp, 'read_only')).toBe(true);
    expect(capabilityMatchesPolicyProfile(personalRead, 'read_only')).toBe(true);
    expect(evaluateAgentCapabilityPolicy(personalWrite, 'read_only')).toMatchObject({
      allowed: false,
      reason: 'read_only',
    });
  });
});
