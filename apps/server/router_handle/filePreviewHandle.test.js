import { beforeEach, describe, expect, it, vi } from 'vitest';

const previewServiceMocks = vi.hoisted(() => ({
  resolveFilePreview: vi.fn(),
  prepareFilePreview: vi.fn(),
  listArchivePreview: vi.fn(),
  getFilePreviewErrorStatus: vi.fn(() => 500),
}));

vi.mock('../util/filePreview/service.js', () => previewServiceMocks);
vi.mock('../util/common.js', () => ({
  L: (_req, zh) => zh,
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'SAFE_ERROR' }));

const { resolveOwnedFilePreview } = await import('./filePreviewHandle.js');

function response() {
  return { send: vi.fn() };
}

describe('file preview handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewServiceMocks.getFilePreviewErrorStatus.mockReturnValue(500);
  });

  it('uses the effective resource owner and avoids cache-touch writes in an admin context', async () => {
    previewServiceMocks.resolveFilePreview.mockResolvedValue({ status: 'ready' });
    const res = response();

    await resolveOwnedFilePreview(
      { user: { id: 'subject-user' }, adminContext: { mode: 'readonly' }, body: { fileId: 42 } },
      res,
    );

    expect(previewServiceMocks.resolveFilePreview).toHaveBeenCalledWith({
      ownerUserId: 'subject-user',
      fileId: 42,
      touch: false,
    });
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('does not expose an unknown dependency error code to the client', async () => {
    previewServiceMocks.resolveFilePreview.mockRejectedValue(
      Object.assign(new Error('upstream'), { code: 'OBS_SECRET' }),
    );
    const res = response();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await resolveOwnedFilePreview({ user: { id: 'user-1' }, body: { fileId: 8 } }, res);

    errorSpy.mockRestore();
    expect(res.send).toHaveBeenCalledWith({
      data: { errorCode: 'FILE_PREVIEW_SERVICE_UNAVAILABLE' },
      status: 500,
      msg: '文件预览暂时不可用，请稍后重试',
    });
  });
});
