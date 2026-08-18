import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgentReplayCase } from '../evaluation/ai-assistant/agentReplayAdapter.js';
import { AGENT_REPLAY_CASES } from '../evaluation/ai-assistant/agentReplayCases.js';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requestAi: vi.fn(),
  requestAiStream: vi.fn(),
  toolExecute: vi.fn(),
  reserve: vi.fn(),
  reconcile: vi.fn(),
  getOrCreateSession: vi.fn(),
  recordTurn: vi.fn(),
  resolveAttachments: vi.fn(),
  resolveAiMemoryIdentity: vi.fn(),
  getActiveAiMemoriesForPrompt: vi.fn(),
  createAiMemoryCandidate: vi.fn(),
  selectAgentTools: vi.fn(),
  matchAgentWriteActionToolNames: vi.fn(() => []),
  createToolConfirmation: vi.fn(),
  publicToolConfirmation: vi.fn(),
  inspectToolConfirmationExecution: vi.fn(),
  recordPendingActionBatch: vi.fn(),
  recordPendingActionBatchById: vi.fn(),
  resolveSessionActionRetry: vi.fn(() => ({ state: 'none' })),
  settleSessionAction: vi.fn(),
  createActionContinuation: vi.fn(),
  finalizeActionContinuation: vi.fn(),
  discardActionContinuation: vi.fn(),
  inspectActionContinuation: vi.fn(),
  claimActionContinuation: vi.fn(),
  settleActionContinuation: vi.fn(),
  releaseActionContinuation: vi.fn(),
  shouldContinueToolPlanning: vi.fn(() => false),
  prepareTodoStatus: vi.fn(),
  prepareTodoDeletion: vi.fn(),
  buildNoteAiPayload: vi.fn(),
  findOwnedNoteForAi: vi.fn(),
  findOwnedTodoForAi: vi.fn(),
  resolveNoteDraftScopeMaterials: vi.fn(),
  looksLikeLeakedToolCall: vi.fn(() => false),
  parseLeakedToolCalls: vi.fn(() => []),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../util/agent/aiGateway.js', () => ({
  requestAi: mocks.requestAi,
  requestAiStream: mocks.requestAiStream,
}));
vi.mock('../util/agent/deepseekClient.js', () => ({
  getActiveProviderInfo: vi.fn(() => ({ provider: 'test', model: 'test-model', price: { input: 0, output: 0 } })),
  looksLikeLeakedToolCall: mocks.looksLikeLeakedToolCall,
  parseLeakedToolCalls: mocks.parseLeakedToolCalls,
}));
vi.mock('../util/agent/prompt.js', () => ({ buildPlannerPrompt: vi.fn(() => 'system') }));
vi.mock('../util/agent/toolRouter.js', () => ({
  matchAgentWriteActionToolNames: mocks.matchAgentWriteActionToolNames,
  selectAgentTools: mocks.selectAgentTools,
}));
vi.mock('../util/agent/secondRound.js', () => ({
  DEPENDENCY_REPAIR_ROUND_INSTRUCTION: '[INTERNAL_AGENT_DEPENDENCY_REPAIR_ROUND]',
  DEPENDENCY_ROUND_INSTRUCTION: '[INTERNAL_AGENT_DEPENDENCY_ROUND]',
  FOLLOW_UP_ROUND_INSTRUCTION: '[INTERNAL_AGENT_RECOVERY_ROUND]',
  PLAN_COMPLETION_ROUND_INSTRUCTION: '[INTERNAL_AGENT_PLAN_COMPLETION_ROUND]',
  SEMANTIC_REPAIR_ROUND_INSTRUCTION: '[INTERNAL_AGENT_SEMANTIC_REPAIR_ROUND]',
  isInternalPlanningInstruction: vi.fn((content) => String(content || '').includes('[INTERNAL_AGENT_')),
  shouldContinueToolPlanning: mocks.shouldContinueToolPlanning,
}));
vi.mock('../util/agent/sessionStore.js', () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  recordPendingActionBatch: mocks.recordPendingActionBatch,
  recordPendingActionBatchById: mocks.recordPendingActionBatchById,
  recordTurn: mocks.recordTurn,
  resolveSessionActionRetry: mocks.resolveSessionActionRetry,
  settleSessionAction: mocks.settleSessionAction,
  getSessionId: (session) => session.id,
}));
vi.mock('../util/aiQuota.js', () => ({
  reserve: mocks.reserve,
  reconcile: mocks.reconcile,
  resolveFingerprint: vi.fn((req) => String(req?.headers?.fingerprint || req?.ip || 'test')),
}));
vi.mock('../util/aiDocument/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveDocumentAttachments: mocks.resolveAttachments,
}));
vi.mock('../util/aiMemoryService.js', () => ({
  resolveAiMemoryIdentity: mocks.resolveAiMemoryIdentity,
  getActiveAiMemoriesForPrompt: mocks.getActiveAiMemoriesForPrompt,
  createAiMemoryCandidate: mocks.createAiMemoryCandidate,
}));
vi.mock('../util/noteAiService.js', () => ({
  buildNoteAiPayload: mocks.buildNoteAiPayload,
  findOwnedNoteForAi: mocks.findOwnedNoteForAi,
}));
vi.mock('../util/services/todoService.js', () => ({ findOwnedTodoForAi: mocks.findOwnedTodoForAi }));
vi.mock('../util/agent/noteDraftScopeMaterials.js', () => ({
  resolveNoteDraftScopeMaterials: mocks.resolveNoteDraftScopeMaterials,
}));
vi.mock('../util/agent/followUpSuggestions.js', () => ({
  getFollowUpSuggestions: vi.fn(),
  shouldOfferFollowUps: vi.fn(() => false),
  storeFollowUpContext: vi.fn(() => false),
}));
vi.mock('../util/agent/tools/index.js', () => ({
  default: [
    {
      name: 'query_demo',
      description: '查询演示数据',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' } },
      },
      requireRoot: false,
      timeoutMs: 1000,
      execute: mocks.toolExecute,
      getDependencyRefs: (raw) => raw.dependencyRefs || [],
      toArtifacts: (raw) => (raw.artifact ? [raw.artifact] : []),
      transform: (raw) => `结果:${raw.value}`,
      summarize: (raw) => `结果:${raw.value}`,
    },
    {
      name: 'query_detail',
      description: '查询演示详情',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      requireRoot: false,
      timeoutMs: 1000,
      dependencyBindings: [{ argument: 'id', refType: 'detail' }],
      execute: mocks.toolExecute,
      getDependencyRefs: (raw) => raw.dependencyRefs || [],
      transform: (raw) => `详情:${raw.value}`,
      summarize: (raw) => `详情:${raw.value}`,
    },
    {
      name: 'query_notes',
      description: '按关键词与时间范围查询笔记',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          timeRange: { type: 'string' },
          limit: { type: 'integer' },
        },
      },
      requireRoot: false,
      timeoutMs: 1000,
      execute: mocks.toolExecute,
      getDependencyRefs: (raw) => raw.dependencyRefs || [],
      transform: (raw) => `笔记查询:${raw.value}`,
      summarize: (raw) => `笔记查询:${raw.value}`,
    },
    {
      name: 'read_url',
      description: '读取用户明确提供的网页链接',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
      requireRoot: false,
      timeoutMs: 1000,
      execute: mocks.toolExecute,
      transform: (raw) => `网页:${raw.value}`,
      summarize: (raw) => `网页:${raw.value}`,
    },
    {
      name: 'set_todo_status',
      description: '修改一条待办状态',
      parameters: {
        type: 'object',
        properties: {
          todoId: { type: 'string' },
          keyword: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'completed'] },
        },
        required: ['status'],
      },
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      confirmationPolicy: 'always',
      dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
      prepareArgs: mocks.prepareTodoStatus,
      execute: vi.fn(),
      transform: () => '待办状态已更新。',
      summarize: () => '待办状态已更新。',
      preview: (args) => ({ title: '完成待办', target: args.targetTitle, impact: '确认后才会写入。' }),
    },
    {
      name: 'delete_todo',
      description: '删除一条待办',
      parameters: {
        type: 'object',
        properties: {
          todoId: { type: 'string' },
          keyword: { type: 'string' },
          scope: { type: 'string', enum: ['current', 'future', 'series'] },
        },
      },
      isWrite: true,
      directAction: true,
      riskLevel: 'medium',
      confirmationPolicy: 'always',
      dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
      prepareArgs: mocks.prepareTodoDeletion,
      execute: vi.fn(),
      transform: () => '待办已移入回收站。',
      summarize: () => '待办已移入回收站。',
      preview: (args) => ({ title: '删除待办', target: args.targetTitle, impact: '确认后才会删除。' }),
    },
    {
      name: 'create_todo',
      description: '创建一条待办',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          dueAt: { type: 'string' },
          priority: { type: 'integer', enum: [0, 1, 2] },
        },
        required: ['title'],
      },
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      confirmationPolicy: 'default',
      execute: vi.fn(),
      transform: (raw) => `✅ 待办「${raw?.title || '新待办'}」已创建。`,
      summarize: () => '待办已创建',
      preview: (args) => ({
        title: '创建待办',
        target: args.title,
        impact: args.dueAt ? `确认后将创建一条截止于 ${args.dueAt} 的待办。` : '确认后将创建一条待办。',
      }),
    },
    {
      name: 'create_note',
      description: '创建一篇笔记',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          parentId: { type: 'string', maxLength: 255 },
        },
        required: ['title'],
      },
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      confirmationPolicy: 'default',
      execute: vi.fn(),
      transform: () => '笔记已创建。',
      summarize: () => '笔记已创建。',
      preview: (args) => ({
        title: '创建笔记',
        target: args.title,
        impact: '确认后才会创建。',
        details: [{ key: 'targetDirectory', value: args.parentId ? '轻笺项目' : '' }],
      }),
    },
  ],
}));
vi.mock('../util/agent/confirmationStore.js', () => {
  class ToolConfirmationError extends Error {}
  return {
    acquireToolConfirmationAction: vi.fn(),
    claimToolConfirmationExecution: vi.fn(),
    createToolConfirmation: mocks.createToolConfirmation,
    finalizeToolConfirmationAction: vi.fn(),
    inspectToolConfirmationExecution: mocks.inspectToolConfirmationExecution,
    publicToolConfirmation: mocks.publicToolConfirmation,
    rejectToolConfirmation: vi.fn(),
    settleToolConfirmationExecution: vi.fn(),
    ToolConfirmationError,
  };
});
vi.mock('../util/agent/interactionStore.js', () => {
  class AgentInteractionError extends Error {}
  return {
    claimAgentInteractionResponse: vi.fn(),
    inspectAgentInteractionResponse: vi.fn(),
    settleAgentInteractionResponse: vi.fn(),
    AgentInteractionError,
  };
});
vi.mock('../util/agent/interactionResolvers.js', () => ({
  createToolResolutionInteraction: vi.fn(),
  resolveAgentInteractionAction: vi.fn(),
}));
vi.mock('../util/agent/actionContinuationStore.js', () => {
  class ActionContinuationError extends Error {
    constructor(code, message, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    ActionContinuationError,
    claimActionContinuation: mocks.claimActionContinuation,
    completeActionContinuation: vi.fn(),
    createActionContinuation: mocks.createActionContinuation,
    discardActionContinuation: mocks.discardActionContinuation,
    finalizeActionContinuation: mocks.finalizeActionContinuation,
    inspectActionContinuation: mocks.inspectActionContinuation,
    rebindActionContinuation: vi.fn(),
    releaseActionContinuation: mocks.releaseActionContinuation,
    settleActionContinuation: mocks.settleActionContinuation,
  };
});

const { agentChat } = await import('./agentHandle.js');

function usage(totalTokens = 0) {
  return { promptTokens: totalTokens, completionTokens: 0, totalTokens };
}

function semanticPlanCall({
  requestClass,
  confidence = 'high',
  intents = [],
  needsClarification = false,
  clarificationQuestion = '',
  toolCalls = [],
} = {}) {
  return {
    id: 'semantic-plan-1',
    type: 'function',
    function: {
      name: 'submit_agent_plan',
      arguments: JSON.stringify({
        version: '1.0',
        requestClass,
        confidence,
        intents,
        needsClarification,
        clarificationQuestion,
        toolCalls,
      }),
    },
  };
}

function toolCall(name, args, id = `call-${name}`) {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

/**
 * 笔记入口的受约束语义分类响应。
 *
 * 传感器命中的请求会先花一次分类判断本轮是否要产出一篇笔记，因此这些用例的
 * Provider 序列第一项固定是它，草稿协议从第二项开始。
 */
function noteDraftTaskResponse({ producesNote = true, otherMutations = false, needsWorkspaceRetrieval = false } = {}) {
  return {
    content: '',
    toolCalls: [toolCall('classify_note_draft_task', { producesNote, otherMutations, needsWorkspaceRetrieval })],
    usage: usage(2),
    usageStatus: 'reported',
    finishReason: 'tool_calls',
  };
}

function request(body) {
  return {
    body,
    user: { id: 'user-1', role: 'user', alias: '用户' },
    headers: { fingerprint: 'device-1' },
    ip: '127.0.0.1',
    setTimeout: vi.fn(),
  };
}

function response() {
  const listeners = new Map();
  const res = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead: vi.fn(function () {
      this.headersSent = true;
    }),
    write: vi.fn(),
    end: vi.fn(function () {
      this.writableEnded = true;
    }),
    status: vi.fn(function () {
      return this;
    }),
    send: vi.fn(function () {
      this.writableEnded = true;
      return this;
    }),
    on: vi.fn((event, listener) => listeners.set(event, listener)),
    removeListener: vi.fn((event) => listeners.delete(event)),
  };
  return res;
}

function sseEvents(res) {
  return res.write.mock.calls
    .map(([chunk]) => String(chunk))
    .filter((chunk) => chunk.startsWith('data: {'))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

describe('agentChat 主链路', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.reserve.mockResolvedValue({
      exempt: false,
      blocked: false,
      type: 'user',
      key: 'user-1',
      pk: '20260719',
      reserved: 5000,
      quota: 100_000,
      used: 0,
    });
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getOrCreateSession.mockResolvedValue({ id: 'session-1', turns: [], lastTool: null });
    mocks.toolExecute.mockResolvedValue({ value: 'ok' });
    mocks.requestAi.mockImplementation(async (_messages, options = {}) => {
      if (options?.trace?.stage === 'planner') {
        return {
          content: '',
          toolCalls: [
            semanticPlanCall({
              requestClass: 'conversation',
              intents: [],
            }),
          ],
          usage: usage(1),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      return {
        content: 'DIRECT_REPLY',
        toolCalls: [],
        usage: usage(1),
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    mocks.resolveAttachments.mockResolvedValue({
      text: '',
      sources: [],
      coverage: { documents: [], overall: { documentCount: 0, complete: true } },
    });
    mocks.resolveAiMemoryIdentity.mockReturnValue({
      actorUserId: 'user-1',
      subjectUserId: 'user-1',
      actorRole: 'user',
      subjectRole: 'user',
      adminContextId: null,
      adminContextMode: 'normal',
    });
    mocks.getActiveAiMemoriesForPrompt.mockResolvedValue([]);
    mocks.createAiMemoryCandidate.mockResolvedValue({ id: 'memory-1', status: 'candidate' });
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('query_demo')].filter(Boolean));
    mocks.matchAgentWriteActionToolNames.mockReturnValue([]);
    mocks.resolveSessionActionRetry.mockReturnValue({ state: 'none' });
    mocks.shouldContinueToolPlanning.mockReturnValue(false);
    mocks.looksLikeLeakedToolCall.mockReturnValue(false);
    mocks.parseLeakedToolCalls.mockReturnValue([]);
    mocks.createToolConfirmation.mockImplementation(async (input) => ({
      token: 'confirmation-token-1',
      confirmation: { ...input, id: 'confirmation-1' },
      expiresIn: 300,
    }));
    mocks.publicToolConfirmation.mockImplementation((token, confirmation, expiresIn) => {
      const { privateContext: _privateContext, ...publicConfirmation } = confirmation || {};
      return { ...publicConfirmation, token, expiresIn };
    });
    mocks.inspectToolConfirmationExecution.mockReset();
    mocks.prepareTodoStatus.mockImplementation(async (args) => {
      if (!args.keyword && !args.todoId) {
        const error = new Error('请提供待办 ID 或足够具体的标题。');
        error.code = 'TODO_TARGET_REQUIRED';
        throw error;
      }
      return {
        ...args,
        expectedVersion: 'todo-version-1',
        targetTitle: args.keyword || args.todoId,
      };
    });
    mocks.prepareTodoDeletion.mockImplementation(async (args) => {
      if (!args.keyword && !args.todoId) {
        const error = new Error('请提供待办 ID 或足够具体的标题。');
        error.code = 'TODO_TARGET_REQUIRED';
        throw error;
      }
      return {
        ...args,
        scope: args.scope || 'current',
        expectedVersion: 'todo-delete-version-1',
        targetTitle: args.keyword || args.todoId,
      };
    });
    mocks.findOwnedNoteForAi.mockResolvedValue(null);
    mocks.buildNoteAiPayload.mockImplementation(async ({ note }) => ({ content: String(note?.content || '') }));
    mocks.findOwnedTodoForAi.mockResolvedValue(null);
    mocks.resolveNoteDraftScopeMaterials.mockResolvedValue({
      materials: [{ type: 'note', id: 'branch-root', title: '轻笺项目', content: '目录范围内的项目正文。' }],
      entityRefs: [{ type: 'note', id: 'branch-root', title: '轻笺项目' }],
      matchedPageCount: 1,
      totalPages: 1,
    });
  });

  it('卡片续答允许空消息内部触发，只读取服务端成功回执且不重新开放 Planner 或工具', async () => {
    const continuation = {
      state: 'ready',
      snapshot: {
        question: '创建一条检查方案的待办，并给我两条执行建议',
        locale: 'zh-CN',
        tools: [{ name: 'create_todo', status: 'confirmation_required', summary: '等待确认' }],
      },
      outcome: {
        receipt: {
          actionId: 'confirmation-1',
          toolName: 'create_todo',
          status: 'succeeded',
          summary: '待办“检查方案”已创建',
        },
      },
    };
    mocks.inspectActionContinuation.mockResolvedValue({ state: 'ready', continuation });
    mocks.claimActionContinuation.mockResolvedValue({ ...continuation, state: 'running' });
    mocks.settleActionContinuation.mockResolvedValue({ ...continuation, state: 'settled' });
    mocks.requestAi.mockResolvedValueOnce({
      content: '建议先明确检查范围，再按影响程度排序。',
      toolCalls: [],
      usage: usage(12),
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const res = response();

    await agentChat(
      request({
        message: '',
        trigger: 'card_continuation',
        continuationToken: 'continuation-token',
        clientCapabilities: ['agent_continuation_v1'],
        sessionId: 'session-1',
        stream: false,
        contexts: [],
        scopeRefs: [],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.inspectActionContinuation).toHaveBeenCalledWith(
      'continuation-token',
      expect.stringMatching(/^user:/),
      'session-1',
    );
    expect(mocks.selectAgentTools).not.toHaveBeenCalled();
    expect(mocks.toolExecute).not.toHaveBeenCalled();
    expect(mocks.requestAi).toHaveBeenCalledTimes(1);
    expect(mocks.requestAi.mock.calls[0]?.[0]?.[0]?.content).toContain('禁止复述、改写或再次确认该操作结果');
    expect(mocks.settleActionContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'running' }),
      expect.objectContaining({ answer: '建议先明确检查范围，再按影响程度排序。' }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          response: '建议先明确检查范围，再按影响程度排序。',
          confirmations: [],
          interactions: [],
        }),
      }),
    );
  });

  it('高置信普通问答跳过 Planner，并完整发送新旧 SSE 生命周期事件', async () => {
    mocks.requestAiStream.mockImplementation(async (_messages, options) => {
      options.onDelta('你好，我在。');
      return {
        content: '你好，我在。',
        leakedToolCall: false,
        usage: usage(9),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const req = request({ message: '你好', stream: true, contexts: [], attachmentIds: [] });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).not.toHaveBeenCalled();
    expect(mocks.requestAiStream).toHaveBeenCalledOnce();
    const output = sseEvents(res);
    const names = output.map((event) => event.event);
    expect(names).toEqual(
      expect.arrayContaining(['response.started', 'start', 'stage.changed', 'delta', 'response.completed', 'done']),
    );
    expect(names.indexOf('response.started')).toBeLessThan(names.indexOf('start'));
    expect(names.indexOf('response.completed')).toBeLessThan(names.indexOf('done'));
    expect(output.map((event) => event.eventId)).toEqual(output.map((_, index) => index + 1));
    expect(output.every((event) => event.protocolVersion === '2.0')).toBe(true);
    const recoveryInsert = mocks.poolQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO ai_response_events'),
    );
    expect(recoveryInsert).toBeTruthy();
    const recoveryParams = recoveryInsert[1];
    const terminalPayload = JSON.parse(recoveryParams.at(-2));
    expect(terminalPayload.recoverySnapshot).toEqual(
      expect.objectContaining({ answer: '你好，我在。', status: 'completed', sessionId: 'session-1' }),
    );
    expect(mocks.recordTurn).toHaveBeenCalledWith(expect.anything(), '你好', '你好，我在。', []);
    const agentLogInsert = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO agent_logs'));
    expect(agentLogInsert[1][16]).toBe('你好');
    expect(agentLogInsert[1][16]).not.toContain('你好，我在。');
  });

  it('目录范围灰度关闭时在会话和额度创建前失败关闭', async () => {
    vi.stubEnv('AI_NOTE_BRANCH_SCOPE_ENABLED', 'false');
    const res = response();

    await agentChat(
      request({
        message: '总结这个目录里的内容',
        stream: false,
        contexts: [],
        scopeRefs: [{ type: 'note_branch', id: 'branch-root' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        msg: expect.stringContaining('暂未开放笔记目录范围'),
      }),
    );
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.requestAi).not.toHaveBeenCalled();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
  });

  it('完整目录分析灰度关闭时保留目录 allowlist，但降级为普通范围问答', async () => {
    vi.stubEnv('AI_NOTE_BRANCH_ANALYSIS_ENABLED', 'false');
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, parent_id, title')) {
        return [
          [
            {
              id: 'branch-root',
              parent_id: null,
              title: '轻笺项目',
              sort: 0,
              is_top: 0,
              del_flag: 0,
              update_time: '2026-08-06 12:00:00',
            },
          ],
        ];
      }
      return [[]];
    });
    const res = response();

    await agentChat(
      request({
        message: '完整分析这个目录里的所有页面、重复和待办',
        stream: false,
        contexts: [],
        scopeRefs: [{ type: 'note_branch', id: 'branch-root' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ response: expect.any(String) }) }),
    );
    expect(
      mocks.requestAi.mock.calls.some(([, options]) =>
        options?.tools?.some((tool) => tool?.function?.name === 'classify_note_branch_analysis'),
      ),
    ).toBe(false);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE create_by = ? AND del_flag = 0'), [
      'user-1',
    ]);
  });

  it('完整目录分析只使用 owner 权威子树，并返回实际页面覆盖与来源', async () => {
    const treeRows = [
      {
        id: 'root',
        parent_id: null,
        title: '轻笺项目',
        sort: 0,
        is_top: 0,
        del_flag: 0,
        update_time: '2026-08-06 10:00:00',
      },
      {
        id: 'child',
        parent_id: 'root',
        title: '移动端设计',
        sort: 0,
        is_top: 0,
        del_flag: 0,
        update_time: '2026-08-06 11:00:00',
      },
    ];
    const noteRows = [
      {
        id: 'root',
        title: '轻笺项目',
        content: '# 项目\n总体设计',
        type: 'markdown',
        update_time: '2026-08-06 10:00:00',
      },
      {
        id: 'child',
        title: '移动端设计',
        content: '# 移动端\n使用底部目录抽屉',
        type: 'markdown',
        update_time: '2026-08-06 11:00:00',
      },
    ];
    mocks.poolQuery.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT id, parent_id, title')) return [treeRows];
      if (text.includes("IF(type = 'drawing', '', content) AS content")) return [noteRows];
      return [[]];
    });
    mocks.requestAi.mockImplementation(async (messages, options = {}) => {
      const toolName = options.tools?.[0]?.function?.name;
      if (toolName === 'classify_note_branch_analysis') {
        return {
          content: '',
          toolCalls: [toolCall(toolName, { decision: 'full_branch_analysis' })],
          usage: usage(2),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      if (toolName === 'submit_note_branch_page_summaries') {
        const payload = JSON.parse(messages[1].content);
        return {
          content: '',
          toolCalls: [
            toolCall(toolName, {
              pages: payload.pageUnits.map((unit) => ({
                unitId: unit.unitId,
                pageId: unit.pageId,
                summary: `${unit.title} 摘要`,
                themes: ['页面树'],
                decisions: [],
                todos: [],
                risks: [],
              })),
            }),
          ],
          usage: usage(3),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      if (toolName === 'submit_note_branch_analysis') {
        return {
          content: '',
          toolCalls: [toolCall(toolName, { answer: '## 主要主题\n页面树与移动端目录抽屉。' })],
          usage: usage(4),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      throw new Error(`unexpected tool ${toolName || 'none'}`);
    });
    const res = response();

    await agentChat(
      request({
        message: '总结这里所有模块、重复决策和未完成事项',
        stream: false,
        contexts: [],
        scopeRefs: [{ type: 'note_branch', id: 'root', title: '客户端标题不可信' }],
        attachmentIds: [],
      }),
      res,
    );

    const payload = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(payload.response).toContain('分析范围：轻笺项目');
    expect(payload.response).toContain('页面总数：2 · 已完整覆盖：2 · 未读取：0');
    expect(payload.sources.map((source) => source.id)).toEqual(['root', 'child']);
    expect(payload.coverage.noteBranches).toEqual([
      expect.objectContaining({
        rootId: 'root',
        title: '轻笺项目',
        totalPages: 2,
        analyzedPages: 2,
        unreadPages: 0,
        completeAnalysis: true,
      }),
    ]);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE create_by = ? AND del_flag = 0'), [
      'user-1',
    ]);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining('id IN (?, ?)'), ['user-1', 'root', 'child']);
    expect(mocks.recordTurn).toHaveBeenCalledWith(
      expect.anything(),
      '总结这里所有模块、重复决策和未完成事项',
      expect.stringContaining('已完整覆盖：2'),
      [expect.objectContaining({ name: 'note_branch_analysis', status: 'success' })],
    );
    expect(mocks.requestAi.mock.calls.some(([, options]) => options?.trace?.stage === 'planner')).toBe(false);
  });

  it('有效草稿候选不会劫持语义上独立的新问题', async () => {
    const confirmationToken = 'p'.repeat(43);
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({
      state: 'ready',
      confirmation: {
        id: 'pending-note-1',
        sessionId: 'session-1',
        toolName: 'create_note',
        args: { title: '旧草稿', content: '旧正文' },
        privateContext: {
          kind: 'note_draft_materials',
          version: 1,
          sourceMessage: '根据材料生成一篇笔记',
          contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }],
          attachmentIds: [],
        },
      },
    });
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('classify_pending_note_draft_intent', {
          decision: 'separate_request',
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    mocks.requestAiStream.mockImplementation(async (_messages, options) => {
      options.onDelta('你好，我在。');
      return {
        content: '你好，我在。',
        leakedToolCall: false,
        usage: usage(9),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const res = response();

    await agentChat(
      request({
        message: '你好',
        stream: true,
        contexts: [],
        attachmentIds: [],
        pendingNoteDraft: {
          confirmationId: 'pending-note-1',
          confirmationToken,
        },
      }),
      res,
    );

    expect(mocks.requestAi).toHaveBeenCalledOnce();
    expect(mocks.requestAiStream).toHaveBeenCalledOnce();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(mocks.settleSessionAction).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'response.completed')?.answer).toBe('你好，我在。');
  });

  it('能力总览由服务端按实际工具确定性生成，不再交给模型自由扩写', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('create_note'), registry.get('set_todo_status')].filter(Boolean),
    );
    const res = response();

    await agentChat(request({ message: '你支持哪些工具？', stream: false, contexts: [], attachmentIds: [] }), res);

    expect(mocks.requestAi).not.toHaveBeenCalled();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('所有数据变更都会先展示确认');
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('暂不能直接编辑或删除已有笔记/书签');
  });

  it('网页总结缺少链接时由服务端直接澄清，不进入随机语义规划', async () => {
    const res = response();

    await agentChat(
      request({
        message: '帮我总结一个网页（粘贴链接）',
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.requestAi).not.toHaveBeenCalled();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toBe('请粘贴需要读取或总结的网页链接。');
  });

  it('关闭广泛联网时仍向显式 URL 请求开放只读网页工具', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('read_url')].filter(Boolean));
    mocks.requestAi.mockImplementation(async (_messages, options = {}) => {
      if (options?.trace?.stage === 'planner') {
        return {
          content: '',
          toolCalls: [
            semanticPlanCall({
              requestClass: 'data_query',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.read_url',
                  goal: '读取用户提供的网页',
                  targetDescription: 'https://uuye.163.com',
                  dependsOn: [],
                },
              ],
              toolCalls: [{ toolName: 'read_url', arguments: { url: 'https://uuye.163.com' } }],
            }),
          ],
          usage: usage(1),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      return {
        content: '这是网页摘要。',
        toolCalls: [],
        usage: usage(1),
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const res = response();

    await agentChat(
      request({
        message: 'https://uuye.163.com这个链接是干嘛的？',
        stream: false,
        contexts: [],
        attachmentIds: [],
        scope: { mode: 'selected', externalWeb: false },
      }),
      res,
    );

    expect(mocks.toolExecute).toHaveBeenCalledWith(
      { url: 'https://uuye.163.com' },
      expect.objectContaining({ question: 'https://uuye.163.com这个链接是干嘛的？' }),
    );
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toBe('这是网页摘要。');
  });

  it('书签生成笔记走统一材料草稿协议，不再进入通用 Semantic Planner', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-1',
              title: 'TypeORM 官方文档',
              url: 'https://typeorm.io',
              snapshot_content: 'TypeORM 是一个 ORM。'.repeat(80),
              description: 'TypeORM 官方文档',
              content: 'TypeORM 是一个 ORM。'.repeat(80),
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: 'TypeORM 使用笔记',
          content: `# TypeORM\n\n${'整理后的正文。'.repeat(80)}`,
        }),
      ],
      usage: usage(30),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '请分析这个书签的内容，生成一篇笔记。',
        stream: false,
        contexts: [{ type: 'bookmark', id: 'bookmark-1' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.selectAgentTools).not.toHaveBeenCalled();
    expect(mocks.toolExecute).not.toHaveBeenCalled();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[0][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'classify_note_draft_task' } },
    });
    expect(mocks.requestAi.mock.calls[1][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'submit_note_draft' } },
    });
    expect(mocks.requestAi.mock.calls[1][0][1].content).not.toContain('类型：用户粘贴文本');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_note',
        args: expect.objectContaining({ title: 'TypeORM 使用笔记' }),
      }),
    );
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringContaining('笔记草稿已准备好'),
      confirmations: [expect.objectContaining({ toolName: 'create_note' })],
      entityRefs: [{ type: 'bookmark', id: 'bookmark-1', title: 'TypeORM 官方文档' }],
    });
  });

  it('隐式描述工作区材料时先按语义查询真实笔记，再在依赖轮生成新笔记', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_notes'), registry.get('create_note')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValueOnce({
      value: '《上午记录》正文甲；《下午记录》正文乙',
      dependencyRefs: [
        { type: 'note', id: 'today-note-1' },
        { type: 'note', id: 'today-note-2' },
      ],
    });
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ needsWorkspaceRetrieval: true }))
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_notes',
                goal: '读取用户描述范围内的真实笔记',
                targetDescription: '用户今天创建的笔记',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '基于查询结果生成一篇总结笔记',
                targetDescription: '新的总结笔记',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_notes', arguments: { timeRange: '今天', limit: 50 } }],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '根据已经返回的真实笔记生成总结',
                targetDescription: '新的总结笔记',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'create_note',
                arguments: {
                  title: '今日笔记总结',
                  content: '# 今日笔记总结\n\n- 上午记录：正文甲\n- 下午记录：正文乙',
                },
              },
            ],
          }),
        ],
        usage: usage(10),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '总结一下我今天的笔记，生成一篇新的笔记',
        stream: false,
        contexts: [],
        attachmentIds: [],
        scope: { mode: 'workspace' },
      }),
      res,
    );

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.requestAi.mock.calls[0][1].trace.stage).toBe('note_draft_task');
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('planner');
    expect(mocks.requestAi.mock.calls[2][1].trace.stage).toBe('planner_round_2');
    expect(mocks.toolExecute).toHaveBeenCalledWith(
      { timeRange: '今天', limit: 50 },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_note',
        args: {
          title: '今日笔记总结',
          content: '# 今日笔记总结\n\n- 上午记录：正文甲\n- 下午记录：正文乙',
        },
      }),
    );
    expect(mocks.requestAi.mock.calls[2][0].some((entry) => String(entry.content || '').includes('正文甲'))).toBe(true);
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      confirmations: [expect.objectContaining({ toolName: 'create_note' })],
    });
  });

  it('隐式笔记任务连续漏掉完整语义计划时，收窄为只读材料查询后仍能生成草稿', async () => {
    // 模拟生产语义模式先暴露全部可用工具，主链必须根据前置语义分类主动收窄。
    mocks.selectAgentTools.mockImplementation((registry) => [...registry.values()]);
    mocks.toolExecute.mockResolvedValueOnce({
      value: '《晨间记录》完成了发布检查；《午后记录》整理了客户反馈',
      dependencyRefs: [
        { type: 'note', id: 'today-note-1' },
        { type: 'note', id: 'today-note-2' },
      ],
    });
    const missingPlanResponse = () => ({
      content: '未返回结构化计划',
      toolCalls: [],
      usage: usage(2),
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ needsWorkspaceRetrieval: true }))
      // 即使模型只返回一个可执行的查询计划，也不能把“查到了”冒充“已生成新笔记”；
      // 同时下方会断言任务范围外的 unavailable capability 已从目录移除。
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_notes',
                goal: '只查询今天的笔记但漏掉创建步骤',
                targetDescription: '今天的笔记',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_notes', arguments: { timeRange: '今天', limit: 50 } }],
          }),
        ],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce(missingPlanResponse())
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [toolCall('query_notes', { timeRange: '今天', limit: 50 }, 'recovered-query-notes')],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '根据前置真实笔记生成日记',
                targetDescription: '今天的新日记',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'create_note',
                arguments: {
                  title: '今天的日记',
                  content: '# 今天的日记\n\n完成了发布检查，并整理了客户反馈。',
                },
              },
            ],
          }),
        ],
        usage: usage(8),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '请总结一下我们今天的全部笔记，生成一篇新的日记',
        stream: false,
        contexts: [],
        attachmentIds: [],
        scope: { mode: 'workspace' },
      }),
      res,
    );

    expect(mocks.requestAi).toHaveBeenCalledTimes(5);
    const plannerToolVariants =
      mocks.requestAi.mock.calls[1][1].tools[0].function.parameters.properties.toolCalls.items.oneOf;
    expect(plannerToolVariants.map((variant) => variant.properties.toolName.enum[0]).sort()).toEqual([
      'create_note',
      'query_notes',
    ]);
    const plannerCapabilityIds =
      mocks.requestAi.mock.calls[1][1].tools[0].function.parameters.properties.intents.items.properties.capabilityId
        .enum;
    expect(plannerCapabilityIds.sort()).toEqual(['note.create', 'read.query_notes', 'unknown']);
    expect(mocks.requestAi.mock.calls[3][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'query_notes' } },
      trace: expect.objectContaining({ stage: 'planner_note_material_recovery' }),
    });
    expect(mocks.requestAi.mock.calls[3][0].at(-1).content).toContain('[INTERNAL_NOTE_DRAFT_MATERIAL_RECOVERY]');
    expect(mocks.toolExecute).toHaveBeenCalledWith(
      { timeRange: '今天', limit: 50 },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_note',
        args: {
          title: '今天的日记',
          content: '# 今天的日记\n\n完成了发布检查，并整理了客户反馈。',
        },
      }),
    );
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).not.toContain('没有返回可核验的语义计划');
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).not.toContain('当前账号或访问模式不能使用');
  });

  it('隐式工作区查询为空时即使模型仍请求创建，也由服务端阻止占位笔记', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_notes'), registry.get('create_note')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValueOnce({ value: '没有找到笔记', dependencyRefs: [] });
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ needsWorkspaceRetrieval: true }))
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_notes',
                goal: '查询目标笔记',
                targetDescription: '用户描述的笔记集合',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '生成总结笔记',
                targetDescription: '新的总结笔记',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_notes', arguments: { timeRange: '今天' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '生成总结笔记',
                targetDescription: '新的总结笔记',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'create_note',
                arguments: { title: '今日笔记总结', content: '当前没有可总结的材料。' },
              },
            ],
          }),
        ],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '把我今天记录的内容归纳成一篇新文档',
        stream: false,
        contexts: [],
        attachmentIds: [],
        scope: { mode: 'workspace' },
      }),
      res,
    );

    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringContaining('没有从工作区查询到可用于生成笔记的真实材料'),
      confirmations: [],
    });
  });

  it('单一目录范围生成笔记时，确认卡默认写入该目录并显示目标目录', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, parent_id, title')) {
        return [
          [
            {
              id: 'branch-root',
              parent_id: null,
              title: '轻笺项目',
              sort: 0,
              is_top: 0,
              del_flag: 0,
              update_time: '2026-08-06 12:00:00',
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: '轻笺项目整理',
          content: `# 轻笺项目\n\n${'目录整理正文。'.repeat(80)}`,
        }),
      ],
      usage: usage(30),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '在这个目录里生成一篇新的项目整理笔记。',
        stream: false,
        contexts: [],
        scopeRefs: [{ type: 'note_branch', id: 'branch-root', title: '客户端标题不可信' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_note',
        args: expect.objectContaining({
          title: '轻笺项目整理',
          parentId: 'branch-root',
        }),
        preview: expect.objectContaining({
          details: [{ key: 'targetDirectory', value: '轻笺项目' }],
        }),
        privateContext: expect.objectContaining({
          scopeRefs: [{ type: 'note_branch', id: 'branch-root' }],
        }),
      }),
    );
    expect(mocks.resolveNoteDraftScopeMaterials).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        resolvedScopes: expect.objectContaining({ noteIds: ['branch-root'] }),
      }),
    );
    const draftPrompt = mocks.requestAi.mock.calls.at(-1)?.[0]?.[1]?.content || '';
    expect(draftPrompt).toContain('目录范围内的项目正文');
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      confirmations: [
        expect.objectContaining({
          toolName: 'create_note',
          args: expect.objectContaining({ parentId: 'branch-root' }),
          preview: expect.objectContaining({
            details: [{ key: 'targetDirectory', value: '轻笺项目' }],
          }),
        }),
      ],
    });
  });

  it('目录范围没有可靠检索命中时不把用户指令冒充材料生成笔记', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, parent_id, title')) {
        return [
          [
            {
              id: 'branch-root',
              parent_id: null,
              title: '空目录',
              sort: 0,
              is_top: 0,
              del_flag: 0,
              update_time: '2026-08-06 12:00:00',
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.resolveNoteDraftScopeMaterials.mockResolvedValueOnce({
      materials: [],
      entityRefs: [],
      matchedPageCount: 0,
      totalPages: 1,
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse());
    const res = response();

    await agentChat(
      request({
        message: '根据这个目录生成一篇项目笔记。',
        stream: false,
        contexts: [],
        scopeRefs: [{ type: 'note_branch', id: 'branch-root' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(mocks.requestAi).toHaveBeenCalledOnce();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('没有检索到');
  });

  it('只有书签且网页无快照、读取失败时明确提示补充材料，不凭标题和链接编造笔记', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-1',
              title: '受限网页',
              url: 'https://restricted.example/article',
              snapshot_content: '',
              description: '',
              content: 'https://restricted.example/article',
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse());
    mocks.toolExecute.mockResolvedValueOnce({ error: 'READ_FAILED', message: '网站拒绝读取' });
    const res = response();

    await agentChat(
      request({
        message: '请分析这个书签的内容，生成一篇笔记。',
        stream: false,
        contexts: [{ type: 'bookmark', id: 'bookmark-1' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    // 入口分类之后不得再有草稿生成调用：材料不可读时不能凭标题编造正文。
    expect(mocks.requestAi).toHaveBeenCalledOnce();
    expect(mocks.requestAi.mock.calls[0][1].trace.stage).toBe('note_draft_task');
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringContaining('没有返回足够的可读正文'),
      confirmations: [],
    });
  });

  it('书签读取失败但同轮还有可读文件时，继续使用其余可靠材料生成笔记', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-1',
              title: '受限网页',
              url: 'https://restricted.example/article',
              snapshot_content: '',
              description: '',
              content: 'https://restricted.example/article',
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.toolExecute.mockResolvedValueOnce({ error: 'READ_FAILED', message: '网站拒绝读取' });
    mocks.resolveAttachments.mockResolvedValueOnce({
      text: '\n\n[document:source-1:0]\n文件中的可靠正文。'.repeat(30),
      sources: [
        {
          type: 'document',
          id: 'source-1',
          documentId: 'source-1',
          fileId: 'file-1',
          title: '补充材料.pdf',
        },
      ],
      coverage: {
        documents: [{ sourceId: 'source-1', status: 'ready', selection: { included: { chars: 600 } } }],
        overall: { documentCount: 1, complete: true },
      },
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: '根据可读文件整理的笔记',
          content: `# 整理结果\n\n${'文件内容分析。'.repeat(80)}`,
        }),
      ],
      usage: usage(30),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '请综合这个书签和文件生成一篇笔记。',
        stream: false,
        contexts: [{ type: 'bookmark', id: 'bookmark-1' }],
        attachmentIds: ['source-1'],
      }),
      res,
    );

    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('文件中的可靠正文');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_note',
        privateContext: expect.objectContaining({ attachmentIds: ['source-1'] }),
      }),
    );
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringContaining('笔记草稿已准备好'),
      confirmations: [expect.objectContaining({ toolName: 'create_note' })],
    });
  });

  it('待确认草稿语境中的省略表达走语义判断，并用新确认原子替换旧确认', async () => {
    const oldToken = 'o'.repeat(43);
    const oldContent = '旧正文。'.repeat(80);
    mocks.poolQuery.mockImplementation(async (sql, params = []) => {
      if (String(sql).includes('SELECT id, parent_id, title')) {
        return [
          [
            {
              id: 'directory-stable',
              parent_id: null,
              title: '稳定目录',
              sort: 0,
              is_top: 0,
              del_flag: 0,
              update_time: '2026-08-06 12:00:00',
            },
          ],
        ];
      }
      if (String(sql).includes('FROM bookmark b')) {
        const requestedId = String(params[1] || '');
        if (requestedId === 'bookmark-evil') {
          return [
            [
              {
                id: 'bookmark-evil',
                title: '客户端伪造的新材料',
                url: 'https://evil.example',
                snapshot_content: '不应进入改写上下文。'.repeat(80),
                description: '',
                content: '不应进入改写上下文。'.repeat(80),
              },
            ],
          ];
        }
        return [
          [
            {
              id: 'bookmark-1',
              title: '示例书签',
              url: 'https://example.com',
              snapshot_content: '网页存档。'.repeat(80),
              description: '',
              content: '网页存档。'.repeat(80),
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({
      state: 'ready',
      confirmation: {
        id: 'old-confirmation',
        sessionId: 'session-1',
        toolName: 'create_note',
        args: { title: '旧标题', content: oldContent, parentId: 'directory-stable' },
        privateContext: {
          kind: 'note_draft_materials',
          version: 1,
          sourceMessage: '请根据这个书签生成笔记',
          contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }],
          scopeRefs: [{ type: 'note_branch', id: 'directory-stable' }],
          attachmentIds: [],
        },
      },
    });
    mocks.resolveNoteDraftScopeMaterials.mockResolvedValueOnce({
      materials: [{ type: 'note', id: 'directory-stable', title: '稳定目录', content: '目录内权威正文。' }],
      entityRefs: [{ type: 'note', id: 'directory-stable', title: '稳定目录' }],
      matchedPageCount: 1,
      totalPages: 1,
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [toolCall('classify_pending_note_draft_intent', { decision: 'revise_pending_draft' })],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          toolCall('submit_note_draft', {
            title: '扩写后的标题',
            content: `${oldContent}\n\n${'新增分析。'.repeat(80)}`,
          }),
        ],
        usage: usage(40),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '再试一下。',
        stream: true,
        sessionId: 'session-1',
        contexts: [{ type: 'bookmark', id: 'bookmark-evil' }],
        attachmentIds: [],
        pendingNoteDraft: {
          confirmationId: 'old-confirmation',
          confirmationToken: oldToken,
        },
      }),
      res,
    );

    expect(mocks.inspectToolConfirmationExecution).toHaveBeenCalledWith(oldToken, 'user:user-1', 'session-1');
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[0][0][0].content).toContain('整体含义、指代和最近对话');
    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('网页存档');
    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('目录内权威正文');
    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('再试一下');
    expect(mocks.requestAi.mock.calls[1][0][1].content).not.toContain('客户端伪造的新材料');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        replaceToken: oldToken,
        replaceConfirmationId: 'old-confirmation',
        args: expect.objectContaining({ title: '扩写后的标题', parentId: 'directory-stable' }),
        privateContext: expect.objectContaining({
          contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }],
          scopeRefs: [{ type: 'note_branch', id: 'directory-stable' }],
        }),
      }),
    );
    expect(mocks.resolveNoteDraftScopeMaterials).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        resolvedScopes: expect.objectContaining({ noteIds: ['directory-stable'] }),
      }),
    );
    expect(mocks.settleSessionAction).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationId: 'old-confirmation', state: 'cancelled' }),
    );
    expect(mocks.recordPendingActionBatch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.settleSessionAction.mock.invocationCallOrder[0],
    );
    const events = sseEvents(res);
    expect(events.some((event) => event.event === 'tool_confirmation_replaced')).toBe(true);
    expect(events.some((event) => event.event === 'tool_confirmation')).toBe(true);
    expect(events.find((event) => event.event === 'response.completed')?.entityRefs).toEqual([
      { type: 'bookmark', id: 'bookmark-1', title: '示例书签' },
      { type: 'note', id: 'directory-stable', title: '稳定目录' },
    ]);
  });

  it('翻译模式隔离历史与知识助手提示，只向模型发送待翻译文本', async () => {
    mocks.requestAiStream.mockImplementation(async (messages, options) => {
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual(
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('只输出译文'),
        }),
      );
      expect(messages[0].content).not.toContain('轻笺');
      expect(messages[1]).toEqual({ role: 'user', content: 'Maintainer' });
      options.onDelta('维护者');
      return {
        content: '维护者',
        leakedToolCall: false,
        usage: usage(6),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: 'Maintainer',
      stream: true,
      enableTranslation: true,
      translationConfig: { source: 'auto', target: 'zh' },
      history: [
        { role: 'user', content: '帮我查最近 7 天新增的笔记' },
        { role: 'assistant', content: '正在查询。' },
      ],
      contexts: [],
      attachmentIds: [],
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).not.toHaveBeenCalled();
    expect(mocks.selectAgentTools).not.toHaveBeenCalled();
    expect(mocks.resolveAttachments).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'delta')?.output?.text).toBe('维护者');
  });

  it('长期记忆已全局关闭:即便 memoryMode=active 也不读取、不注入 Prompt、不生成候选', async () => {
    mocks.getActiveAiMemoriesForPrompt.mockResolvedValue([
      {
        id: 'memory-active',
        memoryType: 'preference',
        content: '回答尽量简洁',
        scopeType: 'global',
      },
    ]);
    mocks.requestAiStream.mockImplementation(async (messages, options) => {
      // 记忆已关闭:Prompt 绝不应包含任何记忆内容
      expect(messages[0].content).not.toContain('回答尽量简洁');
      options.onDelta('好的。');
      return {
        content: '好的。',
        leakedToolCall: false,
        usage: usage(8),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: '以后回答请默认使用要点列表。',
      stream: true,
      contexts: [],
      attachmentIds: [],
      memoryMode: 'active',
      conversationId: 'conversation-1',
      sourceMessageId: 'message-1',
    });
    const res = response();

    await agentChat(req, res);

    // memory_context 明确声明未使用,原因为 disabled(全局关闭),不含任何记忆 id/正文
    const memoryEvent = sseEvents(res).find((event) => event.event === 'memory_context');
    expect(memoryEvent).toEqual(expect.objectContaining({ status: 'not_used', count: 0, reason: 'disabled' }));
    expect(JSON.stringify(memoryEvent)).not.toContain('memory-active');
    expect(JSON.stringify(memoryEvent)).not.toContain('回答尽量简洁');

    // 关闭态:既不读取活跃记忆,也不写入候选
    expect(mocks.getActiveAiMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createAiMemoryCandidate).not.toHaveBeenCalled();
  });

  it('memoryMode=temporary 的临时会话明确声明未使用，且既不读取记忆也不生成候选', async () => {
    mocks.requestAiStream.mockImplementation(async (_messages, options) => {
      options.onDelta('好的。');
      return {
        content: '好的。',
        leakedToolCall: false,
        usage: usage(5),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: '以后回答请默认使用要点列表。',
      stream: true,
      contexts: [],
      attachmentIds: [],
      memoryMode: 'temporary',
      conversationId: 'conversation-1',
      sourceMessageId: 'message-1',
    });

    const res = response();
    await agentChat(req, res);

    expect(mocks.resolveAiMemoryIdentity).not.toHaveBeenCalled();
    expect(mocks.getActiveAiMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createAiMemoryCandidate).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'memory_context')).toEqual(
      expect.objectContaining({
        status: 'not_used',
        count: 0,
        types: [],
        scopes: [],
        reason: 'temporary_session',
      }),
    );
  });

  it('记忆全局关闭下,即使带 conversationId 的 active 请求也不读取记忆、不创建候选', async () => {
    mocks.requestAiStream.mockImplementation(async (_messages, options) => {
      options.onDelta('好的。');
      return {
        content: '好的。',
        leakedToolCall: false,
        usage: usage(5),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: '以后回答请默认使用要点列表。',
      stream: true,
      contexts: [],
      attachmentIds: [],
      memoryMode: 'active',
      conversationId: 'conversation-1',
    });

    await agentChat(req, response());

    // 全局关闭:active 被强制降为 off,既不读取也不写候选
    expect(mocks.getActiveAiMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createAiMemoryCandidate).not.toHaveBeenCalled();
  });

  it('管理员代管上下文不读取记忆，也不把代管对话生成长期候选', async () => {
    const adminMemoryIdentity = {
      actorUserId: 'root-1',
      subjectUserId: 'user-2',
      actorRole: 'root',
      subjectRole: 'user',
      adminContextId: 'context-1',
      adminContextMode: 'maintain',
    };
    mocks.resolveAiMemoryIdentity.mockReturnValue(adminMemoryIdentity);
    mocks.requestAiStream.mockImplementation(async (_messages, options) => {
      options.onDelta('好的。');
      return {
        content: '好的。',
        leakedToolCall: false,
        usage: usage(5),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: '以后回答请默认使用要点列表。',
      stream: true,
      contexts: [],
      attachmentIds: [],
      memoryMode: 'active',
      conversationId: 'conversation-1',
      sourceMessageId: 'message-1',
    });
    req.billingUser = { id: 'root-1', role: 'root', alias: '管理员' };
    req.resourceUser = { id: 'user-2', role: 'user', alias: '目标用户' };
    req.adminContext = { id: 'context-1', mode: 'maintain' };

    await agentChat(req, response());

    expect(mocks.resolveAiMemoryIdentity).not.toHaveBeenCalled();
    expect(mocks.getActiveAiMemoriesForPrompt).not.toHaveBeenCalled();
    expect(mocks.createAiMemoryCandidate).not.toHaveBeenCalled();
  });

  it('管理员会话 ownerKey 同时隔离 context id 与 mode，旧 session 不能跨授权生命周期复用', async () => {
    mocks.requestAiStream.mockImplementation(async (_messages, options) => {
      options.onDelta('完成。');
      return {
        content: '完成。',
        leakedToolCall: false,
        usage: usage(3),
        usageStatus: 'reported',
        provider: 'test',
        model: 'test-model',
        finishReason: 'stop',
      };
    });
    const makeAdminRequest = (id, mode) => {
      const req = request({ message: '你好', stream: true, contexts: [], attachmentIds: [], sessionId: 'old-session' });
      req.billingUser = { id: 'root-1', role: 'root', alias: '管理员' };
      req.resourceUser = { id: 'user-2', role: 'user', alias: '目标用户' };
      req.adminContext = { id, mode };
      return req;
    };

    await agentChat(makeAdminRequest('context-1', 'readonly'), response());
    await agentChat(makeAdminRequest('context-2', 'maintain'), response());

    const [firstOwner, secondOwner] = mocks.getOrCreateSession.mock.calls.map((call) => call[0]);
    expect(firstOwner).toMatch(/^admin-context:[a-f0-9]{32}$/u);
    expect(secondOwner).toMatch(/^admin-context:[a-f0-9]{32}$/u);
    expect(firstOwner).not.toBe(secondOwner);
    expect(firstOwner).not.toContain('context-1');
  });

  it('Provider 失败时发送 response.failed 与旧 error，且不泄漏敏感错误', async () => {
    mocks.requestAiStream.mockRejectedValue(new Error('Authorization: Bearer provider-secret-token'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = request({ message: '你好', stream: true, contexts: [], attachmentIds: [] });
    const res = response();

    await agentChat(req, res);

    const output = sseEvents(res);
    expect(output.slice(-2).map((event) => event.event)).toEqual(['response.failed', 'error']);
    expect(JSON.stringify(output)).not.toContain('provider-secret-token');
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('provider-secret-token');
    expect(mocks.recordTurn).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('Planner 的额外参数被 Tool Policy 阻止，工具不会执行', async () => {
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'query_demo', arguments: JSON.stringify({ keyword: 'x', injected: true }) },
          },
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '参数被安全策略拒绝。',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({ message: '查询演示数据', stream: false, contexts: [], attachmentIds: [] });
    const res = response();

    await agentChat(req, res);

    expect(mocks.toolExecute).not.toHaveBeenCalled();
    const finalMessages = mocks.requestAi.mock.calls[1][0];
    expect(finalMessages.some((item) => item.role === 'tool' || Array.isArray(item.tool_calls))).toBe(false);
    expect(finalMessages.some((item) => String(item.content || '').includes('系统已完成查询'))).toBe(true);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ response: '参数被安全策略拒绝。' }) }),
    );
  });

  it('任意工具缺少必填参数时停止自动重试并向用户请求补充', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('query_detail')].filter(Boolean));
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_query',
          intents: [
            {
              kind: 'read',
              capabilityId: 'read.query_detail',
              goal: '查询详情',
              targetDescription: '用户没有说明具体目标',
              dependsOn: [],
            },
          ],
          toolCalls: [{ toolName: 'query_detail', arguments: {} }],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(request({ message: '帮我查一下详情', stream: false, contexts: [], attachmentIds: [] }), res);

    expect(mocks.toolExecute).not.toHaveBeenCalled();
    expect(mocks.requestAi).toHaveBeenCalledTimes(1);
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('我还缺少完成这次请求所需的关键信息');
  });

  it('明确待办完成请求经语义计划和真实工具调用生成确认，不产生虚假的最终回复', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('set_todo_status')].filter(Boolean));
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.status.set',
              goal: '把指定待办标记为完成',
              targetDescription: '测试代办',
              dependsOn: [],
            },
          ],
          toolCalls: [
            {
              toolName: 'set_todo_status',
              arguments: { keyword: '测试代办', status: 'completed' },
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '把待办「测试代办」标记为完成',
      stream: false,
      contexts: [],
      attachmentIds: [],
      clientCapabilities: ['agent_continuation_v1'],
    });
    const res = response();

    await agentChat(req, res);

    // 只有 Planner 一次调用；待确认时严禁再请求 Final Reply 让模型自行声称“已完成”。
    expect(mocks.requestAi).toHaveBeenCalledTimes(1);
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'set_todo_status',
        args: expect.objectContaining({ keyword: '测试代办', status: 'completed' }),
      }),
    );
    expect(mocks.recordTurn).not.toHaveBeenCalled();
    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.response).toBe('');
    expect(data?.confirmations).toEqual([
      expect.objectContaining({ id: 'confirmation-1', toolName: 'set_todo_status' }),
    ]);
    expect(data?.confirmations?.[0]).not.toHaveProperty('continuation');
    expect(mocks.createActionContinuation).not.toHaveBeenCalled();
    expect(mocks.finalizeActionContinuation).not.toHaveBeenCalled();
  });

  it('明确待办删除请求生成唯一确认卡，不回退到“暂不支持”或模型成功文案', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('delete_todo')].filter(Boolean));
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.delete',
              goal: '删除指定待办',
              targetDescription: '刚才那个待办',
              dependsOn: [],
            },
          ],
          toolCalls: [{ toolName: 'delete_todo', arguments: { keyword: '测试 Agent' } }],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '把刚才那个待办删掉',
      stream: false,
      contexts: [],
      attachmentIds: [],
      clientCapabilities: ['agent_continuation_v1'],
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(1);
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'delete_todo',
        capabilityId: 'todo.delete',
        args: expect.objectContaining({
          keyword: '测试 Agent',
          scope: 'current',
          expectedVersion: 'todo-delete-version-1',
        }),
      }),
    );
    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.response).toBe('');
    expect(data?.confirmations).toEqual([
      expect.objectContaining({ id: 'confirmation-1', toolName: 'delete_todo', capabilityId: 'todo.delete' }),
    ]);
    expect(data?.confirmations?.[0]).not.toHaveProperty('continuation');
    expect(mocks.createActionContinuation).not.toHaveBeenCalled();
    expect(mocks.recordTurn).not.toHaveBeenCalled();
  });

  it('混合请求的确认卡保留 Final Reply 续答，但策略来自语义计划而非工具名', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('set_todo_status')].filter(Boolean));
    mocks.createActionContinuation.mockResolvedValue({
      schemaVersion: 1,
      token: 'continuation-token',
      policy: 'final_reply',
    });
    mocks.finalizeActionContinuation.mockResolvedValue(undefined);
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'mixed',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.status.set',
              goal: '完成待办，之后还要回答用户的非操作问题',
              targetDescription: '测试代办',
              dependsOn: [],
            },
          ],
          toolCalls: [
            {
              toolName: 'set_todo_status',
              arguments: { keyword: '测试代办', status: 'completed' },
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '把待办「测试代办」标记为完成，再结合当前内容给我下一步建议',
        stream: false,
        contexts: [],
        attachmentIds: [],
        clientCapabilities: ['agent_continuation_v1'],
      }),
      res,
    );

    const continuation = res.send.mock.calls.at(-1)?.[0]?.data?.confirmations?.[0]?.continuation;
    expect(continuation).toMatchObject({ token: 'continuation-token', policy: 'final_reply' });
    expect(mocks.createActionContinuation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: { kind: 'confirmation', id: 'confirmation-1' },
        policy: 'final_reply',
      }),
    );
    expect(mocks.finalizeActionContinuation).toHaveBeenCalledTimes(1);
  });

  it('场景A回归:挂着标签问待办,公开来源与追问上下文都不含该标签', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM tag WHERE')) return [[{ id: 'tag-1', name: '网站设计' }]];
      return [[]];
    });
    const followUps = vi.mocked(await import('../util/agent/followUpSuggestions.js'));
    followUps.storeFollowUpContext.mockReturnValue(true);
    followUps.shouldOfferFollowUps.mockReturnValue(true);
    mocks.requestAi.mockImplementation(async (_messages, options = {}) => {
      if (options?.trace?.stage === 'planner') {
        return {
          content: '',
          toolCalls: [
            semanticPlanCall({
              requestClass: 'data_query',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.query_demo',
                  goal: '查询待办',
                  targetDescription: '待办',
                  dependsOn: [],
                },
              ],
              toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '待办' } }],
            }),
          ],
          usage: usage(2),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      return {
        content: '你当前共有 2 条待处理待办。',
        toolCalls: [],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: '我们当前有哪些待办？',
      stream: false,
      contexts: [{ type: 'tag', id: 'tag-1' }],
      attachmentIds: [],
    });
    const res = response();

    await agentChat(req, res);

    const payload = res.send.mock.calls.at(-1)[0].data;
    expect(payload.sources).toEqual([]);
    expect(payload.evidence).toEqual([]);
    const followUpInput = followUps.storeFollowUpContext.mock.calls.at(-1)?.[0];
    expect((followUpInput?.sources || []).some((item) => item.title === '网站设计')).toBe(false);
    followUps.shouldOfferFollowUps.mockReturnValue(false);
    followUps.storeFollowUpContext.mockReturnValue(false);
  });

  it('场景B:引用笔记且回答标注编号时,公开来源恰为该笔记', async () => {
    const noteAi = vi.mocked(await import('../util/noteAiService.js'));
    noteAi.findOwnedNoteForAi.mockResolvedValue({ id: 'note-1', title: '产品方案' });
    noteAi.buildNoteAiPayload.mockResolvedValue({ content: '方案正文要点' });
    mocks.requestAi.mockImplementation(async (_messages, options = {}) => {
      if (options?.trace?.stage === 'planner') {
        return {
          content: '',
          toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [] })],
          usage: usage(2),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      return {
        content: '这篇笔记的核心是方案要点。[1]',
        toolCalls: [],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const req = request({
      message: '总结这篇笔记',
      stream: false,
      contexts: [{ type: 'note', id: 'note-1' }],
      attachmentIds: [],
    });
    const res = response();

    await agentChat(req, res);

    const payload = res.send.mock.calls.at(-1)[0].data;
    expect(payload.sources.map((item) => item.id)).toEqual(['note-1']);
    expect(payload.evidence.map((item) => item.citationKey)).toEqual(['1']);
    expect(payload.citationAudit.citedKeys).toEqual(['1']);
  });

  it('明确引用待办时按 owner 重新读取最新状态、说明与子待办，并形成稳定来源', async () => {
    mocks.findOwnedTodoForAi.mockResolvedValue({
      id: 'todo-1',
      title: '整理发票',
      description: '按月份归档',
      checklist: [
        { id: 'child-1', text: '下载电子票', done: true },
        { id: 'child-2', text: '提交报销', done: false },
      ],
      priority: 2,
      status: 'pending',
      dueAt: '2026-08-05 18:00:00',
      completedAt: null,
      updatedAt: '2026-08-03 22:00:00',
    });
    mocks.requestAi.mockImplementation(async (messages, options = {}) => {
      if (options?.trace?.stage === 'planner') {
        return {
          content: '',
          toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [] })],
          usage: usage(2),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      return {
        content: '这条待办尚未完成，仍需提交报销。[1]',
        toolCalls: [],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const res = response();

    await agentChat(
      request({
        message: '继续分析刚才那个待办',
        stream: false,
        contexts: [{ type: 'todo', id: 'todo-1' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.findOwnedTodoForAi).toHaveBeenCalledWith(expect.anything(), 'user-1', 'todo-1');
    const plannerPrompt = mocks.requestAi.mock.calls[0][0].map((message) => String(message?.content || '')).join('\n');
    expect(plannerPrompt).toContain('[todo:todo-1]');
    expect(plannerPrompt).toContain('提交报销');
    const payload = res.send.mock.calls.at(-1)[0].data;
    expect(payload.sources).toEqual([
      expect.objectContaining({ id: 'todo-1', type: 'todo', title: '整理发票', target: 'todo-inbox' }),
    ]);
    expect(payload.entityRefs).toEqual([{ id: 'todo-1', type: 'todo', title: '整理发票' }]);
    expect(payload.evidence).toEqual([expect.objectContaining({ citationKey: '1' })]);
  });

  it('场景D:附件未被回答引用时,来源与覆盖统计都不包含它', async () => {
    const coverage = {
      documents: [
        {
          sourceId: 'doc-1',
          fileName: '长文档',
          parse: {
            metadataAvailable: true,
            complete: true,
            truncated: false,
            coverageRatio: 1,
            failedRanges: [],
            reasons: [],
            total: { chars: 100, pages: 1, chunks: 1 },
            processed: { chars: 100, pages: 1, chunks: 1 },
          },
          selection: {
            available: { chars: 100, chunks: 1 },
            scanned: { chars: 100, chunks: 1 },
            included: { chars: 100, chunks: 1 },
          },
        },
      ],
      overall: { documentCount: 1, complete: true, coverageRatio: 1 },
    };
    mocks.resolveAttachments.mockResolvedValue({
      text: '\n文档材料',
      coverage,
      sources: [{ type: 'document', id: 'doc-1', title: '长文档', excerpt: '材料片段' }],
    });
    mocks.requestAi.mockImplementation(async (_messages, options = {}) => {
      if (options?.trace?.stage === 'planner') {
        return {
          content: '',
          toolCalls: [
            semanticPlanCall({
              requestClass: 'data_query',
              intents: [
                {
                  kind: 'read',
                  capabilityId: 'read.query_demo',
                  goal: '查询待办',
                  targetDescription: '待办',
                  dependsOn: [],
                },
              ],
              toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '待办' } }],
            }),
          ],
          usage: usage(2),
          usageStatus: 'reported',
          finishReason: 'tool_calls',
        };
      }
      return {
        content: '你有 2 条待办。',
        toolCalls: [],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const req = request({ message: '我有多少条待办？', stream: false, contexts: [], attachmentIds: ['doc-1'] });
    const res = response();

    await agentChat(req, res);

    const payload = res.send.mock.calls.at(-1)[0].data;
    expect(payload.sources).toEqual([]);
    expect(payload.coverage.documents).toEqual([]);
    expect(payload.coverage.overall.documentCount).toBe(0);
  });

  it('流式纯操作只发送唯一确认卡，不签发续答并以空正文终态收口', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('set_todo_status')].filter(Boolean));
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.status.set',
              goal: '完成待办',
              targetDescription: '测试代办',
              dependsOn: [],
            },
          ],
          toolCalls: [
            {
              toolName: 'set_todo_status',
              arguments: { keyword: '测试代办', status: 'completed' },
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '把待办「测试代办」标记为完成',
      stream: true,
      contexts: [],
      attachmentIds: [],
      clientCapabilities: ['agent_continuation_v1'],
    });
    const res = response();

    await agentChat(req, res);

    const output = sseEvents(res);
    const confirmationIndex = output.findIndex((event) => event.event === 'tool_confirmation');
    const terminalIndex = output.findIndex((event) => event.event === 'response.completed');
    expect(confirmationIndex).toBeGreaterThanOrEqual(0);
    expect(terminalIndex).toBeGreaterThan(confirmationIndex);
    expect(output.filter((event) => event.event === 'tool_confirmation')).toHaveLength(1);
    expect(output[confirmationIndex]?.confirmation).not.toHaveProperty('continuation');
    expect(output.some((event) => event.event === 'delta')).toBe(false);
    expect(output[terminalIndex]).toEqual(expect.objectContaining({ answer: '' }));
    expect(mocks.requestAi).toHaveBeenCalledTimes(1);
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(mocks.createActionContinuation).not.toHaveBeenCalled();
    expect(mocks.finalizeActionContinuation).not.toHaveBeenCalled();
  });

  it('模型臆造写入参数时失败关闭，但不向用户泄漏内部 args 字段路径', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('set_todo_status')].filter(Boolean));
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.status.set',
              goal: '完成待办',
              targetDescription: '测试代办',
              dependsOn: [],
            },
          ],
          toolCalls: [
            {
              toolName: 'set_todo_status',
              arguments: { keyword: '测试代办', status: 'completed', completed: true },
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({ message: '把待办「测试代办」标记为完成', stream: false, contexts: [], attachmentIds: [] }),
      res,
    );

    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload?.data?.response).toBe('AI 生成的操作参数无效，请重新发起操作。');
    expect(JSON.stringify(payload)).not.toContain('args.completed');
  });

  it('取消后的“重新执行”不进入模型，重新预检并生成全新的确认', async () => {
    mocks.resolveSessionActionRetry.mockReturnValue({
      state: 'retryable',
      action: {
        confirmationId: 'confirmation-old',
        toolName: 'set_todo_status',
        retryArgs: { keyword: '测试代办', status: 'completed' },
      },
    });
    const req = request({ message: '重新执行', stream: false, sessionId: 'session-1', locale: 'zh-CN' });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.requestAi).not.toHaveBeenCalled();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        toolName: 'set_todo_status',
        args: expect.objectContaining({
          keyword: '测试代办',
          status: 'completed',
          expectedVersion: 'todo-version-1',
        }),
      }),
    );
    expect(mocks.recordPendingActionBatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
      expect.objectContaining({
        actions: [
          expect.objectContaining({
            confirmationId: 'confirmation-1',
            toolName: 'set_todo_status',
            retryArgs: { keyword: '测试代办', status: 'completed' },
          }),
        ],
      }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '',
          confirmations: [expect.objectContaining({ id: 'confirmation-1' })],
        }),
      }),
    );
  });

  it('明确写动作未产生确认时由服务端失败关闭，不允许模型编造成功', async () => {
    mocks.selectAgentTools.mockReturnValue([]);
    mocks.requestAi
      .mockResolvedValueOnce({
        content: 'DIRECT_REPLY',
        toolCalls: [],
        usage: usage(1),
        usageStatus: 'reported',
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        content: 'DIRECT_REPLY',
        toolCalls: [],
        usage: usage(1),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({ message: '请完成待办整理发票', stream: false, contexts: [], attachmentIds: [] });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('planner_semantic_repair_1');
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload?.data?.response).toContain('未执行');
    expect(payload?.data?.response).not.toMatch(/已完成|成功/);
  });

  it('明确创建笔记时使用统一草稿协议，并对 Provider 漏协议做一次有界修复', async () => {
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse())
      .mockResolvedValueOnce({
        content: '漏掉结构化草稿协议',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          toolCall('submit_note_draft', {
            title: '网页摘要',
            content: '# 网页摘要\n\n根据用户提供的正文整理出的测试笔记。',
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '分析内容，生成一份笔记',
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.requestAi.mock.calls[0][1].trace.stage).toBe('note_draft_task');
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('note_draft');
    expect(mocks.requestAi.mock.calls[2][1].trace.stage).toBe('note_draft_repair');
    expect(mocks.selectAgentTools).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).toHaveBeenCalledOnce();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.confirmations).toHaveLength(1);
  });

  it('引用笔记生成新笔记时读取服务端正文，并把稳定引用写入确认私有上下文', async () => {
    mocks.findOwnedNoteForAi.mockResolvedValueOnce({
      id: 'note-1',
      title: 'Redis 学习记录',
      content: 'Redis 是内存数据结构存储。'.repeat(60),
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: 'Redis 学习笔记',
          content: `# Redis\n\n${'整理后的正文。'.repeat(80)}`,
        }),
      ],
      usage: usage(3),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '请根据这个笔记生成一篇更完整的新笔记。',
        stream: false,
        contexts: [{ type: 'note', id: 'note-1' }],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('Redis 是内存数据结构存储');
    expect(mocks.createToolConfirmation).toHaveBeenCalledOnce();
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        privateContext: expect.objectContaining({
          sourceMessage: '请根据这个笔记生成一篇更完整的新笔记。',
          contextRefs: [{ type: 'note', id: 'note-1' }],
          attachmentIds: [],
        }),
      }),
    );
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringContaining('笔记草稿已准备好'),
      confirmations: [expect.objectContaining({ toolName: 'create_note' })],
    });
  });

  it('引用待办生成笔记时包含最新状态、说明与子待办', async () => {
    mocks.findOwnedTodoForAi.mockResolvedValueOnce({
      id: 'todo-1',
      title: '发布轻笺新版',
      status: 'pending',
      priority: 3,
      dueAt: '2026-08-06 20:00:00',
      updatedAt: '2026-08-04 10:00:00',
      description: '发布前完成回归测试',
      checklist: [
        { text: '执行服务端测试', done: true },
        { text: '检查移动端', done: false },
      ],
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: '轻笺新版发布记录',
          content: `# 发布记录\n\n${'待办整理内容。'.repeat(60)}`,
        }),
      ],
      usage: usage(3),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '请根据这个待办生成一篇发布记录笔记。',
        stream: false,
        contexts: [{ type: 'todo', id: 'todo-1' }],
        attachmentIds: [],
      }),
      res,
    );

    const prompt = mocks.requestAi.mock.calls[1][0][1].content;
    expect(prompt).toContain('发布前完成回归测试');
    expect(prompt).toContain('[已完成] 执行服务端测试');
    expect(prompt).toContain('[待处理] 检查移动端');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        privateContext: expect.objectContaining({ contextRefs: [{ type: 'todo', id: 'todo-1' }] }),
      }),
    );
  });

  it('文件附件生成笔记时保存附件来源 ID，后续可由服务端重新解析', async () => {
    mocks.resolveAttachments.mockResolvedValueOnce({
      text: '\n\n[document:source-1:0 第 1 页]\n文件完整正文：统一材料工作流设计。'.repeat(20),
      sources: [
        {
          type: 'document',
          id: 'source-1',
          documentId: 'source-1',
          fileId: 'file-1',
          title: '统一材料方案.pdf',
        },
      ],
      coverage: { documents: [], overall: { documentCount: 1, complete: true } },
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: '统一材料工作流',
          content: `# 统一材料工作流\n\n${'文件整理内容。'.repeat(60)}`,
        }),
      ],
      usage: usage(3),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: '请根据这个文件生成一篇详细笔记。',
        stream: false,
        contexts: [],
        attachmentIds: ['source-1'],
      }),
      res,
    );

    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('文件完整正文');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        privateContext: expect.objectContaining({ contextRefs: [], attachmentIds: ['source-1'] }),
      }),
    );
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.entityRefs).toEqual([
      { type: 'file', id: 'file-1', title: '统一材料方案.pdf' },
    ]);
  });

  it('书签、笔记、待办、文件与粘贴文本可以混合生成同一篇笔记', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-1',
              title: '产品文档',
              url: 'https://example.com/docs',
              snapshot_content: '书签快照正文。'.repeat(60),
              description: '产品说明',
              content: '书签快照正文。'.repeat(60),
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.findOwnedNoteForAi.mockResolvedValueOnce({
      id: 'note-1',
      title: '讨论记录',
      content: '笔记中的讨论结论。'.repeat(40),
    });
    mocks.findOwnedTodoForAi.mockResolvedValueOnce({
      id: 'todo-1',
      title: '后续行动',
      status: 'pending',
      priority: 2,
      description: '完成统一工作流',
      checklist: [],
    });
    mocks.resolveAttachments.mockResolvedValueOnce({
      text: '\n\n[document:source-1:0]\n文件中的验收标准。'.repeat(30),
      sources: [{ type: 'document', id: 'source-1', documentId: 'source-1', title: '验收标准.pdf' }],
      coverage: { documents: [], overall: { documentCount: 1, complete: true } },
    });
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: '统一材料方案总结',
          content: `# 方案总结\n\n${'综合整理内容。'.repeat(80)}`,
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();
    const message = '请综合这些材料生成笔记。下面的补充文字：还要说明后续风险与验收方式。';

    await agentChat(
      request({
        message,
        stream: false,
        contexts: [
          { type: 'bookmark', id: 'bookmark-1' },
          { type: 'note', id: 'note-1' },
          { type: 'todo', id: 'todo-1' },
        ],
        attachmentIds: ['source-1'],
      }),
      res,
    );

    const prompt = mocks.requestAi.mock.calls[1][0][1].content;
    expect(prompt).toContain('书签快照正文');
    expect(prompt).toContain('笔记中的讨论结论');
    expect(prompt).toContain('完成统一工作流');
    expect(prompt).toContain('文件中的验收标准');
    expect(prompt).toContain('后续风险与验收方式');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        privateContext: expect.objectContaining({
          sourceMessage: message,
          contextRefs: [
            { type: 'bookmark', id: 'bookmark-1' },
            { type: 'note', id: 'note-1' },
            { type: 'todo', id: 'todo-1' },
          ],
          attachmentIds: ['source-1'],
        }),
      }),
    );
  });

  it('直接粘贴文本生成笔记时不要求额外引用资源', async () => {
    const pastedText = 'Redis 通过内存数据结构提供高性能读写，并可结合持久化机制保存数据。'.repeat(20);
    mocks.requestAi.mockResolvedValueOnce(noteDraftTaskResponse()).mockResolvedValueOnce({
      content: '',
      toolCalls: [
        toolCall('submit_note_draft', {
          title: 'Redis 基础笔记',
          content: `# Redis\n\n${'文本整理内容。'.repeat(60)}`,
        }),
      ],
      usage: usage(3),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(
      request({
        message: `请把下面文字整理成一篇笔记：${pastedText}`,
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain(pastedText.slice(0, 120));
    expect(mocks.requestAi.mock.calls[1][0][1].content).toContain('类型：用户粘贴文本');
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        privateContext: expect.objectContaining({ contextRefs: [], attachmentIds: [] }),
      }),
    );
  });

  it('统一草稿协议连续两次缺失时失败关闭，不创建半截确认卡', async () => {
    const invalidDraftResponse = () => ({
      content: '',
      toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [], toolCalls: [] })],
      usage: usage(2),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse())
      .mockResolvedValueOnce(invalidDraftResponse())
      .mockResolvedValueOnce(invalidDraftResponse());
    const res = response();

    await agentChat(
      request({
        message: '请创建一篇笔记，标题为测试，正文为测试内容。',
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    // 入口分类 + 两次草稿尝试；草稿协议连续缺失后必须失败关闭。
    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringMatching(/没有生成完整可确认的笔记草稿/),
      confirmations: [],
    });
  });

  it.each(AGENT_REPLAY_CASES)('真实 Agent 主链回放：$id', async (replayCase) => {
    const result = await runAgentReplayCase(replayCase, {
      setProviderResponses(responses) {
        mocks.requestAi.mockReset();
        responses.forEach((providerResponse) => mocks.requestAi.mockResolvedValueOnce(providerResponse));
      },
      async invokeAgent(body) {
        const selectedTools = new Set(body.selectedTools || []);
        mocks.selectAgentTools.mockImplementation((registry) =>
          [...selectedTools].map((toolName) => registry.get(toolName)).filter(Boolean),
        );
        mocks.toolExecute.mockResolvedValue({ value: '合成网页内容' });
        const res = response();
        await agentChat(request(body), res);
        return { res, selectedTools };
      },
      observe({ res, selectedTools }) {
        const payload = res.send.mock.calls.at(-1)?.[0]?.data || {};
        return {
          response: payload.response,
          confirmations: payload.confirmations,
          providerStages: mocks.requestAi.mock.calls.map(([, options]) => options?.trace?.stage).filter(Boolean),
          executedTools: mocks.toolExecute.mock.calls.length ? [...selectedTools] : [],
        };
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('未支持的删除请求由 AI 语义识别、服务端能力目录确定性拦截', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'note.delete',
              goal: '删除指定笔记',
              targetDescription: '引用测试',
              dependsOn: [],
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '帮我删除我的笔记：引用测试',
      stream: false,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.resolveAttachments).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledOnce();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(mocks.recordTurn).toHaveBeenCalledWith(
      expect.anything(),
      '帮我删除我的笔记：引用测试',
      expect.stringMatching(/暂不支持.*没有执行/s),
      [],
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: expect.stringMatching(/删除笔记.*没有执行/s),
          confirmations: [],
          actionPolicy: {
            resolution: 'planned',
            capabilityIds: ['note.delete'],
            executed: false,
          },
        }),
      }),
    );
  });

  it('模型对子计划分类自相矛盾时先由 AI 重判，仍不允许执行未支持的写操作', async () => {
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询目标笔记',
                targetDescription: '引用测试',
                dependsOn: [],
              },
            ],
            toolCalls: [],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.delete',
                goal: '删除目标笔记',
                targetDescription: '引用测试',
                dependsOn: [],
              },
            ],
            toolCalls: [],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '帮我删除我的笔记：引用测试',
        stream: false,
        contexts: [],
        attachmentIds: [],
        locale: 'zh-CN',
      }),
      res,
    );

    expect(mocks.toolExecute).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('planner_semantic_repair_1');
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringMatching(/删除笔记.*没有执行/s),
      actionPolicy: { resolution: 'planned', capabilityIds: ['note.delete'], executed: false },
    });
  });

  it('禁止操作以结构化流式终态返回“未修改”，不会泄漏到 Final Reply', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'data.permanent_delete',
              goal: '永久删除全部笔记',
              targetDescription: '全部笔记',
              dependsOn: [],
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '彻底删除全部笔记',
      stream: true,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledOnce();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    const output = sseEvents(res);
    expect(output.find((event) => event.event === 'stage.changed' && event.stage === 'action_policy')).toMatchObject({
      stage: 'action_policy',
      resolution: 'forbidden',
      executed: false,
    });
    expect(output.find((event) => event.event === 'delta')?.output?.text).toMatch(/不允许.*没有修改/s);
    expect(output.find((event) => event.event === 'response.completed')).toMatchObject({
      output: {
        action_policy: {
          resolution: 'forbidden',
          capability_ids: ['data.permanent_delete'],
          executed: false,
        },
      },
    });
  });

  it('未知的数据修改请求失败关闭，不能被普通回答兜底', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'unknown',
              goal: '同步指代对象',
              targetDescription: '这些',
              dependsOn: [],
            },
          ],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '请立即同步这些',
      stream: false,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledOnce();
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: expect.stringMatching(/没有匹配的已注册.*没有执行/s),
      actionPolicy: { resolution: 'unknown_mutation', capabilityIds: [], executed: false },
    });
  });

  it('“怎么删除笔记”属于用法查询，仍进入只读 Agent 而不是动作拦截', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'product_help',
          intents: [
            {
              kind: 'read',
              capabilityId: 'read.query_demo',
              goal: '查询删除笔记的产品用法',
              targetDescription: '帮助说明',
              dependsOn: [],
            },
          ],
        }),
        toolCall('query_demo', { keyword: '删除笔记' }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    mocks.requestAi.mockResolvedValueOnce({
      content: '你可以在笔记库中删除，删除后会进入回收站。',
      toolCalls: [],
      usage: usage(5),
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const req = request({
      message: '怎么删除笔记？',
      stream: true,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'delta')?.output?.text).toContain('笔记库');
  });

  it('“已完成的待办有哪些”属于数据查询，不进入写操作无回执安全门', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_query',
          intents: [
            {
              kind: 'read',
              capabilityId: 'read.query_demo',
              goal: '查询已完成待办',
              targetDescription: '当前用户已完成的待办',
              dependsOn: [],
            },
          ],
          toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '已完成待办' } }],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    mocks.requestAi.mockResolvedValueOnce({
      content: '你目前有 2 条已完成待办。',
      toolCalls: [],
      usage: usage(5),
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const req = request({
      message: '我目前已完成的待办有哪些？',
      stream: true,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'delta')?.output?.text).toContain('已完成待办');
    expect(JSON.stringify(sseEvents(res))).not.toContain('action_policy');
  });

  it('“回顾很久没看的收藏”属于只读查询，不会被动作策略提前截断', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_query',
          intents: [
            {
              kind: 'read',
              capabilityId: 'read.query_demo',
              goal: '回顾很久未查看的收藏',
              targetDescription: '当前用户的收藏',
              dependsOn: [],
            },
          ],
          toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '很久没看的收藏' } }],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    mocks.requestAi.mockResolvedValueOnce({
      content: '这里是你很久没看的 3 条收藏。',
      toolCalls: [],
      usage: usage(5),
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const req = request({
      message: '帮我回顾很久没看的收藏',
      stream: true,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'delta')?.output?.text).toContain('很久没看的');
    expect(JSON.stringify(sseEvents(res))).not.toContain('action_policy');
  });

  it('只读业务查询由 AI Intent Envelope 选择读取能力，并执行匹配工具', async () => {
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_query',
          intents: [
            {
              kind: 'read',
              capabilityId: 'read.query_demo',
              goal: '查询演示数据',
              targetDescription: '当前用户的演示数据',
              dependsOn: [],
            },
          ],
          toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '最近' } }],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const req = request({
      message: '帮我回顾最近的数据',
      stream: false,
      contexts: [],
      attachmentIds: [],
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi.mock.calls[0][1]).toMatchObject({
      toolChoice: {
        type: 'function',
        function: { name: 'submit_agent_plan' },
      },
      tools: [
        expect.objectContaining({
          function: expect.objectContaining({
            name: 'submit_agent_plan',
            parameters: expect.objectContaining({
              properties: expect.objectContaining({
                toolCalls: expect.objectContaining({
                  items: expect.objectContaining({
                    properties: expect.objectContaining({
                      toolName: expect.objectContaining({ enum: ['query_demo'] }),
                      arguments: expect.objectContaining({ additionalProperties: false }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      ],
    });
    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(mocks.requestAi.mock.calls[1][1]).toMatchObject({
      toolChoice: 'none',
      temperature: 0.3,
    });
  });

  it('真实体检 artifact 经 SSE 与恢复快照透传，数字不依赖模型正文', async () => {
    const artifact = {
      id: 'bookmark-health:run-1',
      kind: 'job',
      schemaVersion: 1,
      status: 'running',
      titleKey: 'ai.artifact.bookmarkHealth.title',
      generatedAt: '2026-08-10T12:00:00.000Z',
      revision: 1,
      data: {
        jobType: 'bookmark_health',
        jobId: 'run-1',
        total: 214,
        checked: 0,
        alive: 0,
        suspect: 0,
        unknown: 0,
        pollAfterMs: 2500,
        suspects: [],
      },
    };
    mocks.toolExecute.mockResolvedValueOnce({ value: '已启动', artifact });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '启动真实死链体检',
                targetDescription: '当前账号全部书签',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: {} }],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '体检已启动，请查看任务卡。',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const res = response();

    await agentChat(
      request({
        message: '我有哪些书签链接失效了？',
        stream: true,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    const events = sseEvents(res);
    expect(events.find((event) => event.event === 'artifact.created')?.artifact).toMatchObject({
      id: 'bookmark-health:run-1',
      data: { total: 214, checked: 0 },
    });
    expect(events.find((event) => event.event === 'response.completed')?.artifacts).toEqual([
      expect.objectContaining({ id: 'bookmark-health:run-1' }),
    ]);
    const recoveryInsert = mocks.poolQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO ai_response_events'),
    );
    const terminalPayload = JSON.parse(recoveryInsert[1].at(-2));
    expect(terminalPayload.recoverySnapshot.artifacts).toEqual([
      expect.objectContaining({ id: 'bookmark-health:run-1' }),
    ]);
  });

  it('多读取计划正确识别能力但漏交工具调用时，会收窄能力补全后再执行查询', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('query_detail')].filter(Boolean),
    );
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询最近新增的书签',
                targetDescription: '最近 7 天新增书签',
                dependsOn: [],
              },
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '查询最近新增的笔记',
                targetDescription: '最近 7 天新增笔记',
                dependsOn: [],
              },
            ],
            toolCalls: [],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          toolCall('query_demo', { keyword: '最近7天' }, 'completion-query-demo'),
          toolCall('query_detail', { id: 'detail-1' }, 'completion-query-detail'),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '最近 7 天新增内容已经按书签和笔记汇总。',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({
      message: '总结我最近 7 天新增的书签和笔记',
      stream: false,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('planner_completion_1');
    expect(mocks.requestAi.mock.calls[1][0].at(-1).content).toContain('[INTERNAL_AGENT_PLAN_COMPLETION_ROUND]');
    expect(mocks.requestAi.mock.calls[1][1].toolChoice).toBe('required');
    expect(mocks.requestAi.mock.calls[1][1].tools.map((item) => item.function.name)).toEqual([
      'query_demo',
      'query_detail',
    ]);
    expect(mocks.toolExecute).toHaveBeenCalledTimes(2);
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '最近 7 天新增内容已经按书签和笔记汇总。',
        }),
      }),
    );
  });

  it('第一次读取补全仍漏交调用时会有界重试，第二次补齐后再执行', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('query_detail')].filter(Boolean),
    );
    const omittedMultiReadPlan = () =>
      semanticPlanCall({
        requestClass: 'data_query',
        intents: [
          {
            kind: 'read',
            capabilityId: 'read.query_demo',
            goal: '查询最近新增的书签',
            targetDescription: '最近 7 天新增书签',
            dependsOn: [],
          },
          {
            kind: 'read',
            capabilityId: 'read.query_detail',
            goal: '查询最近新增的笔记',
            targetDescription: '最近 7 天新增笔记',
            dependsOn: [],
          },
        ],
        toolCalls: [],
      });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [omittedMultiReadPlan()],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          toolCall('query_demo', { keyword: '最近7天' }, 'completion-query-demo'),
          toolCall('query_detail', { id: 'detail-1' }, 'completion-query-detail'),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '第二次补全后成功汇总。',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({
      message: '总结我最近 7 天新增的书签和笔记',
      stream: false,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(4);
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('planner_completion_1');
    expect(mocks.requestAi.mock.calls[2][1].trace.stage).toBe('planner_completion_2');
    expect(mocks.toolExecute).toHaveBeenCalledTimes(2);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '第二次补全后成功汇总。',
        }),
      }),
    );
  });

  it('读取补全阶段供应商异常时保留原安全裁决，不退化为通用 500', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('query_demo')].filter(Boolean));
    const providerError = Object.assign(new Error('private provider detail'), { code: 'AI_PROVIDER_ERROR' });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询最近新增内容',
                targetDescription: '最近 7 天新增内容',
                dependsOn: [],
              },
            ],
            toolCalls: [],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockRejectedValueOnce(providerError);
    const req = request({
      message: '总结我最近 7 天新增的内容',
      stream: false,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.toolExecute).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: expect.stringMatching(/没有成功发起必要的数据查询/),
          actionPolicy: {
            resolution: 'unverified_query',
            capabilityIds: ['read.query_demo'],
            executed: false,
          },
        }),
      }),
    );
    expect(JSON.stringify(res.send.mock.calls.at(-1)?.[0])).not.toContain('private provider detail');
  });

  it('首轮语义计划自相矛盾时先由 AI 重判，重判通过前绝不执行工具', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('query_demo')].filter(Boolean));
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'conversation',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询最近新增内容',
                targetDescription: '最近 7 天新增内容',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '最近7天' } }],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询最近新增内容',
                targetDescription: '最近 7 天新增内容',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '最近7天' } }],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '已经根据真实查询结果完成汇总。',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({
      message: '总结我最近 7 天新增的内容',
      stream: false,
      contexts: [],
      attachmentIds: [],
      locale: 'zh-CN',
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.requestAi.mock.calls[1][1].trace.stage).toBe('planner_semantic_repair_1');
    expect(mocks.requestAi.mock.calls[1][0].at(-1).content).toContain('[INTERNAL_AGENT_SEMANTIC_REPAIR_ROUND]');
    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '已经根据真实查询结果完成汇总。',
        }),
      }),
    );
  });

  it('查询后写入按依赖分两轮推进，并只为真实查询目标生成确认卡', async () => {
    vi.stubEnv('AI_SECOND_ROUND_ENABLED', 'false');
    vi.stubEnv('AI_MAX_TOOL_ROUNDS', '1');
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '1. [todo:todo-1] 测试代办',
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'mixed',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '当前待办列表第一条',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '把查询到的第一条待办标记为完成',
                targetDescription: '查询结果中的第一条待办',
                dependsOn: [0],
              },
            ],
            toolCalls: [
              { toolName: 'query_demo', arguments: { keyword: '第一条' } },
              {
                toolName: 'set_todo_status',
                arguments: { keyword: '猜测目标', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成查询到的待办',
                targetDescription: '测试代办',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-1', keyword: '测试代办', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const req = request({
      message: '把第一条待办标记为完成',
      stream: false,
      contexts: [],
      attachmentIds: [],
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    const [followUpMessages, followUpOptions] = mocks.requestAi.mock.calls[1];
    expect(followUpMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'tool', content: expect.stringContaining('[todo:todo-1]') }),
      ]),
    );
    expect(followUpOptions).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'submit_agent_plan' } },
      tools: [
        expect.objectContaining({
          function: expect.objectContaining({
            name: 'submit_agent_plan',
            parameters: expect.objectContaining({
              properties: expect.objectContaining({
                toolCalls: expect.objectContaining({
                  items: expect.objectContaining({
                    properties: expect.objectContaining({
                      toolName: expect.objectContaining({ enum: ['set_todo_status'] }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      ],
    });
    expect(mocks.createToolConfirmation).toHaveBeenCalledOnce();
    expect(mocks.prepareTodoStatus).toHaveBeenCalledWith(
      expect.objectContaining({ todoId: 'todo-1', keyword: '测试代办', status: 'completed' }),
      expect.anything(),
    );
    expect(mocks.prepareTodoStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '猜测目标' }),
      expect.anything(),
    );
    expect(mocks.recordPendingActionBatch).toHaveBeenCalledOnce();
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '',
          confirmations: [expect.objectContaining({ toolName: 'set_todo_status' })],
        }),
      }),
    );
  });

  it('已有独立确认卡时仍完成同一计划的依赖链，不静默丢失后续动作', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('create_note'), registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '1. [todo:todo-1] 测试代办',
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    mocks.requestAi
      // 同一句里还要改待办：笔记入口必须把复合写请求交回 Semantic Planner，
      // 否则待办那一步会被统一草稿协议静默丢弃。
      .mockResolvedValueOnce(noteDraftTaskResponse({ producesNote: true, otherMutations: true }))
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '创建测试记录',
                targetDescription: '测试记录',
                dependsOn: [],
              },
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '第一条待办',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成第一条待办',
                targetDescription: '查询结果中的第一条待办',
                dependsOn: [1],
              },
            ],
            toolCalls: [
              { toolName: 'create_note', arguments: { title: '测试记录', content: '内容' } },
              { toolName: 'query_demo', arguments: { keyword: '第一条' } },
            ],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成查询到的待办',
                targetDescription: 'todo-1',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-1', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '创建一篇测试记录，并把第一条待办标记为完成',
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    // 入口分类 + 语义计划 + Final Reply。
    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.requestAi.mock.calls[0][1].trace.stage).toBe('note_draft_task');
    expect(mocks.createToolConfirmation).toHaveBeenCalledTimes(2);
    expect(mocks.createToolConfirmation.mock.calls.map(([input]) => input.toolName)).toEqual([
      'create_note',
      'set_todo_status',
    ]);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmations: [
            expect.objectContaining({ toolName: 'create_note' }),
            expect.objectContaining({ toolName: 'set_todo_status' }),
          ],
        }),
      }),
    );
  });

  it('笔记与待办可以在同一句里完成，各自出一张确认卡', async () => {
    // 用户实测诉求：「分析这个书签，生成一篇笔记，然后创建一个今天晚上 21 点的待办」。
    // 此前 todo.manage 是 planned 且 operationPatterns 含 CREATE_PATTERN，"新建待办"会命中
    // 这条 planned 能力，adjudicateSemanticPlan 按 status 优先级把整个请求（含笔记）一起
    // 失败关闭。todo.create 独立成 enabled 之后，两个写操作各自走确认协议。
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('create_note'), registry.get('create_todo')].filter(Boolean),
    );
    mocks.createToolConfirmation
      .mockImplementationOnce(async (input) => ({
        token: 'confirmation-token-note',
        confirmation: { ...input, id: 'confirmation-note' },
        expiresIn: 300,
      }))
      .mockImplementationOnce(async (input) => ({
        token: 'confirmation-token-todo',
        confirmation: { ...input, id: 'confirmation-todo' },
        expiresIn: 300,
      }));
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ producesNote: true, otherMutations: true }))
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '创建笔记',
                targetDescription: '材料汇总笔记',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.create',
                goal: '创建待办',
                targetDescription: '今天晚上 21 点查看笔记',
                dependsOn: [],
              },
            ],
            toolCalls: [
              { toolName: 'create_note', arguments: { title: '材料汇总', content: '正文内容。' } },
              { toolName: 'create_todo', arguments: { title: '查看材料汇总笔记', dueAt: '2026-08-04 21:00:00' } },
            ],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '请分析这个书签的内容，生成一篇笔记，然后创建一个今天晚上 21 点的待办',
        stream: false,
        contexts: [],
        attachmentIds: [],
        clientCapabilities: ['agent_continuation_v1'],
      }),
      res,
    );

    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.confirmations?.map((item) => item.toolName)).toEqual(['create_note', 'create_todo']);
    expect(data?.confirmations?.every((item) => !item.continuation)).toBe(true);
    expect(mocks.createActionContinuation).not.toHaveBeenCalled();
    expect(mocks.finalizeActionContinuation).not.toHaveBeenCalled();
    expect(mocks.discardActionContinuation).not.toHaveBeenCalled();
    // 两个写操作都覆盖到了，就不该再出现"其他操作没有执行"的兜底披露。
    expect(String(data?.response || '')).not.toContain('其他操作没有执行');
  });

  it('材料续问候选经语义分类判承接后，服务端按候选引用解析材料', async () => {
    // 前端正则漏判（"作者是谁"零指代词）时只带候选引用；分类判 continue 则解析材料。
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [toolCall('classify_material_follow_up', { decision: 'continue_with_materials' })],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [] })],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '作者是张三。',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-1',
              title: '文章快照',
              url: 'https://example.com/a',
              snapshot_content: '作者是张三。'.repeat(40),
              description: '',
              content: '作者是张三。'.repeat(40),
            },
          ],
        ];
      }
      return [[]];
    });
    const res = response();

    await agentChat(
      request({
        message: '作者是谁',
        stream: false,
        contexts: [],
        attachmentIds: [],
        history: [
          { role: 'user', content: '总结这篇文章' },
          { role: 'assistant', content: '这篇文章讲了……' },
        ],
        followUpMaterials: { contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }], attachmentIds: [] },
      }),
      res,
    );

    expect(mocks.requestAi.mock.calls[0][1].trace.stage).toBe('material_follow_up');
    // 候选材料被服务端按归属解析并进入回答上下文
    expect(mocks.poolQuery.mock.calls.some((call) => String(call[0]).includes('FROM bookmark b'))).toBe(true);
    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.entityRefs).toEqual([expect.objectContaining({ type: 'bookmark', id: 'bookmark-1' })]);
  });

  it('材料续问分类判独立时不继承候选，行为与旧版一致', async () => {
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [toolCall('classify_material_follow_up', { decision: 'independent_request' })],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [] })],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '今天天气不错。',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const res = response();

    await agentChat(
      request({
        message: '今天深圳天气怎么样',
        stream: false,
        contexts: [],
        attachmentIds: [],
        followUpMaterials: { contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }], attachmentIds: [] },
      }),
      res,
    );

    // 判独立后不解析候选材料
    expect(mocks.poolQuery.mock.calls.some((call) => String(call[0]).includes('FROM bookmark b'))).toBe(false);
    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.entityRefs || []).toHaveLength(0);
  });

  it('本轮已带显式材料时不触发续问分类', async () => {
    mocks.poolQuery.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-2',
              title: '新材料',
              url: 'https://example.com/b',
              snapshot_content: '内容。'.repeat(40),
              description: '',
              content: '内容。'.repeat(40),
            },
          ],
        ];
      }
      return [[]];
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [] })],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '好的。',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const res = response();

    await agentChat(
      request({
        message: '这篇讲了什么',
        stream: false,
        contexts: [{ type: 'bookmark', id: 'bookmark-2' }],
        attachmentIds: [],
        followUpMaterials: { contextRefs: [{ type: 'bookmark', id: 'bookmark-1' }], attachmentIds: [] },
      }),
      res,
    );

    // 第一次 provider 调用直接是 planner，没有 material_follow_up 阶段
    expect(mocks.requestAi.mock.calls[0][1].trace.stage).not.toBe('material_follow_up');
  });

  it('传感器多判的能力不再强制修复：就绪计划按模型语义放行并出全确认卡', async () => {
    // 线上实测：「分析这个书签，生成一篇笔记，然后创建一个今天晚上 21 点的待办」——
    // 旧动作传感器因「书签」与「创建」远距交叉多判出 bookmark.create，模型经两轮修复
    // 提示仍正确拒绝编造建书签意图，反而被 missing-expected 硬校验失败关闭。
    // 现在：计划已覆盖部分 expected 且自洽就绪 → 不触发修复轮、不失败关闭。
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('create_note'), registry.get('create_todo'), registry.get('read_url')].filter(Boolean),
    );
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ producesNote: true, otherMutations: true }))
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '创建分析笔记',
                targetDescription: '书签分析笔记',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.create',
                goal: '创建今晚待办',
                targetDescription: '今晚 21 点待办',
                dependsOn: [],
              },
            ],
            toolCalls: [
              { toolName: 'create_note', arguments: { title: '书签分析', content: '分析正文。' } },
              { toolName: 'create_todo', arguments: { title: '查看笔记', dueAt: '2026-08-04 21:00:00' } },
            ],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        // 该消息会让传感器判出 note.create + bookmark.create + todo.create 三个能力；
        // 计划只覆盖 note + todo，bookmark.create 是多判。
        message: '分析这个书签，生成一篇笔记，然后创建一个今天晚上 21 点的待办',
        stream: false,
        contexts: [{ type: 'bookmark', id: 'bookmark-1' }],
        attachmentIds: [],
      }),
      res,
    );

    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    // 分类 + planner 各一次：就绪计划不再进修复轮。
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(data?.confirmations?.map((item) => item.toolName)).toEqual(['create_note', 'create_todo']);
    expect(String(data?.response || '')).not.toContain('该操作尚未执行');
  });

  it('计划一个 expected 能力都没覆盖时仍失败关闭，不能用普通回答冒充操作', async () => {
    // 传感器宽容只对"部分覆盖 + 就绪"生效；模型把明确写请求当普通对话仍必须拦下。
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('create_note'), registry.get('create_todo')].filter(Boolean),
    );
    const conversationPlan = () => ({
      content: '',
      toolCalls: [semanticPlanCall({ requestClass: 'conversation', intents: [], toolCalls: [] })],
      usage: usage(2),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ producesNote: true, otherMutations: true }))
      .mockResolvedValueOnce(conversationPlan())
      .mockResolvedValueOnce(conversationPlan())
      .mockResolvedValueOnce(conversationPlan());
    const res = response();

    await agentChat(
      request({
        message: '分析这个书签，生成一篇笔记，然后创建一个今天晚上 21 点的待办',
        stream: false,
        contexts: [{ type: 'bookmark', id: 'bookmark-1' }],
        attachmentIds: [],
      }),
      res,
    );

    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.confirmations || []).toHaveLength(0);
    expect(String(data?.response || '')).toContain('该操作尚未执行');
  });

  it('模型漏声明第二个写操作时，确认卡仍要披露另一半没有执行', async () => {
    // otherMutations 是代码级信号，不依赖模型是否老实声明。这里模型只声明了 note.create，
    // 用户要求的删除（bookmark.delete 仍是 planned）既没执行也没被 adjudicate 拦下，
    // 必须由兜底披露补上，否则写操作静默丢失。
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('create_note')].filter(Boolean));
    mocks.requestAi
      .mockResolvedValueOnce(noteDraftTaskResponse({ producesNote: true, otherMutations: true }))
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'note.create',
                goal: '创建笔记',
                targetDescription: '材料汇总笔记',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'create_note', arguments: { title: '材料汇总', content: '正文内容。' } }],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '根据这些材料生成一篇笔记，并把那个失效书签删掉',
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    const data = res.send.mock.calls.at(-1)?.[0]?.data;
    expect(data?.confirmations?.map((item) => item.toolName)).toEqual(['create_note']);
    expect(data?.response).toContain('其他操作没有执行');
  });

  it('三层依赖按拓扑顺序完成且每轮工具调用 ID 唯一，低轮次配置不会截断核心动作', async () => {
    vi.stubEnv('AI_MAX_TOOL_ROUNDS', '1');
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('query_detail'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute
      .mockResolvedValueOnce({
        value: 'detail-1',
        dependencyRefs: [{ type: 'detail', id: 'detail-1' }],
      })
      .mockResolvedValueOnce({
        value: '[todo:todo-1] 测试代办',
        dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
      });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '定位详情',
                targetDescription: '第一项详情',
                dependsOn: [],
              },
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '读取详情中的目标待办',
                targetDescription: 'detail-1',
                dependsOn: [0],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成目标待办',
                targetDescription: '详情中的待办',
                dependsOn: [1],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '第一项' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '读取目标详情',
                targetDescription: 'detail-1',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_detail', arguments: { id: 'detail-1' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成目标待办',
                targetDescription: 'todo-1',
                dependsOn: [0],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-1', keyword: '测试代办', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });

    await agentChat(
      request({ message: '把第一项详情里的第一条待办标记为完成', stream: false, contexts: [], attachmentIds: [] }),
      response(),
    );

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.toolExecute).toHaveBeenCalledTimes(2);
    expect(mocks.createToolConfirmation).toHaveBeenCalledOnce();
    const thirdRoundMessages = mocks.requestAi.mock.calls[2][0];
    const callIds = thirdRoundMessages
      .filter((entry) => Array.isArray(entry.tool_calls))
      .flatMap((entry) => entry.tool_calls.map((call) => call.id));
    expect(callIds).toEqual(['semantic-plan-round-1-1', 'semantic-plan-round-2-1']);
    expect(new Set(callIds).size).toBe(callIds.length);
  });

  it('三层依赖写入只信任直接前置筛选结果，不能回选更早宽查询中的其他目标', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('query_detail'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute
      .mockResolvedValueOnce({
        value: '宽查询包含 [todo:todo-broad]，下一步请继续筛选 detail-1',
        dependencyRefs: [
          { type: 'todo', id: 'todo-broad' },
          { type: 'detail', id: 'detail-1' },
        ],
      })
      .mockResolvedValueOnce({
        value: '筛选后唯一目标 [todo:todo-refined]',
        dependencyRefs: [{ type: 'todo', id: 'todo-refined' }],
      });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询候选',
                targetDescription: '候选集合',
                dependsOn: [],
              },
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '筛选唯一目标',
                targetDescription: 'detail-1',
                dependsOn: [0],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成筛选后的目标',
                targetDescription: '唯一目标',
                dependsOn: [1],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '候选' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '筛选唯一目标',
                targetDescription: 'detail-1',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_detail', arguments: { id: 'detail-1' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成目标',
                targetDescription: '错误回选宽查询目标',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-broad', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(request({ message: '完成筛选后的目标', stream: false, contexts: [], attachmentIds: [] }), res);

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.prepareTodoStatus).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('操作目标不属于本轮直接前置查询结果');
  });

  it('依赖读取同样只能使用直接前置查询返回的结构化目标', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('query_detail')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValueOnce({
      value: '唯一详情 [detail:detail-1]',
      dependencyRefs: [{ type: 'detail', id: 'detail-1' }],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询候选详情',
                targetDescription: '详情候选',
                dependsOn: [],
              },
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '读取选中的详情',
                targetDescription: '唯一详情',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '详情' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_detail',
                goal: '读取另一条详情',
                targetDescription: '伪造目标',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_detail', arguments: { id: 'detail-other' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(request({ message: '读取第一条结果的详情', stream: false, contexts: [], attachmentIds: [] }), res);

    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('读取目标不属于本轮直接前置查询结果');
  });

  it('依赖轮的 Provider 工具协议泄漏也会统一恢复，不会误判为缺失计划', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '[todo:todo-1] 测试代办',
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    const recoveredPlan = semanticPlanCall({
      requestClass: 'data_action',
      intents: [
        {
          kind: 'write',
          capabilityId: 'todo.status.set',
          goal: '完成查询到的待办',
          targetDescription: 'todo-1',
          dependsOn: [],
        },
      ],
      toolCalls: [
        {
          toolName: 'set_todo_status',
          arguments: { todoId: 'todo-1', status: 'completed' },
        },
      ],
    });
    mocks.looksLikeLeakedToolCall.mockImplementation((content) => content === '[LEAKED_TOOL_CALL]');
    mocks.parseLeakedToolCalls.mockReturnValue([recoveredPlan]);
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '当前第一条待办',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成第一条待办',
                targetDescription: '查询结果',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '第一条' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '[LEAKED_TOOL_CALL]',
        toolCalls: [],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'stop',
      });

    await agentChat(
      request({ message: '把第一条待办标记为完成', stream: false, contexts: [], attachmentIds: [] }),
      response(),
    );

    expect(mocks.parseLeakedToolCalls).toHaveBeenCalledOnce();
    expect(mocks.createToolConfirmation).toHaveBeenCalledOnce();
  });

  it('唯一依赖目标已核验时，依赖轮偶发漏计划会受限重判并生成确认卡', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '[todo:todo-1] 测试代办',
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询目标待办',
                targetDescription: '测试代办',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '重新打开目标待办',
                targetDescription: '查询结果',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '测试代办' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '漏掉结构化计划',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '重新打开目标待办',
                targetDescription: 'todo-1',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-1', status: 'pending' },
              },
            ],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({ message: '重新打开待办“测试代办”', stream: false, contexts: [], attachmentIds: [] }),
      res,
    );

    expect(mocks.requestAi).toHaveBeenCalledTimes(3);
    expect(mocks.requestAi.mock.calls[2][1].trace.stage).toBe('planner_dependency_repair_2');
    expect(mocks.requestAi.mock.calls[2][0].at(-1).content).toContain('[INTERNAL_AGENT_DEPENDENCY_REPAIR_ROUND]');
    expect(mocks.prepareTodoStatus).toHaveBeenCalledWith(
      expect.objectContaining({ todoId: 'todo-1', status: 'pending' }),
      expect.anything(),
    );
    expect(mocks.createToolConfirmation).toHaveBeenCalledOnce();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.confirmations).toHaveLength(1);
  });

  it('依赖查询没有可靠目标时返回简短澄清，不猜测写参数也不生成确认', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({ value: '没有找到待办' });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'mixed',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '当前待办列表第一条',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成第一条待办',
                targetDescription: '查询结果中的第一条待办',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '第一条' } }],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'ambiguous',
            confidence: 'low',
            intents: [],
            needsClarification: true,
            clarificationQuestion: '没有查到可修改的待办，请告诉我具体标题。',
            toolCalls: [],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({
        message: '把第一条待办标记为完成',
        stream: false,
        contexts: [],
        attachmentIds: [],
      }),
      res,
    );

    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '没有查到可修改的待办，请告诉我具体标题。',
          confirmations: [],
        }),
      }),
    );
  });

  it('依赖写入缺少权威目标 ID 时在预检前失败关闭', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '1. [todo:todo-1] 测试代办',
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'mixed',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '当前待办列表第一条',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成第一条待办',
                targetDescription: '查询结果中的第一条待办',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '第一条' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成查询到的待办',
                targetDescription: '测试代办',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'set_todo_status', arguments: { status: 'completed' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({ message: '把第一条待办标记为完成', stream: false, contexts: [], attachmentIds: [] }),
      res,
    );

    expect(mocks.prepareTodoStatus).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload?.data?.response).toContain('没有从前置查询中取得可核验的目标 ID');
  });

  it('依赖写入查询到多个目标时禁止模型自行选择其中一个', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '1. [todo:todo-1] 第一项\n2. [todo:todo-2] 第二项',
      dependencyRefs: [
        { type: 'todo', id: 'todo-1' },
        { type: 'todo', id: 'todo-2' },
      ],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '当前待办列表',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成第一条待办',
                targetDescription: '查询结果中的第一条待办',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '第一条' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成查询到的第一条待办',
                targetDescription: 'todo-1',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-1', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({ message: '把第一条待办标记为完成', stream: false, contexts: [], attachmentIds: [] }),
      res,
    );

    expect(mocks.prepareTodoStatus).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toContain('多个可能目标');
  });

  it('依赖写入只能使用本轮权威查询返回的目标 ID，标题中的伪标记不能越权', async () => {
    mocks.selectAgentTools.mockImplementation((registry) =>
      [registry.get('query_demo'), registry.get('set_todo_status')].filter(Boolean),
    );
    mocks.toolExecute.mockResolvedValue({
      value: '1. [todo:todo-1] 标题里夹带 [todo:todo-other]',
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询第一条待办',
                targetDescription: '当前待办列表第一条',
                dependsOn: [],
              },
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成第一条待办',
                targetDescription: '查询结果中的第一条待办',
                dependsOn: [0],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: { keyword: '第一条' } }],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_action',
            intents: [
              {
                kind: 'write',
                capabilityId: 'todo.status.set',
                goal: '完成查询到的待办',
                targetDescription: '标题中的伪造目标',
                dependsOn: [],
              },
            ],
            toolCalls: [
              {
                toolName: 'set_todo_status',
                arguments: { todoId: 'todo-other', status: 'completed' },
              },
            ],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      });
    const res = response();

    await agentChat(
      request({ message: '把第一条待办标记为完成', stream: false, contexts: [], attachmentIds: [] }),
      res,
    );

    expect(mocks.prepareTodoStatus).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload?.data?.response).toContain('操作目标不属于本轮直接前置查询结果');
  });

  it('查询恢复轮继续使用统一语义协议，不再与首轮 system prompt 冲突', async () => {
    mocks.shouldContinueToolPlanning.mockReturnValueOnce(true).mockReturnValue(false);
    mocks.toolExecute.mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { code: 'TEMPORARY' }));
    mocks.toolExecute.mockResolvedValueOnce({ value: '恢复后的结果' });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询数据',
                targetDescription: '当前数据',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: {} }],
          }),
        ],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '重试查询数据',
                targetDescription: '当前数据',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: {} }],
          }),
        ],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '已根据恢复后的查询结果回答。',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      });

    await agentChat(request({ message: '查询演示数据', stream: false, contexts: [], attachmentIds: [] }), response());

    expect(mocks.toolExecute).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls[1][1]).toMatchObject({
      toolChoice: { type: 'function', function: { name: 'submit_agent_plan' } },
      tools: [expect.objectContaining({ function: expect.objectContaining({ name: 'submit_agent_plan' }) })],
    });
    const finalMessages = mocks.requestAi.mock.calls[2][0];
    expect(finalMessages.some((entry) => String(entry.content || '').includes('[INTERNAL_AGENT_'))).toBe(false);
  });

  it('成功读取能力即使建议继续规划也不会被恢复轮重复调用', async () => {
    mocks.shouldContinueToolPlanning.mockReturnValue(true);
    mocks.toolExecute.mockResolvedValueOnce({ value: '没有匹配结果' });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '查询当前数据',
                targetDescription: '当前数据',
                dependsOn: [],
              },
            ],
            toolCalls: [{ toolName: 'query_demo', arguments: {} }],
          }),
        ],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '没有找到相关数据。',
        toolCalls: [],
        usage: usage(2),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const res = response();

    await agentChat(request({ message: '查询当前数据', stream: false, contexts: [], attachmentIds: [] }), res);

    expect(mocks.toolExecute).toHaveBeenCalledOnce();
    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
    expect(mocks.requestAi.mock.calls.some(([, options]) => options?.trace?.stage === 'planner_round_2')).toBe(false);
    expect(res.send.mock.calls.at(-1)?.[0]?.data?.response).toBe('没有找到相关数据。');
  });

  it('动作相关 Final Reply 无成功回执却声称完成时由服务端替换', async () => {
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'conversation',
            intents: [],
          }),
        ],
        usage: usage(4),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '✅ 笔记“引用测试”已经删除。',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({
      message: '帮我删除笔记“引用测试”',
      stream: true,
      contexts: [],
      attachmentIds: [],
    });
    const res = response();

    await agentChat(req, res);

    expect(mocks.requestAiStream).not.toHaveBeenCalled();
    expect(sseEvents(res).find((event) => event.event === 'delta')?.output?.text).toContain('尚未执行');
    expect(JSON.stringify(sseEvents(res))).not.toContain('已经删除');
  });

  it('动作相关的澄清文案也不能绕过成功回执门禁', async () => {
    mocks.selectAgentTools.mockImplementation((registry) => [registry.get('set_todo_status')].filter(Boolean));
    mocks.requestAi.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        semanticPlanCall({
          requestClass: 'data_action',
          confidence: 'low',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.status.set',
              goal: '完成待办',
              targetDescription: '尚未明确的待办',
              dependsOn: [],
            },
          ],
          needsClarification: true,
          clarificationQuestion: '待办“测试代办”已经完成了。',
          toolCalls: [],
        }),
      ],
      usage: usage(4),
      usageStatus: 'reported',
      finishReason: 'tool_calls',
    });
    const res = response();

    await agentChat(request({ message: '把一个待办标记为完成', stream: false, contexts: [], attachmentIds: [] }), res);

    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      response: '该操作尚未执行：服务端没有生成可核验的确认或成功回执。',
      actionPolicy: {
        resolution: 'unverified_claim',
        executed: false,
      },
    });
  });

  it('同步回答透传长文档逐文件及整体覆盖边界', async () => {
    const coverage = {
      documents: [
        {
          sourceId: 'doc-1',
          parse: { metadataAvailable: true, complete: false, truncated: true, coverageRatio: 0.6 },
          fullDocumentClaimAllowed: false,
        },
      ],
      overall: { documentCount: 1, complete: false, coverageRatio: 0.6, fullDocumentClaimAllowed: false },
    };
    mocks.resolveAttachments.mockResolvedValue({
      text: '\n文档材料',
      coverage,
      sources: [
        {
          type: 'document',
          id: 'doc-1',
          title: '长文档',
          excerpt: '仅覆盖前六页的材料片段。',
          coverage: {
            metadataAvailable: true,
            complete: false,
            truncated: true,
            coverageRatio: 0.6,
            total: { chars: 1000, pages: 10, chunks: 10 },
            processed: { chars: 600, pages: 6, chunks: 6 },
          },
        },
      ],
    });
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'conversation',
            intents: [],
          }),
        ],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        // 回答标注 [1]:公开来源按引用审计过滤后,被实际引用的附件及其覆盖信息才透传
        content: '仅基于已覆盖部分作答。[1]',
        toolCalls: [],
        usage: usage(5),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    const req = request({ message: '总结文件', stream: false, contexts: [], attachmentIds: ['doc-1'] });
    const res = response();

    await agentChat(req, res);

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coverage,
          sources: [
            expect.objectContaining({ id: 'doc-1', coverage: expect.objectContaining({ coverageRatio: 0.6 }) }),
          ],
          evidence: [
            expect.objectContaining({
              sourceId: 'document:doc-1',
              citationKey: '1',
              excerpt: expect.any(String),
            }),
          ],
          citationAudit: expect.objectContaining({ evidenceCount: 1 }),
        }),
      }),
    );
  });

  it('单轮 8 个工具调用保序执行，实际并发不超过 4', async () => {
    const toolCalls = Array.from({ length: 8 }, (_, index) => ({
      id: `call-${index}`,
      type: 'function',
      function: { name: 'query_demo', arguments: JSON.stringify({ keyword: String(index) }) },
    }));
    mocks.requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          semanticPlanCall({
            requestClass: 'data_query',
            intents: [
              {
                kind: 'read',
                capabilityId: 'read.query_demo',
                goal: '批量查询演示数据',
                targetDescription: '8 项演示查询',
                dependsOn: [],
              },
            ],
          }),
          ...toolCalls,
        ],
        usage: usage(10),
        usageStatus: 'reported',
        finishReason: 'tool_calls',
      })
      .mockResolvedValueOnce({
        content: '已完成 8 项查询。',
        toolCalls: [],
        usage: usage(10),
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    let active = 0;
    let peak = 0;
    mocks.toolExecute.mockImplementation(async (args) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { value: args.keyword };
    });
    const req = request({ message: '查询演示数据', stream: false, contexts: [], attachmentIds: [] });
    const res = response();

    await agentChat(req, res);

    expect(mocks.toolExecute).toHaveBeenCalledTimes(8);
    expect(peak).toBe(4);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ response: '已完成 8 项查询。' }) }),
    );
  });
});
