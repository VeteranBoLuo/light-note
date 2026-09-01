import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureNotVisitor: vi.fn(),
  ensureUserOrAdminPolicy: vi.fn(),
  recordServerOperation: vi.fn(),
  createToolboxQuote: vi.fn(),
  createToolboxJob: vi.fn(),
  cancelToolboxJob: vi.fn(),
  listToolboxHomeTasks: vi.fn(),
  listToolboxHomeWorkspaces: vi.fn(),
  markToolboxWorkspaceOpened: vi.fn(),
  saveToolboxArtifactToNote: vi.fn(),
  createToolboxWorkspace: vi.fn(),
  updateToolboxWorkspace: vi.fn(),
  addToolboxWorkspaceResources: vi.fn(),
  removeToolboxWorkspaceResource: vi.fn(),
  createToolboxWorkspaceItem: vi.fn(),
  updateToolboxWorkspaceItem: vi.fn(),
  createToolboxWorkspaceSession: vi.fn(),
}));

vi.mock('../util/auth.js', () => ({
  ensureNotVisitor: mocks.ensureNotVisitor,
  ensureUserOrAdminPolicy: mocks.ensureUserOrAdminPolicy,
}));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = 'success') => ({ data, status, msg }),
}));
vi.mock('../util/agent/logSafety.js', () => ({
  stableAgentErrorCode: () => 'OPERATION_LOG_FAILED',
}));
vi.mock('../util/operationLog.js', () => ({
  recordServerOperation: mocks.recordServerOperation,
}));
vi.mock('../util/toolbox/errors.js', () => ({
  parseToolboxError: (error) => ({ status: 500, data: { code: error?.code || 'ERROR' }, message: 'failed' }),
}));
vi.mock('../util/toolbox/knowledgeStructure.js', () => ({ getToolboxKnowledgeOverview: vi.fn() }));
vi.mock('../util/toolbox/service.js', () => ({
  cancelToolboxJob: mocks.cancelToolboxJob,
  createToolboxJob: mocks.createToolboxJob,
  createToolboxQuote: mocks.createToolboxQuote,
  getToolboxArtifact: vi.fn(),
  getToolboxCatalog: vi.fn(),
  getToolboxJob: vi.fn(),
  listToolboxHomeTasks: mocks.listToolboxHomeTasks,
  listToolboxJobs: vi.fn(),
  prepareToolboxUpload: vi.fn(),
  saveToolboxArtifactToNote: mocks.saveToolboxArtifactToNote,
}));
vi.mock('../util/toolbox/workspace.js', () => ({
  addToolboxWorkspaceResources: mocks.addToolboxWorkspaceResources,
  createToolboxWorkspace: mocks.createToolboxWorkspace,
  createToolboxWorkspaceItem: mocks.createToolboxWorkspaceItem,
  createToolboxWorkspaceSession: mocks.createToolboxWorkspaceSession,
  getToolboxWorkspace: vi.fn(),
  listToolboxHomeWorkspaces: mocks.listToolboxHomeWorkspaces,
  listToolboxWorkspaces: vi.fn(),
  markToolboxWorkspaceOpened: mocks.markToolboxWorkspaceOpened,
  removeToolboxWorkspaceResource: mocks.removeToolboxWorkspaceResource,
  updateToolboxWorkspace: mocks.updateToolboxWorkspace,
  updateToolboxWorkspaceItem: mocks.updateToolboxWorkspaceItem,
}));
const {
  addWorkspaceResources,
  cancelJob,
  createJob,
  createQuote,
  createWorkspace,
  createWorkspaceItem,
  createWorkspaceSession,
  getHome,
  openWorkspace,
  removeWorkspaceResource,
  saveArtifact,
  updateWorkspace,
  updateWorkspaceItem,
} = await import('./toolboxHandle.js');

function createResponse() {
  const response = {};
  response.status = vi.fn().mockReturnValue(response);
  response.send = vi.fn().mockReturnValue(response);
  return response;
}

describe('toolbox home handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.ensureUserOrAdminPolicy.mockReturnValue(true);
    mocks.recordServerOperation.mockResolvedValue(true);
  });

  it('首页只读取当前资源所有者，并返回固定版本的聚合读模型', async () => {
    const workspaces = { continue: [{ id: 'workspace-1' }], recent: [] };
    const tasks = { active: [], ready: [{ id: 'job-1' }], recent: [] };
    mocks.listToolboxHomeWorkspaces.mockResolvedValueOnce(workspaces);
    mocks.listToolboxHomeTasks.mockResolvedValueOnce(tasks);
    const response = createResponse();

    await getHome(
      {
        user: { id: 'admin-1' },
        resourceUser: { id: 'owner-1' },
      },
      response,
    );

    expect(mocks.ensureUserOrAdminPolicy).toHaveBeenCalledWith(expect.anything(), response, ['read']);
    expect(mocks.listToolboxHomeWorkspaces).toHaveBeenCalledWith({ userId: 'owner-1' });
    expect(mocks.listToolboxHomeTasks).toHaveBeenCalledWith({ userId: 'owner-1' });
    expect(response.send).toHaveBeenCalledWith({
      data: { schemaVersion: 2, workspaces, tasks },
      status: 200,
      msg: 'success',
    });
  });

  it('报价接口透传用户选择的单一计费方式', async () => {
    const quote = { id: 'quote-1', billingMedium: 'ai_quota', quotedPoints: 0 };
    mocks.createToolboxQuote.mockResolvedValueOnce(quote);
    const response = createResponse();
    const request = {
      user: { id: 'user-1' },
      body: {
        toolId: 'research_brief',
        input: { resourceRefs: [{ type: 'note', id: 'note-1' }] },
        billingMedium: 'ai_quota',
        clientRequestId: 'quote-request-1234',
      },
    };

    await createQuote(request, response);

    expect(mocks.createToolboxQuote).toHaveBeenCalledWith({
      userId: 'user-1',
      toolId: 'research_brief',
      rawInput: request.body.input,
      billingMedium: 'ai_quota',
      clientRequestId: 'quote-request-1234',
    });
    expect(response.send).toHaveBeenCalledWith({ data: quote, status: 200, msg: 'success' });
  });

  it('打开工作区必须通过写权限并始终使用登录用户作为所有者', async () => {
    const workspace = { id: 'workspace-1', lastOpenedAt: '2026-08-30T10:00:00.000Z' };
    mocks.markToolboxWorkspaceOpened.mockResolvedValueOnce(workspace);
    const response = createResponse();

    await openWorkspace(
      {
        user: { id: 'user-1' },
        resourceUser: { id: 'someone-else' },
        params: { workspaceId: 'workspace-1' },
      },
      response,
    );

    expect(mocks.ensureNotVisitor).toHaveBeenCalledOnce();
    expect(mocks.markToolboxWorkspaceOpened).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });
    expect(response.send).toHaveBeenCalledWith({ data: workspace, status: 200, msg: 'success' });
    expect(mocks.recordServerOperation).not.toHaveBeenCalled();
  });

  it('写权限被拒绝时不会触碰工作区打开时间', async () => {
    mocks.ensureNotVisitor.mockReturnValueOnce(false);
    const response = createResponse();

    await openWorkspace({ user: { id: 'visitor-1' }, params: { workspaceId: 'workspace-1' } }, response);

    expect(mocks.markToolboxWorkspaceOpened).not.toHaveBeenCalled();
  });

  it('显式重新存为新笔记时透传保存动作，不信任请求体中的用户', async () => {
    const receipt = {
      status: 'saved',
      targetType: 'note',
      targetId: 'note-2',
      targetAvailability: 'available',
      idempotent: false,
    };
    mocks.saveToolboxArtifactToNote.mockResolvedValueOnce(receipt);
    const response = createResponse();
    const request = {
      user: { id: 'user-1', role: 'user' },
      params: { artifactId: 'artifact-1' },
      body: {
        clientRequestId: 'recreate-request-1234',
        action: 'recreate_missing_target',
        userId: 'attacker-controlled',
      },
    };

    await saveArtifact(request, response);

    expect(mocks.saveToolboxArtifactToNote).toHaveBeenCalledWith({
      userId: 'user-1',
      userRole: 'user',
      artifactId: 'artifact-1',
      clientRequestId: 'recreate-request-1234',
      action: 'recreate_missing_target',
      request,
    });
    expect(response.send).toHaveBeenCalledWith({ data: receipt, status: 200, msg: 'success' });
    expect(mocks.recordServerOperation).toHaveBeenCalledWith(request, {
      module: '知识工坊',
      operation: '重新保存工具成果为新笔记',
    });
  });

  it('持续工作区写操作只记录低敏动作，不把标题或材料内容写入日志', async () => {
    const request = {
      user: { id: 'user-1' },
      params: { workspaceId: 'workspace-1', itemId: 'item-1' },
      body: { kind: 'research', title: '敏感标题', resourceRefs: [{ type: 'note', id: 'note-1' }] },
    };
    const response = createResponse();
    const workspace = { id: 'workspace-1', kind: 'research' };
    mocks.createToolboxWorkspace.mockResolvedValue(workspace);
    mocks.updateToolboxWorkspace.mockResolvedValue(workspace);
    mocks.addToolboxWorkspaceResources.mockResolvedValue(workspace);
    mocks.removeToolboxWorkspaceResource.mockResolvedValue(workspace);
    mocks.createToolboxWorkspaceItem.mockResolvedValue(workspace);
    mocks.updateToolboxWorkspaceItem.mockResolvedValue(workspace);
    mocks.createToolboxWorkspaceSession.mockResolvedValue(workspace);

    await createWorkspace(request, response);
    await updateWorkspace(request, response);
    await addWorkspaceResources(request, response);
    await removeWorkspaceResource(request, response);
    await createWorkspaceItem(request, response);
    await updateWorkspaceItem(request, response);
    await createWorkspaceSession(request, response);

    expect(mocks.recordServerOperation.mock.calls.map(([, payload]) => payload)).toEqual([
      { module: '知识工坊', operation: '新建持续工作区【research】' },
      { module: '知识工坊', operation: '更新持续工作区' },
      { module: '知识工坊', operation: '添加工作区资料' },
      { module: '知识工坊', operation: '移除工作区资料' },
      { module: '知识工坊', operation: '新建工作区事项' },
      { module: '知识工坊', operation: '更新工作区事项' },
      { module: '知识工坊', operation: '记录工作区推进' },
    ]);
    const loggedPayloads = mocks.recordServerOperation.mock.calls.map(([, payload]) => payload);
    expect(JSON.stringify(loggedPayloads)).not.toContain('敏感标题');
    expect(JSON.stringify(loggedPayloads)).not.toContain('note-1');
  });

  it('创建与取消任务记录稳定工具 ID，未取消的终态不重复记录', async () => {
    const request = {
      user: { id: 'user-1' },
      params: { jobId: 'job-1' },
      body: { quoteId: 'quote-1', clientRequestId: 'job-request-1234' },
    };
    const response = createResponse();
    mocks.createToolboxJob.mockResolvedValue({ id: 'job-1', toolId: 'research_brief', status: 'queued' });
    mocks.cancelToolboxJob
      .mockResolvedValueOnce({ id: 'job-1', toolId: 'research_brief', status: 'cancelled' })
      .mockResolvedValueOnce({ id: 'job-2', toolId: 'research_brief', status: 'succeeded' });

    await createJob(request, response);
    await cancelJob(request, response);
    await cancelJob({ ...request, params: { jobId: 'job-2' } }, response);

    expect(mocks.recordServerOperation.mock.calls.map(([, payload]) => payload.operation)).toEqual([
      '创建处理任务【research_brief】',
      '取消处理任务【research_brief】',
    ]);
  });

  it('幂等保存不重复写操作日志', async () => {
    mocks.saveToolboxArtifactToNote.mockResolvedValue({
      status: 'saved',
      targetType: 'note',
      targetId: 'note-1',
      idempotent: true,
    });
    const response = createResponse();

    await saveArtifact(
      {
        user: { id: 'user-1', role: 'user' },
        params: { artifactId: 'artifact-1' },
        body: { clientRequestId: 'save-request-1234' },
      },
      response,
    );

    expect(mocks.recordServerOperation).not.toHaveBeenCalled();
  });

  it('操作日志写入失败不会反转已经成功的业务响应', async () => {
    mocks.createToolboxWorkspace.mockResolvedValue({ id: 'workspace-1', kind: 'learning' });
    mocks.recordServerOperation.mockRejectedValueOnce(new Error('database unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = createResponse();

    await createWorkspace(
      { user: { id: 'user-1' }, body: { kind: 'learning', title: '学习计划' } },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.send).toHaveBeenCalledWith({
      data: { id: 'workspace-1', kind: 'learning' },
      status: 200,
      msg: 'success',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[toolbox] operation log failed code=%s',
      'OPERATION_LOG_FAILED',
    );
    consoleError.mockRestore();
  });
});
