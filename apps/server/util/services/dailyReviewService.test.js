import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn(), getConnection: vi.fn() };
vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('../common.js', () => ({
  insertData: vi.fn(() => ({ id: 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa' })),
}));

const {
  actOnDailyReviewItem,
  actOnDailyReviewToday,
  buildReview,
  DailyReviewError,
  ensureDailyReviewToday,
  getDailyReviewToday,
} = await import('./dailyReviewService.js');

const calendar = { dayKey: '20260901', timezone: 'Asia/Shanghai', shiftMinutes: 480 };
const sessionId = '11111111-1111-1111-8111-111111111111';
const itemId = '22222222-2222-2222-8222-222222222222';

const candidate = (resourceType, resourceId, reasonCode = 'buried', reasonTagId = null) => ({
  resourceType,
  resourceId,
  title: `${resourceType}-${resourceId}`,
  url: resourceType === 'bookmark' ? `https://example.com/${resourceId}` : null,
  time: '2025-01-01 00:00:00',
  resourceDate: '2025-01-01',
  reasonCode,
  reasonTagId,
});

const hydratedItem = (overrides = {}) => ({
  id: itemId,
  slot: 1,
  resourceType: 'bookmark',
  resourceId: 'bookmark-1',
  title: '旧书签',
  url: 'https://example.com',
  time: '2025-01-01 00:00:00',
  resourceDate: '2025-01-01',
  reasonCode: 'buried',
  reasonTagId: null,
  reasonTagName: null,
  action: 'pending',
  ...overrides,
});

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(queryImplementation),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('daily review response derivation', () => {
  it('生成时有条目但当天全部失效时派生 completed，且有效分母和 itemCount 都为 0', () => {
    const review = buildReview({
      date: '2026-09-01',
      timezone: 'Asia/Shanghai',
      session: { id: sessionId, status: 'active', itemCount: 3, completedAt: null, skippedAt: null },
      items: [],
    });

    expect(review.session).toMatchObject({ status: 'completed', itemCount: 0 });
    expect(review.progress).toEqual({ done: 0, total: 0, pending: 0 });
  });

  it('生成时就是 0 条才派生 empty', () => {
    const review = buildReview({
      date: '2026-09-01',
      timezone: 'Asia/Shanghai',
      session: { id: sessionId, status: 'empty', itemCount: 0, completedAt: null, skippedAt: null },
      items: [],
    });

    expect(review.session.status).toBe('empty');
  });

  it('已落库 completed 的会话在资源恢复且仍待处理时纯读派生回 active', () => {
    const review = buildReview({
      date: '2026-09-01',
      timezone: 'Asia/Shanghai',
      session: {
        id: sessionId,
        status: 'completed',
        itemCount: 2,
        completedAt: '2026-09-01 08:00:00',
        skippedAt: null,
      },
      items: [hydratedItem()],
    });

    expect(review.session).toMatchObject({ status: 'active', itemCount: 1, completedAt: null });
    expect(review.progress).toEqual({ done: 0, total: 1, pending: 1 });
  });
});

describe('daily review read and ensure', () => {
  it('GET today 纯读，不存在会话时不创建任何数据', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([[]]), getConnection: vi.fn() };

    await expect(getDailyReviewToday('user-1', { calendar, db })).resolves.toEqual({
      generated: false,
      date: '2026-09-01',
      timezone: 'Asia/Shanghai',
      session: null,
      progress: { done: 0, total: 0, pending: 0 },
      items: [],
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0].trim()).toMatch(/^SELECT/u);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('active_tag 关系被移除后，纯读保留资源但不再返回失效的标签入口', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: sessionId, timezone: 'Asia/Shanghai', status: 'active', itemCount: 1 }]])
        .mockImplementationOnce(async (sql, params) => {
          expect(sql).toContain('LEFT JOIN resource_tag_relations reason_relation');
          expect(params).toHaveLength(9);
          return [
            [
              hydratedItem({
                reasonCode: 'active_tag',
                reasonTagId: 'tag-removed',
                reasonTagName: null,
              }),
            ],
          ];
        }),
      getConnection: vi.fn(),
    };

    const review = await getDailyReviewToday('user-1', { calendar, db });

    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({ reasonCode: 'active_tag', reasonTag: null });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('首次 ensure 在开启事务前解析账号日历，避免并发输家继承空的 RR 快照', async () => {
    const events = [];
    const connection = createConnection(async (sql) => {
      events.push(
        String(sql).includes('INSERT INTO daily_content_review_sessions') ? 'insert-session' : 'transaction-query',
      );
      if (sql.includes('INSERT INTO daily_content_review_sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE daily_content_review_sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT hydrated.*')) return [[]];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    connection.beginTransaction.mockImplementation(async () => events.push('begin'));
    const db = {
      query: vi.fn(async (sql) => {
        events.push(sql.includes('user_growth_preferences') ? 'calendar-preferences' : 'calendar-offset');
        if (sql.includes('user_growth_preferences')) return [[]];
        if (sql.includes('TIMESTAMPDIFF')) return [[{ serverOffset: 0 }]];
        throw new Error(`未覆盖的日历 SQL: ${sql}`);
      }),
      getConnection: vi.fn(async () => {
        events.push('get-connection');
        return connection;
      }),
    };

    await ensureDailyReviewToday('user-1', {
      db,
      loadCandidates: vi.fn().mockResolvedValue([]),
      idFactory: () => sessionId,
    });

    expect(events.slice(0, 4)).toEqual(['calendar-preferences', 'calendar-offset', 'get-connection', 'begin']);
  });

  it('首次 ensure 先竞争唯一键，再在同一连接生成最多 3 条并记录 last_shown_date', async () => {
    const rows = [
      hydratedItem({ id: '22222222-2222-2222-8222-222222222222', resourceId: 'b1', slot: 1 }),
      hydratedItem({
        id: '33333333-3333-3333-8333-333333333333',
        resourceType: 'note',
        resourceId: 'n1',
        title: '旧笔记',
        url: null,
        slot: 2,
      }),
      hydratedItem({
        id: '44444444-4444-4444-8444-444444444444',
        resourceType: 'file',
        resourceId: '7',
        title: '旧文件',
        url: null,
        slot: 3,
      }),
    ];
    const connection = createConnection(async (sql) => {
      if (sql.includes('INSERT INTO daily_content_review_sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('INSERT INTO daily_content_review_items')) return [{ affectedRows: 3 }];
      if (sql.includes('INSERT INTO growth_recap_state')) return [{ affectedRows: 3 }];
      if (sql.includes('UPDATE daily_content_review_sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT hydrated.*')) return [rows];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection), query: vi.fn() };
    const loadCandidates = vi
      .fn()
      .mockResolvedValue([
        candidate('bookmark', 'b1'),
        candidate('note', 'n1'),
        candidate('file', '7'),
        candidate('bookmark', 'b2'),
      ]);
    const generatedIds = [
      sessionId,
      '22222222-2222-2222-8222-222222222222',
      '33333333-3333-3333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ];

    const review = await ensureDailyReviewToday('user-1', {
      calendar,
      db,
      loadCandidates,
      idFactory: () => generatedIds.shift(),
    });

    const statements = connection.query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('INSERT INTO daily_content_review_sessions');
    expect(statements.findIndex((sql) => sql.includes('FOR UPDATE'))).toBe(-1);
    expect(statements[1]).toContain('INSERT INTO daily_content_review_items');
    expect(connection.query.mock.calls[1][1]).toHaveLength(27);
    expect(statements[2]).toContain('last_shown_date');
    expect(review.progress).toEqual({ done: 0, total: 3, pending: 3 });
    expect(review.items).toHaveLength(3);
    expect(loadCandidates).toHaveBeenCalledWith(expect.objectContaining({ db: connection, userId: 'user-1' }));
    expect(db.query).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('并发 ensure 输家在 INSERT IGNORE 后锁读赢家，不再生成或改写固定列表', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('INSERT INTO daily_content_review_sessions')) {
        throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      }
      if (sql.includes('FROM daily_content_review_sessions')) {
        return [[{ id: sessionId, timezone: 'Asia/Tokyo', status: 'active', itemCount: 1 }]];
      }
      if (sql.includes('SELECT hydrated.*')) return [[hydratedItem()]];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };
    const loadCandidates = vi.fn();

    const review = await ensureDailyReviewToday('user-1', {
      calendar,
      db,
      loadCandidates,
      idFactory: () => 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO daily_content_review_sessions');
    expect(connection.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(loadCandidates).not.toHaveBeenCalled();
    expect(review.timezone).toBe('Asia/Tokyo');
    expect(review.session.id).toBe(sessionId);
  });

  it('候选生成异常会回滚且不提交', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('INSERT INTO daily_content_review_sessions')) return [{ affectedRows: 1 }];
      throw new Error(`不应继续查询: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      ensureDailyReviewToday('user-1', {
        calendar,
        db,
        loadCandidates: vi.fn().mockRejectedValue(new Error('candidate failed')),
        idFactory: () => sessionId,
      }),
    ).rejects.toThrow('candidate failed');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('首次会话 INSERT 的非唯一键错误不会被吞掉或进入赢家锁读', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('INSERT INTO daily_content_review_sessions')) {
        throw Object.assign(new Error('data too long'), { code: 'ER_DATA_TOO_LONG' });
      }
      throw new Error(`不应继续查询: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(ensureDailyReviewToday('user-1', { calendar, db, idFactory: () => sessionId })).rejects.toMatchObject({
      code: 'ER_DATA_TOO_LONG',
    });
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

describe('daily review item actions', () => {
  it('在取连接前拒绝非 UUID itemId', async () => {
    const db = { getConnection: vi.fn() };
    await expect(actOnDailyReviewItem('user-1', 'resource-id', 'open', { calendar, db })).rejects.toBeInstanceOf(
      DailyReviewError,
    );
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('只允许操作账号当天会话，并在同一事务原子返回更新后的 review', async () => {
    const connection = createConnection(async (sql, params) => {
      if (sql.includes('FROM daily_content_review_items i') && sql.includes('FOR UPDATE')) {
        expect(sql).toContain('s.review_date = ?');
        expect(params).toEqual([itemId, 'user-1', '2026-09-01']);
        return [
          [
            {
              id: itemId,
              sessionId,
              resourceType: 'bookmark',
              resourceId: 'bookmark-1',
              reasonCode: 'buried',
              reasonTagId: null,
              action: 'pending',
              sessionStatus: 'active',
              sessionItemCount: 1,
              sessionTimezone: 'Asia/Shanghai',
            },
          ],
        ];
      }
      if (sql.startsWith('SELECT id, url FROM bookmark')) {
        return [[{ id: 'bookmark-1', url: 'https://example.com' }]];
      }
      if (sql.includes('UPDATE daily_content_review_items')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 1, pending: 0 }]];
      if (sql.includes('UPDATE daily_content_review_sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM daily_content_review_sessions')) {
        return [[{ id: sessionId, timezone: 'Asia/Shanghai', status: 'completed', itemCount: 1, completedAt: 'now' }]];
      }
      if (sql.includes('SELECT hydrated.*')) return [[hydratedItem({ action: 'opened' })]];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection), query: vi.fn() };

    const result = await actOnDailyReviewItem('user-1', itemId, 'open', { calendar, db });

    expect(result.ok).toBe(true);
    expect(result.review.items[0].action).toBe('opened');
    expect(result.review.session.status).toBe('completed');
    expect(db.query).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('同一动作重试保持幂等，不重复写资源状态', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM daily_content_review_items i') && sql.includes('FOR UPDATE')) {
        return [
          [
            {
              id: itemId,
              sessionId,
              resourceType: 'bookmark',
              resourceId: 'bookmark-1',
              reasonCode: 'buried',
              action: 'opened',
              sessionStatus: 'skipped',
              sessionItemCount: 1,
              sessionCompletedAt: 'now',
              sessionTimezone: 'Asia/Shanghai',
            },
          ],
        ];
      }
      if (sql.includes('FROM daily_content_review_sessions')) {
        return [[{ id: sessionId, timezone: 'Asia/Shanghai', status: 'skipped', itemCount: 1, skippedAt: 'now' }]];
      }
      if (sql.includes('SELECT hydrated.*')) return [[hydratedItem({ action: 'opened' })]];
      throw new Error(`幂等重试不应执行 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(actOnDailyReviewItem('user-1', itemId, 'open', { calendar, db })).resolves.toMatchObject({ ok: true });

    const statements = connection.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.startsWith('SELECT id FROM bookmark'))).toBe(false);
    expect(statements.some((sql) => sql.includes('UPDATE daily_content_review_items'))).toBe(false);
  });

  it('资源恢复后处理最后一条时刷新完成时间，不沿用资源失效前的 completed_at', async () => {
    const completionUpdates = [];
    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM daily_content_review_items i') && sql.includes('FOR UPDATE')) {
        return [
          [
            {
              id: itemId,
              sessionId,
              resourceType: 'bookmark',
              resourceId: 'bookmark-1',
              reasonCode: 'buried',
              reasonTagId: null,
              action: 'pending',
              sessionStatus: 'completed',
              sessionItemCount: 1,
              sessionCompletedAt: '2026-09-01 08:00:00',
              sessionTimezone: 'Asia/Shanghai',
            },
          ],
        ];
      }
      if (sql.startsWith('SELECT id, url FROM bookmark')) {
        return [[{ id: 'bookmark-1', url: 'https://example.com' }]];
      }
      if (sql.includes('UPDATE daily_content_review_items')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT hydrated.*')) return [[hydratedItem({ action: 'opened' })]];
      if (sql.includes('UPDATE daily_content_review_sessions')) {
        completionUpdates.push(sql);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM daily_content_review_sessions')) {
        return [[{ id: sessionId, timezone: 'Asia/Shanghai', status: 'completed', itemCount: 1, completedAt: 'new' }]];
      }
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    const result = await actOnDailyReviewItem('user-1', itemId, 'open', { calendar, db });

    expect(result.review.session.completedAt).toBe('new');
    expect(completionUpdates).toHaveLength(1);
    expect(completionUpdates[0]).toContain('completed_at = NOW()');
    expect(completionUpdates[0]).not.toContain('COALESCE(completed_at, NOW())');
  });

  it('open_tag_space 仅允许 active_tag 原因，失败时回滚', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM daily_content_review_items i')) {
        return [
          [
            {
              id: itemId,
              sessionId,
              resourceType: 'bookmark',
              resourceId: 'bookmark-1',
              reasonCode: 'buried',
              action: 'pending',
              sessionStatus: 'active',
              sessionItemCount: 1,
            },
          ],
        ];
      }
      if (sql.startsWith('SELECT id, url FROM bookmark')) {
        return [[{ id: 'bookmark-1', url: 'https://example.com' }]];
      }
      throw new Error(`不应继续查询: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(actOnDailyReviewItem('user-1', itemId, 'open_tag_space', { calendar, db })).rejects.toMatchObject({
      code: 'DAILY_REVIEW_REASON_TAG_UNAVAILABLE',
    });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('历史畸形书签 URL 不会被记为 opened', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM daily_content_review_items i')) {
        return [
          [
            {
              id: itemId,
              sessionId,
              resourceType: 'bookmark',
              resourceId: 'bookmark-1',
              reasonCode: 'buried',
              action: 'pending',
              sessionStatus: 'active',
              sessionItemCount: 1,
            },
          ],
        ];
      }
      if (sql.startsWith('SELECT id, url FROM bookmark')) {
        return [[{ id: 'bookmark-1', url: 'https://user:password@example.com/private' }]];
      }
      throw new Error(`畸形 URL 不应继续查询: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(actOnDailyReviewItem('user-1', itemId, 'open', { calendar, db })).rejects.toMatchObject({
      code: 'DAILY_REVIEW_RESOURCE_UNAVAILABLE',
    });

    expect(connection.query.mock.calls.some(([sql]) => sql.includes('UPDATE daily_content_review_items'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('snooze_7d 不会通过 upsert 清空已有 dismissed_at', async () => {
    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM daily_content_review_items i')) {
        return [
          [
            {
              id: itemId,
              sessionId,
              resourceType: 'note',
              resourceId: 'note-1',
              reasonCode: 'buried',
              action: 'pending',
              sessionStatus: 'active',
              sessionItemCount: 1,
            },
          ],
        ];
      }
      if (sql.startsWith('SELECT id FROM note')) return [[{ id: 'note-1' }]];
      if (sql.includes('INSERT INTO growth_recap_state')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE daily_content_review_items')) return [{ affectedRows: 1 }];
      if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 1, pending: 0 }]];
      if (sql.includes('UPDATE daily_content_review_sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM daily_content_review_sessions')) {
        return [[{ id: sessionId, timezone: 'Asia/Shanghai', status: 'completed', itemCount: 1 }]];
      }
      if (sql.includes('SELECT hydrated.*')) return [[hydratedItem({ resourceType: 'note', action: 'snoozed' })]];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    await actOnDailyReviewItem('user-1', itemId, 'snooze_7d', { calendar, db });

    const recapSql = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO growth_recap_state'))[0];
    const duplicateClause = recapSql.split('ON DUPLICATE KEY UPDATE')[1];
    expect(duplicateClause).toContain('growth_recap_state.dismissed_at IS NULL');
    expect(duplicateClause).not.toContain('dismissed_at =');
  });
});

describe('daily review session actions', () => {
  it('资源恢复让持久 completed 派生为 active 后，skip_today 仍能收起会话', async () => {
    let sessionReads = 0;
    const connection = createConnection(async (sql) => {
      if (sql.includes('FROM daily_content_review_sessions')) {
        sessionReads += 1;
        return [
          [
            sessionReads === 1
              ? { id: sessionId, timezone: 'Asia/Shanghai', status: 'completed', itemCount: 1, completedAt: 'old' }
              : { id: sessionId, timezone: 'Asia/Shanghai', status: 'skipped', itemCount: 1, skippedAt: 'now' },
          ],
        ];
      }
      if (sql.includes('SELECT hydrated.*')) return [[hydratedItem({ action: 'pending' })]];
      if (sql.includes("SET status = 'skipped'")) return [{ affectedRows: 1 }];
      throw new Error(`未覆盖的测试 SQL: ${sql}`);
    });
    const db = { getConnection: vi.fn().mockResolvedValue(connection) };

    const result = await actOnDailyReviewToday('user-1', 'skip_today', { calendar, db });

    expect(result.review.session.status).toBe('skipped');
    expect(connection.query.mock.calls.some(([sql]) => sql.includes("SET status = 'skipped'"))).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});
