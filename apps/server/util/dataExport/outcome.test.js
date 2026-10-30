import { beforeEach, describe, expect, it, vi } from 'vitest';

const notify = vi.hoisted(() => vi.fn());
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../notification.js', () => ({ createNotification: notify }));

const { exportOutcomeCopy, exportOutcomeNoticeId, recordExportOutcome } = await import('./outcome.js');

function fakeDb(user = { role: 'user', lang: 'zh-CN', inApp: 'true' }) {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      if (/^\s*SELECT role/.test(sql)) return [[user]];
      return [{ affectedRows: 1 }];
    }),
  };
}

const task = {
  id: 'task-1',
  owner_id: 'u',
  total: 312,
  options_json: JSON.stringify({ types: ['notes', 'bookmarks', 'files'] }),
};

beforeEach(() => notify.mockReset());

describe('recordExportOutcome', () => {
  it('records a completed backup and links the notice back to the backup page', async () => {
    const db = fakeDb();
    const now = new Date('2026-10-30T06:20:00.000Z');
    await recordExportOutcome(task, 'completed', { db, now });
    const update = db.calls.find((call) => /UPDATE user/.test(call.sql));
    expect(update.params).toEqual([now.toISOString(), 312, '["notes","bookmarks","files"]', 'completed', 'u']);
    expect(notify).toHaveBeenCalledWith('u', {
      id: exportOutcomeNoticeId('task-1', 'completed'),
      type: 'system',
      title: '备份已完成',
      content: '312 项已打包，24 小时内可下载。',
      link: '/settings?section=export',
      meta: { dataExport: 'task-1', status: 'completed' },
    });
  });

  it('counts unfinished items on partial results and records nothing when the job failed', async () => {
    const partial = fakeDb();
    await recordExportOutcome(task, 'partial', { db: partial, failed: 2 });
    expect(notify.mock.calls[0][1].content).toBe('310 / 312 项已打包，2 项需留意，24 小时内可下载。');

    notify.mockReset();
    const failed = fakeDb();
    await recordExportOutcome(task, 'failed', { db: failed });
    expect(failed.calls.some((call) => /UPDATE user/.test(call.sql))).toBe(false);
    expect(notify.mock.calls[0][1]).toMatchObject({
      title: '备份未完成',
      id: exportOutcomeNoticeId('task-1', 'failed'),
    });
  });

  it('respects the in-app notification switch and never throws into the worker', async () => {
    await recordExportOutcome(task, 'completed', { db: fakeDb({ role: 'user', lang: 'zh-CN', inApp: 'false' }) });
    expect(notify).not.toHaveBeenCalled();

    const broken = { query: vi.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'ECONNRESET' })) };
    await expect(recordExportOutcome(task, 'completed', { db: broken })).resolves.toBeUndefined();
  });

  it('uses one stable notice per task and outcome, in the account language', () => {
    expect(exportOutcomeNoticeId('task-1', 'completed')).toBe(exportOutcomeNoticeId('task-1', 'completed'));
    expect(exportOutcomeNoticeId('task-1', 'completed')).not.toBe(exportOutcomeNoticeId('task-1', 'failed'));
    expect(exportOutcomeCopy('completed', { total: 3 }, 'en-US').title).toBe('Backup ready');
  });
});
