import { describe, expect, it } from 'vitest';
import { resolveAgentRuntimeV2Mode } from './runtimeMode.js';

describe('Agent Runtime V2 mode', () => {
  it('默认 enforce，允许 legacy/shadow 显式回退或观测', () => {
    expect(resolveAgentRuntimeV2Mode({})).toBe('enforce');
    expect(resolveAgentRuntimeV2Mode({ AI_AGENT_RUNTIME_V2_MODE: 'legacy' })).toBe('legacy');
    expect(resolveAgentRuntimeV2Mode({ AI_AGENT_RUNTIME_V2_MODE: 'ENFORCE' })).toBe('enforce');
  });

  it('非法值回退 enforce，不能因拼写错误意外降级到旧决策链', () => {
    expect(resolveAgentRuntimeV2Mode({ AI_AGENT_RUNTIME_V2_MODE: 'enabled' })).toBe('enforce');
  });
});
