import { expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../obsClient.js', () => ({
  buildObjectKey: (owner, name) => `${owner}/${name}`,
  createDownloadSignedUrl: vi.fn(),
}));
import { readOwnedCloudImage } from './cloudImageReadService.js';
it('restricts lookup to the active file owned by the current account', async () => {
  const db = {
    query: vi.fn().mockResolvedValue([[{ file_type: 'image/png', file_size: 100, obs_key: 'private-key' }]]),
  };
  const sign = vi.fn().mockReturnValue({ url: 'https://storage/image' });
  expect(await readOwnedCloudImage({ user: { id: 'owner', role: 'user' }, id: 'image', db, sign })).toEqual({
    contentType: 'image/png',
    url: 'https://storage/image',
  });
  expect(db.query.mock.calls[0][0]).toContain('create_by=? AND del_flag=0');
  expect(db.query.mock.calls[0][1]).toEqual(['image', 'owner']);
  expect(sign).toHaveBeenCalledWith({ objectKey: 'private-key', expires: 60 });
});
it('does not expose missing, non-image, oversized or guest files', async () => {
  const sign = vi.fn();
  for (const rows of [
    [],
    [{ file_type: 'image/svg+xml', file_size: 20 }],
    [{ file_type: 'image/png', file_size: 6 * 1024 * 1024 }],
  ]) {
    expect(
      await readOwnedCloudImage({
        user: { id: 'owner', role: 'user' },
        id: 'image',
        db: { query: async () => [rows] },
        sign,
      }),
    ).toBeNull();
  }
  const db = { query: vi.fn() };
  expect(await readOwnedCloudImage({ user: { id: 'guest', role: 'visitor' }, id: 'image', db, sign })).toBeNull();
  expect(db.query).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
});
