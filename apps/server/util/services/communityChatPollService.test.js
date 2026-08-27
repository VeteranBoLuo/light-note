import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  assertMessaging: vi.fn(),
  assertPostingEnabled: vi.fn(),
  assertPostingAllowed: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('./communityChatAccessService.js', () => {
  class CommunityChatError extends Error {
    constructor(code, status, zhMessage, enMessage) {
      super(zhMessage);
      this.code = code;
      this.status = status;
      this.zhMessage = zhMessage;
      this.enMessage = enMessage;
    }
  }
  return {
    CommunityChatError,
    assertCommunityChatMessagingAccess: mocks.assertMessaging,
    assertCommunityChatPostingEnabled: mocks.assertPostingEnabled,
  };
});
vi.mock('./communityChatModerationService.js', () => ({
  assertCommunityChatPostingAllowed: mocks.assertPostingAllowed,
}));
vi.mock('../communityChat/realtimeBroker.js', () => ({
  publishCommunityChatRealtimeEvent: mocks.publish,
}));

const {
  __test__,
  assertCommunityChatPollDeadlineRange,
  assertCommunityChatPollDeadlineRangeInDatabase,
  closeCommunityChatPoll,
  insertCommunityChatPoll,
  listCommunityChatPollOptionVoters,
  loadCommunityChatPolls,
  normalizeCommunityChatPollDraft,
  voteCommunityChatPoll,
} = await import('./communityChatPollService.js');

function connectionWithQuery(query) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query,
  };
}

describe('communityChatPollService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertMessaging.mockResolvedValue({ feature: { pollsEnabled: true } });
    mocks.assertPostingEnabled.mockResolvedValue({ postingEnabled: true });
    mocks.assertPostingAllowed.mockResolvedValue(undefined);
  });

  it('规范化 Unicode 选项和显式时区，并拒绝重复项与越界截止时间', () => {
    const now = Date.parse('2026-08-26T10:00:00.000Z');
    expect(
      normalizeCommunityChatPollDraft(
        { options: [' Ａ ', 'B'], endsAt: '2026-08-26T12:00:00+01:00' },
        { question: '下一项做什么？', now },
      ),
    ).toMatchObject({
      options: ['A', 'B'],
      selectionMode: 'single',
      maxSelections: 1,
      endsAtUtc: '2026-08-26T11:00:00.000Z',
    });
    expect(() =>
      normalizeCommunityChatPollDraft(
        { options: ['A', 'ａ'], endsAt: '2026-08-26T11:00:00Z' },
        { question: '问题', now },
      ),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_POLL_OPTION' }));
    expect(() => __test__.normalizePollDeadline('2026-08-26 11:00:00', now)).toThrowError(
      expect.objectContaining({ code: 'INVALID_POLL_DEADLINE' }),
    );
    expect(() => __test__.normalizePollDeadline('2026-08-26T10:04:59Z', now)).toThrowError(
      expect.objectContaining({ code: 'POLL_DEADLINE_TOO_SOON' }),
    );
    expect(() =>
      normalizeCommunityChatPollDraft(
        { options: [{ label: 'A' }, 'B'], endsAt: '2026-08-26T11:00:00Z' },
        { question: '问题', now },
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_POLL_OPTION' }));
    const replayDraft = normalizeCommunityChatPollDraft(
      { options: ['A', 'B'], endsAt: '2026-08-26T10:01:00Z' },
      { question: '重放', now, validateDuration: false },
    );
    expect(replayDraft.endsAtUtc).toBe('2026-08-26T10:01:00.000Z');
    expect(() => assertCommunityChatPollDeadlineRange(replayDraft, now)).toThrowError(
      expect.objectContaining({ code: 'POLL_DEADLINE_TOO_SOON' }),
    );

    expect(
      normalizeCommunityChatPollDraft(
        {
          options: ['甲', '乙', '丙'],
          endsAt: '2026-08-26T11:00:00Z',
          selectionMode: 'multiple',
          maxSelections: 2,
        },
        { question: '多选', now },
      ),
    ).toMatchObject({ selectionMode: 'multiple', maxSelections: 2 });
    expect(() =>
      normalizeCommunityChatPollDraft(
        {
          options: ['甲', '乙'],
          endsAt: '2026-08-26T11:00:00Z',
          selectionMode: 'multiple',
          maxSelections: 3,
        },
        { question: '越界', now },
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_POLL_MAX_SELECTIONS' }));
    expect(() =>
      normalizeCommunityChatPollDraft(
        {
          options: ['甲', '乙'],
          endsAt: '2026-08-26T11:00:00Z',
          selectionMode: 'ranked',
          maxSelections: 1,
        },
        { question: '未知模式', now },
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_POLL_SELECTION_MODE' }));
  });

  it('投票结构与选项使用消息 ID 作为唯一聚合根并在同一连接写入', async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
    await insertCommunityChatPoll(
      { query },
      {
        messageId: 42,
        poll: {
          endsAtSql: '2026-08-27 10:00:00.000',
          options: ['甲', '乙'],
          selectionMode: 'multiple',
          maxSelections: 2,
        },
      },
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('community_chat_polls');
    expect(query.mock.calls[0][1]).toEqual([42, 'multiple', 2, '2026-08-27 10:00:00.000']);
    expect(query.mock.calls[1][0]).toContain('community_chat_poll_options');
    expect(query.mock.calls[1][1]).toHaveLength(8);
  });

  it('首次创建的相对截止窗口由数据库 UTC 时钟权威判断', async () => {
    const validDb = { query: vi.fn().mockResolvedValue([[{ invalid: 0, tooSoon: 0, tooLate: 0 }], []]) };
    await expect(
      assertCommunityChatPollDeadlineRangeInDatabase(validDb, {
        endsAtSql: '2026-08-27 10:00:00.125',
      }),
    ).resolves.toBeUndefined();
    expect(String(validDb.query.mock.calls[0][0])).toContain('UTC_TIMESTAMP(3)');
    expect(String(validDb.query.mock.calls[0][0])).toContain('IS NULL AS invalid');
    expect(validDb.query.mock.calls[0][1]).toEqual(['2026-08-27 10:00:00.125']);

    const tooSoonDb = { query: vi.fn().mockResolvedValue([[{ invalid: 0, tooSoon: 1, tooLate: 0 }], []]) };
    await expect(
      assertCommunityChatPollDeadlineRangeInDatabase(tooSoonDb, {
        endsAtSql: '2026-08-26 10:04:59.999',
      }),
    ).rejects.toMatchObject({ code: 'POLL_DEADLINE_TOO_SOON' });

    const invalidDb = { query: vi.fn().mockResolvedValue([[{ invalid: 1, tooSoon: null, tooLate: null }], []]) };
    await expect(
      assertCommunityChatPollDeadlineRangeInDatabase(invalidDb, {
        endsAtSql: '+275760-09-13T00:00:00',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_POLL_DEADLINE' });
  });

  it('未结束投票采用 desired-state upsert，重复或改票都只保留每人一行', async () => {
    const query = vi.fn(async (sql) => {
      const source = String(sql);
      if (source.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              internalId: 7,
              publicId: 'message-1',
              status: 'active',
              roomSlug: 'general',
              authorUserId: 'root-1',
              selectionMode: 'single',
              maxSelections: 1,
              optionCount: 2,
              closed: 0,
            },
          ],
          [],
        ];
      }
      if (source.includes('FROM community_chat_poll_options') && source.includes('FOR UPDATE')) {
        return [[{ id: 9 }], []];
      }
      if (source.includes('INSERT INTO community_chat_poll_votes')) return [{ affectedRows: 1 }, []];
      if (source.includes('FROM community_chat_polls poll')) {
        return [
          [
            {
              messageId: 7,
              endsAt: '2026-08-27T10:00:00.000Z',
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-1',
              label: '甲',
              sortOrder: 0,
              voteCount: 1,
              selectedByViewer: 1,
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${source}`);
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await voteCommunityChatPoll({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: 'message-1',
      optionPublicId: 'option-1',
    });

    const upsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO community_chat_poll_votes'));
    const eligibilityQuery = query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM community_chat_messages message'),
    );
    expect(String(eligibilityQuery?.[0])).toContain('JOIN user viewer ON viewer.id = ?');
    expect(String(eligibilityQuery?.[0])).toContain("viewer.role <> 'deleted'");
    expect(String(eligibilityQuery?.[0])).toContain('FOR UPDATE');
    expect(eligibilityQuery?.[1]?.[0]).toBe('user-1');
    expect(upsert?.[0]).toContain('ON DUPLICATE KEY UPDATE option_id = VALUES(option_id)');
    expect(upsert?.[1]).toEqual([7, 'user-1', 9]);
    expect(result.poll).toMatchObject({ selectedOptionPublicId: 'option-1', resultsVisible: true, totalVoterCount: 1 });
    expect(result.poll.options[0]).toMatchObject({ voteCount: 1 });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledWith('message.updated', expect.objectContaining({ reason: 'poll_vote' }), {
      targetUserId: 'root-1',
    });
  });

  it('多选投票在同一事务中原子替换完整选择集，并按参与人数而非选项票数计总人数', async () => {
    const query = vi.fn(async (sql) => {
      const source = String(sql);
      if (source.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              internalId: 8,
              publicId: 'message-2',
              status: 'active',
              roomSlug: 'general',
              authorUserId: 'root-1',
              selectionMode: 'multiple',
              maxSelections: 2,
              optionCount: 2,
              closed: 0,
            },
          ],
          [],
        ];
      }
      if (source.includes('FROM community_chat_poll_options') && source.includes('FOR UPDATE')) {
        return [
          [
            { id: 11, publicId: 'option-a' },
            { id: 12, publicId: 'option-b' },
          ],
          [],
        ];
      }
      if (source.includes('DELETE FROM community_chat_poll_multi_votes')) return [{ affectedRows: 1 }, []];
      if (source.includes('INSERT INTO community_chat_poll_multi_votes')) return [{ affectedRows: 2 }, []];
      if (source.includes('FROM community_chat_polls poll')) {
        return [
          [
            {
              messageId: 8,
              selectionMode: 'multiple',
              maxSelections: 2,
              endsAt: '2026-08-27T10:00:00.000Z',
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-a',
              label: '甲',
              sortOrder: 0,
              voteCount: 2,
              totalVoterCount: 2,
              selectedByViewer: 1,
            },
            {
              messageId: 8,
              selectionMode: 'multiple',
              maxSelections: 2,
              endsAt: '2026-08-27T10:00:00.000Z',
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-b',
              label: '乙',
              sortOrder: 1,
              voteCount: 1,
              totalVoterCount: 2,
              selectedByViewer: 1,
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${source}`);
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await voteCommunityChatPoll({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: 'message-2',
      optionPublicIds: ['option-b', 'option-a'],
    });

    const deleteIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes('DELETE FROM community_chat'));
    const insertIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO community_chat'));
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    expect(query.mock.calls[insertIndex]?.[1]).toEqual([8, 'user-1', 11, 8, 'user-1', 12]);
    expect(result.poll).toMatchObject({
      selectionMode: 'multiple',
      maxSelections: 2,
      selectedOptionPublicIds: ['option-a', 'option-b'],
      selectedOptionPublicId: 'option-a',
      resultsVisible: true,
    });
    expect(result.poll).toMatchObject({ totalVoterCount: 2 });
    expect(result.poll.options).toEqual([
      expect.objectContaining({ publicId: 'option-a', voteCount: 2 }),
      expect.objectContaining({ publicId: 'option-b', voteCount: 1 }),
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('服务端拒绝重复选择和超过发布上限的完整选择集', async () => {
    expect(() => __test__.normalizeVoteOptionPublicIds({ optionPublicIds: ['option-a', 'option-a'] })).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_POLL_SELECTION' }),
    );
    expect(() =>
      __test__.normalizeVoteOptionPublicIds({ optionPublicIds: ['option-a'], optionPublicId: 'option-b' }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_POLL_SELECTION' }));

    const query = vi.fn(async (sql) => {
      if (String(sql).includes('FROM community_chat_messages message')) {
        return [
          [
            {
              internalId: 8,
              publicId: 'message-2',
              status: 'active',
              roomSlug: 'general',
              selectionMode: 'multiple',
              maxSelections: 2,
              optionCount: 3,
              closed: 0,
            },
          ],
          [],
        ];
      }
      throw new Error('超过上限后不应查询或写入选项');
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);
    await expect(
      voteCommunityChatPoll({
        user: { id: 'user-1', role: 'user' },
        messagePublicId: 'message-2',
        optionPublicIds: ['option-a', 'option-b', 'option-c'],
      }),
    ).rejects.toMatchObject({ code: 'POLL_SELECTION_LIMIT_EXCEEDED' });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('截止判断在锁内由 UTC_TIMESTAMP 完成，已结束时不会写入票行', async () => {
    const query = vi.fn(async (sql) => {
      if (String(sql).includes('FROM community_chat_messages message')) {
        return [[{ internalId: 7, publicId: 'message-1', status: 'active', roomSlug: 'general', closed: 1 }], []];
      }
      throw new Error('should not write');
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    await expect(
      voteCommunityChatPoll({
        user: { id: 'user-1', role: 'user' },
        messagePublicId: 'message-1',
        optionPublicId: 'option-1',
      }),
    ).rejects.toMatchObject({ code: 'POLL_CLOSED' });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('community_chat_poll_votes'))).toBe(false);
  });

  it('投票子开关关闭后拒绝新增或改票', async () => {
    mocks.assertMessaging.mockResolvedValue({ feature: { pollsEnabled: false } });
    const connection = connectionWithQuery(vi.fn());
    mocks.getConnection.mockResolvedValue(connection);

    await expect(
      voteCommunityChatPoll({
        user: { id: 'user-1', role: 'user' },
        messagePublicId: 'message-1',
        optionPublicId: 'option-1',
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_POLLS_DISABLED' });
    expect(mocks.assertPostingEnabled).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('进行中的汇总只对 Root 和已经投票的成员下发，未投票成员看不到票数', async () => {
    const db = {
      query: vi.fn().mockImplementation((_sql, params) =>
        Promise.resolve([
          [
            {
              messageId: 7,
              endsAt: '2026-08-27T10:00:00.000Z',
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-1',
              label: '甲',
              voteCount: 3,
              selectedByViewer: params?.[0] === 'u1' ? 1 : 0,
            },
          ],
          [],
        ]),
      ),
    };
    const rows = [{ internalId: 7, messageKind: 'poll', status: 'active' }];
    const memberPoll = (await loadCommunityChatPolls(db, rows, { viewerUserId: 'u1', pollsEnabled: true })).get(7);
    const nonVoterPoll = (await loadCommunityChatPolls(db, rows, { viewerUserId: 'u2', pollsEnabled: true })).get(7);
    const rootPoll = (
      await loadCommunityChatPolls(db, rows, {
        viewerUserId: 'root-1',
        viewerIsRoot: true,
        pollsEnabled: true,
      })
    ).get(7);
    expect(memberPoll).toMatchObject({ selectedOptionPublicId: 'option-1', resultsVisible: true, totalVoterCount: 3 });
    expect(memberPoll.options[0]).toMatchObject({ voteCount: 3 });
    expect(nonVoterPoll).toMatchObject({ selectedOptionPublicId: null, resultsVisible: false });
    expect(nonVoterPoll).not.toHaveProperty('totalVoterCount');
    expect(nonVoterPoll.options[0]).not.toHaveProperty('voteCount');
    expect(rootPoll).toMatchObject({ resultsVisible: true, totalVoterCount: 3 });
    expect(rootPoll.options[0]).toMatchObject({ voteCount: 3 });
    expect(String(db.query.mock.calls[0][0])).toContain('MICROSECOND(poll.ends_at_utc)');
    expect(String(db.query.mock.calls[0][0])).toContain('MICROSECOND(poll.closed_at_utc)');
  });

  it('投票成员名单只允许 Root 从权威票表按选项分页读取，并只返回社区公开身份', async () => {
    const query = vi.fn(async (sql, params) => {
      const source = String(sql);
      if (source.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              messageId: 8,
              selectionMode: 'multiple',
              optionId: 12,
              label: '性能',
              voteCount: 2,
            },
          ],
          [],
        ];
      }
      if (source.includes('FROM community_chat_poll_multi_votes vote')) {
        expect(params).toEqual([8, 12, 1, 1]);
        return [
          [
            {
              userPublicId: '11111111-1111-4111-8111-111111111111',
              communityId: 'ln_8K2M7A',
              displayName: '薄荷',
              frameId: 'frame-mint',
              hasAvatar: 1,
              userId: 'internal-user-must-not-leak',
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${source}`);
    });
    const db = { query };

    await expect(
      listCommunityChatPollOptionVoters({
        user: { id: 'user-1', role: 'user' },
        messagePublicId: 'message-2',
        optionPublicId: 'option-b',
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_POLL_VOTERS_ROOT_REQUIRED' });
    expect(query).not.toHaveBeenCalled();

    const result = await listCommunityChatPollOptionVoters({
      user: { id: 'root-1', role: 'root' },
      messagePublicId: 'message-2',
      optionPublicId: 'option-b',
      page: 2,
      pageSize: 1,
      db,
    });

    expect(mocks.assertMessaging).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'root-1', role: 'root' }, db }),
    );
    expect(String(query.mock.calls[1][0])).toContain('FROM community_chat_poll_multi_votes vote');
    expect(String(query.mock.calls[1][0])).not.toContain('community_chat_poll_votes vote');
    expect(result).toMatchObject({
      messagePublicId: 'message-2',
      selectionMode: 'multiple',
      option: { publicId: 'option-b', label: '性能', voteCount: 2 },
      total: 2,
      page: 2,
      pageSize: 1,
      hasMore: false,
      items: [
        {
          userPublicId: '11111111-1111-4111-8111-111111111111',
          communityId: 'ln_8K2M7A',
          displayName: '薄荷',
          avatar: '/api/community-chat/members/11111111-1111-4111-8111-111111111111/avatar',
          frameId: 'frame-mint',
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty('userId');
  });

  it('投票成员名单遇到未知选择方式时失败关闭，不猜测票表', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          messageId: 8,
          selectionMode: 'legacy-unknown',
          optionId: 12,
          label: '性能',
          voteCount: 2,
        },
      ],
      [],
    ]);

    await expect(
      listCommunityChatPollOptionVoters({
        user: { id: 'root-1', role: 'root' },
        messagePublicId: 'message-2',
        optionPublicId: 'option-b',
        db: { query },
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_POLL_CONFIGURATION_INVALID' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('结束投票严格要求 Root', async () => {
    await expect(
      closeCommunityChatPoll({ user: { id: 'user-1', role: 'user' }, messagePublicId: 'message-1' }),
    ).rejects.toMatchObject({ code: 'POLL_CLOSE_ROOT_REQUIRED' });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it('子开关关闭和紧急只读都不阻断 Root 收口既有投票', async () => {
    mocks.assertMessaging.mockResolvedValue({ feature: { pollsEnabled: false } });
    const query = vi.fn(async (sql) => {
      const source = String(sql);
      if (source.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              internalId: 7,
              publicId: 'message-1',
              status: 'active',
              roomSlug: 'general',
              authorUserId: 'root-1',
              closed: 0,
            },
          ],
          [],
        ];
      }
      if (source.includes('UPDATE community_chat_polls')) return [{ affectedRows: 1 }, []];
      if (source.includes('FROM community_chat_polls poll')) {
        return [
          [
            {
              messageId: 7,
              endsAt: '2026-08-27T10:00:00.000Z',
              closedAt: '2026-08-26T10:30:00.125Z',
              manuallyClosed: 1,
              deadlinePassed: 0,
              optionPublicId: 'option-1',
              label: '甲',
              sortOrder: 0,
              voteCount: 2,
              selectedByViewer: 1,
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${source}`);
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await closeCommunityChatPoll({
      user: { id: 'root-1', role: 'root' },
      messagePublicId: 'message-1',
    });

    expect(result).toMatchObject({ changed: true, poll: { closed: true, resultsVisible: true, canClose: false } });
    expect(mocks.assertPostingEnabled).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledWith('message.updated', {
      roomSlug: 'general',
      messagePublicId: 'message-1',
      reason: 'poll_closed',
    });
  });
});
