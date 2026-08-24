import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

const { deleteAllDocumentSources, invalidatePersonalKnowledgeCache } = vi.hoisted(() => ({
  deleteAllDocumentSources: vi.fn().mockResolvedValue({
    deleted: 0,
    failed: 0,
    retryScheduled: 0,
    retryUnavailable: 0,
  }),
  invalidatePersonalKnowledgeCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./aiDocument/service.js', () => ({ deleteAllDocumentSources }));
vi.mock('./personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache }));

import {
  __testing,
  cleanupDeletedAiConversations,
  cleanupExpiredAiConversations,
  clearAiIdentityData,
  deleteAiConversation,
  exportAiConversations,
  getAiConversation,
  listAiConversations,
  purgeDeletedAiConversation,
  resolveAiConversationIdentity,
} from './aiConversationService.js';

const normalIdentity = Object.freeze({
  actorUserId: 'user-1',
  subjectUserId: 'user-1',
  actorRole: 'user',
  subjectRole: 'user',
  adminContextId: null,
  adminContextMode: 'normal',
});

const adminIdentity = Object.freeze({
  actorUserId: 'root-1',
  subjectUserId: 'user-1',
  actorRole: 'root',
  subjectRole: 'user',
  adminContextId: 'context-1',
  adminContextMode: 'readonly',
});

function transactionConnection(query = vi.fn().mockResolvedValue([{ affectedRows: 1 }])) {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query,
  };
}

describe('旧 AI 会话只读档案', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteAllDocumentSources.mockResolvedValue({
      deleted: 0,
      failed: 0,
      retryScheduled: 0,
      retryUnavailable: 0,
    });
  });

  it('身份始终绑定真实操作者、数据主体和管理员上下文，访客不能读取云档案', () => {
    expect(
      resolveAiConversationIdentity({
        user: { id: 'root-1', role: 'root' },
        billingUser: { id: 'root-1', role: 'root' },
        resourceUser: { id: 'user-1', role: 'user' },
        adminContext: { id: 'context-1', mode: 'readonly' },
      }),
    ).toEqual(adminIdentity);

    expect(() => resolveAiConversationIdentity({ user: { id: 'visitor', role: 'visitor' } })).toThrow(
      /AI_HISTORY_REQUIRES_ACCOUNT/,
    );
  });

  it('列表检索和删除都使用完整 owner 域，管理员只读预览不能删除', async () => {
    const query = vi.fn().mockResolvedValue([[]]);
    await listAiConversations(adminIdentity, { keyword: '100%_safe', limit: 10 }, { query });

    expect(query.mock.calls[0][1].slice(0, 5)).toEqual([
      'root-1',
      'user-1',
      'readonly',
      'context-1',
      'active',
    ]);
    expect(query.mock.calls[0][1]).toContain('%100\\%\\_safe%');
    expect(query.mock.calls[0][0]).toContain('admin_context_id <=> ?');

    await expect(
      deleteAiConversation(adminIdentity, 'conversation-1', { query: vi.fn() }),
    ).rejects.toMatchObject({ code: 'ADMIN_PREVIEW_READONLY', status: 403 });
  });

  it('只读详情恢复历史消息、来源、证据和旧反馈，不提供任何续写能力', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 'conversation-1',
            title: '旧会话',
            summary: '',
            status: 'active',
            retention_mode: 'standard',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'message-1',
            conversation_id: 'conversation-1',
            role: 'assistant',
            content: '旧回答 [1]',
            status: 'completed',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            message_id: 'message-1',
            source_id: 'source-1',
            resource_type: 'note',
            resource_id: 'note-1',
            display_title: '旧笔记',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            message_id: 'message-1',
            evidence_ref: 'evidence-1',
            source_id: 'source-1',
            citation_key: '1',
            excerpt: '历史证据',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ message_id: 'message-1', rating: 'unhelpful', reason: 'incorrect', resolved: 0 }],
      ]);

    const result = await getAiConversation(adminIdentity, 'conversation-1', {}, { query });

    expect(result.messages[0]).toMatchObject({
      content: '旧回答 [1]',
      sources: [{ sourceId: 'source-1', resourceId: 'note-1' }],
      evidence: [{ evidenceRef: 'evidence-1', excerpt: '历史证据' }],
      feedback: { rating: 'unhelpful', reason: 'incorrect', resolved: false },
    });
    expect(query.mock.calls[4][1]).toEqual(['root-1', 'conversation-1', 'message-1']);
  });

  it('删除只做 owner 约束的软删除，后台保留期任务再永久清理', async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const result = await deleteAiConversation(normalIdentity, 'conversation-1', { query });

    expect(result.deleted).toBe(1);
    expect(new Date(result.undoExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(query.mock.calls[0][0]).toContain("status IN ('active', 'archived')");
    expect(query.mock.calls[0][1]).toEqual(['conversation-1', 'user-1', 'user-1', 'normal', null]);
  });

  it('普通账号清除 AI 数据时同时清除 Skill 短期历史，但保留额度和审计账本', async () => {
    const connection = transactionConnection(vi.fn().mockResolvedValue([{ affectedRows: 2 }]));
    deleteAllDocumentSources.mockResolvedValueOnce({
      deleted: 3,
      failed: 1,
      retryScheduled: 1,
      retryUnavailable: 0,
    });

    const result = await clearAiIdentityData(normalIdentity, {
      getConnection: vi.fn().mockResolvedValue(connection),
    });

    expect(result).toMatchObject({
      deleted: 17,
      scope: 'subject_user',
      retained: ['agentLogs', 'quotaUsage', 'tokenReservations'],
      documentsFailed: 1,
      documentsRetryScheduled: 1,
      excluded: [],
    });
    expect(result.byType).toMatchObject({ skillThreads: 2, conversations: 2, contentChunks: 2, documents: 3 });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM ai_skill_threads'))).toBe(
      true,
    );
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM ai_executions'))).toBe(
      false,
    );
    expect(invalidatePersonalKnowledgeCache).toHaveBeenCalledWith('user-1', { persist: false });
    expect(deleteAllDocumentSources).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('管理员维护上下文只清当前四维 owner 的 Skill 历史，不跨授权上下文删除文档', async () => {
    const connection = transactionConnection();
    const result = await clearAiIdentityData(
      { ...adminIdentity, adminContextMode: 'maintain' },
      { getConnection: vi.fn().mockResolvedValue(connection) },
    );

    expect(result).toMatchObject({ deleted: 6, scope: 'owner_domain', excluded: ['documents'] });
    expect(deleteAllDocumentSources).not.toHaveBeenCalled();
    const skillDelete = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('DELETE FROM ai_skill_threads'),
    );
    expect(skillDelete[1]).toEqual(['root-1', 'user-1', 'maintain', 'context-1']);
    const legacyDomainDeletes = connection.query.mock.calls.filter(([sql]) =>
      String(sql).includes('admin_context_id <=> ?'),
    );
    expect(legacyDomainDeletes).toHaveLength(6);
    expect(
      legacyDomainDeletes.every(([, params]) =>
        params.every((value, index) => value === ['root-1', 'user-1', 'maintain', 'context-1'][index]),
      ),
    ).toBe(true);
  });

  it('清除失败会回滚，Schema 缺失时失败关闭而不是误报成功', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
    const connection = transactionConnection(vi.fn().mockRejectedValue(missing));

    await expect(
      clearAiIdentityData(normalIdentity, { getConnection: vi.fn().mockResolvedValue(connection) }),
    ).rejects.toMatchObject({ code: 'AI_DATA_CLEAR_SCHEMA_UNAVAILABLE', status: 503 });
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('导出仅覆盖当前 owner 域，并将来源与证据挂回对应历史消息', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'conversation-1', title: '导出', status: 'active' }]])
        .mockResolvedValueOnce([
          [
            {
              id: 'message-1',
              conversation_id: 'conversation-1',
              role: 'assistant',
              content: '回答 [1]',
              status: 'completed',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [{ message_id: 'message-1', source_id: 'source-1', resource_type: 'note', display_title: '笔记' }],
        ])
        .mockResolvedValueOnce([
          [
            {
              message_id: 'message-1',
              evidence_ref: 'evidence-1',
              source_id: 'source-1',
              citation_key: '1',
              excerpt: '证据',
            },
          ],
        ])
        .mockResolvedValueOnce([[]]),
    };

    const result = await exportAiConversations(adminIdentity, database);

    expect(result).toMatchObject({ conversationCount: 1, messageCount: 1 });
    expect(result.conversations[0].messages[0]).toMatchObject({
      sources: [{ sourceId: 'source-1' }],
      evidence: [{ evidenceRef: 'evidence-1' }],
    });
    for (const call of database.query.mock.calls) {
      expect(call[1]).toEqual(['root-1', 'user-1', 'readonly', 'context-1']);
    }
  });

  it('游标为封闭格式，非法值直接拒绝', () => {
    const cursor = __testing.encodeCursor({
      id: 'conversation-1',
      is_pinned: 1,
      last_message_at: '2026-08-24T00:00:00.000Z',
    });
    expect(__testing.decodeCursor(cursor)).toEqual({
      id: 'conversation-1',
      pinned: 1,
      at: '2026-08-24T00:00:00.000Z',
    });
    expect(() => __testing.decodeCursor('broken')).toThrow(/INVALID_CURSOR/);
  });
});

describe('旧会话保留期清理', () => {
  it('过期会话和其旧依赖在同一有界事务中删除', async () => {
    const connection = transactionConnection(
      vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_conversations')) return [[{ id: 'expired-1' }]];
        if (String(sql).includes('DELETE FROM ai_conversations')) return [{ affectedRows: 1 }];
        return [{ affectedRows: 2 }];
      }),
    );

    const result = await cleanupExpiredAiConversations(
      { getConnection: vi.fn().mockResolvedValue(connection) },
      { batchSize: 10, maxBatches: 1 },
    );

    expect(result).toMatchObject({ deleted: 1, dependentsDeleted: 4, skipped: false });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('软删除过期后可永久清理，缺失旧表时启动清理安全跳过', async () => {
    const connection = transactionConnection(
      vi.fn(async (sql) => {
        if (String(sql).includes('SELECT id FROM ai_conversations')) return [[{ id: 'deleted-1' }]];
        if (String(sql).includes('DELETE FROM ai_conversations')) return [{ affectedRows: 1 }];
        return [{ affectedRows: 1 }];
      }),
    );
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      purgeDeletedAiConversation('deleted-1', database, new Date('2026-08-24T00:01:00Z')),
    ).resolves.toMatchObject({ deleted: 1, dependentsDeleted: 2, skipped: false });
    await expect(
      cleanupDeletedAiConversations(database, { batchSize: 10, maxBatches: 1 }),
    ).resolves.toMatchObject({ deleted: 1, dependentsDeleted: 2, skipped: false });

    const missing = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
    const missingConnection = transactionConnection(vi.fn().mockRejectedValue(missing));
    await expect(
      cleanupExpiredAiConversations({ getConnection: vi.fn().mockResolvedValue(missingConnection) }),
    ).resolves.toMatchObject({ deleted: 0, skipped: true });
  });
});
