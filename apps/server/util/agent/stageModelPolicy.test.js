import { describe, expect, it } from 'vitest';
import { agentModelStage, resolveAgentStageModelOptions } from './stageModelPolicy.js';

describe('Agent 分阶段模型策略', () => {
  it('把 Compiler、Planner、Composer、Note Draft 映射到独立配置', () => {
    expect(agentModelStage('image_recognition')).toBe('VISION');
    expect(agentModelStage('intent_compiler_repair')).toBe('INTENT');
    expect(agentModelStage('execution_planner_round_2')).toBe('PLANNER');
    expect(agentModelStage('final')).toBe('COMPOSER');
    expect(agentModelStage('note_draft_repair')).toBe('NOTE_DRAFT');
  });

  it('视觉阶段不继承全局文本备用供应商，并使用独立模型名', () => {
    expect(
      resolveAgentStageModelOptions('image_recognition', {
        AGENT_LLM_PROVIDER: 'qwen',
        DEEPSEEK_VISION_MODEL: 'deepseek-vision-test',
      }),
    ).toEqual({
      stageGroup: 'vision',
      providerOverride: 'deepseek',
      modelOverride: 'deepseek-vision-test',
    });
  });

  it('阶段配置优先，未配置时继承全局 Provider', () => {
    expect(
      resolveAgentStageModelOptions('intent_compiler', {
        AGENT_LLM_PROVIDER: 'deepseek',
        AGENT_INTENT_PROVIDER: 'qwen',
        AGENT_INTENT_MODEL: 'qwen-intent-test',
      }),
    ).toEqual({ stageGroup: 'intent', providerOverride: 'qwen', modelOverride: 'qwen-intent-test' });
    expect(resolveAgentStageModelOptions('unknown', { AGENT_LLM_PROVIDER: 'qwen' })).toEqual({
      stageGroup: 'default',
      providerOverride: 'qwen',
    });
  });
});
