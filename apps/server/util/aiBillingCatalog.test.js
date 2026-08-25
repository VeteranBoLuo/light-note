import { describe, expect, it } from 'vitest';
import {
  AI_BILLING_ACTIONS,
  createAiSkillExecutionConfig,
  createUserAiExecutionConfig,
  listPublicAiBillingCatalog,
  resolveAiBillingAction,
} from './aiBillingCatalog.js';
import { listAiSkills, resolveAiSkill } from './aiSkill/registry.js';

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
      ruleVersion: 3,
      chargingRule: 'provider_actual_tokens',
      repairBilling: 'platform',
      failedExecutionBilling: 'platform',
    });
    expect(JSON.stringify(publicCatalog)).not.toContain('reservationTokens');
    expect(JSON.stringify(publicCatalog)).not.toContain('taskTypes');
  });

  it('按本轮材料编译图片识别、正文生成和平台修复阶段', () => {
    const skill = resolveAiSkill('search.summarize_selected', 1);
    const config = createAiSkillExecutionConfig(skill, {
      scope: {
        resourceRefs: [
          { type: 'file', id: 'f-1' },
          { type: 'note', id: 'n-1' },
          { type: 'file', id: 'f-2' },
        ],
      },
    });
    expect(config).toMatchObject({
      maxUserProviderCalls: 3,
      maxPlatformProviderCalls: 1,
      billingRuleVersion: 3,
      providerPlan: {
        stages: {
          image_recognition: { billingScope: 'user', maxCalls: 2 },
          model_generation: { billingScope: 'user', maxCalls: 1 },
          output_repair: { billingScope: 'platform', maxCalls: 1 },
        },
      },
    });
    expect(config.reservationTokens).toBeGreaterThan(60_000);
  });

  it('未声明图片预处理的文件待办提取不会凭资源类型多放一次调用', () => {
    const skill = resolveAiSkill('file.extract_todos', 1);
    const config = createAiSkillExecutionConfig(skill, {
      scope: { resourceRefs: [{ type: 'file', id: 'f-1' }] },
    });
    expect(config.maxUserProviderCalls).toBe(1);
    expect(config.providerPlan.stages).not.toHaveProperty('image_recognition');
  });

  it('直接输入型 Skill 会把大段中文正文纳入动态预占', () => {
    const skill = resolveAiSkill('note.transform_text', 1);
    const config = createAiSkillExecutionConfig(
      skill,
      {
        input: { text: '字'.repeat(60_000), instruction: '润色' },
        scope: { resourceRefs: [] },
      },
      {
        billingPolicy: 'none',
        skillId: 'fake.free_action',
      },
    );
    expect(config).toMatchObject({ billingPolicy: 'user', skillId: 'note.transform_text' });
    expect(config.reservationTokens).toBeGreaterThan(80_000);
  });
});
