import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureNotVisitor = vi.fn();
const createTemporaryDocumentSource = vi.fn();

vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/aiDocument/service.js', () => ({
  attachCloudDocumentSource: vi.fn(),
  confirmTemporaryDocumentSource: vi.fn(),
  createTemporaryDocumentSource,
  deleteDocumentSource: vi.fn(),
  getDocumentSourceStatuses: vi.fn(),
}));

const { initTemporaryUpload } = await import('./aiDocumentHandle.js');

function response() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('aiDocumentHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTemporaryDocumentSource.mockResolvedValue({ attachment: { id: 'source-1' } });
  });

  it('普通游客由统一游客写守卫拦截', async () => {
    ensureNotVisitor.mockReturnValue(false);
    const res = response();
    await initTemporaryUpload({ user: { id: 'visitor', role: 'visitor' }, body: {} }, res);
    expect(createTemporaryDocumentSource).not.toHaveBeenCalled();
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
});
