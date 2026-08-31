import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureNotVisitor: vi.fn(),
  ensureUserOrAdminPolicy: vi.fn(),
  listToolboxHomeTasks: vi.fn(),
  listToolboxHomeWorkspaces: vi.fn(),
  listToolboxHomeProjects: vi.fn(),
  listToolboxProjectRevisions: vi.fn(),
  listToolboxProjects: vi.fn(),
  getToolboxProject: vi.fn(),
  createToolboxProjectRevision: vi.fn(),
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
  createToolboxQuote: vi.fn(),
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
vi.mock('../util/toolbox/project.js', () => ({
  createToolboxProject: vi.fn(),
  createToolboxProjectRevision: mocks.createToolboxProjectRevision,
  getToolboxProject: mocks.getToolboxProject,
  listToolboxHomeProjects: mocks.listToolboxHomeProjects,
  listToolboxProjectRevisions: mocks.listToolboxProjectRevisions,
  listToolboxProjects: mocks.listToolboxProjects,
  openToolboxProject: vi.fn(),
  restoreToolboxProjectRevision: vi.fn(),
  updateToolboxProject: vi.fn(),
}));

const { createProjectRevision, getHome, getProject, listProjectRevisions, listProjects, openWorkspace, saveArtifact } =
  await import('./toolboxHandle.js');

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
    const projects = { continue: [{ id: 'project-1' }], recent: [] };
    mocks.listToolboxHomeWorkspaces.mockResolvedValueOnce(workspaces);
    mocks.listToolboxHomeTasks.mockResolvedValueOnce(tasks);
    mocks.listToolboxHomeProjects.mockResolvedValueOnce(projects);
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
    expect(mocks.listToolboxHomeProjects).toHaveBeenCalledWith({ userId: 'owner-1' });
    expect(response.send).toHaveBeenCalledWith({
      data: { schemaVersion: 2, workspaces, tasks, projects },
      status: 200,
      msg: 'success',
    });
  });

  it('读取项目使用管理员代管的数据主体，修订写入只使用登录用户', async () => {
    const detail = { project: { id: 'project-1' }, revision: { revision: 1 } };
    mocks.getToolboxProject.mockResolvedValueOnce(detail);
    mocks.createToolboxProjectRevision.mockResolvedValueOnce(detail);
    const readResponse = createResponse();
    const writeResponse = createResponse();

    await getProject(
      { user: { id: 'admin-1' }, resourceUser: { id: 'owner-1' }, params: { projectId: 'project-1' } },
      readResponse,
    );
    await createProjectRevision(
      {
        user: { id: 'writer-1' },
        resourceUser: { id: 'owner-1' },
        params: { projectId: 'project-1' },
        body: { clientRequestId: 'revision-request-1' },
      },
      writeResponse,
    );

    expect(mocks.getToolboxProject).toHaveBeenCalledWith({ userId: 'owner-1', projectId: 'project-1' });
    expect(mocks.createToolboxProjectRevision).toHaveBeenCalledWith({
      userId: 'writer-1',
      projectId: 'project-1',
      input: { clientRequestId: 'revision-request-1' },
    });
  });

  it('项目与修订列表透传游标并返回稳定分页 DTO', async () => {
    const projectsPage = { items: [{ id: 'project-2' }], nextCursor: 'project-cursor' };
    const revisionsPage = { items: [{ id: 'revision-2' }], nextCursor: 'revision-cursor' };
    mocks.listToolboxProjects.mockResolvedValueOnce(projectsPage);
    mocks.listToolboxProjectRevisions.mockResolvedValueOnce(revisionsPage);
    const projectsResponse = createResponse();
    const revisionsResponse = createResponse();

    await listProjects(
      {
        user: { id: 'admin-1' },
        resourceUser: { id: 'owner-1' },
        query: { type: 'document', status: 'active', limit: '24', cursor: 'project-cursor-in' },
      },
      projectsResponse,
    );
    await listProjectRevisions(
      {
        user: { id: 'admin-1' },
        resourceUser: { id: 'owner-1' },
        params: { projectId: 'project-1' },
        query: { limit: '30', cursor: 'revision-cursor-in' },
      },
      revisionsResponse,
    );

    expect(mocks.listToolboxProjects).toHaveBeenCalledWith({
      userId: 'owner-1',
      type: 'document',
      status: 'active',
      limit: '24',
      cursor: 'project-cursor-in',
    });
    expect(mocks.listToolboxProjectRevisions).toHaveBeenCalledWith({
      userId: 'owner-1',
      projectId: 'project-1',
      limit: '30',
      cursor: 'revision-cursor-in',
    });
    expect(projectsResponse.send).toHaveBeenCalledWith({ data: projectsPage, status: 200, msg: 'success' });
    expect(revisionsResponse.send).toHaveBeenCalledWith({ data: revisionsPage, status: 200, msg: 'success' });
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
