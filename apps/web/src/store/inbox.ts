import { defineStore } from 'pinia';
import { completeInbox, countInbox, InboxItem, InboxResourceRef, InboxResourceType, listInbox } from '@/api/inboxApi';

interface TypeTotals {
  bookmark: number;
  note: number;
  file: number;
}

export type ActionCaptureType = InboxResourceType | 'todo';

/**
 * 解析注意力口径计数（逾期 + 今天到期），供导航角标使用。
 *
 * 灰度期旧后端还没有这三个字段，回落到「全部未完成待办」：宁可数字偏大，
 * 也不要让角标在版本错配时整体消失。前后端同批发布后可删掉 fallback。
 *
 * 必须用 `??` 而不是 `||`：后端返回 0 是有效结果（今天没有要关注的待办），
 * 用 `||` 会把这个 0 误判成缺字段并回落成全部未完成数，让本该清零的角标继续挂着。
 */
function readAttentionCounts(data: any) {
  return {
    todoAttentionTotal: Number(data?.todoAttentionTotal ?? data?.todoPendingTotal ?? 0),
    todoOverdueTotal: Number(data?.todoOverdueTotal ?? 0),
    todoDueTodayTotal: Number(data?.todoDueTodayTotal ?? 0),
    todoDueWeekTotal: Number(data?.todoDueWeekTotal ?? 0),
  };
}

export default defineStore('inbox', {
  state: () => ({
    pendingTotal: 0,
    // 「库存」口径：全部未完成待办，供工作台总览；永不清零，不用于角标
    todoPendingTotal: 0,
    actionTotal: 0,
    // 「注意力」口径：逾期 + 今天到期，供导航角标；做完今天的事即可归零
    todoAttentionTotal: 0,
    todoOverdueTotal: 0,
    todoDueTodayTotal: 0,
    todoDueWeekTotal: 0,
    typeTotals: { bookmark: 0, note: 0, file: 0 } as TypeTotals,
    items: [] as InboxItem[],
    total: 0,
    loading: false,
    loadFailed: false,
    filterType: 'all' as 'all' | InboxResourceType | 'todo',
    keyword: '',
    sort: 'newest' as 'newest' | 'oldest',
    selectedKeys: [] as string[],
    quickCaptureVisible: false,
    quickCaptureType: 'note' as ActionCaptureType,
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
      this.todoPendingTotal = 0;
      this.actionTotal = 0;
      this.todoAttentionTotal = 0;
      this.todoOverdueTotal = 0;
      this.todoDueTodayTotal = 0;
      this.todoDueWeekTotal = 0;
      this.typeTotals = { bookmark: 0, note: 0, file: 0 };
      this.items = [];
      this.total = 0;
      this.selectedKeys = [];
      this.quickCaptureVisible = false;
      this.quickCaptureType = 'note';
      this.loadFailed = false;
      this.requestId += 1;
    },
    openQuickCapture(type: ActionCaptureType = 'note') {
      this.quickCaptureType = type;
      this.quickCaptureVisible = true;
    },
    async refreshCount() {
      try {
        const res = await countInbox();
        if (res.status !== 200) return false;
        this.pendingTotal = Number(res.data?.pendingTotal || 0);
        this.todoPendingTotal = Number(res.data?.todoPendingTotal || 0);
        this.actionTotal = Number(res.data?.actionTotal || this.pendingTotal + this.todoPendingTotal);
        Object.assign(this, readAttentionCounts(res.data));
        this.typeTotals = res.data?.typeTotals || { bookmark: 0, note: 0, file: 0 };
        return true;
      } catch {
        // 导航角标属于增强信息，接口暂不可用时保留现有数量，避免影响主页面。
        return false;
      }
    },
    // silent: 下拉刷新等场景不进 loading,避免旧列表被骨架屏替换。
    // 失败时不需要特殊处理 loadFailed —— 页面对"有数据 + 失败"已渲染为顶部横幅并保留列表。
    async refreshList(options: { silent?: boolean } = {}) {
      const requestId = ++this.requestId;
      if (!options.silent) this.loading = true;
      this.loadFailed = false;
      try {
        const res = await listInbox({
          type: this.filterType === 'todo' ? 'all' : this.filterType,
          keyword: this.keyword,
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
        this.todoPendingTotal = Number(res.data?.todoPendingTotal || 0);
        this.actionTotal = Number(res.data?.actionTotal || this.pendingTotal + this.todoPendingTotal);
        Object.assign(this, readAttentionCounts(res.data));
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
      let completed = 0;
      try {
        // 后端单次最多接收 50 项；全量列表下的“全选”需要在前端分批提交。
        for (let index = 0; index < items.length; index += 50) {
          const res = await completeInbox(items.slice(index, index + 50));
          if (res.status !== 200) break;
          completed += Number(res.data?.completed || 0);
        }
        if (completed > 0) {
          await this.refreshList();
        }
        return completed;
      } catch {
        if (completed > 0) await this.refreshList();
        return completed;
      }
    },
  },
});
