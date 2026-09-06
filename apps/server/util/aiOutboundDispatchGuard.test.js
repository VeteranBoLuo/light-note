import { describe, expect, it, vi } from 'vitest';
import { withActiveUserAiDispatch } from './aiOutboundDispatchGuard.js';

function createDatabase(user = { id: 'u1', role: 'user', del_flag: 0 }) {
  const events = [];
  const connection = {
    beginTransaction: vi.fn(async () => events.push('begin')),
    query: vi.fn(async (sql) => {
      events.push(sql.includes('FOR UPDATE') ? 'lock-user' : 'query');
      return [[...(user ? [user] : [])]];
    }),
    commit: vi.fn(async () => events.push('commit')),
    rollback: vi.fn(async () => events.push('rollback')),
    release: vi.fn(() => events.push('release')),
  };
  return { database: { getConnection: vi.fn(async () => connection) }, connection, events };
}

describe('AI Provider 外发账号屏障', () => {
  it('在 user 行锁持有期间执行 Provider，并在交付后才释放注销屏障', async () => {
    const { database, connection, events } = createDatabase();
    const result = await withActiveUserAiDispatch(database, 'u1', async ({ user }) => {
      events.push('provider');
      expect(user).toEqual({ id: 'u1', role: 'user', isAuthenticated: true });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(events).toEqual(['begin', 'lock-user', 'provider', 'commit', 'release']);
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });

  it('注销账号在回调前失败关闭且回滚，不会调用 Provider', async () => {
    const { database, events } = createDatabase({ id: 'u1', role: 'deleted', del_flag: 1 });
    const provider = vi.fn();

    await expect(withActiveUserAiDispatch(database, 'u1', provider)).rejects.toMatchObject({
      code: 'AI_ACCOUNT_UNAVAILABLE',
    });
    expect(provider).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'lock-user', 'rollback', 'release']);
  });
});
