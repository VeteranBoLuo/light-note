import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.post }));
vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, string>) => `${key}:${params?.names || ''}`,
    },
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: mocks.alert },
}));

const { confirmNoteCreateShareExposure } = await import('./noteShareExposure');

describe('新建子页面的公开分享预检', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('非分享目录静默通过，不显示确认框', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { parentId: 'private-parent', depth: 2 } });

    await expect(confirmNoteCreateShareExposure('private-parent')).resolves.toBeNull();
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/note/previewNoteCreateTarget',
      { parentId: 'private-parent' },
      { silent: true },
    );
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('分享目录等待用户确认后才放行', async () => {
    mocks.post.mockResolvedValue({
      status: 409,
      data: {
        code: 'NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED',
        details: { roots: [{ id: 'shared-root', title: '公开项目' }] },
      },
    });

    const decision = confirmNoteCreateShareExposure('shared-root');
    await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
    expect(mocks.alert.mock.calls[0][0]).toMatchObject({
      title: 'noteShare.exposureTitle:',
      content: 'noteShare.exposureConfirm:公开项目',
      okText: 'noteShare.confirmExposure:',
    });
    await mocks.alert.mock.calls[0][0].onOk();
    await expect(decision).resolves.toBe(true);
  });

  it('取消确认时保持在原页面', async () => {
    mocks.post.mockResolvedValue({
      status: 409,
      data: {
        code: 'NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED',
        details: { roots: [{ id: 'shared-root', title: '公开项目' }] },
      },
    });

    const decision = confirmNoteCreateShareExposure('shared-root');
    await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
    mocks.alert.mock.calls[0][0].onCancel();
    await expect(decision).resolves.toBe(false);
  });
});
