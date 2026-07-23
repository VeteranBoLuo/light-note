import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  recordPendingActionBatch: vi.fn(),
  recordPendingActionBatchById: vi.fn(),
  resolveSessionActionRetry: vi.fn(() => ({ state: 'none' })),
  settleSessionAction: vi.fn(),
  shouldContinueToolPlanning: vi.fn(() => false),
  prepareTodoStatus: vi.fn(),
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
vi.mock('../util/aiDocument/service.js', () => ({
  resolveDocumentAttachments: mocks.resolveAttachments,
}));
vi.mock('../util/aiMemoryService.js', () => ({
  resolveAiMemoryIdentity: mocks.resolveAiMemoryIdentity,
  getActiveAiMemoriesForPrompt: mocks.getActiveAiMemoriesForPrompt,
  createAiMemoryCandidate: mocks.createAiMemoryCandidate,
}));
vi.mock('../util/noteAiService.js', () => ({ buildNoteAiPayload: vi.fn(), findOwnedNoteForAi: vi.fn() }));
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
      name: 'create_note',
      description: '创建一篇笔记',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
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
      preview: (args) => ({ title: '创建笔记', target: args.title, impact: '确认后才会创建。' }),
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
    inspectToolConfirmationExecution: vi.fn(),
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
    mocks.publicToolConfirmation.mockImplementation((token, confirmation, expiresIn) => ({
      ...confirmation,
      token,
      expiresIn,
    }));
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
    const req = request({ message: '把待办「测试代办」标记为完成', stream: false, contexts: [], attachmentIds: [] });
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
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          response: '',
          confirmations: [expect.objectContaining({ id: 'confirmation-1', toolName: 'set_todo_status' })],
        }),
      }),
    );
  });

  it('流式待确认操作先发送确认卡事件，再以空正文终态收口', async () => {
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
    const req = request({ message: '把待办「测试代办」标记为完成', stream: true, contexts: [], attachmentIds: [] });
    const res = response();

    await agentChat(req, res);

    const output = sseEvents(res);
    const confirmationIndex = output.findIndex((event) => event.event === 'tool_confirmation');
    const terminalIndex = output.findIndex((event) => event.event === 'response.completed');
    expect(confirmationIndex).toBeGreaterThanOrEqual(0);
    expect(terminalIndex).toBeGreaterThan(confirmationIndex);
    expect(output.some((event) => event.event === 'delta')).toBe(false);
    expect(output[terminalIndex]).toEqual(expect.objectContaining({ answer: '' }));
    expect(mocks.requestAi).toHaveBeenCalledTimes(1);
    expect(mocks.requestAiStream).not.toHaveBeenCalled();
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
            toolCalls: [
              { toolName: 'query_demo', arguments: { keyword: '最近7天' } },
              { toolName: 'query_detail', arguments: { id: 'detail-1' } },
            ],
          }),
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
        toolCalls: [omittedMultiReadPlan()],
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
            toolCalls: [
              { toolName: 'query_demo', arguments: { keyword: '最近7天' } },
              { toolName: 'query_detail', arguments: { id: 'detail-1' } },
            ],
          }),
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

    expect(mocks.requestAi).toHaveBeenCalledTimes(2);
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
        content: '仅基于已覆盖部分作答。',
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
