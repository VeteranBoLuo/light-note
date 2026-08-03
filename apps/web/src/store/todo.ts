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
    sort: 'smart' as TodoSort,
    keyword: '',
    ownerId: '',
    requestId: 0,
  }),
  actions: {
    resetForOwner(ownerId: string) {
      if (this.ownerId === ownerId) return;
      this.ownerId = ownerId;
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
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
        return true;
      } catch {
        return false;
      }
    },
    async refreshList(
      options: { status?: TodoFilterStatus; keyword?: string; sort?: TodoSort; preserveStatus?: boolean } = {},
    ) {
      const requestStatus = options.status || this.effectiveStatus || this.status;
      if (options.status && !options.preserveStatus) this.status = options.status;
      this.effectiveStatus = requestStatus;
      if (options.keyword !== undefined) this.keyword = options.keyword;
      if (options.sort) this.sort = options.sort;
      const requestId = ++this.requestId;
      this.loading = true;
      this.loadFailed = false;
      try {
        const res = await listTodos({ status: requestStatus, keyword: this.keyword, sort: this.sort });
        if (requestId !== this.requestId) return false;
        if (res.status !== 200) {
          this.loadFailed = true;
          return false;
        }
        this.items = Array.isArray(res.data?.items) ? res.data.items : [];
        this.total = Number(res.data?.total || 0);
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
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
      await this.refreshList();
      return true;
    },
    async updateChecklist(item: TodoItem, checklist: TodoItem['checklist']) {
      const res = await updateTodo(item.id, { checklist });
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      item.checklist = checklist;
      return true;
    },
    async remove(item: TodoItem) {
      const res = await deleteTodo(item.id);
      const result = resolveTodoMutationResult(res, res.status === 200 && Number(res.data?.affected || 0) > 0);
      if (result !== true) return result;
      await this.refreshList();
      return true;
    },
    async batchComplete(ids: string[]) {
      const res = await batchSetTodoStatus(ids, 'completed');
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      await this.refreshList();
      return true;
    },
    async batchDelete(ids: string[]) {
      const res = await batchDeleteTodos(ids);
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
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
      await this.refreshList();
      return true;
    },
    async snooze(item: TodoItem, targetAt: string) {
      const res = await snoozeTodo(item.id, targetAt);
      const result = resolveTodoMutationResult(res, res.status === 200);
      if (result !== true) return result;
      await this.refreshList();
      return true;
    },
  },
});
