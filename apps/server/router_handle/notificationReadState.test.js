import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, changed, allow } = vi.hoisted(() => ({ query: vi.fn(), changed: vi.fn(), allow: vi.fn(() => true) }));
vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('../util/common.js', () => ({ resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }) }));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: allow }));
vi.mock('../util/notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('../util/notificationRealtimeEvents.js', () => ({
  queueNotificationChange: changed,
  queueNotificationSourceChange: vi.fn(),
}));
vi.mock('../util/communityFeed/schema.js', () => ({ communityFeedSchemaReady: vi.fn(async () => false) }));
vi.mock('../util/publicResources/schema.js', () => ({ publicResourceSchemaReady: vi.fn(async () => false) }));
const { setReadState } = await import('./notificationHandle.js');
const request = (isRead = false) => ({ user: { id: 'owner-1', role: 'user' }, body: { id: 'notice-1', isRead } });
const response = () => ({ send: vi.fn() });

describe('notification read-state writes', () => {
  beforeEach(() => {
    query.mockReset();
    changed.mockReset();
    allow.mockReset().mockReturnValue(true);
  });

  it.each([false, true])('sets an explicit state (%s), only for an owned visible notification', async (isRead) => {
    query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = response();
    await setReadState(request(isRead), res);
    expect(res.send).toHaveBeenCalledWith({ data: { id: 'notice-1', isRead }, status: 200, msg: '' });
    const [sql, values] = query.mock.calls[0];
    expect(values).toEqual([Number(isRead), Number(isRead), 'owner-1', 'notice-1', Number(isRead)]);
    expect(sql).toContain('user_id = ? AND id = ? AND del_flag = 0 AND COALESCE(recalled, 0) = 0');
    expect(sql).toContain('ELSE NULL END');
    expect(sql).toContain("'community_chat'");
    expect(sql).toContain("'community_feed'");
    expect(sql).toContain("'public_resource'");
    const writtenColumns = sql.split(' WHERE ')[0];
    expect(writtenColumns).not.toContain('browser_push_pending');
    expect(writtenColumns).not.toContain('create_time');
    expect(writtenColumns).not.toContain('todo');
    expect(changed).toHaveBeenCalledExactlyOnceWith(null, ['owner-1']);
  });

  it('repeated desired state succeeds without emitting another change', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ isRead: 0 }]]);
    const res = response();
    await setReadState(request(), res);
    expect(res.send.mock.calls[0][0].status).toBe(200);
    expect(changed).not.toHaveBeenCalled();
  });

  it('cannot restore deleted, recalled, invisible or another user’s notification', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    const res = response();
    await setReadState(request(), res);
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 404, msg: 'NOTIFICATION_UNAVAILABLE' });
    expect(query.mock.calls[1][1]).toEqual(['owner-1', 'notice-1']);
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not confirm a state overwritten by another request', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ isRead: 1 }]]);
    const res = response();
    await setReadState(request(), res);
    expect(res.send.mock.calls[0][0].status).toBe(409);
  });

  it.each([
    { id: '', isRead: false },
    { id: 'n1', isRead: 'false' },
    { id: ['n1'], isRead: true },
    { id: 'n'.repeat(65), isRead: true },
  ])('rejects malformed input %j before querying', async (body) => {
    const res = response();
    await setReadState({ ...request(), body }, res);
    expect(res.send.mock.calls[0][0].status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects guests and administrator previews', async () => {
    allow.mockReturnValueOnce(false);
    await setReadState(request(), response());
    const res = response();
    await setReadState({ ...request(), adminContext: {} }, res);
    expect(res.send.mock.calls[0][0].status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not expose SQL or credentials on failure', async () => {
    query.mockRejectedValueOnce(new Error('secret database connection'));
    const res = response();
    await setReadState(request(), res);
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 500, msg: 'NOTIFICATION_READ_STATE_FAILED' });
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('secret');
  });
});
