import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completionMessage, runOrganizeCompletionNotifications } from './organizeCompletionNotification.js';

beforeEach(() => vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'production'));
afterEach(() => vi.unstubAllEnvs());
const run = {
  id: 'run',
  user_id: 'owner',
  status: 'completed',
  summary_json: { completionNotification: 'pending' },
  started_at: '2026-09-06T12:00:00Z',
  updated_at: '2026-09-06T12:01:00Z',
};
function database({ preferences = {}, current = run } = {}) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT id')) return [[run]];
      if (sql.startsWith('SELECT preferences')) return [[{ preferences }]];
      if (sql.startsWith('SELECT *')) return [[current]];
      if (sql.includes('SUM(ai_status')) return [[{ failed: 1 }]];
      return [{ affectedRows: 1 }];
    }),
  };
}
describe('整理完成通知', () => {
  it('默认开启，短任务不打扰，通知解释关闭入口', () => {
    expect(completionMessage(run, {}).content).toContain('设置 → 通知 → 整理完成通知');
    expect(completionMessage({ ...run, updated_at: run.started_at }, {})).toBeNull();
    expect(completionMessage(run, {}, { notificationsOrganize: false })).toBeNull();
    expect(completionMessage(run, {}, { notificationsInApp: false })).toBeNull();
  });
  it('部分失败准确说明，英文偏好受支持', () => {
    expect(completionMessage(run, { failed: 3 }).content).toContain('3 项资源分析未成功');
    expect(completionMessage(run, {}, { lang: 'en-US' }).content).toContain('Settings');
  });
  it('投递使用稳定来源键并与标记共用事务', async () => {
    const db = database();
    const notify = vi.fn();
    await runOrganizeCompletionNotifications('worker', db, notify);
    expect(notify).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ sourceType: 'organize_complete', sourceId: 'run' }),
      db,
    );
    expect(db.commit).toHaveBeenCalledOnce();
    expect(db.query.mock.calls.at(-1)[1]).toEqual(['sent', 'run']);
  });
  it('投递失败回滚待通知状态，后续可补发', async () => {
    const db = database();
    await expect(
      runOrganizeCompletionNotifications('worker', db, vi.fn().mockRejectedValue(new Error('failed'))),
    ).rejects.toThrow();
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('投递时读取最新设置，关闭后不积压待发通知', async () => {
    const db = database({ preferences: { notificationsOrganize: false } });
    const notify = vi.fn();
    await runOrganizeCompletionNotifications('worker', db, notify);
    expect(notify).not.toHaveBeenCalled();
    expect(db.query.mock.calls.at(-1)[1]).toEqual(['skipped', 'run']);
  });
  it.each(['ended', 'paused', 'running'])('不通知 %s 任务', async (status) => {
    const db = database({ current: { ...run, status } });
    const notify = vi.fn();
    await runOrganizeCompletionNotifications('worker', db, notify);
    expect(notify).not.toHaveBeenCalled();
  });
  it('锁定重读已投递状态，重复 Worker 不再次发送', async () => {
    const db = database({ current: { ...run, summary_json: { completionNotification: 'sent' } } });
    const notify = vi.fn();
    await runOrganizeCompletionNotifications('worker', db, notify);
    expect(notify).not.toHaveBeenCalled();
  });
});
