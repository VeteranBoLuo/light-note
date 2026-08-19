import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  prepareArgs: vi.fn(),
  preview: vi.fn(),
  createNotePreview: vi.fn(),
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
  recordPendingActionBatch: vi.fn(),
  recordPendingActionBatchById: vi.fn(),
  resolveSessionActionRetry: vi.fn(() => ({ state: 'none' })),
  settleSessionAction: vi.fn(),
  rejectToolConfirmation: vi.fn(),
  completeActionContinuation: vi.fn(),
  discardActionContinuation: vi.fn(),
  rebindActionContinuation: vi.fn(),
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
vi.mock('../util/agent/toolRouter.js', () => ({
  matchAgentWriteActionToolNames: vi.fn(() => []),
  selectAgentTools: vi.fn(() => []),
}));
vi.mock('../util/agent/secondRound.js', () => ({
  DEPENDENCY_ROUND_INSTRUCTION: '[INTERNAL_AGENT_DEPENDENCY_ROUND]',
  FOLLOW_UP_ROUND_INSTRUCTION: '[INTERNAL_AGENT_RECOVERY_ROUND]',
  isInternalPlanningInstruction: vi.fn(() => false),
  shouldContinueToolPlanning: vi.fn(() => false),
}));
vi.mock('../util/aiQuota.js', () => ({
  reserve: vi.fn(),
  reconcile: vi.fn(),
  resolveFingerprint: vi.fn((req) => String(req?.headers?.fingerprint || req?.ip || 'test')),
}));
vi.mock('../util/aiDocument/service.js', () => ({ resolveDocumentAttachments: vi.fn() }));
vi.mock('../util/noteAiService.js', () => ({
  buildNoteAiPayload: vi.fn(),
  findOwnedNoteForAi: vi.fn(),
}));

vi.mock('../util/agent/sessionStore.js', () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  recordPendingActionBatch: mocks.recordPendingActionBatch,
  recordPendingActionBatchById: mocks.recordPendingActionBatchById,
  recordTurn: vi.fn(),
  resolveSessionActionRetry: mocks.resolveSessionActionRetry,
  settleSessionAction: mocks.settleSessionAction,
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
    claimActionContinuation: vi.fn(),
    completeActionContinuation: mocks.completeActionContinuation,
    createActionContinuation: vi.fn(),
    discardActionContinuation: mocks.discardActionContinuation,
    finalizeActionContinuation: vi.fn(),
    inspectActionContinuation: vi.fn(),
    rebindActionContinuation: mocks.rebindActionContinuation,
    releaseActionContinuation: vi.fn(),
    settleActionContinuation: vi.fn(),
  };
});

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
    rejectToolConfirmation: mocks.rejectToolConfirmation,
    settleToolConfirmationExecution: mocks.settleToolConfirmationExecution,
    ToolConfirmationError,
  };
});

vi.mock('../util/agent/tools/index.js', () => ({
  default: [
    {
      name: 'save_attachment_to_cloud',
      description: '保存附件',
      parameters: {
        type: 'object',
        properties: {
          attachmentId: { type: 'string' },
          fileName: { type: 'string' },
          folderId: { type: 'string' },
          folderName: { type: 'string' },
          folderStrategy: { type: 'string' },
        },
      },
      argumentAliases: ['attachment_id', 'file_name'],
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
      parameters: {
        type: 'object',
        properties: { attachmentId: { type: 'string' }, title: { type: 'string' } },
      },
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      execute: mocks.executeImageNote,
      transform: vi.fn(() => '图片笔记已创建'),
    },
    {
      name: 'create_note',
      description: '创建笔记',
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
      directAction: false,
      riskLevel: 'low',
      normalizeArgs: (args) => ({
        title: String(args.title || '').trim(),
        content: String(args.content || '').trim(),
        ...(String(args.parentId || '').trim() ? { parentId: String(args.parentId).trim() } : {}),
      }),
      preview: mocks.createNotePreview,
      execute: vi.fn(),
      transform: vi.fn(() => ''),
    },
  ],
}));

const {
  confirmAgentTool,
  prepareAgentToolAction,
  rejectAgentTool,
  replaceAgentNoteTargetDirectory,
  respondAgentInteraction,
} = await import('./agentHandle.js');
const { ToolConfirmationError } = await import('../util/agent/confirmationStore.js');

afterEach(() => {
  vi.unstubAllEnvs();
});

function createResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * 把 agent_logs 的 INSERT 还原成「列名 → 值」，顺带校验列与占位符数量一致——
 * 这条 SQL 有 30 多个位置参数，错位不会报错，只会把值写进相邻列。
 */
function agentLogInsert() {
  const call = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO agent_logs'));
  if (!call) return null;
  const [sql, params] = call;
  const columns = String(sql)
    .match(/\(([^)]*)\)\s*VALUES/)[1]
    .split(',')
    .map((column) => column.trim());
  expect(columns.length).toBe(params.length);
  return Object.fromEntries(columns.map((column, index) => [column, params[index]]));
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
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'FOLDER_NOT_FOUND' }, status: 404 }));
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

describe('replaceAgentNoteTargetDirectory', () => {
  const previousConfirmation = {
    id: 'confirm-note-old',
    sessionId: 'session-note',
    toolName: 'create_note',
    args: { title: '可信标题', content: '可信正文', parentId: 'directory-old' },
    resourceUserId: 'user-1',
    resourceUserRole: 'user',
    adminContextId: null,
    adminMode: null,
    privateContext: { sourceMessage: '基于材料创建一篇笔记' },
    originRequestId: 'request-original',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.inspectToolConfirmationExecution.mockResolvedValue({
      state: 'ready',
      confirmation: previousConfirmation,
    });
    mocks.createNotePreview.mockResolvedValue({
      title: '创建笔记',
      target: '可信标题',
      details: [{ key: 'targetDirectory', value: '项目 / 研发' }],
    });
    mocks.createToolConfirmation.mockImplementation(async (input) => ({
      token: 'replacement-token',
      expiresIn: 300,
      confirmation: {
        id: 'confirm-note-new',
        sessionId: input.sessionId,
        toolName: input.toolName,
        args: input.args,
        riskLevel: 'low',
        preview: input.preview,
      },
    }));
    mocks.recordPendingActionBatchById.mockResolvedValue(true);
    mocks.settleSessionAction.mockResolvedValue(true);
  });

  it('只接受新 parentId，并用原确认中的可信标题、正文和私有上下文原子签发替代令牌', async () => {
    const req = {
      body: {
        confirmationToken: 'old-token',
        sessionId: 'session-note',
        parentId: ' directory-new ',
        title: '恶意替换标题',
        content: '恶意替换正文',
      },
      user: { id: 'user-1', role: 'user', alias: '测试用户' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await replaceAgentNoteTargetDirectory(req, res);

    expect(mocks.createNotePreview).toHaveBeenCalledWith(
      { title: '可信标题', content: '可信正文', parentId: 'directory-new' },
      expect.objectContaining({ userId: 'user-1', userRole: 'user', request: req }),
    );
    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: 'user:user-1',
        sessionId: 'session-note',
        toolName: 'create_note',
        args: { title: '可信标题', content: '可信正文', parentId: 'directory-new' },
        replaceToken: 'old-token',
        replaceConfirmationId: 'confirm-note-old',
        privateContext: previousConfirmation.privateContext,
        originRequestId: 'request-original',
      }),
    );
    expect(mocks.recordPendingActionBatchById).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: 'user:user-1',
        sessionId: 'session-note',
        actions: [expect.objectContaining({ confirmationId: 'confirm-note-new', toolName: 'create_note' })],
      }),
    );
    expect(mocks.settleSessionAction).toHaveBeenCalledWith({
      ownerKey: 'user:user-1',
      sessionId: 'session-note',
      confirmationId: 'confirm-note-old',
      state: 'cancelled',
      summary: '目标目录已更新。',
    });
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          previousConfirmationId: 'confirm-note-old',
          confirmation: expect.objectContaining({
            id: 'confirm-note-new',
            token: 'replacement-token',
            args: { title: '可信标题', content: '可信正文', parentId: 'directory-new' },
          }),
        }),
      }),
    );
  });

  it('目标目录超深时返回稳定业务错误，且不签发新令牌', async () => {
    mocks.createNotePreview.mockRejectedValueOnce(
      Object.assign(new Error('笔记目录最多支持 8 层'), {
        code: 'NOTE_TREE_DEPTH_EXCEEDED',
        status: 409,
      }),
    );
    const req = {
      body: { confirmationToken: 'old-token', sessionId: 'session-note', parentId: 'depth-8' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await replaceAgentNoteTargetDirectory(req, res);

    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 409,
        data: { code: 'NOTE_TREE_DEPTH_EXCEEDED' },
        msg: '笔记目录最多支持 8 层',
      }),
    );
  });

  it('页面树写入灰度关闭时拒绝替换到子目录，且不读取旧确认令牌', async () => {
    vi.stubEnv('NOTE_TREE_WRITE_ENABLED', 'false');
    const req = {
      body: { confirmationToken: 'old-token', sessionId: 'session-note', parentId: 'directory-new' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await replaceAgentNoteTargetDirectory(req, res);

    expect(mocks.inspectToolConfirmationExecution).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        data: { code: 'NOTE_TREE_FEATURE_DISABLED' },
      }),
    );
  });

  it('页面树写入灰度关闭后仍允许把待确认目标安全降级到知识库根层', async () => {
    vi.stubEnv('NOTE_TREE_WRITE_ENABLED', 'false');
    const req = {
      body: { confirmationToken: 'old-token', sessionId: 'session-note', parentId: null },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await replaceAgentNoteTargetDirectory(req, res);

    expect(mocks.createToolConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create_note',
        args: { title: '可信标题', content: '可信正文' },
      }),
    );
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('原确认属于其他资源账号时在签发前拒绝', async () => {
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({
      state: 'ready',
      confirmation: { ...previousConfirmation, resourceUserId: 'other-user' },
    });
    const req = {
      body: { confirmationToken: 'old-token', sessionId: 'session-note', parentId: null },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await replaceAgentNoteTargetDirectory(req, res);

    expect(mocks.createNotePreview).not.toHaveBeenCalled();
    expect(mocks.createToolConfirmation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
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
    expect(mocks.settleSessionAction).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-image',
        confirmationId: 'confirm-image-1',
        state: 'succeeded',
      }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          actionReceipt: expect.objectContaining({
            actionId: 'confirm-image-1',
            toolName: 'create_image_note',
            status: 'succeeded',
          }),
        }),
      }),
    );
  });

  it('写操作成功后才激活匹配的续答令牌，续答异常不改变权威成功结果', async () => {
    mocks.completeActionContinuation.mockResolvedValueOnce({
      schemaVersion: 1,
      token: 'continuation-token',
      policy: 'final_reply',
    });
    const req = {
      body: {
        confirmationToken: 'token-image',
        continuationToken: 'continuation-token',
        sessionId: 'session-image',
        clientCapabilities: ['agent_continuation_v1'],
      },
      user: { id: 'user-1', role: 'user', alias: '测试用户' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.completeActionContinuation).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'continuation-token',
        sessionId: 'session-image',
        action: { kind: 'confirmation', id: 'confirm-image-1' },
        outcome: expect.objectContaining({
          receipt: expect.objectContaining({ status: 'succeeded', actionId: 'confirm-image-1' }),
        }),
      }),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        data: expect.objectContaining({
          actionReceipt: expect.objectContaining({ status: 'succeeded' }),
          continuation: expect.objectContaining({ policy: 'final_reply' }),
        }),
      }),
    );
  });

  it('页面树写入灰度关闭后拒绝执行已有的子目录创建确认', async () => {
    vi.stubEnv('NOTE_TREE_WRITE_ENABLED', 'false');
    const confirmation = {
      id: 'confirm-note-directory',
      sessionId: 'session-note',
      toolName: 'create_note',
      args: { title: '项目笔记', content: '正文', parentId: 'directory-1' },
      resourceUserId: 'user-1',
      resourceUserRole: 'user',
      adminContextId: null,
      adminMode: null,
    };
    mocks.inspectToolConfirmationExecution.mockResolvedValueOnce({ state: 'ready', confirmation });
    const req = {
      body: { confirmationToken: 'token-note', sessionId: 'session-note' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await confirmAgentTool(req, res);

    expect(mocks.claimToolConfirmationExecution).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        data: expect.objectContaining({ code: 'NOTE_TREE_FEATURE_DISABLED' }),
      }),
    );
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
      // settled binding 故意不带 args；create_note 的 schema 有必填 title，能防止
      // 回放路径误入参数校验后被当成新执行拒绝。
      toolName: 'create_note',
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
          toolName: 'create_note',
          summary: '笔记已创建',
          sources: [{ type: 'note', id: 'note-1', title: '测试笔记' }],
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
          summary: '笔记已创建',
          sources: [expect.objectContaining({ id: 'note-1' })],
          actionReceipt: expect.objectContaining({
            actionId: 'confirm-replay',
            toolName: 'create_note',
            status: 'succeeded',
          }),
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

// 发卡、用户确认、用户驳回是三个独立请求，各有自己的 request_id。correlation_id 是唯一能把它们
// 串起来的字段，后台据此回答「确认卡发出去了吗、用户点了没有、最后成功了吗」。
describe('确认动作链路日志', () => {
  const settledConfirmation = {
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
    originRequestId: 'origin-request-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue([[]]);
    mocks.acquireToolConfirmationAction.mockResolvedValue(true);
    mocks.finalizeToolConfirmationAction.mockResolvedValue(undefined);
    mocks.settleToolConfirmationExecution.mockImplementation(async (_confirmation, outcome) => outcome);
    mocks.executeImageNote.mockResolvedValue({ id: 'note-1', title: '测试图片' });
    mocks.inspectToolConfirmationExecution.mockResolvedValue({ state: 'ready', confirmation: settledConfirmation });
    mocks.claimToolConfirmationExecution.mockResolvedValue({ state: 'claimed', confirmation: settledConfirmation });
  });

  it('确认执行成功后把日志挂回发卡那一轮的链路', async () => {
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user', alias: '测试用户' },
      headers: {},
      ip: '127.0.0.1',
    };

    await confirmAgentTool(req, createResponse());

    const log = agentLogInsert();
    expect(log).toMatchObject({
      task_type: 'agent_confirmation',
      status: 'success',
      correlation_id: 'origin-request-1',
      confirmation_id: 'confirm-image-1',
      // 确认执行本身不产出对话正文，只落动作结果
      outcome_kind: 'action_only',
      delivered: 1,
      answer_digest: null,
    });
    // 自身 request_id 必须与链路键区分开，否则详情页无法定位当前这一条
    expect(log.request_id).not.toBe(log.correlation_id);
  });

  it('工具执行失败仍留在同一条链路上，并标成出错', async () => {
    mocks.executeImageNote.mockResolvedValueOnce({ error: 'DUPLICATE_TITLE', message: '笔记标题已存在。' });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };

    await confirmAgentTool(req, createResponse());

    expect(agentLogInsert()).toMatchObject({
      correlation_id: 'origin-request-1',
      confirmation_id: 'confirm-image-1',
      status: 'error',
      outcome_kind: 'error',
    });
  });

  it('旧确认卡没有发卡轮标识时退回自身 request_id，不写出空链路', async () => {
    const legacyConfirmation = { ...settledConfirmation, originRequestId: null };
    mocks.inspectToolConfirmationExecution.mockResolvedValue({ state: 'ready', confirmation: legacyConfirmation });
    mocks.claimToolConfirmationExecution.mockResolvedValue({ state: 'claimed', confirmation: legacyConfirmation });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };

    await confirmAgentTool(req, createResponse());

    const log = agentLogInsert();
    expect(log.correlation_id).toBe(log.request_id);
    expect(log.confirmation_id).toBe('confirm-image-1');
  });

  it('用户驳回记成 rejected 并挂回链路，且不把内部标识回传客户端', async () => {
    mocks.rejectToolConfirmation.mockResolvedValue({
      id: 'confirm-image-1',
      toolName: 'create_image_note',
      originRequestId: 'origin-request-1',
    });
    const req = {
      body: { confirmationToken: 'token-image', sessionId: 'session-image' },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };
    const res = createResponse();

    await rejectAgentTool(req, res);

    expect(agentLogInsert()).toMatchObject({
      task_type: 'agent_confirmation',
      status: 'confirmation_rejected',
      correlation_id: 'origin-request-1',
      confirmation_id: 'confirm-image-1',
      outcome_kind: 'rejected',
    });
    const [payload] = res.send.mock.calls[0];
    expect(payload.data).toEqual({ id: 'confirm-image-1', toolName: 'create_image_note' });
    expect(payload.data).not.toHaveProperty('originRequestId');
  });

  it('发卡时把本轮 request_id 交给确认卡保存，链路才能在下一个请求里接上', async () => {
    mocks.getOrCreateSession.mockResolvedValue({ id: 'session-server' });
    mocks.prepareArgs.mockImplementation(async (args) => ({ ...args, folderId: '12', folderName: '项目资料' }));
    mocks.preview.mockResolvedValue({ title: '保存附件', target: '项目资料 / 测试.png' });
    mocks.createToolConfirmation.mockResolvedValue({
      token: 'token-1',
      expiresIn: 300,
      confirmation: { id: 'confirm-1', sessionId: 'session-server', toolName: 'save_attachment_to_cloud', args: {} },
    });
    const req = {
      body: {
        sessionId: 'session-server',
        toolName: 'save_attachment_to_cloud',
        args: { attachmentId: 'attachment-1', fileName: '测试.png', folderId: '12', folderName: '项目资料' },
      },
      user: { id: 'user-1', role: 'user' },
      headers: {},
      ip: '127.0.0.1',
    };

    await prepareAgentToolAction(req, createResponse());

    const [createArgs] = mocks.createToolConfirmation.mock.calls[0];
    const log = agentLogInsert();
    expect(createArgs.originRequestId).toBe(log.request_id);
    expect(log).toMatchObject({
      status: 'confirmation_pending',
      outcome_kind: 'confirmation_card',
      confirmation_id: 'confirm-1',
      delivered: 1,
    });
  });
});
