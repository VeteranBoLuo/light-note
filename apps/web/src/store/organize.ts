import { defineStore } from 'pinia';
import {
  getOrganizeIssueList,
  getOrganizeSummary,
  type BookmarkHealthItem,
  type DuplicateBookmarkGroup,
  type OrganizeIssueType,
  type OrganizeSummary,
  type UntaggedResourceItem,
} from '@/api/organizeApi';

type IssueItem = UntaggedResourceItem | DuplicateBookmarkGroup | BookmarkHealthItem;

interface IssueListState {
  items: IssueItem[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  retryReset: boolean;
  requestGeneration: number;
}

function emptyListState(): IssueListState {
  return {
    items: [],
    cursor: null,
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: false,
    retryReset: true,
    requestGeneration: 0,
  };
}

export default defineStore('organize', {
  state: () => ({
    ownerKey: '',
    summary: null as OrganizeSummary | null,
    summaryLoading: false,
    summaryError: false,
    summaryGeneration: 0,
    lists: {
      untagged: emptyListState(),
      duplicate_bookmark: emptyListState(),
      bookmark_health: emptyListState(),
    } as Record<OrganizeIssueType, IssueListState>,
  }),
  getters: {
    /**
     * 整理中心导航角标表达的是「待处理事项」而不是去重资源数：待整理流程、
     * 资源治理发现分别计数，同一资源命中多个问题时会计多项。
     */
    attentionCount(state): number | null {
      const pendingCount = state.summary?.pendingShortcut?.count;
      if (pendingCount === null || pendingCount === undefined) return null;
      return Math.max(0, Number(pendingCount) || 0) + Math.max(0, Number(state.summary?.totals?.findingTotal) || 0);
    },
  },
  actions: {
    resetForOwner(ownerKey: string) {
      if (this.ownerKey === ownerKey) return;
      this.ownerKey = ownerKey;
      this.summary = null;
      this.summaryLoading = false;
      this.summaryError = false;
      this.summaryGeneration += 1;
      this.lists = {
        untagged: emptyListState(),
        duplicate_bookmark: emptyListState(),
        bookmark_health: emptyListState(),
      };
    },
    async loadSummary({ silent = false } = {}) {
      if (this.summaryLoading) return false;
      const generation = ++this.summaryGeneration;
      if (!silent || !this.summary) this.summaryLoading = true;
      this.summaryError = false;
      try {
        const response = await getOrganizeSummary();
        if (generation !== this.summaryGeneration) return false;
        if (response.status !== 200) {
          this.summaryError = true;
          return false;
        }
        this.summary = response.data as OrganizeSummary;
        return true;
      } catch {
        if (generation === this.summaryGeneration) this.summaryError = true;
        return false;
      } finally {
        if (generation === this.summaryGeneration) this.summaryLoading = false;
      }
    },
    async loadIssue(
      issueType: OrganizeIssueType,
      options: { reset?: boolean; keyword?: string; resourceType?: string; kind?: string; restoreCount?: number } = {},
    ) {
      const list = this.lists[issueType];
      const reset = options.reset !== false;
      // 重复触发续页不能先推进请求世代；否则会把仍在途的合法请求标成过期，
      // 且它的 finally 也无法复位 loadingMore，列表会永久卡在加载态。
      if (!reset && (!list.hasMore || list.loadingMore || list.loading)) return false;
      const generation = ++list.requestGeneration;
      const restoring = reset && issueType === 'untagged' && options.restoreCount !== undefined;
      if (reset) {
        list.loading = true;
        list.loadingMore = false;
        list.error = false;
        // A return refresh must not expose pre-edit resources after a failed query.
        if (restoring) list.items = [];
      } else {
        list.loadingMore = true;
      }
      try {
        let cursor = reset ? null : list.cursor;
        let hasMore = false;
        const items: IssueItem[] = [];
        const seenCursors = new Set<string>();
        do {
          if (cursor) seenCursors.add(cursor);
          const response = await getOrganizeIssueList(issueType, {
            cursor,
            limit: 20,
            keyword: options.keyword,
            resourceType: options.resourceType,
            kind: options.kind,
          });
          if (this.lists[issueType] !== list || generation !== list.requestGeneration) return false;
          if (response.status !== 200) throw new Error('Organize list unavailable');
          const page: IssueItem[] = Array.isArray(response.data?.items) ? response.data.items : [];
          items.push(...page);
          cursor = response.data?.nextCursor || null;
          hasMore = Boolean(response.data?.hasMore);
          if (restoring && hasMore && (!cursor || seenCursors.has(cursor) || !page.length)) {
            throw new Error('Organize pagination did not advance');
          }
        } while (restoring && hasMore && items.length < (options.restoreCount || 0));
        list.items = reset ? items : [...list.items, ...items];
        list.cursor = cursor;
        list.hasMore = hasMore;
        list.error = false;
        return true;
      } catch {
        if (generation === list.requestGeneration) {
          list.retryReset = reset;
          list.error = true;
        }
        return false;
      } finally {
        if (generation === list.requestGeneration) {
          list.loading = false;
          list.loadingMore = false;
        }
      }
    },
    removeIssueItems(issueType: OrganizeIssueType, predicate: (item: IssueItem) => boolean) {
      this.lists[issueType].items = this.lists[issueType].items.filter((item) => !predicate(item));
    },
  },
});
