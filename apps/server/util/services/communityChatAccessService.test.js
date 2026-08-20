import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommunityChatError,
  acceptCommunityChatRules,
  assertCommunityChatPostingEnabled,
  getCommunityChatAccess,
  getCommunityChatRuntimePolicyForAdmin,
  listCommunityChatAccessRequests,
  listCommunityChatRooms,
  requestCommunityChatAccess,
  reviewCommunityChatAccessRequest,
  revokeCommunityChatMember,
  updateCommunityChatRuntimePolicy,
} from './communityChatAccessService.js';
import { communityChatRealtimeBroker } from '../communityChat/realtimeBroker.js';

const INVITE_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'invite_only',
  COMMUNITY_CHAT_WAITLIST_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

const MESSAGE_ENV = {
  ...INVITE_ENV,
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
};

const PUBLIC_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

function createConnection() {
  return {
    beginTransaction: vi.fn(async () => {}),
    query: vi.fn(),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
}

describe('communityChatAccessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认 closed 时不碰数据库且不向任何用户开放', async () => {
    const db = { query: vi.fn() };
    const access = await getCommunityChatAccess({ user: { id: 'user-1', role: 'user' }, env: {}, db });

    expect(access).toMatchObject({ status: 'closed', canEnter: false, canRequest: false });
    expect(access.messagingEnabled).toBe(false);
    expect(access.notificationsDefaultEnabled).toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('游客只得到登录引导，不查询邀请和成员信息', async () => {
    const db = { query: vi.fn() };
    const access = await getCommunityChatAccess({ user: { id: 'visitor-1', role: 'visitor' }, env: INVITE_ENV, db });

    expect(access).toMatchObject({ status: 'login_required', authenticated: false, canEnter: false });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('公共模式下游客可读取频道但不能发言、记未读或读取个人设置', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        if (String(sql).includes('community_chat_runtime_policy')) {
          return [[{ postingEnabled: 1, updatedAt: '2026-08-09 10:00:00' }], []];
        }
        expect(String(sql)).toContain('FROM community_chat_rooms room');
        expect(params).toEqual(['general']);
        return [
          [
            {
              slug: 'general',
              name: '轻笺聊天室',
              description: '聊使用问题、实用技巧、功能想法和日常见闻。',
              type: 'text',
              status: 'active',
              unreadCount: 0,
            },
          ],
          [],
        ];
      }),
    };

    const result = await listCommunityChatRooms({
      user: { id: 'visitor-1', role: 'visitor' },
      env: PUBLIC_ENV,
      db,
      locale: 'zh-CN',
    });

    expect(result.access).toMatchObject({
      status: 'read_only',
      authenticated: false,
      canRead: true,
      canPost: false,
      canEnter: true,
    });
    expect(result.items[0]).toMatchObject({ slug: 'general', unreadCount: 0 });
    const roomQuery = db.query.mock.calls.find(([sql]) => String(sql).includes('FROM community_chat_rooms room'));
    expect(String(roomQuery?.[0])).not.toContain('community_chat_reads');
  });

  it('公共模式下普通登录用户无需邀请即可进入和发言，封禁状态仍然生效', async () => {
    const activeDb = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
        if (String(sql).includes('community_chat_members')) return [[], []];
        if (String(sql).includes('community_chat_user_settings')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const active = await getCommunityChatAccess({
      user: { id: 'user-1', role: 'user' },
      env: PUBLIC_ENV,
      db: activeDb,
    });
    expect(active).toMatchObject({
      status: 'active',
      canRead: true,
      canPost: true,
      canEnter: true,
      memberRole: 'member',
      notificationsDefaultEnabled: true,
      notificationsEnabled: true,
    });

    const bannedDb = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
        if (String(sql).includes('community_chat_members')) return [[{ role: 'member', status: 'banned' }], []];
        if (String(sql).includes('community_chat_user_settings')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const banned = await getCommunityChatAccess({
      user: { id: 'user-2', role: 'user' },
      env: PUBLIC_ENV,
      db: bannedDb,
    });
    expect(banned).toMatchObject({ status: 'restricted', canEnter: false, canPost: false });
  });

  it('数据库紧急只读时保留公共历史访问，但所有登录身份都不再获得发言权', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('community_chat_runtime_policy')) {
          return [[{ postingEnabled: 0, updatedAt: '2026-08-09 10:00:00' }], []];
        }
        if (String(sql).includes('community_chat_members')) return [[], []];
        if (String(sql).includes('community_chat_user_settings')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const access = await getCommunityChatAccess({
      user: { id: 'user-1', role: 'user' },
      env: PUBLIC_ENV,
      db,
    });

    expect(access).toMatchObject({
      status: 'active',
      canRead: true,
      canEnter: true,
      canPost: false,
      postingEnabled: false,
      emergencyReadOnly: true,
      environmentReadOnly: false,
    });
  });

  it('发送事务以行锁复核运行策略，数据库或环境级只读都返回稳定业务码', async () => {
    const databaseDb = {
      query: vi.fn(async () => [[{ postingEnabled: 0 }], []]),
    };
    await expect(
      assertCommunityChatPostingEnabled({ env: PUBLIC_ENV, db: databaseDb, lock: true }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_EMERGENCY_READ_ONLY', status: 423 });
    expect(String(databaseDb.query.mock.calls[0][0])).toContain('FOR UPDATE');

    const environmentDb = {
      query: vi.fn(async () => [[{ postingEnabled: 1 }], []]),
    };
    await expect(
      assertCommunityChatPostingEnabled({
        env: { ...PUBLIC_ENV, COMMUNITY_CHAT_EMERGENCY_READ_ONLY: '1' },
        db: environmentDb,
        lock: true,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_EMERGENCY_READ_ONLY', status: 423 });
  });

  it('已获邀成员必须确认当前版本规则后才能查看频道', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('community_chat_access_requests')) return [[], []];
        if (String(sql).includes('community_chat_members')) {
          return [[{ role: 'member', status: 'invited', rulesVersion: null }], []];
        }
        if (String(sql).includes('community_chat_user_settings')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const access = await getCommunityChatAccess({ user: { id: 'user-1', role: 'user' }, env: INVITE_ENV, db });

    expect(access).toMatchObject({ status: 'rules_required', canAcceptRules: true, canEnter: false });
  });

  it('目录接口在未准入时也返回 access 与空房间，避免客户端先查 access', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('community_chat_access_requests')) return [[], []];
        if (String(sql).includes('community_chat_members')) {
          return [[{ role: 'member', status: 'invited', rulesVersion: null }], []];
        }
        if (String(sql).includes('community_chat_user_settings')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatRooms({
      user: { id: 'user-1', role: 'user' },
      env: INVITE_ENV,
      db,
    });

    expect(result).toMatchObject({
      access: { status: 'rules_required', canEnter: false },
      messagingEnabled: false,
      items: [],
    });
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM community_chat_rooms'))).toBe(false);
  });

  it('当前规则已确认的 active 成员可读取服务端频道目录，并尊重已保存的关闭选择', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('community_chat_access_requests')) return [[], []];
        if (String(sql).includes('community_chat_members')) {
          return [[{ role: 'member', status: 'active', rulesVersion: 'rules-v1' }], []];
        }
        if (String(sql).includes('community_chat_user_settings')) {
          return [[{ notificationsEnabled: 0 }], []];
        }
        if (String(sql).includes('FROM community_chat_rooms')) {
          return [
            [
              {
                slug: 'general',
                name: '轻笺聊天室',
                description: '聊使用问题、实用技巧、功能想法和日常见闻。',
                status: 'active',
                notificationLevel: 'mentions',
              },
            ],
            [],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatRooms({
      user: { id: 'user-1', role: 'user' },
      env: INVITE_ENV,
      db,
      locale: 'zh-CN',
    });

    expect(result.messagingEnabled).toBe(false);
    expect(result.access).toMatchObject({ canEnter: true, notificationsEnabled: false });
    expect(result.items).toEqual([
      expect.objectContaining({ slug: 'general', name: '轻笺聊天室', unreadCount: 0, mentionCount: 0 }),
    ]);
  });

  it('显式开启文本试点后按当前用户阅读位置返回频道未读数', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        if (String(sql).includes('community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
        if (String(sql).includes('community_chat_access_requests')) return [[], []];
        if (String(sql).includes('FROM community_chat_members')) {
          return [[{ role: 'member', status: 'active', rulesVersion: 'rules-v1' }], []];
        }
        if (String(sql).includes('community_chat_user_settings')) {
          return [[{ notificationsEnabled: 1, defaultRoomLevel: 'mentions' }], []];
        }
        if (String(sql).includes('FROM community_chat_rooms room')) {
          expect(params).toEqual([
            'user-1',
            'user-1',
            'user-1',
            'user-1',
            'mentions',
            'mentions',
            'mentions',
            'user-1',
            'user-1',
            'mentions',
            'general',
          ]);
          expect(String(sql)).toContain('community_chat_blocks');
          expect(String(sql)).toContain('community_chat_message_deletions');
          expect(String(sql)).toContain('community_chat_message_mentions');
          expect(String(sql)).toContain('reply.user_id = ?');
          expect(String(sql)).toContain("IN ('mentions_only', 'mentions')");
          expect(String(sql)).toContain("<> 'mentions_only'");
          return [
            [
              {
                slug: 'general',
                name: '轻笺聊天室',
                description: '聊使用问题、实用技巧、功能想法和日常见闻。',
                type: 'text',
                status: 'active',
                unreadCount: '3',
              },
            ],
            [],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatRooms({
      user: { id: 'user-1', role: 'user' },
      env: MESSAGE_ENV,
      db,
      locale: 'zh-CN',
    });

    expect(result.messagingEnabled).toBe(true);
    expect(result.items[0]).toMatchObject({ unreadCount: 3, mentionCount: 0 });
  });

  it('关闭聊天室提醒时不查询也不返回频道未读数', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        if (String(sql).includes('community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
        if (String(sql).includes('community_chat_access_requests')) return [[], []];
        if (String(sql).includes('FROM community_chat_members')) {
          return [[{ role: 'member', status: 'active', rulesVersion: 'rules-v1' }], []];
        }
        if (String(sql).includes('community_chat_user_settings')) return [[{ notificationsEnabled: 0 }], []];
        if (String(sql).includes('FROM community_chat_rooms room')) {
          expect(params).toEqual(['general']);
          expect(String(sql)).not.toContain('community_chat_reads');
          return [[{ slug: 'general', name: '轻笺聊天室', type: 'text', status: 'active' }], []];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatRooms({
      user: { id: 'user-1', role: 'user' },
      env: MESSAGE_ENV,
      db,
      locale: 'zh-CN',
    });

    expect(result.access.notificationsEnabled).toBe(false);
    expect(result.items[0]).toMatchObject({ unreadCount: 0, mentionCount: 0 });
  });

  it('重复申请保持单行幂等，并在提交后释放事务连接', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ id: 'request-1', status: 'pending' }], []]);
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await requestCommunityChatAccess({
      user: { id: 'user-1', role: 'user' },
      env: INVITE_ENV,
      db,
    });

    expect(result).toEqual({ id: 'request-1', status: 'pending', alreadyPending: true });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('确认规则只使用同一事务连接，并幂等创建默认开启的通知偏好', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ status: 'invited' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const db = { getConnection: vi.fn(async () => connection), query: vi.fn() };

    await acceptCommunityChatRules({
      user: { id: 'user-1', role: 'user' },
      rulesVersion: 'rules-v1',
      env: INVITE_ENV,
      db,
    });

    expect(connection.query.mock.calls[2][0]).toContain('INSERT IGNORE INTO community_chat_user_settings');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('Root 审批申请时原子写入邀请成员、默认偏好和审计', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 'user-2', role: 'user', delFlag: '0' }], []])
      .mockResolvedValueOnce([[{ id: 'request-2', status: 'pending' }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValue([{ affectedRows: 1 }, []]);
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await reviewCommunityChatAccessRequest({
      user: { id: 'root-1', role: 'root' },
      targetUserId: 'user-2',
      action: 'approve',
      note: '首批内测',
      db,
    });

    expect(result).toEqual({ userId: 'user-2', status: 'approved' });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_members')),
    ).toBe(true);
    expect(
      connection.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT IGNORE INTO community_chat_user_settings'),
      ),
    ).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('Root 申请列表同时返回账号与成员状态，供审核台安全判断可用动作', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'request-2',
              userId: 'user-2',
              status: 'approved',
              userAlias: '内测用户',
              userEmail: 'pilot@example.com',
              memberRole: 'member',
              memberStatus: 'active',
            },
          ],
          [],
        ])
        .mockResolvedValueOnce([[{ total: '1' }], []]),
    };

    const result = await listCommunityChatAccessRequests({
      user: { id: 'root-1', role: 'root' },
      status: 'approved',
      page: 1,
      pageSize: 20,
      db,
    });

    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20, status: 'approved' });
    expect(result.items[0]).toMatchObject({
      userId: 'user-2',
      userEmail: 'pilot@example.com',
      memberStatus: 'active',
    });
    expect(String(db.query.mock.calls[0][0])).toContain('LEFT JOIN community_chat_members member');
    expect(db.query.mock.calls[0][1]).toEqual(['approved', 20, 0]);
  });

  it('Root 撤销成员资格时只使用同一事务连接并写入审计', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ status: 'active' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const db = { getConnection: vi.fn(async () => connection), query: vi.fn() };

    const result = await revokeCommunityChatMember({
      user: { id: 'root-1', role: 'root' },
      targetUserId: 'user-2',
      reason: '内测阶段暂停',
      env: MESSAGE_ENV,
      db,
    });
    unsubscribeRealtime();

    expect(result).toEqual({ userId: 'user-2', status: 'revoked' });
    expect(connection.query.mock.calls[1][0]).toContain("SET status = 'revoked'");
    expect(connection.query.mock.calls[2][0]).toContain("'access_revoked'");
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(realtimeListener).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'access.changed',
        payload: { reason: 'access_revoked', disconnect: true },
      }),
      internal: { targetUserId: 'user-2' },
    });
  });

  it('Root 切换紧急只读时锁定单行策略，并在同一事务写入不可变审计', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection();
    connection.query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM community_chat_runtime_policy')) {
        return [[{ postingEnabled: 1, updatedAt: '2026-08-09 10:00:00' }], []];
      }
      return [{ affectedRows: 1 }, []];
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await updateCommunityChatRuntimePolicy({
      user: { id: 'root-1', role: 'root' },
      postingEnabled: false,
      reason: '异常刷屏，暂停发言完成核查',
      env: PUBLIC_ENV,
      db,
    });
    unsubscribeRealtime();

    expect(result).toMatchObject({
      messagingEnabled: true,
      postingEnabled: false,
      databasePostingEnabled: false,
      emergencyReadOnly: true,
      changed: true,
    });
    expect(String(connection.query.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[1][0])).toContain('INSERT INTO community_chat_runtime_policy');
    expect(String(connection.query.mock.calls[2][0])).toContain('INSERT INTO community_chat_moderation_actions');
    expect(connection.query.mock.calls[2][1]).toEqual(
      expect.arrayContaining(['root-1', 'root-1', 'emergency_read_only_enabled', '异常刷屏，暂停发言完成核查']),
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(realtimeListener).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'runtime.changed',
        payload: { postingEnabled: false, emergencyReadOnly: true },
      }),
      internal: {},
    });
  });

  it('运行策略只允许 Root 读取，环境级锁生效时不允许从后台伪恢复', async () => {
    const deniedDb = { query: vi.fn() };
    await expect(
      getCommunityChatRuntimePolicyForAdmin({ user: { id: 'user-1', role: 'user' }, env: PUBLIC_ENV, db: deniedDb }),
    ).rejects.toMatchObject({ code: 'ROOT_REQUIRED', status: 403 });
    expect(deniedDb.query).not.toHaveBeenCalled();

    const lockedDb = { getConnection: vi.fn() };
    await expect(
      updateCommunityChatRuntimePolicy({
        user: { id: 'root-1', role: 'root' },
        postingEnabled: true,
        reason: '准备恢复',
        env: { ...PUBLIC_ENV, COMMUNITY_CHAT_EMERGENCY_READ_ONLY: '1' },
        db: lockedDb,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_ENVIRONMENT_READ_ONLY', status: 423 });
    expect(lockedDb.getConnection).not.toHaveBeenCalled();
  });

  it('拒绝和撤销原因由 Service 强制校验，不能只依赖管理页面', async () => {
    const db = { getConnection: vi.fn() };

    await expect(
      reviewCommunityChatAccessRequest({
        user: { id: 'root-1', role: 'root' },
        targetUserId: 'user-2',
        action: 'reject',
        note: '   ',
        db,
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_NOTE_REQUIRED', status: 400 });
    await expect(
      revokeCommunityChatMember({
        user: { id: 'root-1', role: 'root' },
        targetUserId: 'user-2',
        reason: '',
        db,
      }),
    ).rejects.toMatchObject({ code: 'REVOKE_REASON_REQUIRED', status: 400 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('规则版本过期时在获取连接前失败，避免接受陈旧文本', async () => {
    const db = { getConnection: vi.fn() };

    await expect(
      acceptCommunityChatRules({
        user: { id: 'user-1', role: 'user' },
        rulesVersion: 'rules-v0',
        env: INVITE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'RULES_VERSION_OUTDATED', status: 409 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('服务错误保留稳定业务码，不要求调用方解析数据库信息', () => {
    const error = new CommunityChatError('TEST_CODE', 409, '中文', 'English');
    expect(error).toMatchObject({ code: 'TEST_CODE', status: 409, zhMessage: '中文', enMessage: 'English' });
  });
});
