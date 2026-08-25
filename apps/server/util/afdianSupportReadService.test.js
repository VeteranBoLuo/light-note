import { describe, expect, it, vi } from 'vitest';
import {
  getAfdianAdminOverview,
  getAfdianLeaderboard,
  getAfdianPublicAvatar,
  getAfdianPublicPreference,
  invalidateAfdianLeaderboardCache,
  setAfdianAdminIdentityHidden,
  updateAfdianPublicPreference,
} from './afdianSupportReadService.js';

const mocks = vi.hoisted(() => ({ defaultQuery: vi.fn() }));

vi.mock('../db/index.js', () => ({
  default: {
    query: mocks.defaultQuery,
    getConnection: vi.fn(),
  },
}));

describe('爱发电赞助读取与公开偏好', () => {
  it('后台概览允许 Handler 无参数调用并使用默认数据库连接', async () => {
    mocks.defaultQuery
      .mockResolvedValueOnce([
        [{ verified_orders: 2, assigned_supporters: 1, total_amount: '30.00', month_amount: '10.00' }],
        [],
      ])
      .mockResolvedValueOnce([[{ linked_accounts: 1 }], []])
      .mockResolvedValueOnce([[{ pending_orders: 0, conflict_orders: 0, unlinked_orders: 0 }], []])
      .mockResolvedValueOnce([[{ granted_tokens: 600_000, manual_review_rewards: 1, reversal_review_rewards: 0 }], []]);

    await expect(getAfdianAdminOverview()).resolves.toEqual({
      verifiedOrders: 2,
      assignedSupporters: 1,
      totalAmount: '30.00',
      monthAmount: '10.00',
      linkedAccounts: 1,
      pendingOrders: 0,
      conflictOrders: 0,
      unlinkedOrders: 0,
      grantedTokens: 600_000,
      manualReviewRewards: 1,
      reversalReviewRewards: 0,
    });
    expect(mocks.defaultQuery).toHaveBeenCalledTimes(4);
  });

  it('没有偏好记录时默认参与榜单但保持匿名', async () => {
    const db = { query: vi.fn().mockResolvedValue([[], []]) };
    await expect(getAfdianPublicPreference({ userId: 'user-1', db })).resolves.toEqual({
      participateInRanking: true,
      showIdentity: false,
      adminHidden: false,
    });
  });

  it('公开偏好只接受明确布尔值并在保存后失效榜单缓存', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([
          [
            {
              participate_in_ranking: 1,
              show_identity: 1,
              admin_hidden: 0,
              identity_consented_at: '2026-08-14 01:00:00',
            },
          ],
          [],
        ]),
    };
    await expect(
      updateAfdianPublicPreference({ userId: 'user-1', participateInRanking: true, showIdentity: true, db }),
    ).resolves.toMatchObject({ participateInRanking: true, showIdentity: true });
    const preferenceSql = String(db.query.mock.calls[0][0]);
    expect(preferenceSql).toContain('identity_consented_at IS NULL');
    expect(preferenceSql.indexOf('identity_consented_at = CASE')).toBeLessThan(
      preferenceSql.indexOf('show_identity = VALUES(show_identity)'),
    );
    await expect(
      updateAfdianPublicPreference({ userId: 'user-1', participateInRanking: 1, showIdentity: true, db }),
    ).rejects.toMatchObject({ code: 'AFDIAN_PREFERENCE_INVALID' });
  });

  it('退出榜单时后端同步关闭公开身份，重新加入仍需用户明确开启', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([
          [{ participate_in_ranking: 0, show_identity: 0, admin_hidden: 0, identity_consented_at: null }],
          [],
        ]),
    };

    await updateAfdianPublicPreference({
      userId: 'user-1',
      participateInRanking: false,
      showIdentity: true,
      db,
    });

    expect(db.query.mock.calls[0][1].slice(2)).toEqual([0, 0, 0]);
  });

  it('累计榜隐藏内部 userId，默认匿名，只有明确同意的身份才公开', async () => {
    invalidateAfdianLeaderboardCache();
    const db = {
      query: vi.fn().mockResolvedValue([
        [
          {
            user_id: 'private-user-1',
            order_count: 2,
            total_amount: '30.00',
            last_support_at: '2026-08-14 00:00:00',
            alias: '公开用户',
            public_id: '11111111-1111-4111-8111-111111111111',
            participate_in_ranking: 1,
            show_identity: 1,
            admin_hidden: 0,
            has_avatar: 1,
          },
          {
            user_id: 'private-user-2',
            order_count: 1,
            total_amount: '20.00',
            last_support_at: '2026-08-14 01:00:00',
            alias: '不应泄露',
            public_id: null,
            participate_in_ranking: 1,
            show_identity: 0,
            admin_hidden: 0,
            has_avatar: 1,
          },
        ],
        [],
      ]),
    };

    const result = await getAfdianLeaderboard({ userId: 'private-user-2', db });
    expect(result.items[0]).toMatchObject({
      rank: 1,
      anonymous: false,
      displayName: '公开用户',
      publicId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.items[1]).toMatchObject({ rank: 2, anonymous: true, displayName: null, publicId: null });
    expect(result.mine).toEqual(result.items[1]);
    expect(JSON.stringify(result)).not.toContain('private-user');
    expect(String(db.query.mock.calls[0][0])).toContain("NOT IN ('root', 'test', 'visitor')");
  });

  it('公开头像仅在偏好仍公开时读取，并拒绝非 HTTPS 外链', async () => {
    const httpsDb = { query: vi.fn().mockResolvedValue([[{ source: 'https://img.example/avatar.png' }], []]) };
    await expect(
      getAfdianPublicAvatar({ publicId: '11111111-1111-4111-8111-111111111111', db: httpsDb }),
    ).resolves.toEqual({ redirectUrl: 'https://img.example/avatar.png' });
    expect(String(httpsDb.query.mock.calls[0][0])).toContain('p.show_identity = 1');

    const httpDb = { query: vi.fn().mockResolvedValue([[{ source: 'http://img.example/avatar.png' }], []]) };
    await expect(
      getAfdianPublicAvatar({ publicId: '11111111-1111-4111-8111-111111111111', db: httpDb }),
    ).resolves.toBeNull();
  });

  it('后台只能安全隐藏公开身份且必须写入同一事务审计，不能改写用户公开选择', async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ exists: 1 }], []])
        .mockResolvedValue([[], []]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      setAfdianAdminIdentityHidden({
        userId: 'user-1',
        hidden: true,
        reason: '用户举报后临时隐藏',
        actorUserId: 'root',
        requestId: 'request-1',
        ip: '127.0.0.1',
        db,
      }),
    ).resolves.toBeUndefined();

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(String(connection.query.mock.calls[0][0])).toContain('o.provider_status = 2');
    const preferenceSql = String(connection.query.mock.calls[1][0]);
    expect(preferenceSql).toContain('admin_hidden = VALUES(admin_hidden)');
    expect(preferenceSql).not.toContain('show_identity =');
    expect(String(connection.query.mock.calls[2][0])).toContain('INSERT INTO admin_operation_audit');

    await expect(
      setAfdianAdminIdentityHidden({
        userId: 'user-1',
        hidden: true,
        reason: '',
        actorUserId: 'root',
        db,
      }),
    ).rejects.toMatchObject({ code: 'AFDIAN_ADMIN_HIDE_INVALID' });
    expect(db.getConnection).toHaveBeenCalledOnce();
  });
});
