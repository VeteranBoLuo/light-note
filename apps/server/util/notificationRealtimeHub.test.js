import { describe, expect, it } from 'vitest';
import { __test__ } from './notificationRealtimeHub.js';

describe('notification realtime hub', () => {
  it('只接受无查询参数的固定同源路径', () => {
    expect(__test__.pathMatches({ url: '/realtime/notifications' })).toBe(true);
    expect(__test__.pathMatches({ url: '/realtime/notifications?userId=root-1' })).toBe(false);
    expect(__test__.pathMatches({ url: '/realtime/chat' })).toBe(false);
  });

  it('连接与定期复核都只从 sid 恢复 root 权限', async () => {
    const db = {
      query: async () => [[{ id: 'root-1', role: 'root', del_flag: 0 }]],
    };
    const access = await __test__.resolveRootAccessBySid('sid-1', {
      db,
      getSessionById: async () => ({ user_id: 'root-1' }),
    });
    expect(access).toEqual({ sid: 'sid-1', userId: 'root-1' });

    await expect(
      __test__.resolveRootAccessBySid('sid-2', {
        db: { query: async () => [[{ id: 'user-1', role: 'user', del_flag: 0 }]] },
        getSessionById: async () => ({ user_id: 'user-1' }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
