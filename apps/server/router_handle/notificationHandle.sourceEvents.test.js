import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getConnection: vi.fn(), finish: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: vi.fn(), getConnection: mocks.getConnection } }));
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200) => ({ data, status }) }));
vi.mock('../util/adminActionExecution.js', () => ({
  AdminActionError: class extends Error {},
  beginAdminAction: async () => ({}),
  finishAdminAction: mocks.finish,
  adminActionErrorResponse: () => ({ code: 'FAILED', status: 500, message: 'failed' }),
}));
import { notificationRealtimeEvents } from '../util/notificationRealtimeEvents.js';
import { adminRecall, adminDelete } from './notificationHandle.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.finish.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

it.each([adminRecall, adminDelete])(
  'publishes one batch hint after the admin transaction commits without extra recipient SQL in the request',
  async (handler) => {
    const publish = vi.spyOn(notificationRealtimeEvents, 'publishSource').mockImplementation(() => {});
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn(async () => [{ affectedRows: 2 }]),
      commit: vi.fn(async () => {
        expect(publish).not.toHaveBeenCalled();
      }),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    mocks.getConnection.mockResolvedValue(connection);
    const res = { send: vi.fn() };
    await handler({ user: { id: 'root', role: 'root' }, body: { batchId: 'batch' } }, res);
    expect(res.send.mock.calls[0][0].status).toBe(200);
    expect(connection.query).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledExactlyOnceWith({ kind: 'batch', ids: ['batch'] });
  },
);

it('discards queued source hints if the audit fails and the admin operation rolls back', async () => {
  const publish = vi.spyOn(notificationRealtimeEvents, 'publishSource').mockImplementation(() => {});
  const connection = {
    beginTransaction: vi.fn(),
    query: vi.fn(async () => [{ affectedRows: 2 }]),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  mocks.getConnection.mockResolvedValue(connection);
  mocks.finish.mockRejectedValueOnce(new Error('audit failed'));
  await adminRecall({ user: { id: 'root', role: 'root' }, body: { batchId: 'batch' } }, { send: vi.fn() });
  expect(connection.rollback).toHaveBeenCalledOnce();
  await connection.commit();
  expect(publish).not.toHaveBeenCalled();
});
