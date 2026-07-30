import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureNotVisitor = vi.fn();
const attachCloudDocumentSource = vi.fn();
const createTemporaryDocumentSource = vi.fn();
const deleteDocumentSource = vi.fn();
const deleteTemporaryDocumentSources = vi.fn();
const getDocumentSourceStatuses = vi.fn();

vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/aiDocument/service.js', () => ({
  attachCloudDocumentSource,
  confirmTemporaryDocumentSource: vi.fn(),
  createTemporaryDocumentSource,
  deleteDocumentSource,
  deleteTemporaryDocumentSources,
  getDocumentSourceStatuses,
}));

const { attachCloudFile, clearTemporaryAttachments, getStatuses, initTemporaryUpload, removeAttachment } =
  await import('./aiDocumentHandle.js');

function response() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('aiDocumentHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attachCloudDocumentSource.mockResolvedValue({ id: 'source-1', sourceType: 'cloud' });
    createTemporaryDocumentSource.mockResolvedValue({ attachment: { id: 'source-1' } });
    deleteDocumentSource.mockResolvedValue(true);
    deleteTemporaryDocumentSources.mockResolvedValue({ deleted: 2, failed: 0 });
    getDocumentSourceStatuses.mockResolvedValue([]);
  });

  it('普通游客由统一游客写守卫拦截', async () => {
    ensureNotVisitor.mockReturnValue(false);
    const res = response();
    await initTemporaryUpload({ user: { id: 'visitor', role: 'visitor' }, body: {} }, res);
    expect(createTemporaryDocumentSource).not.toHaveBeenCalled();
  });

  it('普通游客可以只读挂载游客展示空间的云文件', async () => {
    const res = response();
    await attachCloudFile({
      user: { id: 'visitor-shared', role: 'visitor' },
      body: { fileId: '9', sessionId: 'local-session' },
    }, res);

    expect(ensureNotVisitor).not.toHaveBeenCalled();
    expect(attachCloudDocumentSource).toHaveBeenCalledWith({
      userId: 'visitor-shared',
      fileId: '9',
      sessionId: 'local-session',
    });
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('普通游客可以查询共享云文件解析状态', async () => {
    getDocumentSourceStatuses.mockResolvedValue([{ id: 'source-1', status: 'ready' }]);
    const res = response();
    await getStatuses(
      {
        user: { id: 'visitor-shared', role: 'visitor' },
        body: { attachmentIds: ['source-1'] },
      },
      res,
    );

    expect(ensureNotVisitor).not.toHaveBeenCalled();
    expect(getDocumentSourceStatuses).toHaveBeenCalledWith({
      userId: 'visitor-shared',
      sourceIds: ['source-1'],
    });
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('游客移除材料只清客户端选中态，不删除共享解析缓存', async () => {
    const res = response();
    await removeAttachment(
      {
        user: { id: 'visitor-shared', role: 'visitor' },
        body: { attachmentId: 'source-1' },
      },
      res,
    );

    expect(deleteDocumentSource).not.toHaveBeenCalled();
    expect(ensureNotVisitor).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200, data: { deleted: false } }));
  });

  it('管理员 AI 上下文使用资源主体归属，不把附件记到真实操作者账号', async () => {
    const res = response();
    await initTemporaryUpload(
      {
        adminContext: { id: 'ctx-1' },
        adminCapability: { policy: 'ai_use' },
        resourceUser: { id: 'subject-1', role: 'user' },
        user: { id: 'subject-1', role: 'user' },
        body: { fileName: 'guide.md', fileType: 'text/markdown', fileSize: 20 },
      },
      res,
    );
    expect(createTemporaryDocumentSource).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'subject-1', fileName: 'guide.md' }),
    );
    expect(ensureNotVisitor).not.toHaveBeenCalled();
  });

  it('新会话清理只删除当前登录用户的临时文件', async () => {
    ensureNotVisitor.mockReturnValue(true);
    const res = response();
    await clearTemporaryAttachments({ user: { id: 'user-1', role: 'user' }, body: {} }, res);
    expect(deleteTemporaryDocumentSources).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200, data: { deleted: 2, failed: 0 } }));
  });

  it('状态接口透传解析覆盖率、截断原因和失败范围', async () => {
    ensureNotVisitor.mockReturnValue(true);
    const coverage = {
      metadataAvailable: true,
      coverageRatio: 0.5,
      truncated: true,
      failedRanges: [{ unit: 'characters', start: 51, end: 100, code: 'CHAR_LIMIT' }],
    };
    getDocumentSourceStatuses.mockResolvedValue([{ id: 'source-1', status: 'ready', coverage }]);
    const res = response();

    await getStatuses({ user: { id: 'user-1', role: 'user' }, body: { attachmentIds: ['source-1'] } }, res);

    expect(getDocumentSourceStatuses).toHaveBeenCalledWith({ userId: 'user-1', sourceIds: ['source-1'] });
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ id: 'source-1', coverage })] }),
    );
  });
});
