import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolvePersonalKnowledgeResourceMetadata = vi.fn();

vi.mock('../personalKnowledgeSearch.js', () => ({ resolvePersonalKnowledgeResourceMetadata }));
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));

const {
  addToolboxWorkspaceResources,
  createToolboxWorkspaceItem,
  calculateWorkspaceStreak,
  createToolboxWorkspaceSession,
  listToolboxHomeWorkspaces,
  listToolboxWorkspaces,
  markToolboxWorkspaceOpened,
  toolboxWorkspaceInternals,
} = await import('./workspace.js');

beforeEach(() => {
  vi.clearAllMocks();
  resolvePersonalKnowledgeResourceMetadata.mockResolvedValue([]);
});

describe('工具箱持续工作区', () => {
  it('我的项目可省略模板，但所有聚合仍限定当前账号', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    await listToolboxWorkspaces({ userId: 'owner', database });
    expect(database.query.mock.calls[0][1]).toEqual(['owner', 'owner', 'owner']);
    expect(database.query.mock.calls[0][0]).not.toContain('AND w.kind = ?');
    await expect(listToolboxWorkspaces({ userId: 'owner', kind: 'invalid', database })).rejects.toMatchObject({
      code: 'TOOLBOX_WORKSPACE_FIELD_INVALID',
    });
  });
  it('连续推进允许今天或昨天作为最近一天，但会在断档处停止', () => {
    const today = new Date('2026-08-29T08:00:00Z');
    expect(calculateWorkspaceStreak(['2026-08-29', '2026-08-28', '2026-08-27'], today)).toBe(3);
    expect(calculateWorkspaceStreak(['2026-08-28', '2026-08-27'], today)).toBe(2);
    expect(calculateWorkspaceStreak(['2026-08-29', '2026-08-27'], today)).toBe(1);
    expect(calculateWorkspaceStreak(['2026-08-26'], today)).toBe(0);
  });

  it('资料引用去重、限制类型，并且只保留有界标题元数据', () => {
    expect(
      toolboxWorkspaceInternals.normalizeResourceRefs([
        { type: 'note', id: 'note-1', title: ' 第一篇 ' },
        { type: 'note', id: 'note-1', title: '重复项' },
        { type: 'file', id: 'file-1', title: '资料.pdf' },
      ]),
    ).toEqual([
      { type: 'note', id: 'note-1', title: '第一篇' },
      { type: 'file', id: 'file-1', title: '资料.pdf' },
    ]);
    expect(() => toolboxWorkspaceInternals.normalizeResourceRefs([{ type: 'todo', id: 'todo-1' }])).toThrowError(
      expect.objectContaining({ code: 'TOOLBOX_WORKSPACE_FIELD_INVALID' }),
    );
  });

  it('工作区列表始终按当前用户和模板过滤，并返回推进统计', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'workspace-1',
            kind: 'research',
            title: '浏览器知识库调研',
            status: 'active',
            resource_count: 6,
            open_item_count: 3,
            completed_item_count: 2,
            create_time: '2026-08-20T00:00:00.000Z',
            updated_at: '2026-08-29T00:00:00.000Z',
          },
        ],
      ]),
    };
    const result = await listToolboxWorkspaces({ userId: 'user-1', kind: 'research', database });
    expect(result[0]).toMatchObject({
      id: 'workspace-1',
      kind: 'research',
      resourceCount: 6,
      openItemCount: 3,
      completedItemCount: 2,
    });
    expect(database.query.mock.calls[0][1]).toEqual(['user-1', 'user-1', 'user-1', 'research']);
  });

  it('首页待继续按行动状态聚合，最近用过按真实时间独立排序', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'completed-1',
            kind: 'writing',
            title: '已完成文章',
            status: 'completed',
            next_step: '',
            resource_count: 2,
            open_item_count: 0,
            completed_item_count: 3,
            last_opened_at: '2026-08-30T09:00:00.000Z',
            updated_at: '2026-08-30T09:00:00.000Z',
          },
          {
            id: 'paused-1',
            kind: 'learning',
            title: '学习专题',
            status: 'paused',
            next_step: '复习第三章',
            resource_count: 4,
            open_item_count: 1,
            completed_item_count: 2,
            last_opened_at: '2026-08-30T08:00:00.000Z',
            updated_at: '2026-08-30T08:00:00.000Z',
          },
          {
            id: 'active-1',
            kind: 'research',
            title: '浏览器知识库调研',
            status: 'active',
            next_step: '核验关键结论',
            resource_count: 6,
            open_item_count: 3,
            completed_item_count: 2,
            last_opened_at: '2026-08-29T08:00:00.000Z',
            updated_at: '2026-08-29T08:00:00.000Z',
          },
        ],
      ]),
    };

    const result = await listToolboxHomeWorkspaces({ userId: 'user-1', database });

    expect(result.continue.map((item) => item.id)).toEqual(['active-1']);
    expect(result.recent.map((item) => item.id)).toEqual(['completed-1', 'paused-1', 'active-1']);
    expect(result.recent.map((item) => item.id)).toEqual(expect.arrayContaining(['paused-1', 'active-1']));
    expect(result.continue[0]).toEqual({
      id: 'active-1',
      kind: 'research',
      title: '浏览器知识库调研',
      status: 'active',
      nextStep: '核验关键结论',
      resourceCount: 6,
      openItemCount: 3,
      completedItemCount: 2,
      lastOpenedAt: '2026-08-29T08:00:00.000Z',
      updatedAt: '2026-08-29T08:00:00.000Z',
    });
    expect(result.continue[0]).not.toHaveProperty('description');
    expect(result.continue[0]).not.toHaveProperty('goal');
    expect(database.query.mock.calls[0][0]).not.toContain('w.*');
    expect(database.query.mock.calls[0][1]).toEqual(['user-1', 'user-1', 'user-1']);
  });

  it('打开工作区只按所有者触碰最近打开时间，并以五分钟窗口节流', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([
          [
            {
              id: 'workspace-1',
              kind: 'research',
              title: '浏览器知识库调研',
              status: 'active',
              next_step: '继续核验',
              resource_count: 5,
              open_item_count: 2,
              completed_item_count: 1,
              last_opened_at: '2026-08-30T10:00:00.000Z',
              updated_at: '2026-08-29T10:00:00.000Z',
            },
          ],
        ]),
    };

    await expect(
      markToolboxWorkspaceOpened({ userId: 'user-1', workspaceId: 'workspace-1', database }),
    ).resolves.toMatchObject({ id: 'workspace-1', lastOpenedAt: '2026-08-30T10:00:00.000Z' });
    expect(database.query.mock.calls[0][0]).toContain('INTERVAL 5 MINUTE');
    expect(database.query.mock.calls[0][0]).toContain('updated_at = updated_at');
    expect(database.query.mock.calls[0][1]).toEqual(['workspace-1', 'user-1']);
    expect(database.query.mock.calls[1][1]).toEqual(['workspace-1', 'user-1']);
  });

  it('加入资料前必须重新验证当前归属与版本，失败时不写入', async () => {
    resolvePersonalKnowledgeResourceMetadata.mockResolvedValueOnce([]);
    const database = {
      query: vi.fn().mockResolvedValueOnce([[{ id: 'workspace-1', user_id: 'user-1' }]]),
    };
    await expect(
      addToolboxWorkspaceResources({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        resourceRefs: [{ type: 'note', id: 'note-1', title: '第一篇' }],
        database,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_WORKSPACE_RESOURCE_UNAVAILABLE' });
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it('加入资料时锁定工作区父行，避免并发请求绕过单工作区上限', async () => {
    resolvePersonalKnowledgeResourceMetadata.mockResolvedValueOnce([
      { type: 'note', id: 'note-1', version: 'v1', title: '权威标题' },
    ]);
    const workspaceRow = {
      id: 'workspace-1',
      user_id: 'user-1',
      kind: 'research',
      title: '并发边界检查',
      status: 'active',
      create_time: '2026-08-20T00:00:00.000Z',
      updated_at: '2026-08-29T00:00:00.000Z',
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'workspace-1' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi
        .fn()
        .mockResolvedValueOnce([[workspaceRow]])
        .mockResolvedValueOnce([[workspaceRow]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]),
    };

    await addToolboxWorkspaceResources({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      resourceRefs: [{ type: 'note', id: 'note-1', title: '第一篇' }],
      database,
    });

    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(resolvePersonalKnowledgeResourceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ database: connection, lockForShare: true }),
    );
    expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO toolbox_workspace_resources');
    expect(connection.query.mock.calls[2][1].at(-1)).toBe('权威标题');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('结束一次推进必须至少记录本次进展或下一步', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce([[{ id: 'workspace-1', user_id: 'user-1' }]]),
    };
    await expect(
      createToolboxWorkspaceSession({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        input: {},
        database,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_WORKSPACE_SESSION_EMPTY' });
  });
});

describe('project material atomic limits', () => {
  it.each(['completed', 'archived'])('rejects adding to a %s project before reading sources', async (status) => {
    const query = vi.fn().mockResolvedValue([[{ id: 'w', status }]]);
    await expect(
      addToolboxWorkspaceResources({
        userId: 'owner',
        workspaceId: 'w',
        resourceRefs: [{ type: 'note', id: 'n' }],
        database: { query },
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_WORKSPACE_UNAVAILABLE' });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'deduplicates a full project or rejects the entire extra batch (duplicate=%s)',
    async (duplicate) => {
      const id = duplicate ? 'n0' : 'extra';
      resolvePersonalKnowledgeResourceMetadata.mockResolvedValueOnce([
        { type: 'note', id, version: 'v1', title: 'Note' },
      ]);
      const connection = {
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
        query: vi
          .fn()
          .mockResolvedValueOnce([[{ id: 'w', status: 'active' }]])
          .mockResolvedValueOnce([
            Array.from({ length: 100 }, (_, i) => ({ resource_type: 'note', resource_id: `n${i}` })),
          ]),
      };
      const database = {
        getConnection: async () => connection,
        query: vi.fn(async (sql) => [
          sql.includes('FROM toolbox_workspaces') ? [{ id: 'w', kind: 'research', status: 'active' }] : [],
        ]),
      };
      const operation = addToolboxWorkspaceResources({
        userId: 'owner',
        workspaceId: 'w',
        resourceRefs: [{ type: 'note', id }],
        database,
      });
      if (duplicate) {
        await expect(operation).resolves.toMatchObject({ id: 'w' });
        expect(connection.commit).toHaveBeenCalledOnce();
      } else {
        await expect(operation).rejects.toMatchObject({ code: 'TOOLBOX_WORKSPACE_RESOURCE_LIMIT' });
        expect(connection.rollback).toHaveBeenCalledOnce();
      }
      expect(connection.query).toHaveBeenCalledTimes(2);
      expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
    },
  );
});

 describe('学习知识创建状态', () => {
  it.each([['learning', 'knowledge', 'done'], ['learning', 'inbox', 'open'], ['learning', 'action', 'open'], ['research', 'knowledge', 'done'], ['writing', 'knowledge', 'done']])('%s / %s 创建为 %s', async (kind, lane, status) => {
    const database = { query: vi.fn(async (sql) => {
      if (sql.includes('FROM toolbox_workspaces')) return [[{ id: 'workspace-1', user_id: 'owner', kind, status: 'active' }]];
      if (sql.includes('COUNT(*)')) return [[{ total: 0 }]];
      if (sql.includes('MAX(position)')) return [[{ next_position: 0 }]];
      return [[]];
    }) };
    await createToolboxWorkspaceItem({ userId: 'owner', workspaceId: 'workspace-1', input: { lane, title: '知识' }, database });
    const insert = database.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO toolbox_workspace_items'));
    expect(insert[1][6]).toBe(status);
    expect(Boolean(insert[1][9])).toBe(status === 'done');
    expect(insert[1].slice(1, 4)).toEqual(['workspace-1', 'owner', lane]);
  });
 });
