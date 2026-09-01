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
    expect(publicCatalog.tokenActions.some((action) => action.module === 'toolbox')).toBe(true);
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

  it('直接输入型 Skill 会把大段中文正文纳入动态预占，内部积分任务可显式改由系统额度承担', () => {
    const skill = resolveAiSkill('note.transform_text', 1);
    const config = createAiSkillExecutionConfig(
      skill,
      {
        input: { text: '字'.repeat(60_000), instruction: '润色' },
        scope: { resourceRefs: [] },
      },
      {
        billingPolicy: 'system',
        systemId: 'toolbox_points',
      },
    );
    expect(config).toMatchObject({
      billingPolicy: 'system',
      systemId: 'toolbox_points',
      skillId: 'note.transform_text',
    });
    expect(config.reservationTokens).toBeGreaterThan(80_000);
  });

  it('知识工坊纯 AI Profile 支持积分或 AI 额度二选一，并进入公开 AI 用量目录', () => {
    const toolboxActions = AI_BILLING_ACTIONS.filter((action) => action.module === 'toolbox');
    expect(toolboxActions.map((action) => action.id)).toContain('toolbox.idea_to_draft');
    expect(toolboxActions.every((action) => action.publicCatalog === true)).toBe(true);
    expect(toolboxActions.every((action) => action.allowedBillingPolicies.join(',') === 'user,system')).toBe(true);

    const skill = resolveAiSkill('toolbox.research_brief', 1);
    const request = { input: {}, scope: { resourceRefs: [{ type: 'note', id: 'n-1' }] } };
    expect(createAiSkillExecutionConfig(skill, request)).toMatchObject({
      billingPolicy: 'user',
      skillId: 'toolbox.research_brief',
      taskType: 'skill_toolbox_research_brief',
    });
    expect(createUserAiExecutionConfig(skill.id)).toMatchObject({
      billingPolicy: 'user',
      skillId: 'toolbox.research_brief',
    });
    expect(
      createAiSkillExecutionConfig(skill, request, { billingPolicy: 'system', systemId: 'toolbox_points' }),
    ).toMatchObject({
      billingPolicy: 'system',
      skillId: 'toolbox.research_brief',
      taskType: 'skill_toolbox_research_brief',
    });
  });

  it('标签分析按服务端展开后的完整范围编译分批调用与预占，而不是按一个标签选择器计数', () => {
    const skill = resolveAiSkill('tag.analyze', 1);
    const request = { scope: { resourceRefs: [{ type: 'tag', id: 'tag-1' }] } };
    const context = {
      resourceRefs: Array.from({ length: 81 }, (_, index) => ({ type: 'note', id: `n-${index + 1}` })),
    };
    const config = createAiSkillExecutionConfig(skill, request, {}, context);
    expect(config).toMatchObject({
      maxUserProviderCalls: 4,
      maxPlatformProviderCalls: 4,
      providerPlan: {
        stages: {
          model_generation: { billingScope: 'user', maxCalls: 4 },
          output_repair: { billingScope: 'platform', maxCalls: 4 },
        },
      },
    });
    expect(config.providerPlan.stages).not.toHaveProperty('image_recognition');
    expect(config.reservationTokens).toBeGreaterThan(80_000);
  });
});
