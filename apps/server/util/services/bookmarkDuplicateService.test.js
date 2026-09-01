import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  action: null,
  candidates: [],
  guards: new Map(),
  members: [],
  tags: [],
}));

const connection = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  query: vi.fn(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    if (text.includes('FROM organize_action_requests')) return [[state.action].filter(Boolean)];
    if (text.startsWith('INSERT INTO organize_action_requests')) {
      state.action = {
        actionType: 'duplicate.resolve',
        payloadHash: params[2],
        status: 'pending',
        responseJson: null,
      };
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('UPDATE organize_action_requests')) {
      state.action = {
        ...state.action,
        status: 'succeeded',
        responseJson: params[0],
      };
      return [{ affectedRows: 1 }];
    }
    if (text.startsWith('SELECT groups.*')) return [state.candidates];
    if (text.includes('LOWER(HEX(url_exact_hash)) AS groupKey')) return [state.members];
    if (text.startsWith('SELECT id, name, url')) return [state.members];
    if (text.includes('FROM resource_tag_relations')) return [state.tags];
    throw new Error(`UNEXPECTED_QUERY:${text.slice(0, 100)}`);
  }),
}));

const pool = vi.hoisted(() => ({ getConnection: vi.fn(() => connection) }));
const queryBookmarkRelationGuards = vi.hoisted(() => vi.fn(async () => state.guards));
const mergeBookmarkTags = vi.hoisted(() => vi.fn(async () => 2));
const softDeleteResources = vi.hoisted(() =>
  vi.fn(async (_db, { items }) => ({
    affectedItemCount: items.length,
    sideEffects: { userId: 'user-1', bookmarkIcons: [], invalidateSearch: true },
  })),
);
const runResourceDeleteSideEffects = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('./bookmarkRelationGuardService.js', () => ({ queryBookmarkRelationGuards }));
vi.mock('./resourceTagWriteService.js', () => ({ mergeBookmarkTags }));
vi.mock('./resourceDeleteService.js', () => ({ softDeleteResources, runResourceDeleteSideEffects }));
vi.mock('./organizeSuppressionService.js', () => ({
  ORGANIZE_SUPPRESSION_TYPES: { DUPLICATE: 'duplicate.ignore' },
  deleteOrganizeSuppression: vi.fn(async () => ({ removed: false })),
  queryOrganizeSuppressions: vi.fn(async () => new Map()),
  upsertOrganizeSuppression: vi.fn(async (_db, value) => value),
}));

const { getDuplicateBookmarkPreview, listDuplicateBookmarkGroups, resolveDuplicateBookmarkGroup } = await import(
  './bookmarkDuplicateService.js'
);

function exactKey(url) {
  return crypto.createHash('sha256').update(Buffer.from(url, 'utf8')).digest('hex');
}

function emptyGuard(overrides = {}) {
  return {
    snapshot: 0,
    noteReference: 0,
    todoReference: 0,
    todoSeriesReference: 0,
    blockers: [],
    blockerCount: 0,
    ...overrides,
  };
}

describe('bookmarkDuplicateService', () => {
  const url = 'https://example.com/exact';
  const groupKey = exactKey(url);

  beforeEach(() => {
    vi.clearAllMocks();
    state.action = null;
    state.candidates = [];
    state.members = [
      { id: 'bookmark-1', name: '较早', url, createdAt: '2026-01-01 00:00:00', updatedAt: null, delFlag: 0 },
      { id: 'bookmark-2', name: '带快照', url, createdAt: '2026-02-01 00:00:00', updatedAt: null, delFlag: 0 },
    ];
    state.tags = [{ bookmarkId: 'bookmark-1', id: 'tag-1', name: '资料' }];
    state.guards = new Map([
      ['bookmark-1', emptyGuard()],
      [
        'bookmark-2',
        emptyGuard({
          snapshot: 1,
          blockerCount: 1,
          blockers: [{ code: 'snapshot', label: '网页快照', count: 1 }],
        }),
      ],
    ]);
    connection.beginTransaction.mockResolvedValue(undefined);
    connection.commit.mockResolvedValue(undefined);
    connection.rollback.mockResolvedValue(undefined);
  });

  it('预览优先推荐保留带关系的成员，并只允许删除无阻断项', async () => {
    const preview = await getDuplicateBookmarkPreview(connection, { userId: 'user-1', groupKey });

    expect(preview).toMatchObject({
      groupKey,
      memberCount: 2,
      recommendedKeepBookmarkId: 'bookmark-2',
      canResolve: true,
      contextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(preview.members.find((item) => item.id === 'bookmark-2')?.guard.blockerCount).toBe(1);
  });

  it('关系注册表异常时不生成可删除预览', async () => {
    queryBookmarkRelationGuards.mockRejectedValueOnce(new Error('guard registry unavailable'));
    await expect(getDuplicateBookmarkPreview(connection, { userId: 'user-1', groupKey })).rejects.toThrow(
      'guard registry unavailable',
    );
  });

  it('列表批量读取多个分组的成员与关系，不按组重复查询', async () => {
    const secondUrl = 'https://example.com/second';
    const secondGroupKey = exactKey(secondUrl);
    state.candidates = [
      { group_key: groupKey, updated_at: '2026-08-31 12:00:00' },
      { group_key: secondGroupKey, updated_at: '2026-08-30 12:00:00' },
    ];
    state.members = [
      ...state.members.map((member) => ({ ...member, groupKey })),
      { id: 'bookmark-3', name: '第二组 A', url: secondUrl, createdAt: '2026-03-01', groupKey: secondGroupKey },
      { id: 'bookmark-4', name: '第二组 B', url: secondUrl, createdAt: '2026-04-01', groupKey: secondGroupKey },
    ];
    state.guards = new Map(state.members.map((member) => [member.id, emptyGuard()]));

    const result = await listDuplicateBookmarkGroups(connection, { userId: 'user-1', limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.groupKey)).toEqual([groupKey, secondGroupKey]);
    expect(queryBookmarkRelationGuards).toHaveBeenCalledTimes(1);
    const memberQueries = connection.query.mock.calls.filter(([sql]) =>
      String(sql).includes('LOWER(HEX(url_exact_hash)) AS groupKey'),
    );
    expect(memberQueries).toHaveLength(1);
  });

  it('解决动作在事务内复核上下文、合并标签并软删除，重试返回同一结果', async () => {
    const preview = await getDuplicateBookmarkPreview(connection, { userId: 'user-1', groupKey });
    const payload = {
      keepBookmarkId: 'bookmark-2',
      deleteBookmarkIds: ['bookmark-1'],
      mergeTags: true,
      expectedContextHash: preview.contextHash,
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    };

    const first = await resolveDuplicateBookmarkGroup({ userId: 'user-1', groupKey, payload });
    const replay = await resolveDuplicateBookmarkGroup({ userId: 'user-1', groupKey, payload });

    expect(first).toMatchObject({ deletedBookmarkIds: ['bookmark-1'], deletedCount: 1, idempotentReplay: false });
    expect(replay).toMatchObject({ deletedBookmarkIds: ['bookmark-1'], deletedCount: 1, idempotentReplay: true });
    expect(mergeBookmarkTags).toHaveBeenCalledTimes(1);
    expect(softDeleteResources).toHaveBeenCalledTimes(1);
    expect(queryBookmarkRelationGuards).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ userId: 'user-1', lock: true }),
    );
    expect(connection.commit).toHaveBeenCalledTimes(2);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('选择会删除有引用成员的保留项时阻断整个事务', async () => {
    const preview = await getDuplicateBookmarkPreview(connection, { userId: 'user-1', groupKey });

    await expect(
      resolveDuplicateBookmarkGroup({
        userId: 'user-1',
        groupKey,
        payload: {
          keepBookmarkId: 'bookmark-1',
          deleteBookmarkIds: ['bookmark-2'],
          mergeTags: true,
          expectedContextHash: preview.contextHash,
          clientRequestId: '123e4567-e89b-42d3-a456-426614174001',
        },
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_GROUP_BLOCKED', status: 409 });
    expect(softDeleteResources).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('合并后超过书签四标签上限时拒绝删除，用户仍可取消标签合并后重试', async () => {
    state.tags = [
      { bookmarkId: 'bookmark-1', id: 'tag-1', name: '一' },
      { bookmarkId: 'bookmark-1', id: 'tag-2', name: '二' },
      { bookmarkId: 'bookmark-1', id: 'tag-3', name: '三' },
      { bookmarkId: 'bookmark-2', id: 'tag-4', name: '四' },
      { bookmarkId: 'bookmark-2', id: 'tag-5', name: '五' },
    ];
    const preview = await getDuplicateBookmarkPreview(connection, { userId: 'user-1', groupKey });

    await expect(
      resolveDuplicateBookmarkGroup({
        userId: 'user-1',
        groupKey,
        payload: {
          keepBookmarkId: 'bookmark-2',
          deleteBookmarkIds: ['bookmark-1'],
          mergeTags: true,
          expectedContextHash: preview.contextHash,
          clientRequestId: '123e4567-e89b-42d3-a456-426614174002',
        },
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_TAG_LIMIT_EXCEEDED',
      status: 409,
      details: { tagCount: 5, maxTagCount: 4 },
    });
    expect(mergeBookmarkTags).not.toHaveBeenCalled();
    expect(softDeleteResources).not.toHaveBeenCalled();
  });
});
