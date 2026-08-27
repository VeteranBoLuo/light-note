import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  assertMessaging: vi.fn(),
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
  };
});

const { loadCommunityChatReadCounts, normalizeReadReceiptMessagePublicIds, recordCommunityChatReadReceipts } =
  await import('./communityChatReadReceiptService.js');

function connectionWithQuery(query) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query,
  };
}

describe('communityChatReadReceiptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertMessaging.mockResolvedValue({ feature: { readReceiptsEnabled: true } });
  });

  it('批量公有 ID 去重并限制为 30 条', () => {
    expect(normalizeReadReceiptMessagePublicIds(['message-1', 'message-1', 'message-2'])).toEqual([
      'message-1',
      'message-2',
    ]);
    expect(() => normalizeReadReceiptMessagePublicIds(Array.from({ length: 31 }, (_, index) => `m-${index}`))).toThrow(
      expect.objectContaining({ code: 'TOO_MANY_READ_RECEIPTS' }),
    );
    expect(() => normalizeReadReceiptMessagePublicIds([])).toThrow(
      expect.objectContaining({ code: 'INVALID_READ_RECEIPTS' }),
    );
  });

  it('普通成员响应不查询也不下发聚合数量，Root 才批量读取计数', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{ messageId: 7, readCount: 3 }], []]) };
    const rows = [
      {
        internalId: 7,
        status: 'active',
        authorAccountRole: 'root',
        readReceiptEnabled: 1,
      },
    ];
    expect(await loadCommunityChatReadCounts(db, rows, { viewerIsRoot: false })).toEqual(new Map());
    expect(db.query).not.toHaveBeenCalled();
    expect(await loadCommunityChatReadCounts(db, rows, { viewerIsRoot: true })).toEqual(new Map([[7, 3]]));
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('多设备重复上报依赖复合主键 INSERT IGNORE 去重，并允许紧急只读下继续记录阅读', async () => {
    const query = vi.fn(async (sql) => {
      const source = String(sql);
      if (source.includes('FROM community_chat_messages message')) {
        return [[{ id: 7, publicId: 'message-1' }], []];
      }
      if (source.includes('INSERT IGNORE INTO community_chat_message_read_receipts')) {
        return [{ affectedRows: 0 }, []];
      }
      throw new Error(`unexpected query: ${source}`);
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await recordCommunityChatReadReceipts({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      messagePublicIds: ['message-1'],
    });

    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT IGNORE'));
    expect(insert?.[1]).toEqual([7, 'user-1']);
    expect(result).toEqual({ roomSlug: 'general', acceptedMessagePublicIds: ['message-1'], recorded: 0 });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('community_chat_runtime_policy'))).toBe(false);
  });

  it('只接受活跃、Root 作者、发送时已启用且对当前用户可见的消息', async () => {
    const query = vi.fn(async (sql) => {
      if (String(sql).includes('FROM community_chat_messages message')) return [[], []];
      throw new Error('empty eligible set must not insert');
    });
    const connection = connectionWithQuery(query);
    mocks.getConnection.mockResolvedValue(connection);

    const result = await recordCommunityChatReadReceipts({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      messagePublicIds: ['message-1'],
    });

    const eligibilitySql = String(query.mock.calls[0][0]);
    expect(eligibilitySql).toContain("author.role = 'root'");
    expect(eligibilitySql).toContain("reader.role <> 'deleted'");
    expect(eligibilitySql).toContain('message.read_receipt_enabled = 1');
    expect(eligibilitySql).toContain('message.user_id <> ?');
    expect(eligibilitySql).toContain('ORDER BY message.id ASC');
    expect(eligibilitySql).toContain('LOCK IN SHARE MODE');
    expect(eligibilitySql).not.toContain('FOR UPDATE');
    expect(mocks.assertMessaging).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'user-1', role: 'user' }, db: connection }),
    );
    expect(mocks.assertMessaging.mock.calls[0][0]).not.toHaveProperty('lock');
    expect(result.acceptedMessagePublicIds).toEqual([]);
  });

  it('独立功能开关关闭时事务内失败关闭', async () => {
    mocks.assertMessaging.mockResolvedValue({ feature: { readReceiptsEnabled: false } });
    const connection = connectionWithQuery(vi.fn());
    mocks.getConnection.mockResolvedValue(connection);

    await expect(
      recordCommunityChatReadReceipts({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        messagePublicIds: ['message-1'],
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_READ_RECEIPTS_DISABLED' });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });
});
