import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../util/agent/aiGateway.js', () => ({
  requestAi: mocks.requestAi,
  requestAiStream: mocks.requestAiStream,
}));
vi.mock('../util/agent/deepseekClient.js', () => ({
  getActiveProviderInfo: vi.fn(() => ({ provider: 'test', model: 'test-model', price: { input: 0, output: 0 } })),
  looksLikeLeakedToolCall: vi.fn(() => false),
  parseLeakedToolCalls: vi.fn(() => []),
}));
vi.mock('../util/agent/prompt.js', () => ({ buildPlannerPrompt: vi.fn(() => 'system') }));
vi.mock('../util/agent/toolRouter.js', () => ({
  selectAgentTools: vi.fn((registry) => [registry.get('query_demo')].filter(Boolean)),
}));
vi.mock('../util/agent/secondRound.js', () => ({
  FOLLOW_UP_ROUND_INSTRUCTION: '',
  constrainSecondRoundToolCalls: vi.fn(() => []),
  selectSecondRoundTools: vi.fn(() => []),
  shouldContinueToolPlanning: vi.fn(() => false),
}));
vi.mock('../util/agent/sessionStore.js', () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  recordTurn: mocks.recordTurn,
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
      transform: (raw) => `结果:${raw.value}`,
      summarize: (raw) => `结果:${raw.value}`,
    },
  ],
}));
vi.mock('../util/agent/confirmationStore.js', () => {
  class ToolConfirmationError extends Error {}
  return {
    acquireToolConfirmationAction: vi.fn(),
    claimToolConfirmationExecution: vi.fn(),
    createToolConfirmation: vi.fn(),
    finalizeToolConfirmationAction: vi.fn(),
    inspectToolConfirmationExecution: vi.fn(),
    publicToolConfirmation: vi.fn(),
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
    mocks.requestAi.mockResolvedValue({
      content: 'DIRECT_REPLY',
      toolCalls: [],
      usage: usage(1),
      usageStatus: 'reported',
      finishReason: 'stop',
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
    expect(agentLogInsert[1][16]).toContain('正文不写入日志');
    expect(agentLogInsert[1][16]).not.toContain('你好');
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
        content: 'DIRECT_REPLY',
        toolCalls: [],
        usage: usage(3),
        usageStatus: 'reported',
        finishReason: 'stop',
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
        toolCalls,
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
