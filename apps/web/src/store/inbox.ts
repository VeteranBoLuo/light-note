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
      this.requestId += 1;
    },
    async refreshCount() {
      const res = await countInbox();
      if (res.status === 200) {
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
        this.typeTotals = res.data?.typeTotals || { bookmark: 0, note: 0, file: 0 };
      }
    },
    async refreshList() {
      const requestId = ++this.requestId;
      this.loading = true;
      try {
        const res = await listInbox({
          type: this.filterType,
          keyword: this.keyword,
          currentPage: this.currentPage,
          pageSize: this.pageSize,
          sort: this.sort,
        });
        if (requestId !== this.requestId || res.status !== 200) return;
        this.items = Array.isArray(res.data?.items) ? res.data.items : [];
        this.total = Number(res.data?.total || 0);
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
        this.typeTotals = res.data?.typeTotals || { bookmark: 0, note: 0, file: 0 };
        this.selectedKeys = [];
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    },
    async complete(items: InboxResourceRef[]) {
      if (items.length === 0) return 0;
      const res = await completeInbox(items);
      if (res.status !== 200) return 0;
      const completed = Number(res.data?.completed || 0);
      if (completed > 0) {
        if (this.currentPage > 1 && this.items.length <= completed) this.currentPage -= 1;
        await this.refreshList();
      }
      return completed;
    },
  },
});
