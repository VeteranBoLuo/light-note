import {
  getTodoWorkspaceGroup,
  getTodoWorkspaceSeries,
  type TodoSeriesQuery,
  type TodoWorkspaceGroup,
  type TodoWorkspaceNode,
} from '@/api/todoApi';
import { getTodoWorkspace, type TodoList, type TodoWorkspaceQuery } from '@/api/todoApi';
import { defineStore } from 'pinia';
import {
  completeTodo,
  batchDeleteTodos,
  batchRestoreTodos,
  batchSetTodoStatus,
  countTodos,
  deleteTodo,
  listTodos,
  reorderTodos,
  reopenTodo,
  snoozeTodo,
  updateTodo,
  type TodoItem,
  type TodoFilterStatus,
  type TodoSort,
} from '@/api/todoApi';

type WorkspaceGroupPage = TodoWorkspaceGroup & {
  nodes: TodoWorkspaceNode[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  failed: boolean;
};

type TodoMutationResult = boolean | 'preview';

function resolveTodoMutationResult(response: { status?: unknown }, succeeded: boolean): TodoMutationResult {
  return response.status === 'preview' ? 'preview' : succeeded;
}

export default defineStore('todo', {
  state: () => ({
    items: [] as TodoItem[],
    workspaceEnabled: false,
    seriesPresentation: false,
    groups: [] as WorkspaceGroupPage[],
    groupQueryKey: '',
    groupQuery: {} as TodoWorkspaceQuery,
    selectedSeriesItems: {} as Record<string, TodoItem>,
    seriesPages: {} as Record<
      string,
      {
        items: TodoItem[];
        nextCursor: string | null;
        total: number;
        loaded: boolean;
        loading: boolean;
        failed: boolean;
        generation: number;
      }
    >,
    filters: { scope: 'all', tagIds: [] } as TodoWorkspaceQuery,
    lists: [] as TodoList[],
    overview: {} as Record<string, number>,
    navigationCounts: {} as Partial<Record<'pending' | 'completed', Record<string, number>>>,
    groupCounts: {} as Record<string, number>,
    statusTotals: { pending: 0, completed: 0, all: 0 },
    nextCursor: null as string | null,
    loadingMore: false,
    expandedSubitems: {} as Record<string, boolean>,
    checklistPending: {} as Record<string, boolean>,
    checklistErrors: {} as Record<string, TodoItem['checklist']>,
    organizationEpoch: 0,
    pendingTotal: 0,
    total: 0,
    loading: false,
    refreshing: false,
    loadFailed: false,
    status: 'all' as TodoFilterStatus,
    /**
     * 实际用于查询的状态口径。
     * 「待处理」的全部页签会以 preserveStatus 传入 pending(页签仍高亮「全部」),
     * 此时 status 保持 all;后续 setCompleted/reorder 等无参刷新若沿用 status,
     * 会把已完成待办重新拉进列表,故单独记录真实请求口径。
     */
    effectiveStatus: 'all' as TodoFilterStatus,
    // 待办默认使用可解释的智能排序；用户在当前账号会话内切换后保持选择。
    sort: 'smart' as TodoSort,
    keyword: '',
    ownerId: '',
    requestId: 0,
  }),
  actions: {
    resetForOwner(ownerId: string) {
      if (this.ownerId === ownerId) return;
      this.ownerId = ownerId;
      this.filters = { scope: 'all', tagIds: [] };
      this.lists = [];
      this.overview = {};
      this.navigationCounts = {};
      this.nextCursor = null;
      this.loading = false;
      this.refreshing = false;
      this.loadingMore = false;
      this.expandedSubitems = {};
      this.checklistPending = {};
      this.checklistErrors = {};
      this.groupCounts = {};
      this.groups = [];
      this.groupQueryKey = '';
      this.selectedSeriesItems = {};
      this.seriesPages = {};
      this.statusTotals = { pending: 0, completed: 0, all: 0 };
      this.items = [];
      this.pendingTotal = 0;
      this.total = 0;
      this.status = 'all';
      this.effectiveStatus = 'all';
      this.sort = 'smart';
      this.keyword = '';
      this.loadFailed = false;
      this.requestId += 1;
    },
    async loadSeriesPage(key: string, query: TodoSeriesQuery, reset = false) {
      let page = this.seriesPages[key];
      if (!reset && page && (page.loading || (page.loaded && !page.nextCursor))) return;
      const generation = this.requestId;
      const retained = reset && page ? page.items : [];
      if (reset || !page) {
        this.seriesPages[key] = {
          items: retained,
          nextCursor: null,
          total: page?.total || 0,
          loaded: false,
          loading: false,
          failed: false,
          generation,
        };
        page = this.seriesPages[key];
      }
      const target = page;
      target.loading = true;
      target.failed = false;
      try {
        let cursor = reset ? null : target.nextCursor;
        const items: TodoItem[] = [];
        do {
          const res = await getTodoWorkspaceSeries({ ...query, cursor });
          if (generation !== this.requestId || this.seriesPages[key] !== target) return;
          if (res.status !== 200) {
            target.failed = true;
            return;
          }
          items.push(...res.data.items);
          cursor = res.data.nextCursor || null;
          target.total = Number(res.data.total || 0);
          if (!res.data.items.length) break;
        } while (reset && cursor && items.length < retained.length);
        const previous = reset ? [] : target.items;
        target.items = [...new Map([...previous, ...items].map((item) => [item.id, item])).values()];
        target.nextCursor = cursor;
        target.loaded = true;
        target.generation = generation;
      } catch {
        if (generation === this.requestId) target.failed = true;
      } finally {
        if (this.seriesPages[key] === target) target.loading = false;
      }
    },
    syncGroupItems() {
      this.items = this.groups.flatMap((group) =>
        group.nodes.map((node) => (node.kind === 'series' ? node.representative : node.item)),
      );
    },
    async loadGroup(key: string, retry = false) {
      const group = this.groups.find((group) => group.key === key);
      if (
        !group ||
        group.loading ||
        this.refreshing ||
        this.loading ||
        (group.failed && !retry) ||
        (group.loaded && !group.nextCursor)
      )
        return;
      const generation = this.requestId;
      group.loading = true;
      group.failed = false;
      try {
        const res = await getTodoWorkspaceGroup({ ...this.groupQuery, groupKey: key, cursor: group.nextCursor });
        if (generation !== this.requestId || !this.groups.includes(group)) return;
        if (res.status !== 200) {
          group.failed = true;
          return;
        }
        const seen = new Set(group.nodes.map((node) => node.key));
        group.nodes.push(...(res.data.nodes as TodoWorkspaceNode[]).filter((node) => !seen.has(node.key)));
        group.nextCursor = res.data.nextCursor || null;
        group.nodeCount = Number(res.data.total || 0);
        group.loaded = true;
        this.syncGroupItems();
      } catch {
        if (generation === this.requestId) group.failed = true;
      } finally {
        if (generation === this.requestId) group.loading = false;
      }
    },
    async refreshCount() {
      try {
        const res = await countTodos();
        if (res.status !== 200) return false;
        this.pendingTotal = Number(res.data?.pendingTotal ?? res.data?.overview?.allTotal ?? 0);
        return true;
      } catch {
        return false;
      }
    },
    async refreshList(
      options: {
        status?: TodoFilterStatus;
        keyword?: string;
        sort?: TodoSort;
        preserveStatus?: boolean;
        // silent: 同 inbox store,下拉刷新时保留旧列表不闪骨架屏。
        silent?: boolean;
      } = {},
    ) {
      const requestStatus = options.status || this.effectiveStatus || this.status;
      if (options.status && !options.preserveStatus) this.status = options.status;
      this.effectiveStatus = requestStatus;
      if (options.keyword !== undefined) this.keyword = options.keyword;
      if (options.sort) this.sort = options.sort;
      const requestId = ++this.requestId;
      this.refreshing = true;
      for (const group of this.groups) group.loading = false;
      if (!options.silent && !(this.seriesPresentation && this.groups.length)) this.loading = true;
      this.loadFailed = false;
      try {
        const query = {
          ...(this.workspaceEnabled ? this.filters : {}),
          status: requestStatus,
          keyword: this.keyword,
          sort: this.sort,
          ...(this.workspaceEnabled && this.seriesPresentation ? { presentation: 'series' as const } : {}),
        };
        const res = this.workspaceEnabled ? await getTodoWorkspace(query) : await listTodos(query);
        if (requestId !== this.requestId) return false;
        if (res.status !== 200) {
          this.loadFailed = true;
          return false;
        }
        if (this.workspaceEnabled && this.seriesPresentation) {
          const key = JSON.stringify(query);
          const preserve = key === this.groupQueryKey;
          const groups: WorkspaceGroupPage[] = (res.data.groups || []).map((group: TodoWorkspaceGroup) => ({
            ...group,
            nodes: [],
            nextCursor: null,
            loaded: false,
            loading: false,
            failed: false,
          }));
          if (preserve) {
            await Promise.all(
              groups.map(async (group) => {
                const old = this.groups.find((entry) => entry.key === group.key);
                if (!old?.loaded) return;
                let remaining = Math.max(1, old.nodes.length);
                do {
                  const page = await getTodoWorkspaceGroup({ ...query, groupKey: group.key, cursor: group.nextCursor });
                  if (requestId !== this.requestId) return;
                  if (page.status !== 200) throw new Error('TODO_GROUP_REFRESH_FAILED');
                  group.nodes.push(...page.data.nodes);
                  group.nextCursor = page.data.nextCursor || null;
                  group.loaded = true;
                  remaining -= page.data.nodes.length;
                  if (!page.data.nodes.length) break;
                } while (remaining > 0 && group.nextCursor);
              }),
            );
          }
          if (requestId !== this.requestId) return false;
          let selected: TodoItem[] = [];
          const selectedIds = Object.keys(this.selectedSeriesItems);
          if (preserve && selectedIds.length) {
            const pages = [];
            for (let offset = 0; offset < selectedIds.length; offset += 50) {
              pages.push(
                getTodoWorkspace({
                  ...this.filters,
                  ids: selectedIds.slice(offset, offset + 50),
                  status: requestStatus,
                  keyword: this.keyword,
                }),
              );
            }
            const results = await Promise.all(pages);
            if (requestId !== this.requestId) return false;
            if (results.some((result) => result.status !== 200)) throw new Error('TODO_SELECTION_REFRESH_FAILED');
            selected = results.flatMap((result) => result.data.items);
          }
          this.selectedSeriesItems = Object.fromEntries(selected.map((item) => [item.id, item]));
          this.groupQuery = query;
          this.groupQueryKey = key;
          this.groups = groups;
          if (!preserve) this.selectedSeriesItems = {};
          this.syncGroupItems();
        } else this.groups = [];
        if (this.workspaceEnabled) {
          this.lists = res.data?.lists || [];
          this.overview = res.data?.overview || {};
          this.navigationCounts = res.data?.navigationCounts || {};
          this.groupCounts = res.data?.groupCounts || {};
          this.statusTotals = res.data?.statusTotals || { pending: 0, completed: 0, all: 0 };
          this.nextCursor = res.data?.nextCursor || null;
        }
        if (!this.seriesPresentation || !this.workspaceEnabled)
          this.items = Array.isArray(res.data?.items) ? res.data.items : [];
        this.total = this.seriesPresentation
          ? this.groups.reduce((total, group) => total + group.instanceCount, 0)
          : Number(res.data?.total || 0);
        this.pendingTotal = Number(res.data?.pendingTotal ?? res.data?.overview?.allTotal ?? 0);
        return true;
      } catch {
        if (requestId === this.requestId) this.loadFailed = true;
        return false;
      } finally {
        if (requestId === this.requestId) {
          this.loading = false;
          this.refreshing = false;
        }
      }
    },
    async setCompleted(item: TodoItem, completed: boolean) {
      const owner = this.ownerId;
      const res = completed ? await completeTodo(item.id) : await reopenTodo(item.id);
      if (owner !== this.ownerId) return false;
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async loadMore() {
      if (!this.nextCursor || this.loadingMore) return;
      const generation = this.requestId;
      this.loadingMore = true;
      try {
        const res = await getTodoWorkspace({
          ...this.filters,
          status: this.effectiveStatus,
          keyword: this.keyword,
          sort: this.sort,
          cursor: this.nextCursor,
        });
        if (generation !== this.requestId) return;
        if (res.status !== 200) {
          this.loadFailed = true;
          return;
        }
        const seen = new Set(this.items.map((item) => item.id));
        this.items.push(...(res.data.items as TodoItem[]).filter((item) => !seen.has(item.id)));
        this.nextCursor = res.data.nextCursor || null;
      } catch {
        if (generation === this.requestId) this.loadFailed = true;
      } finally {
        if (generation === this.requestId) this.loadingMore = false;
      }
    },
    async updateChecklist(item: TodoItem, checklist: TodoItem['checklist']) {
      if (this.checklistPending[item.id] || item.status === 'completed') return false;
      const owner = this.ownerId;
      this.checklistPending[item.id] = true;
      delete this.checklistErrors[item.id];
      try {
        const res = await updateTodo(item.id, { checklist });
        const result = resolveTodoMutationResult(res, res.status === 200);
        if (owner !== this.ownerId) return false;
        if (result !== true) {
          if (result === false) this.checklistErrors[item.id] = checklist;
          return result;
        }
        item.checklist = checklist;
        const current = this.items.find((entry) => entry.id === item.id);
        if (current) current.checklist = checklist;
        return true;
      } catch {
        if (owner === this.ownerId) this.checklistErrors[item.id] = checklist;
        return false;
      } finally {
        if (owner === this.ownerId) delete this.checklistPending[item.id];
      }
    },
    async remove(item: TodoItem) {
      const owner = this.ownerId;
      const res = await deleteTodo(item.id);
      if (owner !== this.ownerId) return false;
      const result = resolveTodoMutationResult(res, res.status === 200 && Number(res.data?.affected || 0) > 0);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async batchComplete(ids: string[]) {
      const owner = this.ownerId;
      const res = await batchSetTodoStatus(ids, 'completed');
      if (owner !== this.ownerId) return false;
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async batchDelete(ids: string[]) {
      const owner = this.ownerId;
      const res = await batchDeleteTodos(ids);
      if (owner !== this.ownerId) return false;
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async restoreMany(ids: string[]) {
      const owner = this.ownerId;
      const uniqueIds = [...new Set(ids)];
      const res = await batchRestoreTodos(uniqueIds);
      if (owner !== this.ownerId) return false;
      if (String(res.status) === 'preview') return 'preview';
      await this.refreshList();
      return res.status === 200 && Number(res.data?.affected || 0) === uniqueIds.length;
    },
    async reopenMany(ids: string[]) {
      const owner = this.ownerId;
      const res = await batchSetTodoStatus(ids, 'pending', { undoCompletion: true });
      if (owner !== this.ownerId) return false;
      if (String(res.status) === 'preview') return 'preview';
      await this.refreshList();
      return res.status === 200 && Number(res.data?.affected || 0) === new Set(ids).size;
    },
    async reorder(items: Array<{ id: string; dueAt?: string | null; priority: TodoItem['priority'] }>) {
      const owner = this.ownerId;
      const res = await reorderTodos(items);
      if (owner !== this.ownerId) return false;
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async snooze(item: TodoItem, targetAt: string) {
      const owner = this.ownerId;
      const res = await snoozeTodo(item.id, targetAt);
      if (owner !== this.ownerId) return false;
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
  },
});
