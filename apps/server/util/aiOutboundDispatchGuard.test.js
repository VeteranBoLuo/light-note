import { describe, expect, it, vi } from 'vitest';
import { withActiveUserAiDispatch } from './aiOutboundDispatchGuard.js';

function createDatabase(user = { id: 'u1', role: 'user', del_flag: 0 }) {
  const events = [];
  const connection = {
    beginTransaction: vi.fn(async () => events.push('begin')),
    query: vi.fn(async (sql) => {
      if (sql.includes('GET_LOCK')) {
        events.push('lifecycle-lock');
        return [[{ acquired: 1 }]];
      }
      if (sql.includes('RELEASE_LOCK')) {
        events.push('lifecycle-release');
        return [[{ released: 1 }]];
      }
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
  it('短事务验证账号，交付后才释放独立生命周期屏障', async () => {
    const { database, connection, events } = createDatabase();
    const result = await withActiveUserAiDispatch(database, 'u1', async ({ user }) => {
      events.push('provider');
      expect(user).toEqual({ id: 'u1', role: 'user', isAuthenticated: true });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(events).toEqual([
      'query',
      'lifecycle-lock',
      'begin',
      'lock-user',
      'commit',
      'begin',
      'provider',
      'commit',
      'lifecycle-release',
      'release',
    ]);
    expect(connection.query.mock.calls[2][0]).toContain('FOR UPDATE');
  });

  it('注销账号在回调前失败关闭且回滚，不会调用 Provider', async () => {
    const { database, events } = createDatabase({ id: 'u1', role: 'deleted', del_flag: 1 });
    const provider = vi.fn();

    await expect(withActiveUserAiDispatch(database, 'u1', provider)).rejects.toMatchObject({
      code: 'AI_ACCOUNT_UNAVAILABLE',
    });
    expect(provider).not.toHaveBeenCalled();
    expect(events).toEqual(['query', 'lifecycle-lock', 'begin', 'lock-user', 'rollback', 'lifecycle-release', 'release']);
  });

  it('completes more dispatches than pool slots when callbacks borrow the same pool', async () => {
    let active = 0;
    let peak = 0;
    const waiting = [];
    const database = {
      pool: { config: { connectionLimit: 10 } },
      async getConnection() {
        if (active === 10) await new Promise((resolve) => waiting.push(resolve));
        active += 1;
        peak = Math.max(peak, active);
        return {
          beginTransaction: async () => {},
          commit: async () => {},
          rollback: async () => {},
          query: async (sql) => [
            [
              sql.includes('GET_LOCK')
                ? { acquired: 1 }
                : sql.includes('RELEASE_LOCK')
                  ? { released: 1 }
                  : { id: 'u', role: 'user', del_flag: 0 },
            ],
          ],
          release() {
            active -= 1;
            waiting.shift()?.();
          },
        };
      },
      async query() {
        const connection = await this.getConnection();
        await Promise.resolve();
        connection.release();
      },
    };
    let timer;
    try {
      const result = await Promise.race([
        Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            withActiveUserAiDispatch(database, `u${i}`, async () => {
              await database.query();
              return i;
            }),
          ),
        ),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('pool starvation')), 500);
        }),
      ]);
      expect(result).toHaveLength(20);
      expect(peak).toBeLessThanOrEqual(4);
      expect(active).toBe(0);
    } finally {
      clearTimeout(timer);
    }
  });

  it('queues the same account without borrowing connections or blocking other accounts', async () => {
    const { database } = createDatabase();
    let finish;
    const first = withActiveUserAiDispatch(
      database,
      'same',
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    // Enter the callback before adding the competing request.
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const secondCallback = vi.fn();
    const second = withActiveUserAiDispatch(database, 'same', secondCallback);
    await withActiveUserAiDispatch(database, 'other', async () => {});
    expect(database.getConnection).toHaveBeenCalledTimes(2);
    expect(secondCallback).not.toHaveBeenCalled();
    finish();
    await Promise.all([first, second]);
    expect(secondCallback).toHaveBeenCalledOnce();
  });

  it('returns admission capacity after connection checkout fails', async () => {
    const { database } = createDatabase();
    database.getConnection.mockRejectedValueOnce(new Error('unavailable'));
    await expect(withActiveUserAiDispatch(database, 'u1', async () => {})).rejects.toThrow('unavailable');
    await expect(withActiveUserAiDispatch(database, 'u1', async () => 'ok')).resolves.toBe('ok');
  });
});
