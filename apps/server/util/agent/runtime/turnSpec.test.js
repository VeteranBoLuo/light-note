import { describe, expect, it } from 'vitest';
import { buildTurnSpecToolDefinition, digestTurnSpec, normalizeTurnSpec, parseTurnSpecResponse } from './turnSpec.js';

function validSpec(overrides = {}) {
  return {
    version: '2.0',
    requestKind: 'action',
    confidence: 'high',
    goals: [
      {
        id: 'goal-1',
        kind: 'write',
        capabilityDomain: 'todo',
        description: '创建待办',
        targetDescription: '用户指定的新待办',
        dependsOn: [],
      },
    ],
    groundingPolicy: 'general_knowledge',
    missingSlots: [],
    clarificationQuestion: '',
    ...overrides,
  };
}

describe('TurnSpec V2', () => {
  it('严格归一多目标依赖，绑定服务端 OutputContract 并生成稳定摘要', () => {
    const raw = validSpec({
      requestKind: 'mixed',
      goals: [
        {
          id: 'read-materials',
          kind: 'read',
          capabilityDomain: 'note',
          description: '读取今天的笔记',
          targetDescription: '今天的全部笔记',
          dependsOn: [],
        },
        {
          id: 'create-note',
          kind: 'write',
          capabilityDomain: 'note',
          description: '创建汇总笔记',
          targetDescription: '新的 Markdown 笔记',
          dependsOn: ['read-materials'],
        },
      ],
      groundingPolicy: 'workspace_query',
    });
    const spec = normalizeTurnSpec(raw, {
      authoritativeGroundingPolicy: 'workspace_query',
      outputContract: { format: 'note_markdown', length: { mode: 'minimum', minChars: 2000 } },
    });
    expect(spec).toMatchObject({ version: '2.0', requestKind: 'mixed', confidence: 'high' });
    expect(spec.goals[1].dependsOn).toEqual(['read-materials']);
    expect(spec.outputContract.length.minChars).toBe(2000);
    expect(spec.digest).toBe(digestTurnSpec(spec));
  });

  it('I-03/I-08：低置信或缺 slot 必须澄清，不能伪装成可执行计划', () => {
    expect(normalizeTurnSpec(validSpec({ confidence: 'low' }))).toBeNull();
    expect(
      normalizeTurnSpec(
        validSpec({
          confidence: 'low',
          missingSlots: [{ name: 'targetNote', reason: '目标不唯一', question: '你想处理哪一篇笔记？' }],
          clarificationQuestion: '你想处理哪一篇笔记？',
        }),
      ),
    ).toMatchObject({ missingSlots: [{ name: 'targetNote' }] });
  });

  it('拒绝未来依赖、write 作为依赖和模型修改服务端材料策略', () => {
    expect(normalizeTurnSpec(validSpec({ goals: [{ ...validSpec().goals[0], dependsOn: ['goal-2'] }] }))).toBeNull();
    expect(
      normalizeTurnSpec(
        validSpec({
          goals: [validSpec().goals[0], { ...validSpec().goals[0], id: 'goal-2', dependsOn: ['goal-1'] }],
        }),
      ),
    ).toBeNull();
    expect(normalizeTurnSpec(validSpec(), { authoritativeGroundingPolicy: 'current_explicit_only' })).toBeNull();
    expect(buildTurnSpecToolDefinition().function.parameters.additionalProperties).toBe(false);
  });

  it('I-09：malformed 协议不被宽松修正', () => {
    expect(
      parseTurnSpecResponse({
        toolCalls: [{ function: { name: 'submit_turn_spec', arguments: '{not-json' } }],
      }),
    ).toBeNull();
  });

  it('Intent Compiler 单轮最多选择 3 个能力域，防止重新膨胀成完整工具目录', () => {
    expect(
      normalizeTurnSpec(
        validSpec({
          requestKind: 'answer',
          goals: ['note', 'todo', 'bookmark', 'file'].map((capabilityDomain, index) => ({
            id: `goal-${index}`,
            kind: 'read',
            capabilityDomain,
            description: `查询 ${capabilityDomain}`,
            targetDescription: capabilityDomain,
            dependsOn: [],
          })),
        }),
      ),
    ).toBeNull();
  });
});
