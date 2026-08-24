import { describe, expect, it } from 'vitest';
import {
  AI_BILLING_ACTIONS,
  createUserAiExecutionConfig,
  listPublicAiBillingCatalog,
  resolveAiBillingAction,
} from './aiBillingCatalog.js';
import { listAiSkills } from './aiSkill/registry.js';

describe('aiBillingCatalog', () => {
  it('每个已注册 Skill 都且只在统一计费目录出现一次', () => {
    const registeredIds = listAiSkills().map((skill) => skill.id);
    for (const skillId of registeredIds) {
      expect(
        AI_BILLING_ACTIONS.filter((action) => action.id === skillId),
        skillId,
      ).toHaveLength(1);
    }
    expect(new Set(registeredIds).size).toBe(registeredIds.length);
  });

  it('task type 别名唯一，账本记录不会被映射到错误模块', () => {
    const aliases = AI_BILLING_ACTIONS.flatMap((action) => action.taskTypes);
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(resolveAiBillingAction({ taskType: 'organize_note_tags' })).toMatchObject({
      id: 'note.organize_tags',
      module: 'note',
      unit: 'item',
    });
  });

  it('执行配置从目录读取调用上限和预占策略，公开目录不暴露内部预算', () => {
    expect(createUserAiExecutionConfig('bookmark.organize')).toMatchObject({
      billingPolicy: 'user',
      skillId: 'bookmark.organize',
      maxUserProviderCalls: 20,
      maxPlatformProviderCalls: 0,
      reservationTokens: 100_000,
    });
    const publicCatalog = listPublicAiBillingCatalog();
    expect(publicCatalog).toMatchObject({
      chargingRule: 'provider_actual_tokens',
      repairBilling: 'platform',
    });
    expect(JSON.stringify(publicCatalog)).not.toContain('reservationTokens');
    expect(JSON.stringify(publicCatalog)).not.toContain('taskTypes');
  });
});
