import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyProductionProjectContent,
  normalizeProductionProjectMetadata,
} from '@lightnote/shared/production-project-protocol';

const mocks = vi.hoisted(() => ({ apiBaseGet: vi.fn(), apiBasePost: vi.fn() }));
vi.mock('@/http/request', () => ({ apiBaseGet: mocks.apiBaseGet, apiBasePost: mocks.apiBasePost }));

import {
  createToolboxProject,
  createToolboxArtifactProjectRequestId,
  createToolboxProjectClientRequestId,
  fetchToolboxProjectRevisions,
  fetchToolboxProjectRevisionsPage,
  fetchToolboxProjectsPage,
  isToolboxProjectConflict,
  restoreToolboxProjectRevision,
  saveToolboxProjectRevision,
} from './toolboxProjects';

const content = {
  ...createEmptyProductionProjectContent('document'),
  body: { format: 'markdown' as const, value: '# 文档' },
};
const project = {
  id: '58a8f855-ebbc-5ea2-b766-7b02f1df8e7a',
  projectType: 'document' as const,
  title: '文档',
  metadata: normalizeProductionProjectMetadata(),
  status: 'active' as const,
  currentRevision: 2,
  currentRevisionId: 'be6a8cf2-d5df-4f3c-83fe-04ace3d19100',
  version: 4,
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
  trashedAt: null,
};
const detail = {
  project,
  revision: {
    id: 'be6a8cf2-d5df-4f3c-83fe-04ace3d19100',
    projectId: '58a8f855-ebbc-5ea2-b766-7b02f1df8e7a',
    projectType: 'document' as const,
    revision: 2,
    changeKind: 'autosave' as const,
    label: null,
    sourceRevisionId: null,
    createdAt: '2026-08-30T00:00:00.000Z',
    content,
  },
  resources: [],
};

describe('文档创作台 API 契约', () => {
  beforeEach(() => vi.clearAllMocks());

  it('创建项目时发送可扩展的判别内容，而不是 Markdown 裸字符串', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 201, data: detail });
    await createToolboxProject({ clientRequestId: 'create:1', projectType: 'document', title: '文档', content });
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/toolbox/projects',
      { clientRequestId: 'create:1', projectType: 'document', title: '文档', content },
      { silent: true },
    );
  });

  it('保存正文与标题时携带同一份 revision CAS 基线', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: detail });
    await saveToolboxProjectRevision('project/1', {
      clientRequestId: 'save:1',
      expectedRevision: 1,
      expectedVersion: 3,
      changeKind: 'autosave',
      content,
    });
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/toolbox/projects/project%2F1/revisions',
      expect.objectContaining({ expectedRevision: 1, expectedVersion: 3, content }),
      { silent: true },
    );
  });

  it('版本列表与恢复接口使用 revisionNo 深链', async () => {
    mocks.apiBaseGet.mockResolvedValue({ status: 200, data: { items: [] } });
    await fetchToolboxProjectRevisions('project/1');
    expect(mocks.apiBaseGet).toHaveBeenCalledWith(
      '/api/toolbox/projects/project%2F1/revisions',
      { limit: undefined, cursor: undefined },
      { silent: true },
    );

    mocks.apiBasePost.mockResolvedValue({ status: 200, data: detail });
    await restoreToolboxProjectRevision('project/1', 2, {
      clientRequestId: 'restore:1',
      expectedVersion: 5,
      expectedRevision: 4,
      sourceRevisionId: 'be6a8cf2-d5df-4f3c-83fe-04ace3d19100',
    });
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/toolbox/projects/project%2F1/revisions/2/restore',
      expect.objectContaining({ expectedRevision: 4 }),
      { silent: true },
    );
  });

  it('项目与修订分页透传稳定游标并返回下一页位置', async () => {
    mocks.apiBaseGet
      .mockResolvedValueOnce({ status: 200, data: { items: [project], nextCursor: 'project-cursor-2' } })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [
            {
              id: detail.revision.id,
              revision: 2,
              projectType: 'document',
              changeKind: 'named',
              label: '里程碑',
              sourceRevisionId: null,
              createdAt: detail.revision.createdAt,
            },
          ],
          nextCursor: 'revision-cursor-2',
        },
      });

    const projectPage = await fetchToolboxProjectsPage({
      projectType: 'document',
      status: 'active',
      limit: 24,
      cursor: 'project-cursor-1',
    });
    const revisionPage = await fetchToolboxProjectRevisionsPage('project/1', {
      limit: 30,
      cursor: 'revision-cursor-1',
    });

    expect(projectPage.nextCursor).toBe('project-cursor-2');
    expect(projectPage.items[0]?.id).toBe(project.id);
    expect(revisionPage.nextCursor).toBe('revision-cursor-2');
    expect(revisionPage.items[0]?.label).toBe('里程碑');
    expect(mocks.apiBaseGet).toHaveBeenNthCalledWith(
      1,
      '/api/toolbox/projects',
      { type: 'document', status: 'active', limit: 24, cursor: 'project-cursor-1' },
      { silent: true },
    );
    expect(mocks.apiBaseGet).toHaveBeenNthCalledWith(
      2,
      '/api/toolbox/projects/project%2F1/revisions',
      { limit: 30, cursor: 'revision-cursor-1' },
      { silent: true },
    );
  });

  it('识别服务端并发冲突并生成受约束的幂等键', () => {
    expect(isToolboxProjectConflict(Object.assign(new Error('conflict'), { status: 409 }))).toBe(true);
    expect(
      isToolboxProjectConflict(Object.assign(new Error('conflict'), { code: 'TOOLBOX_PROJECT_VERSION_CONFLICT' })),
    ).toBe(true);
    expect(createToolboxProjectClientRequestId('document-save')).toMatch(/^document-save:[A-Za-z0-9:_-]+$/u);
    expect(createToolboxProjectClientRequestId('document-save').length).toBeLessThanOrEqual(64);
    expect(createToolboxArtifactProjectRequestId('artifact/one', 3)).toBe('artifact:document:artifactone:v3');
    expect(createToolboxArtifactProjectRequestId('artifact/one', 3)).toBe(
      createToolboxArtifactProjectRequestId('artifact/one', 3),
    );
    expect(createToolboxArtifactProjectRequestId('x'.repeat(200), 1).length).toBeLessThanOrEqual(128);
  });
});
