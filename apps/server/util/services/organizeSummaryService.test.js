import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  healthRows: [],
  queryPendingCount: vi.fn(),
  getHealthSummary: vi.fn(),
  getDuplicateBookmarkSummary: vi.fn(),
  getUntaggedSummary: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  default: {
    query: vi.fn(async () => [mocks.healthRows]),
  },
}));
vi.mock('../resourceInbox.js', () => ({ queryPendingCount: mocks.queryPendingCount }));
vi.mock('../linkHealth.js', () => ({ getHealthSummary: mocks.getHealthSummary }));
vi.mock('./bookmarkDuplicateService.js', () => ({
  getDuplicateBookmarkSummary: mocks.getDuplicateBookmarkSummary,
}));
vi.mock('./resourceInventoryService.js', () => ({ getUntaggedSummary: mocks.getUntaggedSummary }));

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
    mocks.getUntaggedSummary.mockResolvedValue({
      findingCount: 2,
      affectedResourceCount: 2,
      resourceKeys: ['bookmark:bookmark-1', 'note:note-1'],
      exact: true,
      hasMore: false,
    });
    mocks.getDuplicateBookmarkSummary.mockResolvedValue({
      groupCount: 1,
      findingCount: 1,
      affectedResourceCount: 2,
      resourceKeys: ['bookmark:bookmark-1', 'bookmark:bookmark-2'],
      exact: true,
      hasMore: false,
    });
    mocks.getHealthSummary.mockResolvedValue({
      suspectCount: 2,
      checked: 5,
      total: 8,
      unknown: 1,
      userNormal: 1,
      lastCheckedAt: '2026-08-31 12:00:00',
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
    expect(result.issues.bookmarkHealth).toMatchObject({ findingCount: 2, exact: true, hasMore: false });
    expect(mocks.getHealthSummary).toHaveBeenCalledWith('user-1', { includeSuspect: false });
  });

  it('单类治理查询失败时保留其他结果并显式标记部分不可用', async () => {
    mocks.getDuplicateBookmarkSummary.mockRejectedValueOnce(new Error('duplicate unavailable'));

    const result = await getOrganizeSummary('user-1');

    expect(result.issues.duplicateBookmark).toMatchObject({
      state: 'error',
      findingCount: null,
      errorCode: 'DUPLICATE_SUMMARY_FAILED',
    });
    expect(result.issues.untagged.state).toBe('ready');
    expect(result.totals).toMatchObject({ findingTotal: 4, exact: false, hasMore: true });
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
      exact: true,
      hasMore: false,
    });
    mocks.getHealthSummary.mockResolvedValue({ suspectCount: 6000, checked: 6000, total: 6000 });

    const result = await getOrganizeSummary('user-1');

    expect(result.issues.bookmarkHealth).toMatchObject({ findingCount: 6000, exact: true, hasMore: false });
    expect(result.totals).toMatchObject({ affectedResourceTotal: 5000, exact: false, hasMore: true });
  });
});
