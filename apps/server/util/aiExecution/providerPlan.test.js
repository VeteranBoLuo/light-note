import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_STAGE_TYPES,
  classifyAiProviderStage,
  createAiProviderPlan,
  normalizeAiProviderPlan,
  resolveAiProviderPlanRule,
} from './providerPlan.js';

describe('AI Provider 阶段计划', () => {
  it('把业务 stage 收敛为三个稳定阶段', () => {
    expect(classifyAiProviderStage('image_recognition')).toBe('image_recognition');
    expect(classifyAiProviderStage('image_recognition_page_2')).toBe('image_recognition');
    expect(classifyAiProviderStage('skill_file_summarize_repair')).toBe('output_repair');
    expect(classifyAiProviderStage('skill_file_summarize')).toBe('model_generation');
  });

  it('从阶段规则派生总调用上限，不再维护第二份次数配置', () => {
    const plan = createAiProviderPlan({
      [AI_PROVIDER_STAGE_TYPES.IMAGE_RECOGNITION]: { billingScope: 'user', maxCalls: 3 },
      [AI_PROVIDER_STAGE_TYPES.MODEL_GENERATION]: { billingScope: 'user', maxCalls: 1 },
      [AI_PROVIDER_STAGE_TYPES.OUTPUT_REPAIR]: { billingScope: 'platform', maxCalls: 1 },
    });
    expect(plan).toMatchObject({ maxUserProviderCalls: 4, maxPlatformProviderCalls: 1 });
    expect(resolveAiProviderPlanRule(plan, 'skill_test_repair')).toMatchObject({
      stageType: 'output_repair',
      rule: { billingScope: 'platform', maxCalls: 1 },
    });
  });

  it('拒绝把普通生成伪装成平台调用', () => {
    expect(() =>
      normalizeAiProviderPlan({
        model_generation: { billingScope: 'platform', maxCalls: 1 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_EXECUTION_PROVIDER_PLAN_INVALID' }));
  });

  it('拒绝静默忽略拼错或未来未声明的阶段', () => {
    expect(() =>
      createAiProviderPlan({
        model_generatoin: { billingScope: 'user', maxCalls: 1 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_EXECUTION_PROVIDER_PLAN_INVALID' }));
    expect(() =>
      createAiProviderPlan({
        model_generation: { billingScope: 'user', maxCall: 1 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_EXECUTION_PROVIDER_PLAN_INVALID' }));
    expect(() =>
      normalizeAiProviderPlan({
        stages: { model_generation: { billingScope: 'user', maxCalls: 1 } },
        maxUserProviderCalls: 2,
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_EXECUTION_PROVIDER_PLAN_INVALID' }));
  });
});
