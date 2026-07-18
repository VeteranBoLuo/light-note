import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  prepareArgs: vi.fn(),
  preview: vi.fn(),
  createToolConfirmation: vi.fn(),
  inspectToolConfirmationExecution: vi.fn(),
  claimToolConfirmationExecution: vi.fn(),
  settleToolConfirmationExecution: vi.fn(),
  acquireToolConfirmationAction: vi.fn(),
  finalizeToolConfirmationAction: vi.fn(),
  executeImageNote: vi.fn(),
  getOrCreateSession: vi.fn(),
  createToolResolutionInteraction: vi.fn(),
  resolveAgentInteractionAction: vi.fn(),
  inspectAgentInteractionResponse: vi.fn(),
  claimAgentInteractionResponse: vi.fn(),
  settleAgentInteractionResponse: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.poolQuery },
}));

vi.mock('../util/agent/deepseekClient.js', () => ({
  requestDeepSeek: vi.fn(),
  requestDeepSeekStream: vi.fn(),
  getActiveProviderInfo: vi.fn(() => ({ price: { input: 0, output: 0 } })),
  looksLikeLeakedToolCall: vi.fn(() => false),
  parseLeakedToolCalls: vi.fn(() => []),
}));

vi.mock('../util/agent/timeRange.js', () => ({ parseTimeRange: vi.fn() }));
vi.mock('../util/agent/prompt.js', () => ({ buildPlannerPrompt: vi.fn() }));
vi.mock('../util/agent/toolRouter.js', () => ({ selectAgentTools: vi.fn(() => []) }));
vi.mock('../util/agent/secondRound.js', () => ({
  FOLLOW_UP_ROUND_INSTRUCTION: '',
  constrainSecondRoundToolCalls: vi.fn(() => []),
  selectSecondRoundTools: vi.fn(() => []),
  shouldContinueToolPlanning: vi.fn(() => false),
}));
vi.mock('../util/aiQuota.js', () => ({ reserve: vi.fn(), reconcile: vi.fn() }));
vi.mock('../util/aiDocument/service.js', () => ({ resolveDocumentAttachments: vi.fn() }));
vi.mock('../util/noteAiService.js', () => ({
  buildNoteAiPayload: vi.fn(),
  findOwnedNoteForAi: vi.fn(),
}));

vi.mock('../util/agent/sessionStore.js', () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  recordTurn: vi.fn(),
  getSessionId: (session) => session.id,
}));

vi.mock('../util/agent/interactionStore.js', () => {
  class AgentInteractionError extends Error {
    constructor(code, message, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    inspectAgentInteractionResponse: mocks.inspectAgentInteractionResponse,
    claimAgentInteractionResponse: mocks.claimAgentInteractionResponse,
    settleAgentInteractionResponse: mocks.settleAgentInteractionResponse,
    AgentInteractionError,
  };
});

vi.mock('../util/agent/interactionResolvers.js', () => ({
  createToolResolutionInteraction: mocks.createToolResolutionInteraction,
  resolveAgentInteractionAction: mocks.resolveAgentInteractionAction,
}));

vi.mock('../util/agent/confirmationStore.js', () => {
  class ToolConfirmationError extends Error {
    constructor(code, message, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    acquireToolConfirmationAction: mocks.acquireToolConfirmationAction,
    claimToolConfirmationExecution: mocks.claimToolConfirmationExecution,
    createToolConfirmation: mocks.createToolConfirmation,
    finalizeToolConfirmationAction: mocks.finalizeToolConfirmationAction,
    inspectToolConfirmationExecution: mocks.inspectToolConfirmationExecution,
    publicToolConfirmation: (token, confirmation, expiresIn = 300) => ({
      token,
      id: confirmation.id,
      sessionId: confirmation.sessionId,
      toolName: confirmation.toolName,
      args: confirmation.args,
      riskLevel: confirmation.riskLevel,
      preview: confirmation.preview,
      expiresIn,
    }),
    rejectToolConfirmation: vi.fn(),
    settleToolConfirmationExecution: mocks.settleToolConfirmationExecution,
    ToolConfirmationError,
  };
});

vi.mock('../util/agent/tools/index.js', () => ({
  default: [
    {
      name: 'save_attachment_to_cloud',
      description: '保存附件',
      parameters: { type: 'object', properties: {} },
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      normalizeArgs: (args) => ({
        attachmentId: String(args.attachment_id || args.attachmentId || ''),
        fileName: String(args.file_name || args.fileName || ''),
      }),
      prepareArgs: mocks.prepareArgs,
      preview: mocks.preview,
      execute: vi.fn(),
      transform: vi.fn(() => ''),
    },
    {
      name: 'create_image_note',
      description: '创建图片笔记',
      parameters: { type: 'object', properties: {} },
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      execute: mocks.executeImageNote,
      transform: vi.fn(() => '图片笔记已创建'),
    },
    {
      name: 'create_note',
      description: '创建笔记',
      parameters: { type: 'object', properties: {} },
      isWrite: true,
      directAction: false,
      riskLevel: 'low',
      execute: vi.fn(),
      transform: vi.fn(() => ''),
    },
  ],
}));

const { confirmAgentTool, prepareAgentToolAction, respondAgentInteraction } = await import('./agentHandle.js');
const { ToolConfirmationError } = await import('../util/agent/confirmationStore.js');

function createResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('prepareAgentToolAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.getOrCreateSession.mockResolvedValue({ id: 'session-server' });
    mocks.acquireToolConfirmationAction.mockResolvedValue(true);
    mocks.finalizeToolConfirmationAction.mockResolvedValue(undefined);
    mocks.settleToolConfirmationExecution.mockImplementation(async (_confirmation, outcome) => outcome);
    mocks.executeImageNote.mockResolvedValue({ id: 'note-1', title: '测试图片' });
    mocks.prepareArgs.mockImplementation(async (args) => ({ ...args, folderId: '12', folderName: '项目资料' }));
    mocks.preview.mockResolvedValue({ title: '保存附件', target: '项目资料 / 测试.png' });
    mocks.createToolConfirmation.mockResolvedValue({
      token: 'token-1',
      expiresIn: 300,
      confirmation: {
        id: 'confirm-1',
        sessionId: 'session-server',
        toolName: 'save_attachment_to_cloud',
        args: { attachmentId: 'attachment-1', fileName: '测试.png', folderId: '12', folderName: '项目资料' },
        riskLevel: 'low',
        preview: { title: '保存附件', target: '项目资料 / 测试.png' },
      },
    });
    mocks.settleAgentInteractionResponse.mockImplementation(async (_interaction, _response, outcome) => outcome);
  });

  it('只用用户最终结构化参数生成确认，不调用模型', async () => {
    const req = {
      body: {
        sessionId: '',
        toolName: 'save_attachment_to_cloud',
        args: { attachment_id: 'attachment-1', file_name: '测试.png' },
      },
      user: { id: 'user-1', role: 'user', alias: '测试用户' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(mocks.prepareArgs).toHaveBeenCalledWith(
      { attachmentId: 'attachment-1', fileName: '测试.png' },
      expect.objectContaining({ userId: 'user-1', request: req }),
    );
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: 'user:user-1',
        sessionId: 'session-server',
        toolName: 'save_attachment_to_cloud',
        args: expect.objectContaining({ fileName: '测试.png', folderId: '12' }),
      }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          sessionId: 'session-server',
          confirmation: expect.objectContaining({ token: 'token-1', toolName: 'save_attachment_to_cloud' }),
        }),
      }),
    );
  });

  it('拒绝未加入直达白名单的写工具', async () => {
    const req = {
      body: { toolName: 'create_note', args: { title: '不能绕过 Planner' } },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'TOOL_DIRECT_ACTION_NOT_ALLOWED' }, status: 400 }),
    );
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
  });

  it('游客不能准备附件写操作', async () => {
    const req = {
      body: { toolName: 'save_attachment_to_cloud', args: { attachmentId: 'attachment-1' } },
      user: { id: 'visitor', role: 'visitor' },
      headers: { fingerprint: 'visitor-test' },
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'GUEST_FORBIDDEN' }, status: 403 }));
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
  });

  it('管理员只读预览不能准备写操作', async () => {
    const req = {
      body: { toolName: 'save_attachment_to_cloud', args: { attachmentId: 'attachment-1' } },
      user: { id: 'root-1', role: 'root' },
      resourceUser: { id: 'user-1', role: 'user' },
      billingUser: { id: 'root-1', role: 'root' },
      adminContext: { id: 'context-1', mode: 'readonly' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'TOOL_CONFIRMATION_FORBIDDEN' }, status: 403 }),
    );
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
  });

  it('结构化业务错误保留错误码但不向用户暴露技术前缀', async () => {
    const error = new Error('FOLDER_NOT_FOUND: 目标文件夹不存在');
    error.code = 'FOLDER_NOT_FOUND';
    mocks.prepareArgs.mockRejectedValueOnce(error);
    const req = {
      body: { toolName: 'save_attachment_to_cloud', args: { attachmentId: 'attachment-1', folderId: '404' } },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: 'FOLDER_NOT_FOUND' },
        status: 404,
        msg: '目标文件夹不存在',
      }),
    );
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
  });

  it('旧客户端未声明 interaction 能力时保持原错误，不签发无法展示的选择卡', async () => {
    const folderError = Object.assign(new Error('FOLDER_NOT_FOUND: 没有找到名为“项目资料”的文件夹'), {
      code: 'FOLDER_NOT_FOUND',
    });
    mocks.prepareArgs.mockRejectedValueOnce(folderError);
    const req = {
      body: {
        toolName: 'save_attachment_to_cloud',
        args: { attachmentId: 'attachment-1', folderName: '项目资料' },
      },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(mocks.createToolResolutionInteraction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'FOLDER_NOT_FOUND' }, status: 404 }),
    );
  });

  it('声明 interaction 能力后，文件夹不存在返回选择卡而不是普通错误', async () => {
    const folderError = Object.assign(new Error('FOLDER_NOT_FOUND: 没有找到名为“项目资料”的文件夹'), {
      code: 'FOLDER_NOT_FOUND',
    });
    mocks.prepareArgs.mockRejectedValueOnce(folderError);
    mocks.createToolResolutionInteraction.mockResolvedValueOnce({
      interaction: {
        token: 'interaction-token',
        id: 'interaction-1',
        sessionId: 'session-server',
        type: 'single_choice',
      },
    });
    const req = {
      body: {
        clientCapabilities: ['agent_interaction_v1'],
        toolName: 'save_attachment_to_cloud',
        args: { attachmentId: 'attachment-1', folderName: '项目资料' },
      },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await prepareAgentToolAction(req, res);

    expect(mocks.createToolResolutionInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'save_attachment_to_cloud', ownerKey: 'user:user-1' }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({ interaction: expect.objectContaining({ id: 'interaction-1' }) }),
      }),
    );
  });
});

describe('respondAgentInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue({ title: '保存附件', target: '项目资料 / 测试.png' });
    mocks.prepareArgs.mockImplementation(async (args) => ({ ...args, folderStrategy: 'create_if_missing' }));
    mocks.createToolConfirmation.mockImplementation(async ({ token, args }) => ({
      token,
      expiresIn: 300,
      confirmation: {
        id: 'confirm-promoted',
        sessionId: 'session-1',
        toolName: 'save_attachment_to_cloud',
        args,
        riskLevel: 'low',
        preview: { title: '保存附件' },
      },
    }));
    mocks.settleAgentInteractionResponse.mockImplementation(async (_interaction, _response, outcome) => outcome);
  });

  it('把同一个 interaction token 晋级为写操作确认并只结算一次', async () => {
    const interaction = {
      id: 'interaction-1',
      sessionId: 'session-1',
      resourceUserId: 'user-1',
      resourceUserRole: 'user',
      adminContextId: null,
      action: { toolName: 'save_attachment_to_cloud' },
    };
    const response = { cancelled: false, selectedIds: ['create_and_save'], customValue: '' };
    mocks.inspectAgentInteractionResponse.mockResolvedValueOnce({ state: 'ready', interaction, response });
    mocks.claimAgentInteractionResponse.mockResolvedValueOnce({ state: 'claimed', interaction, response });
    mocks.resolveAgentInteractionAction.mockReturnValueOnce({
      state: 'confirmation_required',
      toolName: 'save_attachment_to_cloud',
      args: { attachmentId: 'attachment-1', fileName: '测试.png', folderName: '项目资料' },
    });
    const req = {
      body: {
        interactionToken: 'same-interaction-token',
        sessionId: 'session-1',
        selectedIds: ['create_and_save'],
      },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await respondAgentInteraction(req, res);

    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'same-interaction-token', sessionId: 'session-1' }),
    );
    expect(mocks.settleAgentInteractionResponse).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          state: 'confirmation_required',
          confirmation: expect.objectContaining({ token: 'same-interaction-token' }),
        }),
      }),
    );
  });

  it('已结算的回答直接回放并恢复 token，不重复签发确认', async () => {
    mocks.inspectAgentInteractionResponse.mockResolvedValueOnce({
      state: 'settled',
      interaction: {
        sessionId: 'session-1',
        resourceUserId: 'user-1',
        resourceUserRole: 'user',
        adminContextId: null,
      },
      response: { cancelled: false, selectedIds: ['save_to_root'], customValue: '' },
      outcome: {
        state: 'confirmation_required',
        confirmation: { id: 'confirm-1', sessionId: 'session-1', toolName: 'save_attachment_to_cloud' },
      },
    });
    const req = {
      body: { interactionToken: 'replay-token', sessionId: 'session-1', selectedIds: ['save_to_root'] },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await respondAgentInteraction(req, res);

    expect(mocks.claimAgentInteractionResponse).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confirmation: expect.objectContaining({ token: 'replay-token' }) }),
      }),
    );
  });

  it('资源账号或管理员上下文变化时拒绝继续，不生成确认', async () => {
    mocks.inspectAgentInteractionResponse.mockResolvedValueOnce({
      state: 'ready',
      interaction: {
        sessionId: 'session-1',
        resourceUserId: 'other-user',
        resourceUserRole: 'user',
        adminContextId: null,
      },
      response: { cancelled: false, selectedIds: ['save_to_root'], customValue: '' },
    });
    const req = {
      body: { interactionToken: 'foreign-token', sessionId: 'session-1', selectedIds: ['save_to_root'] },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await respondAgentInteraction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.claimAgentInteractionResponse).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
  });
});

describe('confirmAgentTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.acquireToolConfirmationAction.mockResolvedValue(true);
    mocks.finalizeToolConfirmationAction.mockResolvedValue(undefined);
    mocks.settleToolConfirmationExecution.mockImplementation(async (_confirmation, outcome) => outcome);
    mocks.executeImageNote.mockResolvedValue({ id: 'note-1', title: '测试图片' });
    const confirmation = {
      id: 'confirm-image-1',
      sessionId: 'session-image',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-1', title: '测试图片' },
      resourceUserId: 'user-1',
      resourceUserRole: 'user',
      adminContextId: null,
      adminMode: null,
      actionLockKey: 'agent:action-lock:test',
      idempotencyKey: 'agent-write-v1:confirm-image',
    };
    mocks.inspectToolConfirmationExecution.mockResolvedValue({ state: 'ready', confirmation });
    mocks.claimToolConfirmationExecution.mockResolvedValue({ state: 'claimed', confirmation });
  });

  it('完成身份和工具校验后才获取动作锁，并在执行成功后进入冷却', async () => {
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user', alias: '测试用户' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    const confirmation = (await mocks.inspectToolConfirmationExecution.mock.results[0].value).confirmation;
    expect(mocks.acquireToolConfirmationAction).toHaveBeenCalledWith(confirmation);
    expect(mocks.inspectToolConfirmationExecution.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.claimToolConfirmationExecution.mock.invocationCallOrder[0],
    );
    expect(mocks.claimToolConfirmationExecution.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.acquireToolConfirmationAction.mock.invocationCallOrder[0],
    );
    expect(mocks.acquireToolConfirmationAction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.executeImageNote.mock.invocationCallOrder[0],
    );
    expect(mocks.finalizeToolConfirmationAction).toHaveBeenCalledWith(await confirmation, { succeeded: true });
    expect(mocks.executeImageNote).toHaveBeenCalledWith(
      confirmation.args,
      expect.objectContaining({ idempotencyKey: 'agent-write-v1:confirm-image' }),
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('身份校验失败时不获取或释放动作锁，也不执行工具', async () => {
    const confirmation = {
      id: 'confirm-foreign',
      sessionId: 'session-image',
      toolName: 'create_image_note',
      args: { attachmentId: 'attachment-1' },
      resourceUserId: 'other-user',
      resourceUserRole: 'user',
      actionLockKey: 'agent:action-lock:foreign',
    };
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({ state: 'ready', confirmation });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.acquireToolConfirmationAction).not.toHaveBeenCalled();
    expect(mocks.executeImageNote).not.toHaveBeenCalled();
    expect(mocks.finalizeToolConfirmationAction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('工具校验失败时不获取动作锁', async () => {
    const confirmation = {
      id: 'confirm-invalid-tool',
      sessionId: 'session-image',
      toolName: 'missing_write_tool',
      args: {},
      resourceUserId: 'user-1',
      resourceUserRole: 'user',
      actionLockKey: 'agent:action-lock:invalid-tool',
    };
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({ state: 'ready', confirmation });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.acquireToolConfirmationAction).not.toHaveBeenCalled();
    expect(mocks.finalizeToolConfirmationAction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('动作锁被占用时不执行工具，也不会释放其他确认持有的锁', async () => {
    mocks.acquireToolConfirmationAction.mockRejectedValueOnce(
      new ToolConfirmationError('TOOL_ACTION_PENDING', '图片笔记操作正在执行。', 409),
    );
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.executeImageNote).not.toHaveBeenCalled();
    expect(mocks.finalizeToolConfirmationAction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'TOOL_ACTION_PENDING' }, status: 409 }),
    );
  });

  it('已经取得动作锁但工具执行失败时释放自己的锁', async () => {
    mocks.executeImageNote.mockResolvedValueOnce({ error: 'DUPLICATE_TITLE', message: '笔记标题已存在。' });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    const confirmation = (await mocks.inspectToolConfirmationExecution.mock.results[0].value).confirmation;
    expect(mocks.acquireToolConfirmationAction).toHaveBeenCalledWith(confirmation);
    expect(mocks.finalizeToolConfirmationAction).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeToolConfirmationAction).toHaveBeenCalledWith(confirmation, { succeeded: false });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('同一令牌已有成功结果时直接回放，不再次执行写工具', async () => {
    const confirmation = {
      id: 'confirm-replay',
      sessionId: 'session-image',
      toolName: 'create_image_note',
      resourceUserId: 'user-1',
      resourceUserRole: 'user',
      adminContextId: null,
      adminMode: null,
    };
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({
      state: 'settled',
      confirmation,
      outcome: {
        httpStatus: 200,
        data: {
          toolName: 'create_image_note',
          summary: '图片笔记已创建',
          sources: [{ type: 'note', id: 'note-1', title: '测试图片' }],
        },
        message: '',
      },
    });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.claimToolConfirmationExecution).not.toHaveBeenCalled();
    expect(mocks.executeImageNote).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          summary: '图片笔记已创建',
          sources: [expect.objectContaining({ id: 'note-1' })],
        }),
      }),
    );
  });

  it('同一令牌仍在执行时返回可识别的安全重试状态', async () => {
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({
      state: 'running',
      confirmation: {
        id: 'confirm-running',
        sessionId: 'session-image',
        toolName: 'create_image_note',
        resourceUserId: 'user-1',
        resourceUserRole: 'user',
        adminContextId: null,
        adminMode: null,
      },
    });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.executeImageNote).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'TOOL_CONFIRMATION_IN_PROGRESS', retryable: true }),
      }),
    );
  });

  it('COMMIT 结果未知时不缓存失败也不释放动作锁', async () => {
    const error = new Error('commit response lost');
    error.commitOutcomeUnknown = true;
    mocks.executeImageNote.mockRejectedValueOnce(error);
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.settleToolConfirmationExecution).not.toHaveBeenCalled();
    expect(mocks.finalizeToolConfirmationAction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'TOOL_CONFIRMATION_RESULT_PENDING' }) }),
    );
  });
});
