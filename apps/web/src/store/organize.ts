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
      options: { reset?: boolean; keyword?: string; resourceType?: string } = {},
    ) {
      const list = this.lists[issueType];
      const reset = options.reset !== false;
      // 重复点击“加载更多”不能先推进请求世代；否则会把仍在途的合法请求标成过期，
      // 且它的 finally 也无法复位 loadingMore，列表会永久卡在加载态。
      if (!reset && (!list.hasMore || list.loadingMore || list.loading)) return false;
      const generation = ++list.requestGeneration;
      if (reset) {
        list.loading = true;
        list.loadingMore = false;
        list.error = false;
      } else {
        list.loadingMore = true;
      }
      try {
        const response = await getOrganizeIssueList(issueType, {
          cursor: reset ? null : list.cursor,
          limit: 20,
          keyword: options.keyword,
          resourceType: options.resourceType,
        });
        if (generation !== list.requestGeneration) return false;
        if (response.status !== 200) {
          list.error = true;
          return false;
        }
        const items = Array.isArray(response.data?.items) ? response.data.items : [];
        list.items = reset ? items : [...list.items, ...items];
        list.cursor = response.data?.nextCursor || null;
        list.hasMore = Boolean(response.data?.hasMore);
        list.error = false;
        return true;
      } catch {
        if (generation === list.requestGeneration) list.error = true;
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
