import { describe, expect, it, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../util/communityFeed/core.js', async (original) => ({
  ...(await original()),
  access: vi.fn(),
  loadPost: vi.fn().mockResolvedValue({ author_id: 'author' }),
  first: vi.fn().mockResolvedValue({ head_picture: 'https://example.com/avatar.png' }),
}));
import { handle, image, profileAvatar } from './communityFeedHandle.js';
const response = () => {
  const res = {};
  for (const key of ['set', 'status', 'send', 'sendStatus', 'json', 'redirect'])
    res[key] = vi.fn().mockReturnValue(res);
  return res;
};
describe('community administrator preview boundary', () => {
  it.each(['readonly', 'maintain'])('uses the subject identity for a safe read in %s', async (mode) => {
    const service = vi.fn().mockResolvedValue({ items: [] });
    const subject = { id: 'subject', role: 'user' };
    const res = response();
    await handle(
      service,
      undefined,
      true,
    )(
      {
        method: 'GET',
        adminContext: { mode },
        resourceUser: subject,
        user: { id: 'administrator', role: 'root' },
        query: { topic: 'midautumn' },
      },
      res,
    );
    expect(service).toHaveBeenCalledWith({ user: subject, input: { topic: 'midautumn' }, previewReadOnly: true });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it.each([
    { method: 'GET', safe: false, subject: true },
    { method: 'POST', safe: true, subject: true },
    { method: 'GET', safe: true, subject: false },
  ])('fails closed before invoking the service: %j', async ({ method, safe, subject }) => {
    const service = vi.fn(),
      res = response();
    await handle(
      service,
      undefined,
      safe,
    )(
      {
        method,
        adminContext: { mode: 'readonly' },
        resourceUser: subject ? { id: 'subject' } : undefined,
        user: { id: 'root', role: 'root' },
      },
      res,
    );
    expect(service).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('rejects media reads with no subject instead of falling back to root', async () => {
    for (const handler of [image, profileAvatar]) {
      const res = response();
      await handler({ adminContext: { mode: 'readonly' }, user: { id: 'root' } }, res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    }
  });
  it('returns an authorized public avatar URL without redirecting the preview header', async () => {
    const res = response();
    await profileAvatar(
      { adminContext: { mode: 'readonly' }, resourceUser: { id: 'subject' }, params: { postId: 'post' } },
      res,
    );
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ publicAvatarUrl: 'https://example.com/avatar.png' });
  });
  it('keeps ordinary write service behavior unchanged', async () => {
    const service = vi.fn().mockResolvedValue({ ok: true });
    const user = { id: 'member' };
    await handle(service)({ method: 'POST', user, body: { body: 'hello' } }, response());
    expect(service).toHaveBeenCalledWith({ user, input: { body: 'hello' }, previewReadOnly: false });
  });
});
