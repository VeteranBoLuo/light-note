import { describe, expect, it, vi } from 'vitest';
import { buildAgentV3CapabilityCatalog } from './capabilityManifest.js';
import { compileAgentTurnSpecV3 } from './intentCompiler.js';

const tools = [{ name: 'query_notes', description: '查询笔记', parameters: { type: 'object', properties: {} } }];
const catalog = buildAgentV3CapabilityCatalog(tools, {
  availableToolNames: new Set(['query_notes']),
  actorRole: 'user',
});

const continuationCatalog = buildAgentV3CapabilityCatalog(
  [
    { name: 'read_note', description: '读取笔记', parameters: { type: 'object', properties: {} } },
    { name: 'read_url', description: '读取网页', parameters: { type: 'object', properties: {} } },
  ],
  {
    availableToolNames: new Set(['read_note', 'read_url']),
    actorRole: 'user',
  },
);

const artifactCatalog = buildAgentV3CapabilityCatalog(
  [
    { name: 'query_notes', description: '查询笔记', parameters: { type: 'object', properties: {} } },
    { name: 'create_note', description: '创建笔记', parameters: { type: 'object', properties: {} } },
  ],
  {
    availableToolNames: new Set(['query_notes', 'create_note']),
    actorRole: 'user',
  },
);

function response(argumentsValue) {
  return {
    toolCalls: [
      {
        function: {
          name: 'submit_turn_spec_v3',
          arguments: typeof argumentsValue === 'string' ? argumentsValue : JSON.stringify(argumentsValue),
        },
      },
    ],
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    usageStatus: 'reported',
  };
}

const validSpec = {
  version: '3.0',
  requestKind: 'answer',
  confidence: 'high',
  continuationMode: 'independent',
  topicEpochAction: 'advance',
  goals: [
    {
      id: 'query',
      capabilityId: 'note.query',
      operation: 'read',
      description: '查询今天的笔记',
      targetDescription: '今天',
      dependsOn: [],
      referentSelectors: [],
    },
  ],
  groundingPolicy: 'workspace_query',
  temporalConstraints: [],
  missingSlots: [],
  clarificationQuestion: '',
};

describe('Intent Compiler V3', () => {
  it('模型只把最新消息当动作与时间权威，recentDialogue 仅用于语义承接', async () => {
    const request = vi.fn().mockResolvedValue(response(validSpec));
    const result = await compileAgentTurnSpecV3({
      message: '只查询今天的笔记',
      recentDialogue: [
        { role: 'user', content: '先查询最近 7 天的书签' },
        { role: 'assistant', content: '找到了 5 条，你还想了解什么？' },
      ],
      catalog,
      discourseProjection: {
        topicEpoch: 2,
        activeDomain: 'bookmark',
        lastCapabilityIds: ['bookmark.query'],
        lastResultSet: { available: true, domains: ['bookmark'], refTypes: ['bookmark'], refCount: 2 },
      },
      contextSummary: {},
      authoritativeGroundingPolicy: 'workspace_query',
      request,
    });
    expect(result.turnSpec.goals[0].capabilityId).toBe('note.query');
    const messages = request.mock.calls[0][0];
    const payload = JSON.parse(messages[1].content);
    expect(payload).toMatchObject({ latestMessage: '只查询今天的笔记' });
    expect(payload.authoritativeTemporalMentions).toEqual([
      expect.objectContaining({ expression: '今天', precision: 'date' }),
    ]);
    expect(payload.recentDialogue).toEqual([
      { role: 'user', content: '先查询最近 7 天的书签' },
      { role: 'assistant', content: '找到了 5 条，你还想了解什么？' },
    ]);
    expect(payload.authoritativeTemporalMentions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ expression: expect.stringContaining('7 天') })]),
    );
    expect(payload.structuredDiscourse).toMatchObject({ activeDomain: 'bookmark' });
    expect(JSON.stringify(payload)).not.toContain('recentDiscourse');
    expect(JSON.stringify(payload)).not.toContain('history');
  });

  it('协议无效时最多修复一次，仍无效则不产生任何执行计划', async () => {
    const request = vi.fn().mockResolvedValue(response('{'));
    await expect(
      compileAgentTurnSpecV3({
        message: '查询笔记',
        catalog,
        authoritativeGroundingPolicy: 'workspace_query',
        request,
      }),
    ).rejects.toMatchObject({ code: 'TURN_SPEC_V3_INVALID' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('Dialogue Anchor 只有服务端存在稳定消息锚点时才允许进入规格', async () => {
    const dialogueSpec = {
      ...validSpec,
      requestKind: 'create_artifact',
      groundingPolicy: 'none',
      goals: [
        {
          ...validSpec.goals[0],
          capabilityId: 'note.create',
          operation: 'create',
          referentSelectors: [{ source: 'dialogue_anchor', types: ['dialogue'], ordinal: null }],
        },
      ],
    };
    const dialogueCatalog = buildAgentV3CapabilityCatalog(
      [{ name: 'create_note', description: '创建笔记', parameters: { type: 'object', properties: {} } }],
      { availableToolNames: new Set(['create_note']), actorRole: 'user' },
    );
    const request = vi.fn().mockResolvedValue(response(dialogueSpec));
    await expect(
      compileAgentTurnSpecV3({
        message: '把刚才讨论整理成笔记',
        recentDialogue: [{ role: 'assistant', content: '刚才的讨论内容' }],
        catalog: dialogueCatalog,
        contextSummary: { dialogueAnchorAvailable: true },
        authoritativeGroundingPolicy: 'none',
        outputContract: { format: 'note_markdown' },
        request,
      }),
    ).resolves.toMatchObject({
      turnSpec: {
        goals: [
          expect.objectContaining({
            referentSelectors: [{ source: 'dialogue_anchor', types: ['dialogue'], ordinal: null }],
          }),
        ],
      },
    });

    const unavailable = vi.fn().mockResolvedValue(response(dialogueSpec));
    await expect(
      compileAgentTurnSpecV3({
        message: '把刚才讨论整理成笔记',
        recentDialogue: [{ role: 'assistant', content: '临时 session 内容' }],
        catalog: dialogueCatalog,
        contextSummary: { dialogueAnchorAvailable: false },
        authoritativeGroundingPolicy: 'none',
        outputContract: { format: 'note_markdown' },
        request: unavailable,
      }),
    ).rejects.toMatchObject({ code: 'TURN_SPEC_V3_INVALID' });
    expect(unavailable).toHaveBeenCalledTimes(2);
  });

  it('唯一网页结果被误编译成笔记读取时进行一次通用语义复核并改回兼容能力', async () => {
    const wrong = {
      ...validSpec,
      continuationMode: 'independent',
      goals: [
        {
          ...validSpec.goals[0],
          capabilityId: 'note.read',
          description: '总结内容',
          targetDescription: '内容',
        },
      ],
    };
    const corrected = {
      ...validSpec,
      continuationMode: 'refer_last_result',
      topicEpochAction: 'keep',
      goals: [
        {
          ...validSpec.goals[0],
          capabilityId: 'web.read',
          description: '总结上一网页结果',
          targetDescription: '上一网页结果',
          referentSelectors: [{ source: 'last_result', types: ['web'], ordinal: null }],
        },
      ],
    };
    const request = vi.fn().mockResolvedValueOnce(response(wrong)).mockResolvedValueOnce(response(corrected));

    const result = await compileAgentTurnSpecV3({
      message: '总结这个内容',
      catalog: continuationCatalog,
      discourseProjection: {
        lastResultSet: { available: true, domains: ['web', 'bookmark'], refTypes: ['web'], refCount: 1 },
        resultSetCandidates: [{ available: true, domains: ['web', 'bookmark'], refTypes: ['web'], refCount: 1 }],
      },
      authoritativeGroundingPolicy: 'workspace_query',
      request,
    });

    expect(result).toMatchObject({ attempts: 2, turnSpec: { continuationMode: 'refer_last_result' } });
    expect(result.turnSpec.goals[0]).toMatchObject({ capabilityId: 'web.read', capabilityDomain: 'web' });
    expect(request.mock.calls[1][0][0].content).toContain('语义边界复核');
  });

  it('refer_last_result 的读取领域与真实引用不兼容时失败关闭', async () => {
    const incompatible = {
      ...validSpec,
      continuationMode: 'refer_last_result',
      topicEpochAction: 'keep',
      goals: [
        {
          ...validSpec.goals[0],
          capabilityId: 'note.read',
          referentSelectors: [{ source: 'last_result', types: ['web'], ordinal: null }],
        },
      ],
    };
    const request = vi.fn().mockResolvedValue(response(incompatible));
    await expect(
      compileAgentTurnSpecV3({
        message: '继续处理刚才那个',
        catalog: continuationCatalog,
        discourseProjection: {
          lastResultSet: { available: true, domains: ['web'], refTypes: ['web'], refCount: 1 },
          resultSetCandidates: [{ available: true, domains: ['web'], refTypes: ['web'], refCount: 1 }],
        },
        authoritativeGroundingPolicy: 'workspace_query',
        request,
      }),
    ).rejects.toMatchObject({ code: 'TURN_SPEC_V3_INVALID' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('同领域待确认产物被误判为独立创建时强制复核为范围替换', async () => {
    const goals = [
      {
        id: 'materials',
        capabilityId: 'note.query',
        operation: 'read',
        description: '查询今天的笔记材料',
        targetDescription: '今天的全部笔记',
        dependsOn: [],
        referentSelectors: [],
      },
      {
        id: 'draft',
        capabilityId: 'note.create',
        operation: 'create',
        description: '按新范围生成笔记草稿',
        targetDescription: '待确认笔记草稿',
        dependsOn: ['materials'],
        referentSelectors: [{ source: 'pending_artifact', types: ['note'], ordinal: null }],
      },
    ];
    const independent = {
      ...validSpec,
      requestKind: 'create_artifact',
      continuationMode: 'independent',
      goals,
    };
    const replacement = {
      ...independent,
      continuationMode: 'scope_replacement',
    };
    const request = vi.fn().mockResolvedValueOnce(response(independent)).mockResolvedValueOnce(response(replacement));

    const result = await compileAgentTurnSpecV3({
      message: '只按本轮指定的新范围重新生成',
      catalog: artifactCatalog,
      discourseProjection: {
        pendingArtifact: { available: true, domain: 'note', state: 'pending' },
      },
      contextSummary: { hasPendingArtifact: true },
      authoritativeGroundingPolicy: 'workspace_query',
      request,
    });

    expect(result).toMatchObject({ attempts: 2, turnSpec: { continuationMode: 'scope_replacement' } });
    expect(request.mock.calls[1][0][0].content).toContain('同领域待确认产物');
  });
});
