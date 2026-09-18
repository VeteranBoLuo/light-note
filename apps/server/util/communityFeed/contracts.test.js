import { describe, it, expect, vi } from 'vitest';
import { normalizeCommunityPost } from '@lightnote/shared/community-feed';
import { handle } from '../../router_handle/communityFeedHandle.js';
import { CommunityFeedError } from './core.js';
import { startCommunityFeedScheduler } from './scheduler.js';
import { randomUUID } from 'node:crypto';
function response() {
  return { set: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
}
describe('community discussion contracts', () => {
  it('accepts nine image IDs and rejects duplicates, foreign URLs and oversized sets', () => {
    const ids = Array.from({ length: 9 }, () => randomUUID());
    expect(normalizeCommunityPost({ kind: 'share', body: 'images', images: ids }).images).toEqual(ids);
    for (const images of [[...ids, randomUUID()], [ids[0], ids[0].toUpperCase()], ['https://example.com/image.png']])
      expect(() => normalizeCommunityPost({ kind: 'share', body: 'images', images })).toThrow();
  });
  it('counts Unicode code points and rejects unsupported kinds, excess topics and incomplete questions', () => {
    expect(
      normalizeCommunityPost({ kind: 'thought', title: '', body: '😀'.repeat(4000), topics: [], mentions: [] }).body
        .length,
    ).toBe(8000);
    for (const input of [
      { kind: 'thought', body: '😀'.repeat(4001) },
      { kind: 'question', body: 'question' },
      { kind: 'html', body: 'text' },
      { kind: 'share', body: 'text', topics: ['a', 'b'] },
    ])
      expect(() => normalizeCommunityPost(input)).toThrow();
  });
  it('administrator impersonation cannot invoke even a valid service', async () => {
    const service = vi.fn();
    const res = response();
    await handle(service)(
      { adminContext: { id: 'preview' }, user: { id: 'a', role: 'root' }, method: 'POST', body: {} },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(service).not.toHaveBeenCalled();
  });
  it('expected errors stay structured and unexpected failures do not expose SQL or content', async () => {
    for (const [error, code, status] of [
      [new CommunityFeedError('COMMUNITY_REVISION_CONFLICT', 409), 'COMMUNITY_REVISION_CONFLICT', 409],
      [new Error('SELECT secret body'), 'COMMUNITY_UNAVAILABLE', 503],
    ]) {
      const res = response();
      await handle(async () => {
        throw error;
      })({ user: { id: 'a', role: 'user' }, method: 'GET', query: {} }, res);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.send.mock.calls[0][0].data.code).toBe(code);
      expect(JSON.stringify(res.send.mock.calls)).not.toContain('secret');
    }
  });
  it('local startup never consumes notifications even with feed worker flags enabled', () => {
    const db = { query: vi.fn() };
    const stop = startCommunityFeedScheduler({
      db,
      env: { LIGHTNOTE_RUNTIME_ENV: 'local', COMMUNITY_FEED_ENABLED: 'true', COMMUNITY_FEED_WORKER_ENABLED: 'true' },
    });
    stop();
    expect(db.query).not.toHaveBeenCalled();
  });
});
