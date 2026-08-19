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
        operation: 'create',
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
      requestKind: 'create_artifact',
      goals: [
        {
          id: 'read-materials',
          kind: 'read',
          operation: 'read',
          capabilityDomain: 'note',
          description: '读取今天的笔记',
          targetDescription: '今天的全部笔记',
          dependsOn: [],
        },
        {
          id: 'create-note',
          kind: 'transform',
          operation: 'create',
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
    expect(spec).toMatchObject({ version: '2.0', requestKind: 'create_artifact', confidence: 'high' });
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

  it('笔记 OutputContract 绑定单一 note transform，并拒绝空标题追问与知识库串线', () => {
    const outputContract = { format: 'note_markdown', length: { mode: 'minimum', minChars: 2000 } };
    const readGoal = {
      id: 'read-materials',
      kind: 'read',
      operation: 'read',
      capabilityDomain: 'note',
      description: '读取今天的全部笔记',
      targetDescription: '今天',
      dependsOn: [],
    };
    const noteGoal = {
      id: 'create-note',
      kind: 'transform',
      operation: 'create',
      capabilityDomain: 'note',
      description: '生成总结笔记',
      targetDescription: '一篇 Markdown 笔记',
      dependsOn: ['read-materials'],
    };
    const options = { authoritativeGroundingPolicy: 'workspace_query', outputContract };

    expect(
      normalizeTurnSpec(
        validSpec({
          requestKind: 'create_artifact',
          goals: [readGoal, noteGoal],
          groundingPolicy: 'workspace_query',
        }),
        options,
      ),
    ).toMatchObject({ requestKind: 'create_artifact', outputContract });
    expect(
      normalizeTurnSpec(
        validSpec({ requestKind: 'mixed', goals: [readGoal, noteGoal], groundingPolicy: 'workspace_query' }),
        options,
      ),
    ).toBeNull();
    expect(
      normalizeTurnSpec(
        validSpec({
          requestKind: 'create_artifact',
          goals: [readGoal, { ...noteGoal, capabilityDomain: 'content' }],
          groundingPolicy: 'workspace_query',
        }),
        options,
      ),
    ).toBeNull();
    expect(
      normalizeTurnSpec(
        validSpec({
          requestKind: 'create_artifact',
          goals: [readGoal, noteGoal],
          groundingPolicy: 'workspace_query',
          missingSlots: [{ name: 'title', reason: '没有标题', question: '标题是什么？' }],
          clarificationQuestion: '标题是什么？',
        }),
        options,
      ),
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
            operation: 'read',
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
