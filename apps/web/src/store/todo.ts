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

type TodoMutationResult = boolean | 'preview';

function resolveTodoMutationResult(response: { status?: unknown }, succeeded: boolean): TodoMutationResult {
  return response.status === 'preview' ? 'preview' : succeeded;
}

export default defineStore('todo', {
  state: () => ({
    items: [] as TodoItem[],
    workspaceEnabled: false,
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
      this.loadingMore = false;
      this.expandedSubitems = {};
      this.checklistPending = {};
      this.checklistErrors = {};
      this.groupCounts = {};
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
      if (!options.silent) this.loading = true;
      this.loadFailed = false;
      try {
        const query = {
          ...(this.workspaceEnabled ? this.filters : {}),
          status: requestStatus,
          keyword: this.keyword,
          sort: this.sort,
        };
        const res = this.workspaceEnabled ? await getTodoWorkspace(query) : await listTodos(query);
        if (requestId !== this.requestId) return false;
        if (res.status !== 200) {
          this.loadFailed = true;
          return false;
        }
        if (this.workspaceEnabled) {
          this.lists = res.data?.lists || [];
          this.overview = res.data?.overview || {};
          this.navigationCounts = res.data?.navigationCounts || {};
          this.groupCounts = res.data?.groupCounts || {};
          this.statusTotals = res.data?.statusTotals || { pending: 0, completed: 0, all: 0 };
          this.nextCursor = res.data?.nextCursor || null;
        }
        this.items = Array.isArray(res.data?.items) ? res.data.items : [];
        this.total = Number(res.data?.total || 0);
        this.pendingTotal = Number(res.data?.pendingTotal ?? res.data?.overview?.allTotal ?? 0);
        return true;
      } catch {
        if (requestId === this.requestId) this.loadFailed = true;
        return false;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    async setCompleted(item: TodoItem, completed: boolean) {
      const res = completed ? await completeTodo(item.id) : await reopenTodo(item.id);
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
      const res = await deleteTodo(item.id);
      const result = resolveTodoMutationResult(res, res.status === 200 && Number(res.data?.affected || 0) > 0);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async batchComplete(ids: string[]) {
      const res = await batchSetTodoStatus(ids, 'completed');
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async batchDelete(ids: string[]) {
      const res = await batchDeleteTodos(ids);
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async restoreMany(ids: string[]) {
      const uniqueIds = [...new Set(ids)];
      const res = await batchRestoreTodos(uniqueIds);
      if (String(res.status) === 'preview') return 'preview';
      await this.refreshList();
      return res.status === 200 && Number(res.data?.affected || 0) === uniqueIds.length;
    },
    async reopenMany(ids: string[]) {
      const res = await batchSetTodoStatus(ids, 'pending', { undoCompletion: true });
      if (String(res.status) === 'preview') return 'preview';
      await this.refreshList();
      return res.status === 200 && Number(res.data?.affected || 0) === new Set(ids).size;
    },
    async reorder(items: Array<{ id: string; dueAt?: string | null; priority: TodoItem['priority'] }>) {
      const res = await reorderTodos(items);
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
    async snooze(item: TodoItem, targetAt: string) {
      const res = await snoozeTodo(item.id, targetAt);
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      this.organizationEpoch++;
      await this.refreshList();
      return true;
    },
  },
});
