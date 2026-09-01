import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  healthRows: [],
  queryPendingCount: vi.fn(),
  listInboxResources: vi.fn(),
  getHealthSummary: vi.fn(),
  listBookmarkHealthIssues: vi.fn(),
  getDuplicateBookmarkSummary: vi.fn(),
  getUntaggedSummary: vi.fn(),
  listUntaggedResources: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  default: {
    query: vi.fn(async () => [mocks.healthRows]),
  },
}));
vi.mock('../resourceInbox.js', () => ({
  queryPendingCount: mocks.queryPendingCount,
  listInboxResources: mocks.listInboxResources,
}));
vi.mock('../linkHealth.js', () => ({
  getHealthSummary: mocks.getHealthSummary,
  listBookmarkHealthIssues: mocks.listBookmarkHealthIssues,
}));
vi.mock('./bookmarkDuplicateService.js', () => ({
  getDuplicateBookmarkSummary: mocks.getDuplicateBookmarkSummary,
}));
vi.mock('./resourceInventoryService.js', () => ({
  getUntaggedSummary: mocks.getUntaggedSummary,
  listUntaggedResources: mocks.listUntaggedResources,
}));

const { getOrganizeSummary } = await import('./organizeSummaryService.js');

describe('organizeSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.healthRows = [
      { id: 'bookmark-2', checkedAt: '2026-08-31 12:00:00' },
      { id: 'bookmark-3', checkedAt: '2026-08-31 11:00:00' },
    ];
    mocks.queryPendingCount.mockResolvedValue({
      pendingTotal: 7,
      typeTotals: { bookmark: 3, note: 2, file: 2 },
    });
    mocks.listInboxResources.mockResolvedValue({
      items: [
        {
          resourceType: 'bookmark',
          resourceId: 'pending-1',
          title: '待读书签',
          source: 'quick_capture',
          collectedAt: '2026-09-01 08:00:00',
          resourceCreatedAt: '2026-08-30 08:00:00',
        },
      ],
      nextCursor: 'pending-page-2',
    });
    mocks.getUntaggedSummary.mockResolvedValue({
      findingCount: 2,
      affectedResourceCount: 2,
      resourceKeys: ['bookmark:bookmark-1', 'note:note-1'],
      exact: true,
      hasMore: false,
    });
    mocks.listUntaggedResources.mockResolvedValue({
      items: [
        {
          resourceType: 'note',
          resourceId: 'note-1',
          title: '无标签笔记',
          summary: '不应进入总览响应的正文摘要',
          url: 'https://example.com/private-preview-detail',
        },
      ],
      hasMore: false,
    });
    mocks.getDuplicateBookmarkSummary.mockResolvedValue({
      groupCount: 1,
      findingCount: 1,
      affectedResourceCount: 2,
      resourceKeys: ['bookmark:bookmark-1', 'bookmark:bookmark-2'],
      previewItems: [{ groupKey: 'duplicate-1', url: 'https://example.com', memberCount: 2 }],
      previewHasMore: false,
      exact: true,
      hasMore: false,
    });
    mocks.getHealthSummary.mockResolvedValue({
      suspectCount: 2,
      checked: 5,
      total: 8,
      alive: 2,
      unknown: 1,
      userNormal: 1,
      unchecked: 3,
      running: true,
      runId: 'health-run-1',
      runStatus: 'running',
      startedAt: '2026-08-31 10:00:00',
      completedAt: null,
      lastCheckedAt: '2026-08-31 12:00:00',
    });
    mocks.listBookmarkHealthIssues.mockResolvedValue({
      items: [
        {
          id: 'bookmark-2',
          name: '疑似失效书签',
          url: 'https://example.com/missing',
          observedCode: '404',
          checkedAt: '2026-08-31 12:00:00',
          effectiveStatus: 'suspect',
          hasSnapshot: false,
        },
      ],
      hasMore: true,
    });
  });

  it('待整理保持独立口径，治理总数按问题相加、受影响资源跨问题去重', async () => {
    const result = await getOrganizeSummary('user-1');

    expect(result.pendingShortcut).toMatchObject({ count: 7, route: '/organize?issue=pending' });
    expect(result.totals).toEqual({
      affectedResourceTotal: 4,
      findingTotal: 5,
      exact: true,
      hasMore: false,
    });
    expect(result.issues.bookmarkHealth).toMatchObject({
      findingCount: 2,
      exact: true,
      hasMore: false,
      coverage: { checked: 5, total: 8 },
      alive: 2,
      unknownCount: 1,
      userNormalCount: 1,
      unchecked: 3,
      running: true,
      runId: 'health-run-1',
      runStatus: 'running',
    });
    expect(result.previews).toEqual({
      pending: {
        state: 'ready',
        items: [
          {
            resourceType: 'bookmark',
            resourceId: 'pending-1',
            title: '待读书签',
            source: 'quick_capture',
            collectedAt: '2026-09-01 08:00:00',
          },
        ],
        hasMore: true,
        errorCode: null,
      },
      untagged: {
        state: 'ready',
        items: [{ resourceType: 'note', resourceId: 'note-1', title: '无标签笔记', updatedAt: null }],
        hasMore: false,
        errorCode: null,
      },
      duplicateBookmark: {
        state: 'ready',
        items: [{ groupKey: 'duplicate-1', url: 'https://example.com', memberCount: 2 }],
        hasMore: false,
        errorCode: null,
      },
      bookmarkHealth: {
        state: 'ready',
        items: [
          {
            id: 'bookmark-2',
            name: '疑似失效书签',
            observedCode: '404',
            checkedAt: '2026-08-31 12:00:00',
          },
        ],
        hasMore: true,
        errorCode: null,
      },
    });
    expect(mocks.listInboxResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        limit: 5,
        view: 'summary',
        includeTotal: false,
        includeCounts: false,
      }),
    );
    expect(mocks.listUntaggedResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1', limit: 3 }),
    );
    expect(mocks.getDuplicateBookmarkSummary).toHaveBeenCalledTimes(1);
    expect(mocks.listBookmarkHealthIssues).toHaveBeenCalledWith('user-1', { limit: 3 });
    expect(mocks.getHealthSummary).toHaveBeenCalledWith('user-1', { includeSuspect: false });
    expect(JSON.stringify(result.previews)).not.toContain('private-preview-detail');
    expect(JSON.stringify(result.previews)).not.toContain('不应进入总览响应的正文摘要');
  });

  it('单类治理查询失败时保留其他结果并显式标记部分不可用', async () => {
    mocks.getDuplicateBookmarkSummary.mockRejectedValueOnce(new Error('duplicate unavailable'));

    const result = await getOrganizeSummary('user-1');

    expect(result.issues.duplicateBookmark).toMatchObject({
      state: 'error',
      findingCount: null,
      errorCode: 'DUPLICATE_SUMMARY_FAILED',
    });
    expect(result.previews.duplicateBookmark).toEqual({
      state: 'error',
      items: [],
      hasMore: false,
      errorCode: 'DUPLICATE_PREVIEW_FAILED',
    });
    expect(result.issues.untagged.state).toBe('ready');
    expect(result.totals).toMatchObject({ findingTotal: 4, exact: false, hasMore: true });
  });

  it('即使底层服务异常多返回，单请求总览仍严格限制各类预览数量', async () => {
    mocks.listInboxResources.mockResolvedValueOnce({
      items: Array.from({ length: 6 }, (_, index) => ({
        resourceType: 'note',
        resourceId: `pending-${index}`,
        title: `待整理 ${index}`,
        source: 'manual',
        collectedAt: '2026-09-01 08:00:00',
      })),
      hasMore: false,
    });
    mocks.listUntaggedResources.mockResolvedValueOnce({
      items: Array.from({ length: 4 }, (_, index) => ({ resourceType: 'note', resourceId: `note-${index}` })),
      hasMore: false,
    });
    mocks.getDuplicateBookmarkSummary.mockResolvedValueOnce({
      groupCount: 4,
      findingCount: 4,
      affectedResourceCount: 8,
      resourceKeys: Array.from({ length: 8 }, (_, index) => `bookmark:duplicate-${index}`),
      previewItems: Array.from({ length: 4 }, (_, index) => ({ groupKey: `group-${index}`, memberCount: 2 })),
      previewHasMore: true,
      exact: true,
      hasMore: false,
    });
    mocks.listBookmarkHealthIssues.mockResolvedValueOnce({
      items: Array.from({ length: 4 }, (_, index) => ({ id: `bookmark-${index}` })),
      hasMore: false,
    });

    const result = await getOrganizeSummary('user-1');

    expect(result.previews.pending).toMatchObject({ state: 'ready', hasMore: true });
    expect(result.previews.pending.items).toHaveLength(5);
    expect(result.previews.untagged).toMatchObject({ state: 'ready', hasMore: true });
    expect(result.previews.untagged.items).toHaveLength(3);
    expect(result.previews.duplicateBookmark).toMatchObject({ state: 'ready', hasMore: true });
    expect(result.previews.duplicateBookmark.items).toHaveLength(3);
    expect(result.previews.bookmarkHealth).toMatchObject({ state: 'ready', hasMore: true });
    expect(result.previews.bookmarkHealth.items).toHaveLength(3);
  });

  it('独立列表预览失败时不影响摘要，并用错误态区别于空列表', async () => {
    mocks.listInboxResources.mockRejectedValueOnce(new Error('pending preview unavailable'));
    mocks.listUntaggedResources.mockRejectedValueOnce(new Error('untagged preview unavailable'));
    mocks.listBookmarkHealthIssues.mockRejectedValueOnce(new Error('health preview unavailable'));

    const result = await getOrganizeSummary('user-1');

    expect(result.pendingShortcut).toMatchObject({ state: 'ready', count: 7 });
    expect(result.issues.untagged.state).toBe('ready');
    expect(result.issues.duplicateBookmark.state).toBe('ready');
    expect(result.issues.bookmarkHealth.state).toBe('ready');
    expect(result.previews).toEqual({
      pending: {
        state: 'error',
        items: [],
        hasMore: false,
        errorCode: 'PENDING_PREVIEW_FAILED',
      },
      untagged: {
        state: 'error',
        items: [],
        hasMore: false,
        errorCode: 'UNTAGGED_PREVIEW_FAILED',
      },
      duplicateBookmark: {
        state: 'ready',
        items: [{ groupKey: 'duplicate-1', url: 'https://example.com', memberCount: 2 }],
        hasMore: false,
        errorCode: null,
      },
      bookmarkHealth: {
        state: 'error',
        items: [],
        hasMore: false,
        errorCode: 'BOOKMARK_HEALTH_PREVIEW_FAILED',
      },
    });
  });

  it('合法空预览保持 ready 态，不会被误判为加载失败', async () => {
    mocks.listInboxResources.mockResolvedValueOnce({ items: [], nextCursor: null });
    mocks.listUntaggedResources.mockResolvedValueOnce({ items: [], hasMore: false });
    mocks.getDuplicateBookmarkSummary.mockResolvedValueOnce({
      groupCount: 0,
      findingCount: 0,
      affectedResourceCount: 0,
      resourceKeys: [],
      previewItems: [],
      previewHasMore: false,
      exact: true,
      hasMore: false,
    });
    mocks.listBookmarkHealthIssues.mockResolvedValueOnce({ items: [], hasMore: false });

    const result = await getOrganizeSummary('user-1');

    Object.values(result.previews).forEach((preview) => {
      expect(preview).toEqual({ state: 'ready', items: [], hasMore: false, errorCode: null });
    });
  });

  it('健康问题聚合数保持精确，跨问题去重键截断只让总资源数显示下界', async () => {
    mocks.healthRows = Array.from({ length: 5001 }, (_, index) => ({
      id: `bookmark-${index}`,
      checkedAt: '2026-08-31 12:00:00',
    }));
    mocks.getUntaggedSummary.mockResolvedValue({
      findingCount: 0,
      affectedResourceCount: 0,
      resourceKeys: [],
      exact: true,
      hasMore: false,
    });
    mocks.getDuplicateBookmarkSummary.mockResolvedValue({
      groupCount: 0,
      findingCount: 0,
      affectedResourceCount: 0,
      resourceKeys: [],
      previewItems: [],
      previewHasMore: false,
      exact: true,
      hasMore: false,
    });
    mocks.getHealthSummary.mockResolvedValue({ suspectCount: 6000, checked: 6000, total: 6000 });

    const result = await getOrganizeSummary('user-1');

    expect(result.issues.bookmarkHealth).toMatchObject({ findingCount: 6000, exact: true, hasMore: false });
    expect(result.totals).toMatchObject({ affectedResourceTotal: 5000, exact: false, hasMore: true });
  });
});
