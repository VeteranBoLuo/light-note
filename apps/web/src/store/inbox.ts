import { defineStore } from 'pinia';
import { completeInbox, countInbox, InboxItem, InboxResourceRef, InboxResourceType, listInbox } from '@/api/inboxApi';

interface TypeTotals {
  bookmark: number;
  note: number;
  file: number;
}

export default defineStore('inbox', {
  state: () => ({
    pendingTotal: 0,
    typeTotals: { bookmark: 0, note: 0, file: 0 } as TypeTotals,
    items: [] as InboxItem[],
    total: 0,
    loading: false,
    loadFailed: false,
    currentPage: 1,
    pageSize: 20,
    filterType: 'all' as 'all' | InboxResourceType,
    keyword: '',
    sort: 'newest' as 'newest' | 'oldest',
    selectedKeys: [] as string[],
    quickCaptureVisible: false,
    ownerId: '',
    requestId: 0,
  }),
  actions: {
    resourceKey(item: InboxResourceRef) {
      return `${item.resourceType}:${item.resourceId}`;
    },
    resetForOwner(ownerId: string) {
      if (this.ownerId === ownerId) return;
      this.ownerId = ownerId;
      this.pendingTotal = 0;
      this.typeTotals = { bookmark: 0, note: 0, file: 0 };
      this.items = [];
      this.total = 0;
      this.currentPage = 1;
      this.selectedKeys = [];
      this.loadFailed = false;
      this.requestId += 1;
    },
    async refreshCount() {
      try {
        const res = await countInbox();
        if (res.status !== 200) return false;
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
        this.typeTotals = res.data?.typeTotals || { bookmark: 0, note: 0, file: 0 };
        return true;
      } catch {
        // 导航角标属于增强信息，接口暂不可用时保留现有数量，避免影响主页面。
        return false;
      }
    },
    async refreshList() {
      const requestId = ++this.requestId;
      this.loading = true;
      this.loadFailed = false;
      try {
        const res = await listInbox({
          type: this.filterType,
          keyword: this.keyword,
          currentPage: this.currentPage,
          pageSize: this.pageSize,
          sort: this.sort,
        });
        if (requestId !== this.requestId) return false;
        if (res.status !== 200) {
          this.loadFailed = true;
          return false;
        }
        this.items = Array.isArray(res.data?.items) ? res.data.items : [];
        this.total = Number(res.data?.total || 0);
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
        this.typeTotals = res.data?.typeTotals || { bookmark: 0, note: 0, file: 0 };
        this.selectedKeys = [];
        return true;
      } catch {
        // 前后端灰度发布或网络失败时保留当前列表，并吞掉组件生命周期中的未处理异常。
        if (requestId === this.requestId) this.loadFailed = true;
        return false;
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    async complete(items: InboxResourceRef[]) {
      if (items.length === 0) return 0;
      try {
        const res = await completeInbox(items);
        if (res.status !== 200) return 0;
        const completed = Number(res.data?.completed || 0);
        if (completed > 0) {
          if (this.currentPage > 1 && this.items.length <= completed) this.currentPage -= 1;
          await this.refreshList();
        }
        return completed;
      } catch {
        return 0;
      }
    },
  },
});
