import { describe, expect, it } from 'vitest';
import { buildAiCapabilityPolicyOptions, normalizeAiCapabilityPolicyProfile } from './aiCapabilityPolicy';

describe('AI capability policy profile', () => {
  it('只接受固定会话策略，未知值回退自动模式', () => {
    expect(normalizeAiCapabilityPolicyProfile('chat_only')).toBe('chat_only');
    expect(normalizeAiCapabilityPolicyProfile('read_only')).toBe('read_only');
    expect(normalizeAiCapabilityPolicyProfile('execute')).toBe('auto');
  });

  it('选项由统一翻译 key 生成', () => {
    expect(buildAiCapabilityPolicyOptions((key) => key)).toEqual([
      { value: 'auto', label: 'ai.capabilityPolicy.auto' },
      { value: 'chat_only', label: 'ai.capabilityPolicy.chatOnly' },
      { value: 'read_only', label: 'ai.capabilityPolicy.readOnly' },
    ]);
  });
});
