import { describe, expect, it, vi } from 'vitest';
import {
  acceptOrganizeAiSuggestion,
  createOrganizeAiSuggestionBatch,
  estimateOrganizeAiSuggestions,
  ignoreOrganizeAiSuggestion,
  organizeAiSuggestionServiceInternals,
  runSingleOrganizeAiSuggestionBatch,
} from './organizeAiSuggestionService.js';

describe('organizeAiSuggestionService contracts', () => {
  it('固定只支持书签/笔记与最多二十项选择', () => {
    expect(
      organizeAiSuggestionServiceInternals.normalizeRequest({
        resourceType: 'note',
        scope: 'selected',
        resourceIds: ['n-1', 'n-1', 'n-2'],
      }),
    ).toMatchObject({ resourceType: 'note', scopeMode: 'selected', resourceIds: ['n-1', 'n-2'] });
    expect(() =>
      organizeAiSuggestionServiceInternals.normalizeRequest({
        resourceType: 'file',
        scope: 'selected',
        resourceIds: ['f-1'],
      }),
    ).toThrowError(expect.objectContaining({ code: 'ORGANIZE_AI_RESOURCE_TYPE_INVALID' }));
    expect(() =>
      organizeAiSuggestionServiceInternals.normalizeRequest({
        resourceType: 'bookmark',
        scope: 'selected',
        resourceIds: Array.from({ length: 21 }, (_, index) => `b-${index}`),
      }),
    ).toThrowError(expect.objectContaining({ code: 'ORGANIZE_AI_RESOURCE_IDS_INVALID' }));
  });

  it('发布开关关闭时预估不可创建，创建也不会查询或调用模型', async () => {
    const database = { query: vi.fn() };
    const input = { resourceType: 'bookmark', scope: 'selected', resourceIds: ['b-1'] };
    database.query.mockResolvedValueOnce([[{ id: 'b-1' }]]);
    await expect(
      estimateOrganizeAiSuggestions(database, {
        userId: 'user-1',
        input,
        env: { ORGANIZE_AI_SUGGESTIONS_ENABLED: 'off' },
      }),
    ).resolves.toMatchObject({ featureEnabled: false, canCreate: false });
    database.query.mockClear();
    await expect(
      createOrganizeAiSuggestionBatch(database, {
        userId: 'user-1',
        input: { ...input, requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538' },
        env: { ORGANIZE_AI_SUGGESTIONS_ENABLED: 'off' },
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_AI_SUGGESTIONS_DISABLED', status: 503 });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('创建批次先锁定有效账号，再读取资源和写入，注销后不会留下迟到批次', async () => {
    const note = { id: 'note-1', title: '标题', type: 'html', content: '正文', revision: 1 };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM user') && sql.includes('FOR UPDATE')) {
          return [[{ id: 'user-1', role: 'user', del_flag: 0 }]];
        }
        if (sql.includes('payload_hash AS payloadHash')) return [[]];
        if (sql.includes('FROM note WHERE create_by')) return [[note]];
        if (sql.includes('FROM resource_tag_relations r')) return [[]];
        if (sql.includes('INSERT INTO organize_ai_tag_batches')) return [{ affectedRows: 1 }];
        if (sql.includes('INSERT INTO organize_ai_tag_suggestions')) return [{ affectedRows: 1 }];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      createOrganizeAiSuggestionBatch(database, {
        userId: 'user-1',
        input: {
          resourceType: 'note',
          scope: 'selected',
          resourceIds: ['note-1'],
          requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
        },
      }),
    ).resolves.toMatchObject({ resourceType: 'note', status: 'queued', progress: { total: 1 } });

    const sqlCalls = connection.query.mock.calls.map(([sql]) => sql);
    const accountLockIndex = sqlCalls.findIndex((sql) => sql.includes('FROM user') && sql.includes('FOR UPDATE'));
    const resourceReadIndex = sqlCalls.findIndex((sql) => sql.includes('FROM note WHERE create_by'));
    const batchInsertIndex = sqlCalls.findIndex((sql) => sql.includes('INSERT INTO organize_ai_tag_batches'));
    expect(accountLockIndex).toBeGreaterThanOrEqual(0);
    expect(resourceReadIndex).toBeGreaterThan(accountLockIndex);
    expect(batchInsertIndex).toBeGreaterThan(resourceReadIndex);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('快照摘要同时绑定内容和当前标签，资源变化不能继续接受旧建议', () => {
    const base = organizeAiSuggestionServiceInternals.snapshotHash(
      'note',
      'n-1',
      { title: '标题', content: '正文', revision: 1 },
      [{ id: 't-1', name: '资料' }],
    );
    expect(
      organizeAiSuggestionServiceInternals.snapshotHash(
        'note',
        'n-1',
        { title: '标题', content: '正文已更新', revision: 2 },
        [{ id: 't-1', name: '资料' }],
      ),
    ).not.toBe(base);
    expect(
      organizeAiSuggestionServiceInternals.snapshotHash(
        'note',
        'n-1',
        { title: '标题', content: '正文', revision: 1 },
        [{ id: 't-2', name: '新标签' }],
      ),
    ).not.toBe(base);
  });

  it('资源冲突不会把批次误标为全部完成', () => {
    expect(
      organizeAiSuggestionServiceInternals.batchStatusFromCounts({
        queued: 0,
        running: 0,
        processed: 1,
        pending: 0,
        failed: 0,
        conflicted: 1,
      }),
    ).toBe('partial');
  });

  it('发布开关关闭时 Worker 不领取批次', async () => {
    const database = { getConnection: vi.fn() };
    await expect(
      runSingleOrganizeAiSuggestionBatch('worker-1', database, {
        env: { ORGANIZE_AI_SUGGESTIONS_ENABLED: 'false' },
      }),
    ).resolves.toBe(false);
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('Worker 在事务内领取排队或过期租约，并写入新租约', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'batch-1', userId: 'user-1', resourceType: 'note' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    const job = await organizeAiSuggestionServiceInternals.claimNextBatch(database, 'worker-1');

    expect(job).toMatchObject({ id: 'batch-1', userId: 'user-1', resourceType: 'note' });
    expect(job.leaseToken).toMatch(/^[0-9a-f-]{36}$/u);
    expect(connection.query.mock.calls[0][0]).toContain("status = 'queued'");
    expect(connection.query.mock.calls[0][0]).toContain("status = 'running'");
    expect(connection.query.mock.calls[0][0]).toContain('lease_expires_at < NOW()');
    expect(connection.query.mock.calls[0][0]).toContain('lease_token IS NULL');
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[1][1]).toEqual([
      'worker-1',
      job.leaseToken,
      organizeAiSuggestionServiceInternals.LEASE_SECONDS,
      'batch-1',
    ]);
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('每次 Worker 轮询只取一项，不长时间阻塞现有文档队列', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]),
    };
    const runAiExecution = vi.fn(async (_config, operation) => operation());

    await organizeAiSuggestionServiceInternals.processClaimedBatch(
      database,
      { id: 'batch-1', userId: 'user-1', resourceType: 'note', leaseToken: 'lease-1' },
      { user: { id: 'user-1', role: 'user', isAuthenticated: true }, restrictions: [] },
      { runAiExecution },
    );

    expect(database.query.mock.calls[1][0]).toContain('LIMIT ?');
    expect(database.query.mock.calls[1][1]).toEqual([
      'batch-1',
      'user-1',
      organizeAiSuggestionServiceInternals.WORKER_SLICE_ITEMS,
    ]);
    expect(organizeAiSuggestionServiceInternals.WORKER_SLICE_ITEMS).toBe(1);
    expect(runAiExecution).toHaveBeenCalledOnce();
    expect(runAiExecution.mock.calls[0][0]).toMatchObject({
      reservationTokens: organizeAiSuggestionServiceInternals.WORKER_ITEM_RESERVATION_TOKENS,
      maxUserProviderCalls: 1,
      maxPlatformProviderCalls: 0,
    });
    expect(organizeAiSuggestionServiceInternals.WORKER_ITEM_RESERVATION_TOKENS).toBe(5_000);
  });

  it('续租失败时旧 Worker 立即停止，不能写入新 Worker 的结果', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]),
    };

    await expect(
      organizeAiSuggestionServiceInternals.renewOrganizeAiLease(database, {
        id: 'batch-1',
        leaseToken: 'expired-lease',
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_AI_LEASE_LOST', status: 409 });
    expect(database.query.mock.calls[0][0]).toContain("status = 'running'");
    expect(database.query.mock.calls[0][0]).toContain('lease_token = ?');
    expect(database.query.mock.calls[0][1]).toEqual([
      organizeAiSuggestionServiceInternals.LEASE_SECONDS,
      'batch-1',
      'expired-lease',
    ]);
  });

  it('批次进度在事务内锁定批次后重新汇总，避免并发状态覆盖', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'batch-1' }]])
        .mockResolvedValueOnce([
          [
            { id: 'suggestion-1', status: 'pending' },
            { id: 'suggestion-2', status: 'accepted' },
          ],
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      organizeAiSuggestionServiceInternals.refreshBatchProgress(database, 'batch-1', 'user-1'),
    ).resolves.toMatchObject({ status: 'ready', counts: { processed: 2, pending: 1, accepted: 1 } });
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[0][0]).toContain('organize_ai_tag_batches');
    expect(connection.query.mock.calls[1][0]).toContain('organize_ai_tag_suggestions');
    expect(connection.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('Worker 汇总必须携带运行租约，注销清空租约后不能复活 cancelled 批次', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn().mockResolvedValueOnce([[]]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      organizeAiSuggestionServiceInternals.refreshBatchProgress(database, 'batch-1', 'user-1', {
        leaseToken: 'cancelled-lease',
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_AI_LEASE_LOST', status: 409 });

    expect(connection.query.mock.calls[0][0]).toContain("status = 'running'");
    expect(connection.query.mock.calls[0][0]).toContain('lease_token = ?');
    expect(connection.query.mock.calls[0][1]).toEqual(['batch-1', 'user-1', 'cancelled-lease']);
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('Worker 状态写使用 batch→suggestion 显式短事务，不依赖多表 UPDATE 锁序', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'batch-1' }]])
        .mockResolvedValueOnce([[{ id: 'suggestion-1', status: 'queued' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await organizeAiSuggestionServiceInternals.updateWorkerSuggestion(
      database,
      { id: 'batch-1', userId: 'user-1', leaseToken: 'lease-1' },
      'suggestion-1',
      "status = 'running', attempts = attempts + 1",
      [],
      'queued',
    );

    const sqlCalls = connection.query.mock.calls.map(([sql]) => sql);
    expect(sqlCalls[0]).toContain('organize_ai_tag_batches');
    expect(sqlCalls[0]).toContain('FOR UPDATE');
    expect(sqlCalls[1]).toContain('organize_ai_tag_suggestions');
    expect(sqlCalls[1]).toContain('FOR UPDATE');
    expect(sqlCalls[2]).toContain('UPDATE organize_ai_tag_suggestions');
    expect(sqlCalls[2]).not.toContain('JOIN organize_ai_tag_batches');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('忽略建议与批次计数共用同一事务，并统一按批次锁再按建议锁', async () => {
    const suggestion = {
      id: 'suggestion-1',
      batchId: 'batch-1',
      resourceType: 'note',
      resourceId: 'note-1',
      resourceTitle: '标题',
      resourceVersion: '1',
      currentTags: '[]',
      recommendedTags: '[]',
      status: 'pending',
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('LIMIT 1 FOR UPDATE') && sql.includes('organize_ai_tag_suggestions')) return [[suggestion]];
        if (sql.includes("SET status = 'ignored'")) return [{ affectedRows: 1 }];
        if (sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE')) return [[{ id: 'batch-1' }]];
        if (sql.includes('SELECT id, status FROM organize_ai_tag_suggestions')) {
          return [[{ id: 'suggestion-1', status: 'ignored' }]];
        }
        if (sql.includes('UPDATE organize_ai_tag_batches')) return [{ affectedRows: 1 }];
        if (sql.includes('organize_ai_tag_suggestions') && sql.includes('LIMIT 1')) {
          return [[{ ...suggestion, status: 'ignored' }]];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      ignoreOrganizeAiSuggestion(database, {
        userId: 'user-1',
        batchId: 'batch-1',
        suggestionId: 'suggestion-1',
      }),
    ).resolves.toMatchObject({ id: 'suggestion-1', status: 'ignored' });

    const suggestionLockIndex = connection.query.mock.calls.findIndex(
      ([sql]) => sql.includes('organize_ai_tag_suggestions') && sql.includes('FOR UPDATE'),
    );
    const batchLockIndex = connection.query.mock.calls.findIndex(
      ([sql]) => sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE'),
    );
    expect(suggestionLockIndex).toBeGreaterThanOrEqual(0);
    expect(batchLockIndex).toBeGreaterThanOrEqual(0);
    expect(batchLockIndex).toBeLessThan(suggestionLockIndex);
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('接受建议锁定资源及标签关系后才复核版本并写入', async () => {
    const currentTags = [{ id: 'tag-1', name: '资料' }];
    const note = { id: 'note-1', title: '标题', type: 'html', content: '正文', revision: 3 };
    const sourceHash = organizeAiSuggestionServiceInternals.snapshotHash(
      'note',
      note.id,
      { title: note.title, content: note.content, noteType: note.type, revision: note.revision },
      currentTags,
    );
    const suggestion = {
      id: 'suggestion-1',
      batchId: 'batch-1',
      resourceType: 'note',
      resourceId: note.id,
      resourceTitle: note.title,
      resourceVersion: '3',
      sourceHash,
      currentTags: JSON.stringify(currentTags),
      recommendedTags: JSON.stringify([{ id: 'tag-1', name: '资料', source: 'existing' }]),
      status: 'pending',
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('organize_ai_tag_suggestions') && sql.includes('LIMIT 1 FOR UPDATE')) return [[suggestion]];
        if (sql.includes('FROM note WHERE id = ?') && sql.includes('FOR UPDATE')) return [[note]];
        if (sql.includes('SELECT tag_id FROM resource_tag_relations') && sql.includes('FOR UPDATE')) {
          return [[{ tag_id: 'tag-1' }]];
        }
        if (sql.includes('SELECT id, name FROM tag') && sql.includes('FOR UPDATE')) {
          return [[{ id: 'tag-1', name: '资料' }]];
        }
        if (sql.includes("SET status = 'accepted'")) return [{ affectedRows: 1 }];
        if (sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE')) return [[{ id: 'batch-1' }]];
        if (sql.includes('SELECT id, status FROM organize_ai_tag_suggestions')) {
          return [[{ id: 'suggestion-1', status: 'accepted' }]];
        }
        if (sql.includes('UPDATE organize_ai_tag_batches')) return [{ affectedRows: 1 }];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      acceptOrganizeAiSuggestion(database, {
        userId: 'user-1',
        batchId: 'batch-1',
        suggestionId: 'suggestion-1',
      }),
    ).resolves.toMatchObject({ status: 'accepted', acceptedTags: currentTags });

    const sqlCalls = connection.query.mock.calls.map(([sql]) => sql);
    const resourceLockIndex = sqlCalls.findIndex(
      (sql) => sql.includes('FROM note WHERE id = ?') && sql.includes('FOR UPDATE'),
    );
    const tagLockIndex = sqlCalls.findIndex(
      (sql) => sql.includes('SELECT id, name FROM tag') && sql.includes('FOR UPDATE'),
    );
    const relationLockIndex = sqlCalls.findIndex(
      (sql) => sql.includes('SELECT tag_id FROM resource_tag_relations') && sql.includes('FOR UPDATE'),
    );
    const nameGapLockIndex = sqlCalls.findIndex((sql) => sql.includes('active_name = ?') && sql.includes('FOR UPDATE'));
    const acceptedWriteIndex = sqlCalls.findIndex((sql) => sql.includes("SET status = 'accepted'"));
    expect(resourceLockIndex).toBeGreaterThanOrEqual(0);
    expect(tagLockIndex).toBeGreaterThan(resourceLockIndex);
    expect(nameGapLockIndex).toBeGreaterThan(tagLockIndex);
    expect(relationLockIndex).toBeGreaterThan(tagLockIndex);
    expect(relationLockIndex).toBeGreaterThan(nameGapLockIndex);
    expect(acceptedWriteIndex).toBeGreaterThan(relationLockIndex);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('默认接受保留生成时的标签 ID/name/source，标签被改名后转为冲突而不按名称重建', async () => {
    const note = { id: 'note-1', title: '标题', type: 'html', content: '正文', revision: 1 };
    const sourceHash = organizeAiSuggestionServiceInternals.snapshotHash(
      'note',
      note.id,
      { title: note.title, content: note.content, noteType: note.type, revision: note.revision },
      [],
    );
    const suggestion = {
      id: 'suggestion-1',
      batchId: 'batch-1',
      resourceType: 'note',
      resourceId: note.id,
      resourceTitle: note.title,
      resourceVersion: '1',
      sourceHash,
      currentTags: '[]',
      recommendedTags: JSON.stringify([{ id: 'tag-1', name: '资料', source: 'existing' }]),
      status: 'pending',
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE')) return [[{ id: 'batch-1' }]];
        if (sql.includes('organize_ai_tag_suggestions') && sql.includes('LIMIT 1 FOR UPDATE')) return [[suggestion]];
        if (sql.includes('FROM note WHERE id = ?') && sql.includes('FOR UPDATE')) return [[note]];
        if (sql.includes('SELECT tag_id FROM resource_tag_relations') && sql.includes('FOR UPDATE')) return [[]];
        if (sql.includes('SELECT id, name FROM tag') && sql.includes('FOR UPDATE')) {
          return [[{ id: 'tag-1', name: '已改名' }]];
        }
        if (sql.includes("SET status = 'conflict'")) return [{ affectedRows: 1 }];
        if (sql.includes('SELECT id, status FROM organize_ai_tag_suggestions')) {
          return [[{ id: 'suggestion-1', status: 'conflict' }]];
        }
        if (sql.includes('UPDATE organize_ai_tag_batches')) return [{ affectedRows: 1 }];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      acceptOrganizeAiSuggestion(database, {
        userId: 'user-1',
        batchId: 'batch-1',
        suggestionId: 'suggestion-1',
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZE_AI_RECOMMENDATION_STALE', status: 409 });

    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.some(([sql]) => sql.includes("last_error_code = 'TAG_CHANGED'"))).toBe(false);
    const conflictWrite = connection.query.mock.calls.find(([sql]) => sql.includes("SET status = 'conflict'"));
    expect(conflictWrite?.[1]).toEqual(['TAG_CHANGED', 'suggestion-1', 'batch-1', 'user-1']);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO tag'))).toBe(false);
  });

  it('Worker 每项外发前重新校验账号并续租，注销后不会调用 Provider', async () => {
    const note = { id: 'note-1', title: '标题', type: 'html', content: '正文', revision: 1 };
    const item = {
      id: 'suggestion-1',
      batchId: 'batch-1',
      resourceType: 'note',
      resourceId: note.id,
      sourceHash: organizeAiSuggestionServiceInternals.snapshotHash(
        'note',
        note.id,
        { title: note.title, content: note.content, noteType: note.type, revision: note.revision },
        [],
      ),
      status: 'queued',
    };
    const database = {
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT id, name FROM tag')) return [[]];
        if (sql.includes('FROM organize_ai_tag_suggestions') && sql.includes("status IN ('queued','running')")) {
          return [[item]];
        }
        if (sql.includes('SET lease_expires_at')) return [{ affectedRows: 1 }];
        if (sql.includes('FROM note WHERE create_by')) return [[note]];
        if (sql.includes('FROM resource_tag_relations r')) return [[]];
        if (sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE')) return [[{ id: 'batch-1' }]];
        if (sql.includes('SELECT id, status FROM organize_ai_tag_suggestions')) {
          return [[{ id: 'suggestion-1', status: 'queued' }]];
        }
        if (sql.includes('UPDATE organize_ai_tag_suggestions')) return [{ affectedRows: 1 }];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const suggestTagsFromText = vi.fn();
    const accountUnavailable = Object.assign(new Error('deleted'), {
      code: 'ORGANIZE_AI_ACCOUNT_UNAVAILABLE',
      status: 403,
    });
    const withActiveUserAiDispatch = vi.fn(async (_database, _userId, callback) => callback());

    await expect(
      organizeAiSuggestionServiceInternals.processClaimedBatch(
        database,
        { id: 'batch-1', userId: 'user-1', resourceType: 'note', leaseToken: 'lease-1' },
        { user: { id: 'user-1', role: 'user', isAuthenticated: true }, restrictions: [] },
        {
          suggestTagsFromText,
          withActiveUserAiDispatch,
          loadWorkerIdentity: vi.fn().mockRejectedValue(accountUnavailable),
          runAiExecution: async (_config, operation) => operation(),
        },
      ),
    ).rejects.toBe(accountUnavailable);

    expect(suggestTagsFromText).not.toHaveBeenCalled();
    expect(withActiveUserAiDispatch).toHaveBeenCalledWith(database, 'user-1', expect.any(Function));
    const batchLockIndex = database.query.mock.calls.findIndex(
      ([sql]) => sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE'),
    );
    const suggestionLockIndex = database.query.mock.calls.findIndex(([sql]) =>
      sql.includes('SELECT id, status FROM organize_ai_tag_suggestions'),
    );
    expect(batchLockIndex).toBeGreaterThanOrEqual(0);
    expect(suggestionLockIndex).toBeGreaterThan(batchLockIndex);
  });

  it('模型解析失败与合法无建议严格区分', () => {
    expect(() => organizeAiSuggestionServiceInternals.validateSuggestionModelResult(null)).toThrowError(
      expect.objectContaining({ code: 'ORGANIZE_AI_OUTPUT_INVALID', status: 502 }),
    );
    const noSuggestion = { matchedTagIds: [], newTags: [], suggestions: [] };
    expect(organizeAiSuggestionServiceInternals.validateSuggestionModelResult(noSuggestion)).toBe(noSuggestion);
  });

  it('Worker 将解析失败记为失败且退费语义，合法空数组才记为 no_suggestion', async () => {
    const note = { id: 'note-1', title: '标题', type: 'html', content: '正文', revision: 1 };
    const sourceHash = organizeAiSuggestionServiceInternals.snapshotHash(
      'note',
      note.id,
      { title: note.title, content: note.content, noteType: note.type, revision: note.revision },
      [],
    );
    const item = {
      id: 'suggestion-1',
      batchId: 'batch-1',
      resourceType: 'note',
      resourceId: note.id,
      sourceHash,
      status: 'queued',
    };
    const runCase = async (modelResult) => {
      const writes = [];
      let executionOutcome = null;
      let itemStatus = 'queued';
      const database = {
        query: vi.fn(async (sql, params = []) => {
          if (sql.startsWith('SELECT id, name FROM tag')) return [[]];
          if (sql.includes('FROM organize_ai_tag_suggestions') && sql.includes("status IN ('queued','running')")) {
            return [[item]];
          }
          if (sql.includes('SET lease_expires_at')) return [{ affectedRows: 1 }];
          if (sql.includes('FROM note WHERE create_by')) return [[note]];
          if (sql.includes('FROM resource_tag_relations r')) return [[]];
          if (sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE')) {
            return [[{ id: 'batch-1' }]];
          }
          if (sql.includes('SELECT id, status FROM organize_ai_tag_suggestions')) {
            return [[{ id: 'suggestion-1', status: itemStatus }]];
          }
          if (sql.includes('UPDATE organize_ai_tag_suggestions')) {
            writes.push({ sql, params });
            if (sql.includes("status = 'running'")) itemStatus = 'running';
            else if (sql.includes("status = 'failed'")) itemStatus = 'failed';
            else if (params.includes('no_suggestion')) itemStatus = 'no_suggestion';
            return [{ affectedRows: 1 }];
          }
          throw new Error(`unexpected sql: ${sql}`);
        }),
      };
      const result = await organizeAiSuggestionServiceInternals.processClaimedBatch(
        database,
        { id: 'batch-1', userId: 'user-1', resourceType: 'note', leaseToken: 'lease-1' },
        { user: { id: 'user-1', role: 'user', isAuthenticated: true }, restrictions: [] },
        {
          suggestTagsFromText: vi.fn().mockResolvedValue(modelResult),
          withActiveUserAiDispatch: async (_database, _userId, callback) => callback(),
          loadWorkerIdentity: vi.fn().mockResolvedValue({
            user: { id: 'user-1', role: 'user', isAuthenticated: true },
            restrictions: [],
          }),
          runAiExecution: async (config, operation) => {
            const output = await operation();
            executionOutcome = config.resolveResultOutcome(output);
            return output;
          },
        },
      );
      return { result, writes, executionOutcome };
    };

    const invalid = await runCase(null);
    expect(invalid.result).toMatchObject({ succeeded: 0, failed: 1, errorCode: 'ORGANIZE_AI_OUTPUT_INVALID' });
    expect(invalid.executionOutcome).toEqual({ status: 'failed', errorCode: 'ORGANIZE_AI_OUTPUT_INVALID' });
    expect(invalid.writes.some(({ params }) => params.includes('ORGANIZE_AI_OUTPUT_INVALID'))).toBe(true);
    expect(invalid.writes.some(({ params }) => params.includes('no_suggestion'))).toBe(false);
    expect(invalid.writes.every(({ sql }) => !sql.includes('JOIN organize_ai_tag_batches'))).toBe(true);

    const empty = await runCase({ matchedTagIds: [], newTags: [], suggestions: [] });
    expect(empty.result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(empty.executionOutcome).toEqual({ status: 'success' });
    expect(empty.writes.some(({ params }) => params.includes('no_suggestion'))).toBe(true);
  });
});
