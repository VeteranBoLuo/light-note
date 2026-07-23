import { defineStore } from 'pinia';
import {
  completeTodo,
  countTodos,
  deleteTodo,
  listTodos,
  reopenTodo,
  updateTodo,
  type TodoItem,
  type TodoFilterStatus,
  type TodoSort,
} from '@/api/todoApi';

export default defineStore('todo', {
  state: () => ({
    items: [] as TodoItem[],
    pendingTotal: 0,
    total: 0,
    loading: false,
    loadFailed: false,
    status: 'all' as TodoFilterStatus,
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
      const requestStatus = options.status || this.status;
      if (options.status && !options.preserveStatus) this.status = options.status;
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
      if (res.status !== 200) return false;
      await this.refreshList();
      return true;
    },
    async updateChecklist(item: TodoItem, checklist: TodoItem['checklist']) {
      const res = await updateTodo(item.id, { checklist });
      if (res.status !== 200) return false;
      item.checklist = checklist;
      return true;
    },
    async remove(item: TodoItem) {
      const res = await deleteTodo(item.id);
      if (res.status !== 200 || !Number(res.data?.affected || 0)) return false;
      await this.refreshList();
      return true;
    },
  },
});
