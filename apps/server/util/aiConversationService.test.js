import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));
// clearAiIdentityData 现在会清 AI 文档派生数据;mock 掉文档服务,避免它经 obsClient 在无 OBS 配置的测试环境导入即崩,
// 同时可断言「subject 清除调用、owner_domain 排除」。用 vi.hoisted 让 mock fn 在被提升的 vi.mock 工厂里可用。
const { deleteAllDocumentSources } = vi.hoisted(() => ({
  deleteAllDocumentSources: vi
    .fn()
    .mockResolvedValue({ deleted: 0, failed: 0, retryScheduled: 0, retryUnavailable: 0 }),
}));
vi.mock('./aiDocument/service.js', () => ({ deleteAllDocumentSources }));

import {
  __testing,
  assertAiCloudHistoryEnabled,
  branchAiConversation,
  cleanupExpiredAiConversations,
  cleanupDeletedAiConversations,
  clearAiIdentityData,
  createAiConversation,
  deleteAiConversation,
  exportAiConversations,
  getAiConversation,
  getAiConversationLineage,
  listAiConversations,
  listAiMessageVersions,
  prepareAiMessageVersionGroup,
  purgeDeletedAiConversation,
  resolveAiConversationIdentity,
  restoreDeletedAiConversation,
  saveAiMessage,
} from './aiConversationService.js';

const identity = {
  actorUserId: 'actor-1',
  subjectUserId: 'subject-1',
  actorRole: 'root',
  subjectRole: 'user',
  adminContextId: 'context-1',
  adminContextMode: 'readonly',
};

const normalIdentity = {
  actorUserId: 'user-1',
  subjectUserId: 'user-1',
  actorRole: 'user',
  subjectRole: 'user',
  adminContextId: null,
  adminContextMode: 'normal',
};

describe('AI conversation isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the owner from actor, subject and admin mode instead of req.user alone', () => {
    expect(
      resolveAiConversationIdentity({
        user: { id: 'actor-1', role: 'root' },
        billingUser: { id: 'actor-1', role: 'root' },
        resourceUser: { id: 'subject-1', role: 'user' },
        adminContext: { id: 'context-1', mode: 'readonly' },
      }),
    ).toEqual(identity);
  });

  it('does not persist visitor history on the server', () => {
    expect(() => resolveAiConversationIdentity({ user: { id: 'visitor', role: 'visitor' } })).toThrow(
      /AI_HISTORY_REQUIRES_ACCOUNT/,
    );
  });

  it('enforces the subject account cloud-history preference for automatic API persistence', async () => {
    const enabledDb = { query: vi.fn().mockResolvedValue([[{ enabled: 'true' }]]) };
    await expect(assertAiCloudHistoryEnabled(normalIdentity, enabledDb)).resolves.toBe(true);
    expect(enabledDb.query).toHaveBeenCalledWith(expect.stringContaining('JSON_EXTRACT'), ['user-1']);

    await expect(
      assertAiCloudHistoryEnabled(normalIdentity, {
        query: vi.fn().mockResolvedValue([[{ enabled: 'false' }]]),
      }),
    ).rejects.toMatchObject({ code: 'AI_CLOUD_HISTORY_DISABLED', status: 409 });
    await expect(
      assertAiCloudHistoryEnabled(normalIdentity, { query: vi.fn().mockResolvedValue([[]]) }),
    ).rejects.toMatchObject({ code: 'AI_CLOUD_HISTORY_DISABLED', status: 409 });
  });

  it('readonly can read but every persistent mutation is rejected before touching storage', async () => {
    const database = { query: vi.fn(), getConnection: vi.fn() };
    await expect(createAiConversation(identity, {}, database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    await expect(deleteAiConversation(identity, 'conversation-1', database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    await expect(clearAiIdentityData(identity, database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    await expect(
      saveAiMessage(identity, 'conversation-1', { role: 'user', content: 'readonly must not persist' }, database),
    ).rejects.toMatchObject({ code: 'ADMIN_PREVIEW_READONLY', status: 403 });
    expect(database.query).not.toHaveBeenCalled();
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('在单个事务中按 subject 清除普通账号的全部可控 AI 数据并保留安全账本', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockResolvedValue([{ affectedRows: 2 }]),
    };
    // 文档清理(临时+cloud 的 AI 派生 + OBS 原文件)在主事务提交后执行:本例模拟删 3 个、1 个原文件清理失败
    deleteAllDocumentSources.mockResolvedValueOnce({ deleted: 3, failed: 1, retryScheduled: 1, retryUnavailable: 0 });
    const result = await clearAiIdentityData(normalIdentity, {
      getConnection: vi.fn().mockResolvedValue(connection),
    });

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    // 10 条主删除(memories/changeSets/responseEvents/productEvents/conversations 各 2)+ contentChunks 2 + documents 3
    expect(result.deleted).toBe(15);
    expect(result.scope).toBe('subject_user');
    expect(result.retained).toEqual(['agentLogs', 'quotaUsage', 'tokenReservations']);
    expect(result.byType).toMatchObject({ conversations: 2, memories: 2, contentChunks: 2, documents: 3 });
    // subject 清除会清文档,且如实上报失败数;无排除项
    expect(deleteAllDocumentSources).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(result.documentsFailed).toBe(1);
    expect(result.documentsRetryScheduled).toBe(1);
    expect(result.documentsRetryUnavailable).toBe(0);
    expect(result.excluded).toEqual([]);
    const subjectDeletes = connection.query.mock.calls.filter(
      ([sql]) => String(sql).includes('subject_user_id = ?') && !String(sql).includes('ai_content_chunks'),
    );
    expect(subjectDeletes).toHaveLength(5);
    expect(subjectDeletes.every(([, params]) => params.join('|') === 'user-1')).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('admin_context_id <=> ?'))).toBe(false);
    expect(connection.query.mock.calls.at(-2)).toEqual([
      expect.stringContaining('INSERT INTO ai_content_generations'),
      ['user-1'],
    ]);
    expect(connection.query.mock.calls.at(-2)[0]).toContain('generation = generation + 1');
    expect(connection.query.mock.calls.at(-1)).toEqual([
      'DELETE FROM ai_content_chunks WHERE subject_user_id = ?',
      ['user-1'],
    ]);
    expect(connection.query.mock.invocationCallOrder.at(-1)).toBeLessThan(
      connection.commit.mock.invocationCallOrder[0],
    );
  });

  it('管理员代管清除仍严格限制在当前四维 owner 域', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    const result = await clearAiIdentityData(
      { ...identity, adminContextMode: 'maintain' },
      { getConnection: vi.fn().mockResolvedValue(connection) },
    );

    expect(result.scope).toBe('owner_domain');
    expect(result.deleted).toBe(5);
    // owner_domain(管理员代管):文档表仅 user_id 归属,无法按 owner 域精确清理 → 明确排除,绝不调用文档清理
    expect(deleteAllDocumentSources).not.toHaveBeenCalled();
    expect(result.excluded).toEqual(['documents']);
    expect(result.byType.documents).toBe(0);
    expect(connection.query).toHaveBeenCalledTimes(5);
    expect(
      connection.query.mock.calls.every(
        ([sql, params]) =>
          String(sql).includes('admin_context_id <=> ?') && params.join('|') === 'actor-1|subject-1|maintain|context-1',
      ),
    ).toBe(true);
  });

  it('AI 数据清除失败时回滚且不吞掉真实数据库异常', async () => {
    const failure = Object.assign(new Error('offline'), { code: 'ECONNRESET' });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockRejectedValue(failure),
    };
    await expect(
      clearAiIdentityData(normalIdentity, { getConnection: vi.fn().mockResolvedValue(connection) }),
    ).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('AI 数据结构缺失时清除操作失败关闭，不把未检查分域误报为空', async () => {
    const missing = Object.assign(new Error('missing field'), { code: 'ER_BAD_FIELD_ERROR' });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockRejectedValue(missing),
    };
    await expect(
      clearAiIdentityData(normalIdentity, { getConnection: vi.fn().mockResolvedValue(connection) }),
    ).rejects.toMatchObject({ code: 'AI_DATA_CLEAR_SCHEMA_UNAVAILABLE', status: 503 });
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('subject 总清除无法在同一事务推进检索代际时回滚全部删除', async () => {
    const missing = Object.assign(new Error('generation table missing'), { code: 'ER_NO_SUCH_TABLE' });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        // 5 次可控删除成功；推进检索代际(INSERT ai_content_generations)时缺表→整体回滚。
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockRejectedValueOnce(missing),
    };
    await expect(
      clearAiIdentityData(normalIdentity, { getConnection: vi.fn().mockResolvedValue(connection) }),
    ).rejects.toMatchObject({ code: 'AI_DATA_CLEAR_SCHEMA_UNAVAILABLE', status: 503 });
    expect(connection.query.mock.calls.at(-1)[0]).toContain('INSERT INTO ai_content_generations');
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('always applies actor, subject, mode and exact context id when listing and deleting', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const database = { query };
    await listAiConversations(identity, { limit: 10 }, database);
    await deleteAiConversation({ ...identity, adminContextMode: 'maintain' }, 'conversation-1', database);
    expect(query.mock.calls[0][1].slice(0, 5)).toEqual(['actor-1', 'subject-1', 'readonly', 'context-1', 'active']);
    expect(query.mock.calls[1][1]).toEqual(['conversation-1', 'actor-1', 'subject-1', 'maintain', 'context-1']);
    expect(query.mock.calls[1][0]).toContain("status IN ('active', 'archived')");
    expect(query.mock.calls[1][0]).not.toContain('DELETE FROM ai_conversations');
  });

  it('restores the current actor feedback together with cloud conversation messages', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ id: 'conversation-1', title: 'Conversation', status: 'active' }]])
      .mockResolvedValueOnce([
        [
          {
            id: 'message-1',
            conversation_id: 'conversation-1',
            role: 'assistant',
            content: 'Answer',
            status: 'completed',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ message_id: 'message-1', rating: 'unhelpful', reason: 'unsupported', resolved: 0 }]]);

    const conversation = await getAiConversation(identity, 'conversation-1', {}, { query });

    expect(conversation.messages[0].feedback).toEqual({
      rating: 'unhelpful',
      reason: 'unsupported',
      resolved: false,
    });
    expect(query.mock.calls[4][0]).toContain('actor_user_id = ?');
    expect(query.mock.calls[4][1]).toEqual(['actor-1', 'conversation-1', 'message-1']);
  });

  it('soft deletes a conversation and restores it only inside the owner-scoped undo window', async () => {
    const deleteQuery = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const deleted = await deleteAiConversation(normalIdentity, 'conversation-undo', { query: deleteQuery });
    expect(deleted.deleted).toBe(1);
    expect(new Date(deleted.undoExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(deleteQuery.mock.calls[0][0]).toContain("THEN 'deleted_archived'");

    const restoreQuery = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    await expect(
      restoreDeletedAiConversation(normalIdentity, 'conversation-undo', { query: restoreQuery }),
    ).resolves.toEqual({ restored: 1 });
    expect(restoreQuery.mock.calls[0][0]).toContain("status IN ('deleted_active', 'deleted_archived')");
    expect(restoreQuery.mock.calls[0][0]).toContain('DATE_SUB(CURRENT_TIMESTAMP');
    expect(restoreQuery.mock.calls[0][1]).toEqual(['conversation-undo', 'user-1', 'user-1', 'normal', null]);

    await expect(
      restoreDeletedAiConversation(normalIdentity, 'conversation-undo', {
        query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_DELETE_UNDO_EXPIRED', status: 409 });
  });

  it('exports only the current owner domain and keeps sources and evidence attached to their message', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'conversation-1', title: 'Export', status: 'active' }]])
        .mockResolvedValueOnce([
          [
            {
              id: 'message-1',
              conversation_id: 'conversation-1',
              role: 'assistant',
              content: 'Answer [1]',
              status: 'completed',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [{ message_id: 'message-1', source_id: 'source-1', resource_type: 'note', display_title: 'Note' }],
        ])
        .mockResolvedValueOnce([
          [
            {
              message_id: 'message-1',
              evidence_ref: 'evidence-1',
              source_id: 'source-1',
              citation_key: '1',
              excerpt_hash: 'hash',
              excerpt: 'Support',
            },
          ],
        ])
        .mockResolvedValueOnce([[]]),
    };
    const exported = await exportAiConversations(identity, database);
    expect(exported).toMatchObject({ conversationCount: 1, messageCount: 1 });
    expect(exported.conversations[0].messages[0]).toMatchObject({
      content: 'Answer [1]',
      sources: [{ sourceId: 'source-1' }],
      evidence: [{ evidenceRef: 'evidence-1' }],
    });
    for (const call of database.query.mock.calls.slice(0, 4)) {
      expect(call[1]).toEqual(['actor-1', 'subject-1', 'readonly', 'context-1']);
    }
  });

  it('normal and two admin context ids are three disjoint owner domains', async () => {
    const query = vi.fn().mockResolvedValue([[]]);
    await listAiConversations(normalIdentity, {}, { query });
    await listAiConversations({ ...identity, adminContextId: 'context-a' }, {}, { query });
    await listAiConversations({ ...identity, adminContextId: 'context-b' }, {}, { query });
    expect(query.mock.calls.map((call) => call[1].slice(0, 4))).toEqual([
      ['user-1', 'user-1', 'normal', null],
      ['actor-1', 'subject-1', 'readonly', 'context-a'],
      ['actor-1', 'subject-1', 'readonly', 'context-b'],
    ]);
    expect(query.mock.calls.every(([sql]) => sql.includes('admin_context_id <=> ?'))).toBe(true);
  });
});

describe('AI conversation lineage and answer versions', () => {
  it('滚动发布时把旧后端写入的 NULL 根与新版子分支一起返回，不依赖 current 注入', async () => {
    const root = {
      id: 'root-1',
      title: 'Root',
      root_conversation_id: null,
      parent_conversation_id: null,
      status: 'active',
      retention_mode: 'standard',
      create_time: '2026-07-19 10:00:00',
    };
    const child = {
      id: 'child-1',
      title: 'Child',
      root_conversation_id: 'root-1',
      parent_conversation_id: 'root-1',
      branch_from_message_id: 'message-1',
      status: 'active',
      retention_mode: 'standard',
      create_time: '2026-07-19 10:01:00',
    };
    const databaseFor = (current) => ({
      query: vi
        .fn()
        .mockResolvedValueOnce([[current]])
        .mockResolvedValueOnce([[root, child]]),
    });

    for (const current of [root, child]) {
      const database = databaseFor(current);
      const result = await getAiConversationLineage(normalIdentity, current.id, database);
      expect(result.nodes.map((node) => node.id)).toEqual(['root-1', 'child-1']);
      expect(result.nodes.find((node) => node.id === current.id)?.current).toBe(true);
      expect(database.query.mock.calls[1][0]).toContain('(root_conversation_id = ? OR id = ?)');
      expect(database.query.mock.calls[1][0]).toContain('admin_context_id <=> ?');
      expect(database.query.mock.calls[1][0]).toContain("retention_mode <> 'temporary'");
      expect(database.query.mock.calls[1][1]).toEqual(['user-1', 'user-1', 'normal', null, 'root-1', 'root-1']);
    }
  });

  it('版本列表只读取同会话同 versionGroupId，并兼容以首个回答 ID 作为组锚点', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'conversation-1', status: 'active', retention_mode: 'standard' }]])
        .mockResolvedValueOnce([[{ id: 'answer-2', version_group_id: 'answer-1', status: 'completed' }]])
        .mockResolvedValueOnce([
          [
            { id: 'answer-1', version_group_id: null, create_time: '2026-07-19 10:00:00' },
            { id: 'answer-2', version_group_id: 'answer-1', create_time: '2026-07-19 10:01:00' },
          ],
        ]),
    };
    const result = await listAiMessageVersions(normalIdentity, 'conversation-1', 'answer-2', database);
    expect(result.versionGroupId).toBe('answer-1');
    expect(result.items.map((item) => item.messageId)).toEqual(['answer-1', 'answer-2']);
    expect(database.query.mock.calls[2][0]).toContain('(version_group_id = ? OR id = ?)');
    expect(database.query.mock.calls[2][1]).toEqual(['conversation-1', 'answer-1', 'answer-1']);
  });

  it('显式 prepare 只锁定 owner 会话内 completed assistant，并原子把首个旧答案纳入版本组', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'conversation-1', status: 'active', retention_mode: 'standard' }]])
        .mockResolvedValueOnce([[{ id: 'answer-1', version_group_id: null }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const result = await prepareAiMessageVersionGroup(normalIdentity, 'conversation-1', 'answer-1', {
      getConnection: vi.fn().mockResolvedValue(connection),
    });
    expect(result).toEqual({ conversationId: 'conversation-1', messageId: 'answer-1', versionGroupId: 'answer-1' });
    expect(connection.query.mock.calls[1][0]).toContain("role = 'assistant' AND status = 'completed'");
    expect(connection.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[1][1]).toEqual(['answer-1', 'conversation-1']);
    expect(connection.query.mock.calls[2][1]).toEqual(['answer-1', 'answer-1', 'conversation-1']);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('分支创建在同一事务连接中写入谱系并继承保留策略', async () => {
    let branchRow;
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params = []) => {
        if (String(sql).includes('INSERT INTO ai_conversations')) {
          branchRow = {
            id: params[0],
            title: params[5],
            scope_type: params[6],
            scope_json: params[7],
            retention_mode: params[8],
            expire_at: params[9],
            root_conversation_id: params[10],
            parent_conversation_id: params[11],
            branch_from_message_id: params[12],
            status: 'active',
          };
          return [{ affectedRows: 1 }];
        }
        if (String(sql).includes('SELECT * FROM ai_conversations')) {
          if (params[0] === 'source-1') {
            return [
              [
                {
                  id: 'source-1',
                  title: 'Source',
                  scope_type: 'global',
                  scope_json: '{}',
                  status: 'active',
                  retention_mode: 'indefinite',
                  root_conversation_id: 'root-1',
                },
              ],
            ];
          }
          return [[branchRow]];
        }
        if (String(sql).includes('SELECT COUNT(*) AS total FROM ai_messages')) return [[{ total: 0 }]];
        if (String(sql).includes('SELECT * FROM ai_messages')) return [[]];
        return [{ affectedRows: 1 }];
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };
    const branch = await branchAiConversation(normalIdentity, 'source-1', {}, database);
    expect(branch).toMatchObject({ rootConversationId: 'root-1', parentConversationId: 'source-1' });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(branchRow).toMatchObject({
      retention_mode: 'indefinite',
      root_conversation_id: 'root-1',
      parent_conversation_id: 'source-1',
      branch_from_message_id: null,
    });
  });

  it('超过安全克隆上限时在 owner 校验后稳定拒绝，不创建静默截断分支', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'source-large', status: 'active', retention_mode: 'standard' }]])
        .mockResolvedValueOnce([[{ total: 201 }]]),
    };
    await expect(
      branchAiConversation(
        normalIdentity,
        'source-large',
        { throughMessageId: 'message-201' },
        {
          getConnection: vi.fn().mockResolvedValue(connection),
        },
      ),
    ).rejects.toMatchObject({ code: 'CONVERSATION_BRANCH_TOO_LARGE', status: 409 });
    expect(connection.query.mock.calls[0][0]).toContain('admin_context_id <=> ?');
    expect(connection.query.mock.calls[1]).toEqual([
      'SELECT COUNT(*) AS total FROM ai_messages WHERE conversation_id = ?',
      ['source-large'],
    ]);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_conversations'))).toBe(
      false,
    );
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('克隆消息只映射已在新分支创建的父 ID，不泄漏源会话消息 ID', () => {
    const ids = new Map([['source-user', 'branch-user']]);
    expect(__testing.clonedParentMessageId({ parentMessageId: 'source-user' }, ids)).toBe('branch-user');
    expect(__testing.clonedParentMessageId({ parentMessageId: 'not-cloned' }, ids)).toBeNull();
    expect(__testing.clonedParentMessageId({ parentMessageId: null }, ids)).toBeNull();
  });
});

describe('AI temporary conversation retention', () => {
  it('sets a bounded default expiry and rejects past or overlong temporary retention', async () => {
    const createdRow = {
      id: 'conversation-1',
      title: 'Temporary',
      status: 'active',
      retention_mode: 'temporary',
      expire_at: new Date(Date.now() + 60_000),
    };
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[createdRow]]),
    };
    const before = Date.now();
    await createAiConversation(normalIdentity, { id: 'conversation-1', retentionMode: 'temporary' }, database);
    const expireAt = database.query.mock.calls[0][1][9];
    expect(expireAt).toBeInstanceOf(Date);
    expect(expireAt.getTime() - before).toBeGreaterThanOrEqual(__testing.DEFAULT_TEMPORARY_RETENTION_MS - 1000);
    await expect(
      createAiConversation(
        normalIdentity,
        { retentionMode: 'temporary', expireAt: new Date(Date.now() - 1) },
        { query: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'RETENTION_EXPIRE_AT_INVALID' });
    await expect(
      createAiConversation(
        normalIdentity,
        { retentionMode: 'temporary', expireAt: new Date(Date.now() + __testing.MAX_TEMPORARY_RETENTION_MS + 60_000) },
        { query: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'RETENTION_EXPIRE_AT_TOO_LATE' });
  });

  it('expired conversations are excluded from every owned read', async () => {
    const query = vi.fn().mockResolvedValue([[]]);
    await expect(getAiConversation(normalIdentity, 'expired-conversation', {}, { query })).rejects.toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
      status: 404,
    });
    expect(query.mock.calls[0][0]).toContain("retention_mode <> 'temporary'");
    expect(query.mock.calls[0][0]).toContain('expire_at > CURRENT_TIMESTAMP');
  });

  it('cleans expired conversations and linked AI objects in one bounded transaction', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params = []) => {
        if (sql.includes('SELECT id FROM ai_conversations')) return [[{ id: 'expired-1' }]];
        if (sql.includes('DELETE FROM ai_conversations')) return [{ affectedRows: 1 }];
        return [{ affectedRows: 2 }];
      }),
    };
    const result = await cleanupExpiredAiConversations(
      { getConnection: vi.fn().mockResolvedValue(connection) },
      { batchSize: 10, maxBatches: 1 },
    );
    expect(result).toMatchObject({ deleted: 1, dependentsDeleted: 4, skipped: false });
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM ai_memories'))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM ai_change_sets'))).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('permanently purges an overdue soft-deleted conversation and its linked private AI objects', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT id FROM ai_conversations')) return [[{ id: 'deleted-1' }]];
        if (sql.includes('DELETE FROM ai_conversations')) return [{ affectedRows: 1 }];
        return [{ affectedRows: 2 }];
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };
    const purged = await purgeDeletedAiConversation('deleted-1', database, new Date('2026-07-19T00:00:30Z'));
    expect(purged).toMatchObject({ deleted: 1, dependentsDeleted: 4, skipped: false });
    expect(connection.query.mock.calls[0][0]).toContain("status IN ('deleted_active', 'deleted_archived')");
    expect(connection.commit).toHaveBeenCalledTimes(1);

    connection.query.mockClear();
    connection.commit.mockClear();
    connection.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM ai_conversations')) return [[{ id: 'deleted-2' }]];
      if (sql.includes('DELETE FROM ai_conversations')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    });
    const cleaned = await cleanupDeletedAiConversations(database, { batchSize: 10, maxBatches: 1 });
    expect(cleaned).toMatchObject({ deleted: 1, dependentsDeleted: 2, skipped: false });
  });

  it('missing workspace table skips cleanup without preventing startup', async () => {
    const missing = Object.assign(new Error('table missing'), { code: 'ER_NO_SUCH_TABLE' });
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockRejectedValue(missing),
    };
    await expect(
      cleanupExpiredAiConversations({ getConnection: vi.fn().mockResolvedValue(connection) }),
    ).resolves.toMatchObject({ deleted: 0, skipped: true });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});

describe('AI evidence persistence', () => {
  it('normalizes Agent string targets into durable resource links', () => {
    expect(
      __testing.normalizeSources([
        {
          sourceId: 'note:note-1',
          type: 'note',
          id: 'note-1',
          title: 'Note',
          target: 'note-detail',
        },
      ])[0],
    ).toMatchObject({
      sourceId: 'note:note-1',
      resourceType: 'note',
      resourceId: 'note-1',
      target: { type: 'note-detail', id: 'note-1', path: '/noteLibrary/note-1' },
    });
  });

  it('rejects evidence references that were not returned as real sources', () => {
    expect(() =>
      __testing.normalizeEvidence(
        [{ sourceId: 'invented', evidenceRef: 'ev-1', citationKey: '1', excerpt: 'text' }],
        new Set(['real-source']),
      ),
    ).toThrow(/EVIDENCE_SOURCE_INVALID/);
  });

  it('persists immutable material snapshots and verified evidence in one transaction', async () => {
    const savedRow = {
      id: 'message-1',
      conversation_id: 'conversation-1',
      role: 'assistant',
      content: 'Answer [1]',
      status: 'completed',
      context_refs_json: '[]',
      attachment_refs_json: '[]',
      activity_json: '[]',
      coverage_json: null,
      create_time: new Date(),
      update_time: new Date(),
    };
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT * FROM ai_conversations')) {
          return [[{ id: 'conversation-1', title: 'New', status: 'active' }]];
        }
        if (sql.includes('SELECT id FROM ai_messages')) return [[]];
        if (sql.includes('SELECT * FROM ai_messages')) return [[savedRow]];
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn(),
    };
    const message = await saveAiMessage(
      normalIdentity,
      'conversation-1',
      {
        id: 'message-1',
        requestId: 'request-1',
        role: 'assistant',
        content: 'Answer [1]',
        contextRefs: [{ type: 'note', id: 'note-1', title: 'Frozen title' }],
        attachmentRefs: [{ id: 'attachment-1', fileName: 'frozen.pdf', status: 'ready' }],
        activity: [
          {
            event: 'memory_context',
            status: 'used',
            count: 2,
            types: ['preference', 'workflow', 'system_instruction'],
            scopes: ['global', 'conversation', 'foreign_owner'],
            memoryId: 'memory-secret-id',
            content: '记忆正文 secret',
            rawError: 'provider-secret',
          },
        ],
        sources: [{ sourceId: 'source-1', resourceType: 'note', resourceId: 'note-1', title: 'Note' }],
        evidence: [
          {
            sourceId: 'source-1',
            evidenceRef: 'evidence-1',
            citationKey: '1',
            locator: { type: 'paragraph', value: 'p3' },
            excerpt: 'Supporting statement',
          },
        ],
      },
      database,
    );
    expect(message.sources).toHaveLength(1);
    expect(message.evidence[0].excerptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    const insertMessage = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_messages'));
    expect(insertMessage[1][8]).toContain('note-1');
    expect(insertMessage[1][9]).toContain('attachment-1');
    expect(JSON.parse(insertMessage[1][10])).toEqual([
      {
        event: 'memory_context',
        status: 'used',
        count: 2,
        types: ['preference', 'workflow'],
        scopes: ['global', 'conversation'],
      },
    ]);
    expect(insertMessage[1][10]).not.toContain('memory-secret-id');
    expect(insertMessage[1][10]).not.toContain('记忆正文');
    expect(insertMessage[1][10]).not.toContain('provider-secret');
  });

  it('ignores a client-controlled message id and never uses a primary-key conflict to update another conversation', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params = []) => {
        if (sql.includes('SELECT * FROM ai_conversations')) {
          return [[{ id: 'conversation-1', title: 'New', status: 'active' }]];
        }
        if (sql.includes('SELECT * FROM ai_messages')) {
          return [
            [
              {
                id: params[0],
                conversation_id: 'conversation-1',
                role: 'assistant',
                content: 'Safe answer',
                status: 'completed',
              },
            ],
          ];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn(),
    };
    await saveAiMessage(
      normalIdentity,
      'conversation-1',
      { id: 'known-victim-message-id', role: 'assistant', content: 'Safe answer' },
      database,
    );
    const insert = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ai_messages'));
    expect(insert[0]).not.toContain('ON DUPLICATE KEY UPDATE');
    expect(insert[1][0]).not.toBe('known-victim-message-id');
    expect(insert[1][1]).toBe('conversation-1');
    const destructiveCalls = connection.query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM ai_message_'));
    expect(destructiveCalls).toHaveLength(2);
    expect(destructiveCalls.every(([, params]) => params[0] === insert[1][0])).toBe(true);
    expect(destructiveCalls.every(([, params]) => params[2] === 'conversation-1')).toBe(true);
  });
});
