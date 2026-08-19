import { describe, expect, it } from 'vitest';
import { agentModelStage, resolveAgentStageModelOptions } from './stageModelPolicy.js';

describe('Agent 分阶段模型策略', () => {
  it('把 Compiler、Planner、Composer、Note Draft 映射到独立配置', () => {
    expect(agentModelStage('intent_compiler_repair')).toBe('INTENT');
    expect(agentModelStage('execution_planner_round_2')).toBe('PLANNER');
    expect(agentModelStage('final')).toBe('COMPOSER');
    expect(agentModelStage('note_draft_repair')).toBe('NOTE_DRAFT');
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
