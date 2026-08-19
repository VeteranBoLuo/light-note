import { describe, expect, it } from 'vitest';
import { adaptRuntimeOutcomeToLegacy } from './legacyRuntimeAdapter.js';

const catalog = [
  { id: 'note.query', effect: 'read', status: 'enabled', toolNames: ['query_notes'] },
  { id: 'note.create', effect: 'write', status: 'enabled', toolNames: ['create_note'] },
];

describe('Runtime V2 legacy execution adapter', () => {
  it('只把已确认 TurnSpec 投影给既有执行/确认层，不重新判断意图', () => {
    const result = adaptRuntimeOutcomeToLegacy(
      {
        state: 'ready_for_tools',
        turnSpec: {
          requestKind: 'mixed',
          confidence: 'high',
          goals: [
            { id: 'read', kind: 'read', description: '查询笔记', targetDescription: '今天', dependsOn: [] },
            {
              id: 'write',
              kind: 'transform',
              description: '创建总结',
              targetDescription: '新笔记',
              dependsOn: ['read'],
            },
          ],
        },
        route: {
          goalRoutes: [
            { goalId: 'read', capabilityIds: ['note.query'] },
            { goalId: 'write', capabilityIds: ['note.create'] },
          ],
        },
      },
      catalog,
    );
    expect(result.semanticPlan).toMatchObject({
      requestClass: 'mixed',
      intents: [
        { capabilityId: 'note.query', kind: 'read', dependsOn: [] },
        { capabilityId: 'note.create', kind: 'write', dependsOn: [0] },
      ],
    });
    expect(result.writeToolNames).toEqual(['create_note']);
    expect(result.semanticPolicy).toBeNull();
  });

  it('统一映射澄清，不允许进入工具执行', () => {
    const result = adaptRuntimeOutcomeToLegacy({
      state: 'clarification',
      question: '请问要处理哪一篇笔记？',
      turnSpec: {
        requestKind: 'action',
        confidence: 'low',
        goals: [],
      },
      route: { goalRoutes: [] },
    });
    expect(result.semanticPolicy).toMatchObject({
      state: 'clarification',
      resolution: 'ambiguous',
      message: '请问要处理哪一篇笔记？',
    });
  });

  it('不支持目标的说明只包含真正被阻断的能力，不把同轮正常读取误报为禁止', () => {
    const result = adaptRuntimeOutcomeToLegacy(
      {
        state: 'unsupported',
        turnSpec: {
          requestKind: 'mixed',
          confidence: 'high',
          goals: [
            { id: 'read', kind: 'read', description: '读取笔记', targetDescription: '', dependsOn: [] },
            { id: 'delete', kind: 'write', description: '永久删除', targetDescription: '', dependsOn: ['read'] },
          ],
        },
        route: {
          goalRoutes: [
            { goalId: 'read', capabilityIds: ['note.query'] },
            { goalId: 'delete', capabilityIds: ['data.permanent_delete'] },
          ],
        },
      },
      [...catalog, { id: 'data.permanent_delete', effect: 'write', status: 'forbidden', toolNames: [] }],
    );
    expect(result.semanticPolicy).toMatchObject({
      state: 'blocked',
      resolution: 'forbidden',
      capabilities: [{ id: 'data.permanent_delete' }],
    });
  });
});
