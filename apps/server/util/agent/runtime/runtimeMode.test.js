import { describe, expect, it } from 'vitest';
import {
  resolveAgentRuntimeDecision,
  resolveAgentRuntimeMode,
  resolveAgentRuntimeRolloutPolicy,
  resolveAgentRuntimeV2Mode,
  stableAgentRuntimeRolloutBucket,
} from './runtimeMode.js';

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

describe('Agent Runtime V3 mode', () => {
  it('默认不增加任何 V3 模型调用，只有显式配置才启用 shadow/enforce', () => {
    expect(resolveAgentRuntimeMode({})).toBe('legacy');
    expect(resolveAgentRuntimeMode({ AI_AGENT_RUNTIME_MODE: 'v3_shadow' })).toBe('v3_shadow');
    expect(resolveAgentRuntimeMode({ AI_AGENT_RUNTIME_MODE: 'V3_ENFORCE' })).toBe('v3_enforce');
    expect(resolveAgentRuntimeMode({ AI_AGENT_RUNTIME_MODE: 'unknown' })).toBe('legacy');
  });

  it('只配置目标模式但没有灰度受众时失败关闭，且不会产生 V3 调用', () => {
    expect(
      resolveAgentRuntimeDecision({
        env: { AI_AGENT_RUNTIME_MODE: 'v3_shadow' },
        actorId: 'user-1',
        actorRole: 'user',
      }),
    ).toEqual({
      configuredMode: 'v3_shadow',
      effectiveMode: 'legacy',
      enrolled: false,
      reason: 'policy_disabled',
      rolloutPercentage: 0,
    });
  });

  it('root 别名只按认证后的操作者角色纳入，不把普通账号带入灰度', () => {
    const env = {
      AI_AGENT_RUNTIME_MODE: 'v3_enforce',
      AI_AGENT_RUNTIME_V3_ROLLOUT: 'root',
    };
    expect(resolveAgentRuntimeDecision({ env, actorId: 'root-1', actorRole: 'root' })).toMatchObject({
      effectiveMode: 'v3_enforce',
      enrolled: true,
      reason: 'role_allowlist',
    });
    expect(resolveAgentRuntimeDecision({ env, actorId: 'user-1', actorRole: 'user' })).toMatchObject({
      effectiveMode: 'legacy',
      enrolled: false,
      reason: 'not_selected',
    });
  });

  it('结构化策略支持账号白名单、角色、排除项和稳定百分比分桶', () => {
    const policy = JSON.stringify({
      roles: ['root'],
      actorIds: ['user-allow'],
      excludeActorIds: ['root-excluded'],
      percentage: 50,
      salt: 'release-1',
    });
    const env = {
      AI_AGENT_RUNTIME_MODE: 'v3_shadow',
      AI_AGENT_RUNTIME_V3_ROLLOUT: policy,
    };
    expect(resolveAgentRuntimeDecision({ env, actorId: 'user-allow', actorRole: 'user' })).toMatchObject({
      effectiveMode: 'v3_shadow',
      reason: 'actor_allowlist',
    });
    expect(resolveAgentRuntimeDecision({ env, actorId: 'root-excluded', actorRole: 'root' })).toMatchObject({
      effectiveMode: 'legacy',
      reason: 'excluded',
    });

    const actorKeys = Array.from({ length: 200 }, (_, index) => `actor-${index}`);
    const selectedKey = actorKeys.find((key) => stableAgentRuntimeRolloutBucket(key, 'release-1') < 5000);
    const skippedKey = actorKeys.find((key) => stableAgentRuntimeRolloutBucket(key, 'release-1') >= 5000);
    expect(selectedKey).toBeTruthy();
    expect(skippedKey).toBeTruthy();
    expect(
      resolveAgentRuntimeDecision({ env, actorId: selectedKey, actorRole: 'user', actorKey: selectedKey }),
    ).toMatchObject({ effectiveMode: 'v3_shadow', reason: 'percentage' });
    expect(
      resolveAgentRuntimeDecision({ env, actorId: skippedKey, actorRole: 'user', actorKey: skippedKey }),
    ).toMatchObject({ effectiveMode: 'legacy', reason: 'not_selected' });
    const stableBucket = stableAgentRuntimeRolloutBucket(selectedKey, 'release-1');
    expect(stableBucket).toBe(stableAgentRuntimeRolloutBucket(selectedKey, 'release-1'));
    expect(Number.isInteger(stableBucket)).toBe(true);
    expect(stableBucket).toBeGreaterThanOrEqual(0);
    expect(stableBucket).toBeLessThan(10_000);
  });

  it('all 显式全量启用；非法 JSON、未知字段和越界比例都失败关闭', () => {
    expect(
      resolveAgentRuntimeDecision({
        env: { AI_AGENT_RUNTIME_MODE: 'v3_shadow', AI_AGENT_RUNTIME_V3_ROLLOUT: 'all' },
      }),
    ).toMatchObject({ effectiveMode: 'v3_shadow', enrolled: true, reason: 'all' });

    for (const rollout of [
      '{bad',
      '{"percentage":101}',
      '{"percentage":"10"}',
      '{"roles":[null]}',
      '{"salt":123}',
      '{"percent":10}',
    ]) {
      const env = { AI_AGENT_RUNTIME_MODE: 'v3_enforce', AI_AGENT_RUNTIME_V3_ROLLOUT: rollout };
      expect(resolveAgentRuntimeRolloutPolicy(env).status).toBe('invalid');
      expect(resolveAgentRuntimeDecision({ env, actorId: 'user-1', actorRole: 'user' })).toMatchObject({
        effectiveMode: 'legacy',
        enrolled: false,
        reason: 'invalid_policy',
      });
    }
  });
});
