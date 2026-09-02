import { defineStore } from 'pinia';
import {
  getOrganizeIssueList,
  getOrganizeKnowledgeStructureSummary,
  getOrganizeSummary,
  type BookmarkHealthItem,
  type DuplicateBookmarkGroup,
  type KnowledgeStructureIssue,
  type KnowledgeStructureSummary,
  type OrganizeIssueType,
  type OrganizeSummary,
  type UntaggedResourceItem,
} from '@/api/organizeApi';

type IssueItem = UntaggedResourceItem | DuplicateBookmarkGroup | BookmarkHealthItem | KnowledgeStructureIssue;

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
    knowledgeStructureSummary: null as KnowledgeStructureSummary | null,
    knowledgeStructureLoading: false,
    knowledgeStructureError: false,
    knowledgeStructureGeneration: 0,
    lists: {
      untagged: emptyListState(),
      duplicate_bookmark: emptyListState(),
      bookmark_health: emptyListState(),
      knowledge_structure: emptyListState(),
    } as Record<OrganizeIssueType, IssueListState>,
  }),
  getters: {
    /**
     * 整理中心导航角标表达的是「待处理事项」而不是去重资源数：待整理流程、
     * 资源治理发现与知识结构发现分别计数，同一资源命中多个问题时会计多项。
     */
    attentionCount(state): number | null {
      const pendingCount = state.summary?.pendingShortcut?.count;
      if (pendingCount === null || pendingCount === undefined || !state.knowledgeStructureSummary) return null;
      return (
        Math.max(0, Number(pendingCount) || 0) +
        Math.max(0, Number(state.summary?.totals?.findingTotal) || 0) +
        Math.max(0, Number(state.knowledgeStructureSummary.findingCount) || 0)
      );
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
      this.knowledgeStructureSummary = null;
      this.knowledgeStructureLoading = false;
      this.knowledgeStructureError = false;
      this.knowledgeStructureGeneration += 1;
      this.lists = {
        untagged: emptyListState(),
        duplicate_bookmark: emptyListState(),
        bookmark_health: emptyListState(),
        knowledge_structure: emptyListState(),
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
    async loadKnowledgeStructureSummary({ silent = false } = {}) {
      if (this.knowledgeStructureLoading) return false;
      const generation = ++this.knowledgeStructureGeneration;
      if (!silent || !this.knowledgeStructureSummary) this.knowledgeStructureLoading = true;
      this.knowledgeStructureError = false;
      try {
        const response = await getOrganizeKnowledgeStructureSummary();
        if (generation !== this.knowledgeStructureGeneration) return false;
        if (response.status !== 200) {
          this.knowledgeStructureError = true;
          return false;
        }
        this.knowledgeStructureSummary = response.data as KnowledgeStructureSummary;
        return true;
      } catch {
        if (generation === this.knowledgeStructureGeneration) this.knowledgeStructureError = true;
        return false;
      } finally {
        if (generation === this.knowledgeStructureGeneration) this.knowledgeStructureLoading = false;
      }
    },
    async loadIssue(
      issueType: OrganizeIssueType,
      options: { reset?: boolean; keyword?: string; resourceType?: string; kind?: string } = {},
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
          kind: options.kind,
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
