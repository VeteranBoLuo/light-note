import { expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('./core.js', () => ({
  access: vi.fn(),
  publicId: (id) => id,
  fail: (code) => {
    throw new Error(code);
  },
}));
import { savedPostResources } from './saved.js';
import { actionIdempotencyUuid } from '../agent/actionIdempotency.js';
it('looks up canonical deterministic IDs within the owner and preserves trash status', async () => {
  const db = {
    query: vi
      .fn()
      .mockResolvedValueOnce([[{ id: 'note', del_flag: 1 }]])
      .mockResolvedValueOnce([[]]),
  };
  const result = await savedPostResources({ user: { id: 'owner', role: 'user' }, id: 'post', db });
  expect(result.note).toEqual({ id: 'note', deleted: true });
  expect(result.bookmark).toBeNull();
  expect(db.query.mock.calls[0][1]).toEqual([actionIdempotencyUuid(result.key, 'note'), 'owner']);
  expect(db.query.mock.calls[1][1]).toEqual([actionIdempotencyUuid(result.key, 'bookmark'), 'owner']);
});
it('rejects guest lookup', async () => {
  await expect(savedPostResources({ user: { id: 'guest', role: 'visitor' }, id: 'post' })).rejects.toThrow(
    'COMMUNITY_LOGIN_REQUIRED',
  );
});
