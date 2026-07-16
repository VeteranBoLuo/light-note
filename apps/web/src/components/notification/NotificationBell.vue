<template>
  <BPopover
    trigger="click"
    placement="bottom-right"
    overlay-class-name="notification-popover"
    v-model:open="open"
    @openChange="onOpenChange"
  >
    <BTooltip :title="t('notification.title')">
      <div class="nt-bell dom-hover" v-click-log="{ module: '通知中心', operation: '打开通知铃铛' }">
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span v-if="unreadTotal > 0" class="nt-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
      </div>
    </BTooltip>

    <template #content>
      <div class="nt-panel">
        <div class="nt-head">
          <span class="nt-title">{{ t('notification.title') }}</span>
          <span v-if="unreadTotal > 0" class="nt-markall dom-hover" @click="onMarkAll">{{
            t('notification.markAllRead')
          }}</span>
        </div>

        <div class="nt-tabs">
          <button
            v-for="tb in tabs"
            :key="tb.v"
            class="nt-tab"
            :class="{ active: activeTab === tb.v }"
            @click="switchTab(tb.v)"
          >
            {{ tb.label }}
            <span v-if="tabUnread(tb.v) > 0" class="nt-tab-badge">{{
              tabUnread(tb.v) > 99 ? '99+' : tabUnread(tb.v)
            }}</span>
          </button>
        </div>

        <div class="nt-list">
          <div v-if="loading && !items.length" class="nt-state">{{ t('notification.loading') }}</div>
          <div v-else-if="!items.length" class="nt-state">
            <div class="nt-empty-icon">🔔</div>
            <div>{{ t('notification.empty') }}</div>
          </div>
          <template v-else>
            <div v-for="grp in groupedItems" :key="grp.key" class="nt-group">
              <div class="nt-group-label">{{ grp.label }}</div>
              <div
                v-for="n in grp.items"
                :key="n.id"
                class="nt-item dom-hover"
                :class="{ unread: !n.isRead }"
                @click="onItemClick(n)"
                v-click-log="{ module: '通知中心', operation: `查看通知【${renderTitle(n)}】` }"
              >
                <span class="nt-dot" :class="`type-${n.type}`"></span>
                <div class="nt-item-main">
                  <div class="nt-item-title">{{ renderTitle(n) }}</div>
                  <div v-if="renderContent(n)" class="nt-item-content">{{ renderContent(n) }}</div>
                  <div class="nt-item-time">{{ fmtTime(n.createTime) }}</div>
                </div>
                <button class="nt-del dom-hover" :title="t('notification.delete')" @click.stop="onDelete(n)">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>
            </div>
            <button v-if="items.length < total" class="nt-more" :disabled="loading" @click="loadMore">
              {{ loading ? t('notification.loading') : t('notification.loadMore') }}
            </button>
          </template>
        </div>
      </div>
    </template>
  </BPopover>
  <WeeklyReportModal v-model:visible="wrVisible" :report="wrData" />

  <!-- 无跳转链接的通知:点击弹框看完整标题 + 正文(列表里被截两行) -->
  <BModal
    v-model:visible="detailVisible"
    :title="detailItem ? renderTitle(detailItem) : ''"
    :show-footer="false"
    width="440px"
  >
    <div class="nt-detail">
      <div v-if="detailItem" class="nt-detail-time">{{ fmtTime(detailItem.createTime) }}</div>
      <div v-if="detailItem && renderContent(detailItem)" class="nt-detail-content">{{
        renderContent(detailItem)
      }}</div>
      <div v-else class="nt-detail-empty">{{ t('notification.noContent') }}</div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import { useNotification, type NotificationItem } from '@/composables/useNotification.ts';
  import WeeklyReportModal from '@/components/growth/WeeklyReportModal.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';

  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const { unreadTotal, unreadByType, refreshUnread, fetchList, markRead, markAllRead, deleteNotifications } =
    useNotification();

  const open = ref(false);
  const wrVisible = ref(false);
  const wrData = ref<any>(null);
  const detailVisible = ref(false);
  const detailItem = ref<NotificationItem | null>(null);
  const items = ref<NotificationItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const activeTab = ref('all');
  const currentPage = ref(1);
  const pageSize = 20;

  const tabs = computed(() => [
    { v: 'all', label: t('notification.tabAll') },
    { v: 'level_up', label: t('notification.tabLevelUp') },
    { v: 'opinion_reply', label: t('notification.tabReply') },
    { v: 'system', label: t('notification.tabSystem') },
    { v: 'other', label: t('notification.tabOther') },
  ]);
  // 各 tab 未读角标:全部=总数,其余=该类型未读数
  // 「其他」tab 兜底:非三大已知类型(如 streak_risk 签到提醒)都归它,与后端 list 口径一致
  const KNOWN_NOTIFY_TYPES = ['level_up', 'opinion_reply', 'system'];
  function tabUnread(v: string): number {
    if (v === 'all') return unreadTotal.value;
    if (v === 'other') {
      return Object.entries(unreadByType.value).reduce(
        (s, [t, c]) => (KNOWN_NOTIFY_TYPES.includes(t) ? s : s + Number(c || 0)),
        0,
      );
    }
    return unreadByType.value[v] || 0;
  }

  // 按时间把当前列表分「今天 / 本周 / 更早」三组(纯前端,不改后端返回顺序)
  const groupedItems = computed(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 86400000;
    const buckets: Record<string, NotificationItem[]> = { today: [], week: [], earlier: [] };
    for (const it of items.value) {
      const ts = new Date(String(it.createTime).replace(/-/g, '/')).getTime();
      if (Number.isNaN(ts) || ts >= todayStart) buckets.today.push(it);
      else if (ts >= weekStart) buckets.week.push(it);
      else buckets.earlier.push(it);
    }
    return [
      { key: 'today', label: t('notification.groupToday'), items: buckets.today },
      { key: 'week', label: t('notification.groupWeek'), items: buckets.week },
      { key: 'earlier', label: t('notification.groupEarlier'), items: buckets.earlier },
    ].filter((g) => g.items.length);
  });

  function parseMeta(meta: any): any {
    if (!meta) return {};
    if (typeof meta === 'object') return meta;
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  // 升级通知按 type+meta 渲染 i18n(国际化);其余(反馈回复/系统/其他)用后端原文
  function renderTitle(n: NotificationItem): string {
    if (n.type === 'level_up') {
      const m = parseMeta(n.meta);
      return t('notification.levelUpTitle', { level: m.level, name: t('growth.ranks.' + m.level) });
    }
    if (n.type === 'opinion_reply') return t('notification.opinionReplyTitle');
    return n.title;
  }
  function renderContent(n: NotificationItem): string {
    if (n.type === 'level_up') return '';
    return n.content || '';
  }

  function fmtTime(ts: string): string {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
    const abs = Math.abs(diffSec);
    try {
      const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
      if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
      if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
    } catch {
      /* Intl 不可用时回退到日期 */
    }
    return d.toLocaleDateString();
  }

  async function load(reset = true) {
    loading.value = true;
    if (reset) currentPage.value = 1;
    const page = await fetchList({ currentPage: currentPage.value, pageSize, type: activeTab.value });
    items.value = reset ? page.items : [...items.value, ...page.items];
    total.value = page.total;
    loading.value = false;
  }
  function switchTab(v: string) {
    if (activeTab.value === v) return;
    activeTab.value = v;
    load(true);
  }
  function loadMore() {
    currentPage.value += 1;
    load(false);
  }
  function onOpenChange(v: boolean) {
    if (v) load(true);
  }
  async function onMarkAll() {
    const succeeded = await markAllRead();
    if (succeeded) {
      items.value.forEach((n) => (n.isRead = 1));
      recordOperation({ module: '通知中心', operation: '全部通知标记已读成功' });
    }
  }
  async function onItemClick(n: NotificationItem) {
    if (!n.isRead) {
      n.isRead = 1;
      markRead([n.id]);
    }
    // 周报通知:点击弹出周报大图,不跳转
    const m = parseMeta(n.meta);
    if (m?.weeklyReport) {
      wrData.value = m.weeklyReport;
      wrVisible.value = true;
      open.value = false;
      return;
    }
    if (n.link) {
      // 升级/反馈等带跳转链接的通知:关闭面板并跳转
      open.value = false;
      router.push(n.link).catch(() => {});
    } else {
      // 系统/其他等无跳转链接的通知:弹框展示完整标题+正文(列表里被截成两行,弹框看全)
      detailItem.value = n;
      detailVisible.value = true;
      open.value = false;
    }
  }
  // 删除单条:本地即时移除 + 后端软删(未读的会由 refreshUnread 同步角标)
  async function onDelete(n: NotificationItem) {
    const previousItems = items.value;
    const previousTotal = total.value;
    items.value = items.value.filter((x) => x.id !== n.id);
    total.value = Math.max(0, total.value - 1);
    const succeeded = await deleteNotifications([n.id]);
    if (succeeded) {
      recordOperation({
        ...OPERATION_LOG_MAP.notification.deleteOne,
        operation: `删除通知成功【${renderTitle(n)}】`,
      });
    } else {
      items.value = previousItems;
      total.value = previousTotal;
    }
  }

  // 未读数:进来拉一次 + 定时轮询(2 分钟) + 切号刷新
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    refreshUnread();
    timer = setInterval(() => refreshUnread(), 120000);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });
  watch(
    () => user.id,
    () => refreshUnread(),
  );
</script>

<style scoped lang="less">
  .nt-bell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color);
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    box-sizing: border-box;
    transition: background-color 0.2s;
  }
  @media (min-width: 600px) {
    .nt-bell:hover {
      background-color: var(--menu-item-h-bg-color);
    }
  }
  .nt-badge {
    position: absolute;
    top: -1px;
    right: -1px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #ff4d4f;
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    box-sizing: border-box;
    box-shadow: 0 0 0 1.5px var(--background-color);
  }
</style>

<!-- 面板样式不 scoped:BPopover 内容 teleport 到 body,scoped 命不中 -->
<style lang="less">
  .notification-popover {
    width: 370px;
    max-width: calc(100vw - 24px);
    padding: 0;
    overflow: hidden;
  }
  .notification-popover .nt-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 45%, transparent);
  }
  .notification-popover .nt-title {
    font-size: 14px;
    font-weight: 700;
  }
  .notification-popover .nt-markall {
    font-size: 12px;
    color: var(--primary-color);
    cursor: pointer;
  }
  .notification-popover .nt-tabs {
    display: flex;
    gap: 6px;
    padding: 10px 14px 4px;
    flex-wrap: wrap;
  }
  .notification-popover .nt-tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent);
    background: transparent;
    color: var(--desc-color);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .notification-popover .nt-tab.active {
    border-color: transparent;
    background: var(--primary-color);
    color: #fff;
  }
  .notification-popover .nt-tab-badge {
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 999px;
    background: #ff4d4f;
    color: #fff;
    font-size: 10px;
    line-height: 15px;
    text-align: center;
    box-sizing: border-box;
    font-variant-numeric: tabular-nums;
  }
  .notification-popover .nt-tab.active .nt-tab-badge {
    background: rgba(255, 255, 255, 0.28);
  }
  .notification-popover .nt-list {
    max-height: 380px;
    overflow-y: auto;
    padding: 6px;
  }
  .notification-popover .nt-state {
    padding: 40px 0;
    text-align: center;
    color: var(--desc-color);
    font-size: 13px;
  }
  .notification-popover .nt-empty-icon {
    font-size: 30px;
    margin-bottom: 8px;
    opacity: 0.7;
  }
  .notification-popover .nt-group-label {
    padding: 10px 4px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--desc-color, #888);
  }
  .notification-popover .nt-item {
    position: relative;
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
  }
  .notification-popover .nt-item:hover {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  }
  .notification-popover .nt-del {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--desc-color);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s,
      background 0.15s;
  }
  .notification-popover .nt-item:hover .nt-del {
    opacity: 1;
  }
  .notification-popover .nt-del:hover {
    color: #ef4444;
    background: color-mix(in srgb, #ef4444 12%, transparent);
  }
  .notification-popover .nt-item.unread {
    background: color-mix(in srgb, var(--primary-color) 5%, transparent);
  }
  .notification-popover .nt-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--card-border-color);
  }
  /* 未读点兜底色:未配专属色的类型(如 streak_risk 签到提醒)也显示未读色,不再是灰点看着像已读;下面各 type 专属色会按需覆盖 */
  .notification-popover .nt-item.unread .nt-dot {
    background: var(--primary-color);
  }
  .notification-popover .nt-item.unread .nt-dot.type-level_up {
    background: #fb923c;
  }
  .notification-popover .nt-item.unread .nt-dot.type-opinion_reply {
    background: var(--primary-color);
  }
  .notification-popover .nt-item.unread .nt-dot.type-system {
    background: #22c55e;
  }
  .notification-popover .nt-item.unread .nt-dot.type-other {
    background: #a855f7;
  }
  .notification-popover .nt-item-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .notification-popover .nt-item-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
    padding-right: 22px; /* 预留删除按钮位,悬停出现时不遮挡标题 */
  }
  .notification-popover .nt-item-content {
    margin-top: 2px;
    font-size: 12px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: pre-wrap;
  }
  /* 通知详情弹框(BModal teleport 到 body,不在 .notification-popover 内) */
  /* 定宽约束 BModal 的 min-width:max-content,否则长正文会把弹框撑成单行、横向溢出 */
  .nt-detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px;
    width: 400px;
    max-width: 84vw;
    box-sizing: border-box;
  }
  .nt-detail-time {
    font-size: 12px;
    color: var(--desc-color);
  }
  .nt-detail-content {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-color);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-height: 56vh;
    overflow-y: auto;
  }
  .nt-detail-empty {
    font-size: 13px;
    color: var(--desc-color);
    padding: 8px 0;
  }
  .notification-popover .nt-item-time {
    margin-top: 4px;
    font-size: 11px;
    color: var(--desc-color);
    opacity: 0.8;
  }
  .notification-popover .nt-more {
    width: 100%;
    padding: 8px;
    margin-top: 4px;
    border: none;
    background: transparent;
    color: var(--primary-color);
    font-size: 12px;
    cursor: pointer;
  }
  .notification-popover .nt-more:disabled {
    color: var(--desc-color);
    cursor: default;
  }
</style>
