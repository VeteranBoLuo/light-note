import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureNotVisitor: vi.fn(),
  ensureUserOrAdminPolicy: vi.fn(),
  createToolboxQuote: vi.fn(),
  listToolboxHomeTasks: vi.fn(),
  listToolboxHomeWorkspaces: vi.fn(),
  markToolboxWorkspaceOpened: vi.fn(),
  saveToolboxArtifactToNote: vi.fn(),
}));

vi.mock('../util/auth.js', () => ({
  ensureNotVisitor: mocks.ensureNotVisitor,
  ensureUserOrAdminPolicy: mocks.ensureUserOrAdminPolicy,
}));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg = 'success') => ({ data, status, msg }),
}));
vi.mock('../util/toolbox/errors.js', () => ({
  parseToolboxError: (error) => ({ status: 500, data: { code: error?.code || 'ERROR' }, message: 'failed' }),
}));
vi.mock('../util/toolbox/knowledgeStructure.js', () => ({ getToolboxKnowledgeOverview: vi.fn() }));
vi.mock('../util/toolbox/service.js', () => ({
  cancelToolboxJob: vi.fn(),
  createToolboxJob: vi.fn(),
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
  addToolboxWorkspaceResources: vi.fn(),
  createToolboxWorkspace: vi.fn(),
  createToolboxWorkspaceItem: vi.fn(),
  createToolboxWorkspaceSession: vi.fn(),
  getToolboxWorkspace: vi.fn(),
  listToolboxHomeWorkspaces: mocks.listToolboxHomeWorkspaces,
  listToolboxWorkspaces: vi.fn(),
  markToolboxWorkspaceOpened: mocks.markToolboxWorkspaceOpened,
  removeToolboxWorkspaceResource: vi.fn(),
  updateToolboxWorkspace: vi.fn(),
  updateToolboxWorkspaceItem: vi.fn(),
}));
const { createQuote, getHome, openWorkspace, saveArtifact } = await import('./toolboxHandle.js');

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
  });
});
