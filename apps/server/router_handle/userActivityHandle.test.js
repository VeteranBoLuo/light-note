import { describe, expect, it, vi, beforeEach } from 'vitest';
const { query, recordActivity, queryActiveUsers } = vi.hoisted(() => ({
  query: vi.fn(),
  recordActivity: vi.fn(),
  queryActiveUsers: vi.fn(),
}));
vi.mock('../db/index.js', () => ({ default: { query } }));
vi.mock('../util/services/userActivityService.js', async (original) => ({
  ...(await original()),
  recordActivity,
  queryActiveUsers,
}));
// Match the application's import order through the existing router/common cycle.
await import('../util/common.js');
const { recordUserActivity, getAdminOverviewActiveUsers } = await import('./userActivityHandle.js');
const res = () => ({ send: vi.fn(), status: vi.fn().mockReturnThis() });
beforeEach(() => {
  query.mockReset();
  recordActivity.mockReset();
  queryActiveUsers.mockReset();
});
describe('user activity authorization', () => {
  it.each([
    {},
    { id: 'visitor', role: 'visitor', isAuthenticated: true },
    { id: 'disabled', role: 'user', isAuthenticated: true, isDeletedOrDisabled: true },
    { id: 'deleted', role: 'deleted', isAuthenticated: true },
  ])('ignores ineligible identities without writes: %j', async (user) => {
    const response = res();
    await recordUserActivity({ user, body: { signal: 'interaction' } }, response);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ data: { accepted: false } }));
  });
  it('preview does not accrue subject activity and payload identity/time cannot override the actor', async () => {
    const user = { id: 'real', role: 'user', isAuthenticated: true };
    await recordUserActivity({ user, adminContext: {}, body: { signal: 'reading' } }, res());
    expect(recordActivity).not.toHaveBeenCalled();
    recordActivity.mockResolvedValue({ accepted: true, recorded: true });
    await recordUserActivity(
      { user, body: { signal: 'interaction', userId: 'forged', timestamp: '2000-01-01' } },
      res(),
    );
    expect(recordActivity).toHaveBeenCalledWith('real');
  });
  it('invalid signals do not reach storage', async () => {
    const response = res();
    await recordUserActivity(
      { user: { id: 'u', role: 'user', isAuthenticated: true }, body: { signal: 'poll' } },
      response,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(recordActivity).not.toHaveBeenCalled();
  });
  it('list requires a currently enabled root, not a stale role or impersonation context', async () => {
    await getAdminOverviewActiveUsers({ user: { id: 'u', role: 'user' } }, res());
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 1 }]]);
    await getAdminOverviewActiveUsers({ user: { id: 'root', role: 'root' } }, res());
    expect(queryActiveUsers).not.toHaveBeenCalled();
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    queryActiveUsers.mockResolvedValue({ total: 0, items: [] });
    await getAdminOverviewActiveUsers({ user: { id: 'root', role: 'root' }, body: { hideInternal: false } }, res());
    expect(queryActiveUsers).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'root', hideInternal: false }));
  });
  it('storage outages return unavailable, not a fabricated empty list', async () => {
    query.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    queryActiveUsers.mockRejectedValue(Object.assign(new Error('private details'), { code: 'ER_NO_SUCH_TABLE' }));
    const response = res();
    await getAdminOverviewActiveUsers({ user: { id: 'root', role: 'root' } }, response);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'ACTIVITY_UNAVAILABLE' } }));
  });
});
