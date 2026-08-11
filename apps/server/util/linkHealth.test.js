import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  bookmarks: [
    { id: 'bookmark-1', name: '正常页', url: 'https://example.com/alive' },
    { id: 'bookmark-2', name: '失效页', url: 'https://example.com/gone' },
  ],
  health: new Map(),
  livenessResolvers: [],
}));

vi.mock('../db/index.js', () => ({
  default: {
    query: vi.fn(async (sql, params = []) => {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('DELETE FROM bookmark_health')) {
        state.health.clear();
        return [{ affectedRows: 2 }];
      }
      if (text.startsWith('SELECT id, url FROM bookmark')) {
        return [state.bookmarks.map(({ id, url }) => ({ id, url }))];
      }
      if (text.includes('SELECT COUNT(*) AS c FROM bookmark')) {
        return [[{ c: state.bookmarks.length }]];
      }
      if (text.includes('SELECT COUNT(*) AS checked')) {
        const values = [...state.health.values()];
        return [
          [
            {
              checked: values.length,
              alive: values.filter((item) => item.status === 'alive').length,
              suspect: values.filter((item) => item.status === 'suspect').length,
              unknown: values.filter((item) => item.status === 'unknown').length,
              last_checked_at: values.length ? '2026-08-10T12:00:00.000Z' : null,
            },
          ],
        ];
      }
      if (text.startsWith('SELECT h.bookmark_id')) {
        return [
          state.bookmarks
            .filter((bookmark) => state.health.get(bookmark.id)?.status === 'suspect')
            .map((bookmark) => ({
              bookmark_id: bookmark.id,
              name: bookmark.name,
              url: bookmark.url,
              note: state.health.get(bookmark.id)?.note,
              checked_at: '2026-08-10T12:00:00.000Z',
              has_snapshot: 0,
            })),
        ];
      }
      if (text.startsWith('INSERT INTO bookmark_health')) {
        state.health.set(params[0], { status: params[2], note: params[3] });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`UNEXPECTED_QUERY:${text.slice(0, 80)}`);
    }),
  },
}));

vi.mock('./fetchWebMeta.js', () => ({
  checkUrlLiveness: vi.fn(
    (url) =>
      new Promise((resolve) => {
        state.livenessResolvers.push(() =>
          resolve(url.includes('/gone') ? { status: 'suspect', code: 404 } : { status: 'alive', code: 200 }),
        );
      }),
  ),
}));

describe('linkHealth 全量体检', () => {
  beforeEach(() => {
    state.health.clear();
    state.livenessResolvers.length = 0;
  });

  it('真实执行时返回进度，同一用户的重复请求复用当前任务', async () => {
    const { getHealthSummary, isChecking, startFullCheck } = await import('./linkHealth.js');
    const started = await startFullCheck('user-link-health-test');
    expect(started).toMatchObject({ total: 2, checked: 0, running: true, runStatus: 'running' });
    expect(started.runId).not.toBe('latest');

    const duplicate = await startFullCheck('user-link-health-test');
    expect(duplicate).toMatchObject({ running: true, already: true, runId: started.runId });

    await vi.waitFor(() => expect(state.livenessResolvers).toHaveLength(2));
    state.livenessResolvers.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(isChecking('user-link-health-test')).toBe(false));

    await expect(getHealthSummary('user-link-health-test')).resolves.toMatchObject({
      total: 2,
      checked: 2,
      alive: 1,
      suspectCount: 1,
      running: false,
      runStatus: 'succeeded',
      suspect: [expect.objectContaining({ id: 'bookmark-2', name: '失效页' })],
    });
  });
});
