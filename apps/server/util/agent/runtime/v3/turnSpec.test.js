import { describe, expect, it } from 'vitest';
import { buildAgentV3CapabilityCatalog } from './capabilityManifest.js';
import {
  attachTurnSpecV3OutputContract,
  digestExecutionContractV3,
  normalizeTurnSpecV3,
  resolveArtifactContinuationV3,
} from './turnSpec.js';

const tool = (name) => ({ name, description: name, parameters: { type: 'object', properties: {} } });

function catalogFor(names, actorRole = 'user') {
  const tools = names.map(tool);
  return buildAgentV3CapabilityCatalog(tools, {
    availableToolNames: new Set(names),
    actorRole,
  });
}

function rawGoal(capabilityId, operation = 'read', extra = {}) {
  return {
    id: extra.id || 'goal-1',
    capabilityId,
    operation,
    description: extra.description || '处理当前请求',
    targetDescription: extra.targetDescription || '用户指定的目标',
    dependsOn: extra.dependsOn || [],
    referentSelectors: extra.referentSelectors || [],
  };
}

function rawSpec(goals, extra = {}) {
  return {
    version: '3.0',
    requestKind: extra.requestKind || 'answer',
    confidence: extra.confidence || 'high',
    continuationMode: extra.continuationMode || 'independent',
    topicEpochAction: extra.topicEpochAction || 'advance',
    goals,
    temporalConstraints: extra.temporalConstraints || [],
    groundingPolicy: extra.groundingPolicy || 'workspace_query',
    missingSlots: extra.missingSlots || [],
    clarificationQuestion: extra.clarificationQuestion || '',
  };
}

describe('TurnSpec V3', () => {
  it('写能力的声明式依赖由服务端确定性补齐，不要求模型再猜一次查询工具', () => {
    const catalog = catalogFor(['query_todos', 'set_todo_status']);
    const spec = normalizeTurnSpecV3(rawSpec([rawGoal('todo.status.set', 'complete')], { requestKind: 'action' }), {
      catalog,
      authoritativeGroundingPolicy: 'workspace_query',
    });
    expect(spec.goals).toHaveLength(2);
    expect(spec.goals[0]).toMatchObject({ capabilityId: 'todo.query', kind: 'read', implicit: true });
    expect(spec.goals[1]).toMatchObject({ capabilityId: 'todo.status.set', kind: 'write', operation: 'complete' });
    expect(spec.goals[1].dependsOn).toEqual([spec.goals[0].id]);
  });

  it('工作区材料生成笔记必须显式绑定读取目标与单一 note.create 产物', () => {
    const catalog = catalogFor(['query_notes', 'create_note']);
    const spec = normalizeTurnSpecV3(
      rawSpec(
        [
          rawGoal('note.query', 'read', { id: 'materials' }),
          rawGoal('note.create', 'create', { id: 'draft', dependsOn: ['materials'] }),
        ],
        { requestKind: 'create_artifact' },
      ),
      {
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
        outputContract: { format: 'note_markdown' },
      },
    );
    expect(spec).toMatchObject({ requestKind: 'create_artifact', outputContract: { format: 'note_markdown' } });
    expect(spec.goals.find((goal) => goal.id === 'draft')).toMatchObject({ kind: 'transform' });

    const missingReadDependency = normalizeTurnSpecV3(
      rawSpec([rawGoal('note.create', 'create')], { requestKind: 'create_artifact' }),
      {
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
        outputContract: { format: 'note_markdown' },
      },
    );
    expect(missingReadDependency).toBeNull();
  });

  it('未知能力 ID 或不属于能力清单的 operation 直接失败关闭', () => {
    const catalog = catalogFor(['query_notes']);
    expect(
      normalizeTurnSpecV3(rawSpec([rawGoal('read.query_notes')]), {
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
      }),
    ).toBeNull();
    expect(
      normalizeTurnSpecV3(rawSpec([rawGoal('note.query', 'delete')]), {
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
      }),
    ).toBeNull();
  });

  it('最新消息的单一时间表达式由服务端自动绑定，旧范围不能混入', () => {
    const catalog = catalogFor(['query_notes']);
    const today = normalizeTurnSpecV3(rawSpec([rawGoal('note.query')]), {
      catalog,
      authoritativeGroundingPolicy: 'workspace_query',
      latestMessage: '改为只总结我今天的全部笔记',
      temporalContext: { currentDate: '2026-08-20', currentDateTime: '2026-08-20 10:30:00' },
    });
    expect(today.temporalConstraints).toEqual([
      expect.objectContaining({
        goalId: 'goal-1',
        slot: 'timeRange',
        expression: '今天',
        argumentValue: '今天',
        implicit: true,
      }),
    ]);

    const stale = normalizeTurnSpecV3(
      rawSpec([rawGoal('note.query')], {
        temporalConstraints: [{ goalId: 'goal-1', slot: 'timeRange', expression: '最近7天' }],
      }),
      {
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
        latestMessage: '改为只总结我今天的全部笔记',
        temporalContext: { currentDate: '2026-08-20', currentDateTime: '2026-08-20 10:30:00' },
      },
    );
    expect(stale).toBeNull();
  });

  it('Root 必填时间槽按 Manifest 默认全部或确定性进入澄清', () => {
    const rankingCatalog = catalogFor(['get_resource_creation_ranking'], 'root');
    const ranking = normalizeTurnSpecV3(rawSpec([rawGoal('admin.resource.ranking.read')]), {
      catalog: rankingCatalog,
      actorRole: 'root',
      authoritativeGroundingPolicy: 'workspace_query',
      latestMessage: '查看资源创建排行',
    });
    expect(ranking.temporalConstraints).toEqual([
      expect.objectContaining({ slot: 'timeRange', argumentValue: '全部', implicit: true }),
    ]);
    expect(ranking.missingSlots).toEqual([]);

    const newUserCatalog = catalogFor(['query_new_user_resources'], 'root');
    const newUser = normalizeTurnSpecV3(rawSpec([rawGoal('admin.new_user.resource.query')]), {
      catalog: newUserCatalog,
      actorRole: 'root',
      authoritativeGroundingPolicy: 'workspace_query',
      latestMessage: '查看新增用户创建的资源',
    });
    expect(newUser.missingSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'goal-1.registeredWithin' }),
        expect.objectContaining({ name: 'goal-1.resourceTimeRange' }),
      ]),
    );
    expect(newUser.clarificationQuestion).toContain('用户注册时间');
    expect(newUser.clarificationQuestion).toContain('资源创建时间');
  });

  it('semanticDigest 保持语义稳定，executionDigest 纳入服务端实际绑定', () => {
    const catalog = catalogFor(['read_note']);
    const spec = normalizeTurnSpecV3(
      rawSpec([rawGoal('note.read')], { groundingPolicy: 'current_explicit_only' }),
      {
      catalog,
      authoritativeGroundingPolicy: 'current_explicit_only',
      latestMessage: '分析这篇笔记',
      },
    );
    expect(spec.semanticDigest).toBe(spec.digest);
    expect(spec.semanticDigest).toMatch(/^[a-f0-9]{64}$/u);
    const route = {
      goalRoutes: [
        { goalId: 'goal-1', capabilityIds: ['note.read'], toolNames: ['read_note'], status: 'ready' },
      ],
    };
    const first = digestExecutionContractV3({
      turnSpec: spec,
      route,
      executionContext: { contextRefs: [{ type: 'note', id: 'note-1' }], attachmentIds: [], resources: [] },
    });
    const second = digestExecutionContractV3({
      turnSpec: spec,
      route,
      executionContext: { contextRefs: [{ type: 'note', id: 'note-2' }], attachmentIds: [], resources: [] },
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toBe(second);
    expect(spec.semanticDigest).toBe(spec.digest);

    const reordered = digestExecutionContractV3({
      turnSpec: spec,
      route: {
        goalRoutes: [
          { goalId: 'goal-2', capabilityIds: ['note.read'], toolNames: ['read_note'], status: 'ready' },
          ...route.goalRoutes,
        ],
      },
      executionContext: {
        contextRefs: [
          { type: 'note', id: 'note-2' },
          { type: 'note', id: 'note-1' },
        ],
        attachmentIds: ['attachment-2', 'attachment-1'],
        resources: [],
      },
    });
    const canonicalOrder = digestExecutionContractV3({
      turnSpec: spec,
      route: {
        goalRoutes: [
          ...route.goalRoutes,
          { goalId: 'goal-2', capabilityIds: ['note.read'], toolNames: ['read_note'], status: 'ready' },
        ],
      },
      executionContext: {
        contextRefs: [
          { type: 'note', id: 'note-1' },
          { type: 'note', id: 'note-2' },
        ],
        attachmentIds: ['attachment-1', 'attachment-2'],
        resources: [],
      },
    });
    expect(reordered).toBe(canonicalOrder);
  });

  it('精确提醒时间自动绑定提醒和计划日期，可用于定位写操作的隐式查询依赖', () => {
    const catalog = catalogFor(['query_todos', 'set_todo_status']);
    const spec = normalizeTurnSpecV3(rawSpec([rawGoal('todo.status.set', 'complete')], { requestKind: 'action' }), {
      catalog,
      authoritativeGroundingPolicy: 'workspace_query',
      latestMessage: '把今天下午 4 点提醒的那个待办标记完成',
      temporalContext: { currentDate: '2026-08-20', currentDateTime: '2026-08-20 15:10:00' },
    });
    const queryGoal = spec.goals.find((goal) => goal.capabilityId === 'todo.query');
    expect(spec.temporalConstraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goalId: queryGoal.id, slot: 'reminderAt', argumentValue: '2026-08-20 16:00' }),
        expect.objectContaining({ goalId: queryGoal.id, slot: 'planDate', argumentValue: '2026-08-20' }),
      ]),
    );
  });

  it('输出契约只能附加到单一笔记产物，普通回答不能被包装成写操作', () => {
    const catalog = catalogFor(['query_notes', 'create_note']);
    const artifact = normalizeTurnSpecV3(
      rawSpec(
        [
          rawGoal('note.query', 'read', { id: 'materials' }),
          rawGoal('note.create', 'create', { id: 'draft', dependsOn: ['materials'] }),
        ],
        { requestKind: 'create_artifact' },
      ),
      {
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
        latestMessage: '总结笔记并创建一篇新笔记',
      },
    );
    expect(attachTurnSpecV3OutputContract(artifact, { format: 'note_markdown', length: { min: 2000 } })).toMatchObject({
      outputContract: { format: 'note_markdown', length: { min: 2000 } },
    });

    const answer = normalizeTurnSpecV3(rawSpec([rawGoal('note.query')]), {
      catalog,
      authoritativeGroundingPolicy: 'workspace_query',
      latestMessage: '有哪些笔记',
    });
    expect(attachTurnSpecV3OutputContract(answer, { format: 'note_markdown' })).toBeNull();
  });

  it('产物续写动作只由 TurnSpec 协议枚举决定，不依赖用户句式', () => {
    expect(
      resolveArtifactContinuationV3({ requestKind: 'create_artifact', continuationMode: 'scope_replacement' }),
    ).toBe('replace_scope');
    expect(
      resolveArtifactContinuationV3({ requestKind: 'revise_artifact', continuationMode: 'refine_last_artifact' }),
    ).toBe('refine');
    expect(resolveArtifactContinuationV3({ requestKind: 'create_artifact', continuationMode: 'independent' })).toBe(
      'create',
    );
    expect(resolveArtifactContinuationV3({ requestKind: 'answer', continuationMode: 'scope_replacement' })).toBe(
      'none',
    );
  });
});
