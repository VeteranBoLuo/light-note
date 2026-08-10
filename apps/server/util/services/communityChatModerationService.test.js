import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __test__,
  assertCommunityChatPostingAllowed,
  blockCommunityChatMessageAuthor,
  listCommunityChatReports,
  reportCommunityChatMessage,
  reviewCommunityChatReport,
} from './communityChatModerationService.js';
import { communityChatRealtimeBroker } from '../communityChat/realtimeBroker.js';

const MESSAGE_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'invite_only',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

const MEMBER = { role: 'member', status: 'active', rulesVersion: 'rules-v1' };

function moderationMessage(overrides = {}) {
  return {
    id: 12,
    publicId: '00000000-0000-4000-8000-000000000012',
    userId: 'user-2',
    content: '需要人工判断的消息内容',
    status: 'active',
    createdAt: '2026-08-09T10:00:00.000Z',
    roomSlug: 'newcomers',
    roomNameZh: '新手问答',
    roomNameEn: 'Newcomer Q&A',
    authorName: '薄荷',
    accountDeleted: '0',
    accountRole: 'user',
    memberRole: 'member',
    memberStatus: 'active',
    ...overrides,
  };
}

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn(async () => {}),
    query: vi.fn(queryImplementation),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
}

describe('communityChatModerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('举报在同一事务复核资格并保存最小必要证据快照', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_messages message')) return [[moderationMessage()], []];
      if (text.includes('FROM community_chat_reports')) return [[], []];
      if (text.includes('INSERT INTO community_chat_reports')) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await reportCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: '00000000-0000-4000-8000-000000000012',
      reasonCode: 'harassment',
      detail: '持续攻击他人',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({ status: 'pending', alreadyReported: false });
    const insert = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_reports'),
    );
    expect(insert?.[0]).not.toContain('需要人工判断的消息内容');
    const evidence = JSON.parse(insert?.[1]?.[5]);
    expect(evidence).toMatchObject({
      messagePublicId: '00000000-0000-4000-8000-000000000012',
      roomSlug: 'newcomers',
      authorName: '薄荷',
      content: '需要人工判断的消息内容',
    });
    expect(evidence).not.toHaveProperty('authorUserId');
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('同一用户重复举报同一消息幂等返回，不复制证据', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_messages message')) return [[moderationMessage()], []];
      if (text.includes('FROM community_chat_reports')) return [[{ id: 'report-1', status: 'pending' }], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await reportCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: '00000000-0000-4000-8000-000000000012',
      reasonCode: 'spam',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toEqual({ id: 'report-1', status: 'pending', alreadyReported: true });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_reports')),
    ).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('屏蔽只通过消息解析作者，不向客户端暴露内部账号 ID', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_messages message')) return [[moderationMessage()], []];
      if (text.includes('FROM community_chat_blocks')) return [[], []];
      if (text.includes('INSERT INTO community_chat_blocks')) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await blockCommunityChatMessageAuthor({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: '00000000-0000-4000-8000-000000000012',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({ displayName: '薄荷', alreadyBlocked: false });
    expect(result).not.toHaveProperty('userId');
    const insert = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_blocks'),
    );
    expect(insert?.[1]?.slice(1)).toEqual(['user-1', 'user-2']);
  });

  it('有效禁言在消息写入边界失败关闭，过期禁言不阻断', async () => {
    const mutedDb = { query: vi.fn(async () => [[{ expiresAt: '2026-08-10 10:00:00' }], []]) };
    await expect(
      assertCommunityChatPostingAllowed({ user: { id: 'user-1', role: 'user' }, db: mutedDb, lock: true }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_MUTED', status: 403 });
    expect(String(mutedDb.query.mock.calls[0][0])).toContain('FOR UPDATE');

    const clearDb = { query: vi.fn(async () => [[], []]) };
    await expect(
      assertCommunityChatPostingAllowed({ user: { id: 'user-1', role: 'user' }, db: clearDb }),
    ).resolves.toBeUndefined();
  });

  it('Root 举报列表只返回必要证据并解析 MySQL JSON 字符串', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'report-1',
              reasonCode: 'privacy',
              status: 'pending',
              evidenceSnapshot: '{"messagePublicId":"message-1","content":"证据"}',
            },
          ],
          [],
        ])
        .mockResolvedValueOnce([[{ total: '1' }], []]),
    };

    const result = await listCommunityChatReports({ user: { id: 'root-1', role: 'root' }, db });

    expect(result).toMatchObject({ total: 1, status: 'pending' });
    expect(result.items[0].evidenceSnapshot).toEqual({ messagePublicId: 'message-1', content: '证据' });
  });

  it('隐藏处置在同一事务更新消息、举报状态和不可变审核动作', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_reports report')) {
        return [
          [
            {
              id: 'report-1',
              status: 'pending',
              messageId: 12,
              messagePublicId: 'message-0001',
              roomSlug: 'general',
              targetUserId: 'user-2',
              messageStatus: 'active',
              accountRole: 'user',
              memberStatus: 'active',
            },
          ],
          [],
        ];
      }
      return [{ affectedRows: 1 }, []];
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await reviewCommunityChatReport({
      user: { id: 'root-1', role: 'root' },
      reportId: 'report-1',
      action: 'hide_message',
      note: '包含他人隐私信息',
      db,
    });
    unsubscribeRealtime();

    expect(result).toEqual({
      id: 'report-1',
      status: 'actioned',
      action: 'hide_message',
      messageStatus: 'hidden',
      durationMinutes: null,
    });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'hidden'"))).toBe(true);
    expect(
      connection.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO community_chat_moderation_actions'),
      ),
    ).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(realtimeListener).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'message.removed',
        payload: { roomSlug: 'general', messagePublicId: 'message-0001', reason: 'moderation' },
      }),
      internal: {},
    });
  });

  it('禁言处置创建有到期时间的处罚并替换旧禁言', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_reports report')) {
        return [
          [
            {
              id: 'report-2',
              status: 'pending',
              messageId: 13,
              messagePublicId: 'message-0002',
              roomSlug: 'general',
              targetUserId: 'user-3',
              messageStatus: 'active',
              accountRole: 'user',
              memberStatus: 'active',
            },
          ],
          [],
        ];
      }
      return [{ affectedRows: 1 }, []];
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await reviewCommunityChatReport({
      user: { id: 'root-1', role: 'root' },
      reportId: 'report-2',
      action: 'mute_author',
      note: '连续骚扰其他成员',
      durationMinutes: 1440,
      db,
    });

    expect(result).toMatchObject({ action: 'mute_author', durationMinutes: 1440, status: 'actioned' });
    const sanctionInsert = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_member_sanctions'),
    );
    expect(String(sanctionInsert?.[0])).toContain('DATE_ADD(NOW(), INTERVAL ? MINUTE)');
    expect(sanctionInsert?.[1]?.slice(1)).toEqual(['user-3', 1440, '连续骚扰其他成员', 'root-1']);
  });

  it('封禁同步更新成员访问状态和访问审计，处置原因不能为空', async () => {
    const dbWithoutConnection = { getConnection: vi.fn() };
    await expect(
      reviewCommunityChatReport({
        user: { id: 'root-1', role: 'root' },
        reportId: 'report-3',
        action: 'ban_author',
        note: '',
        db: dbWithoutConnection,
      }),
    ).rejects.toMatchObject({ code: 'MODERATION_NOTE_REQUIRED' });
    expect(dbWithoutConnection.getConnection).not.toHaveBeenCalled();

    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_reports report')) {
        return [
          [
            {
              id: 'report-3',
              status: 'pending',
              messageId: 14,
              messagePublicId: 'message-0003',
              roomSlug: 'general',
              targetUserId: 'user-4',
              messageStatus: 'active',
              accountRole: 'user',
              memberStatus: 'active',
            },
          ],
          [],
        ];
      }
      return [{ affectedRows: 1 }, []];
    });
    const db = { getConnection: vi.fn(async () => connection) };
    await reviewCommunityChatReport({
      user: { id: 'root-1', role: 'root' },
      reportId: 'report-3',
      action: 'ban_author',
      note: '持续发布诈骗内容',
      db,
    });

    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'banned'"))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes("'community_banned'"))).toBe(true);
  });

  it('举报原因、其他说明和禁言时长均执行服务端白名单', () => {
    expect(() => __test__.normalizeReasonCode('unknown')).toThrowError(
      expect.objectContaining({ code: 'INVALID_REPORT_REASON' }),
    );
    expect(() => __test__.normalizeReportDetail('', 'other')).toThrowError(
      expect.objectContaining({ code: 'REPORT_DETAIL_REQUIRED' }),
    );
    expect(() => __test__.normalizeMuteMinutes(5)).toThrowError(
      expect.objectContaining({ code: 'INVALID_MUTE_DURATION' }),
    );
    expect(__test__.normalizeMuteMinutes(60)).toBe(60);
  });
});
