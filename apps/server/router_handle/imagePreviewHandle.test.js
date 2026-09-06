import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), prepare: vi.fn(), access: vi.fn() }));
vi.mock('../util/filePreview/service.js', () => ({
  resolveFilePreview: mocks.resolve,
  prepareFilePreview: mocks.prepare,
}));
vi.mock('../util/services/communityChatImageService.js', () => ({ getCommunityChatImageDownload: mocks.access }));
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, msg = '') => ({ data, status, msg }) }));
import { imagePreviewBatch } from './imagePreviewHandle.js';
const response = () => ({ send: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ status: 'missing', fileId: '17' });
  mocks.prepare.mockResolvedValue({ status: 'queued', fileId: '17' });
  mocks.access.mockResolvedValue({ id: 17, ownerUserId: 'owner' });
});
describe('image preview batches', () => {
  it('rejects oversized batches before any resource access', async () => {
    const res = response();
    await imagePreviewBatch({ body: { ids: Array(41).fill('1') } }, res);
    expect(res.send.mock.calls[0][0].status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('deduplicates ids and keeps failed items separate from successful items', async () => {
    mocks.resolve.mockImplementation(async ({ fileId }) => {
      if (fileId === 2) throw Object.assign(new Error(), { code: 'FILE_NOT_FOUND' });
      return { status: 'missing' };
    });
    const res = response();
    await imagePreviewBatch({ user: { id: 'u' }, body: { ids: ['1', '1', '2'] } }, res, { prepare: true });
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(res.send.mock.calls[0][0].data.items).toMatchObject([
      { id: '1', status: 'queued' },
      { id: '2', status: 'failed', errorCode: 'FILE_NOT_FOUND' },
    ]);
  });
  it('resolves chat public identity through the complete access policy and does not expose internal ids', async () => {
    const res = response();
    await imagePreviewBatch({ user: { id: 'viewer' }, body: { ids: ['public-image'] } }, res, {
      chat: true,
      prepare: true,
    });
    expect(mocks.access).toHaveBeenCalledTimes(2);
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'owner', fileId: 17, sourceType: 'community_chat_image' }),
    );
    const item = res.send.mock.calls[0][0].data.items[0];
    expect(item.id).toBe('public-image');
    expect(item).not.toHaveProperty('fileId');
  });
  it('revoked or expired chat access prevents generation; admin read-only never creates jobs', async () => {
    mocks.access.mockRejectedValue(Object.assign(new Error(), { code: 'COMMUNITY_CHAT_IMAGE_EXPIRED' }));
    const res = response();
    await imagePreviewBatch({ user: { id: 'viewer' }, body: { ids: ['expired'] } }, res, { chat: true, prepare: true });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    await imagePreviewBatch(
      {
        user: { id: 'root' },
        resourceUser: { id: 'subject' },
        adminContext: { mode: 'readonly' },
        body: { ids: ['1'] },
      },
      response(),
      { prepare: true },
    );
    expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 'subject', touch: false }));
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
