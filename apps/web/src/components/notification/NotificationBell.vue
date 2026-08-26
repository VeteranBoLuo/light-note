<template>
  <section v-if="page" class="nt-page">
    <header class="nt-page__header">
      <BButton class="nt-page__back" :aria-label="t('common.back')" @click="leaveNotificationPage">
        <SvgIcon :src="icon.arrow_left" size="20" aria-hidden="true" />
      </BButton>
      <h1>{{ t('notification.title') }}</h1>
      <BButton class="nt-page__markall" :disabled="unreadTotal <= 0" @click="onMarkAll">
        {{ t('notification.markAllRead') }}
      </BButton>
    </header>
    <NotificationCenterPanel
      mobile
      :show-header="false"
      :items="items"
      :groups="groupedItems"
      :tabs="tabs"
      :active-tab="activeTab"
      :unread-total="unreadTotal"
      :total="total"
      :loading="loading"
      :completing-todo-id="completingTodoId"
      :tab-unread="tabUnread"
      :render-title="renderTitle"
      :render-content="renderContent"
      :format-time="fmtTime"
      :todo-id="getTodoId"
      :todo-action-state="todoActionState"
      @mark-all="onMarkAll"
      @switch-tab="switchTab"
      @item-click="onItemClick"
      @complete-todo="completeReminderTodo"
      @more="openNotificationActions"
      @load-more="loadMore"
    />
  </section>
  <BPopover
    v-else-if="!isMobileLayout"
    trigger="click"
    placement="bottom-right"
    overlay-class-name="notification-popover"
    v-model:open="open"
    @openChange="onOpenChange"
  >
    <BTooltip :title="t('notification.title')">
      <BButton
        class="nt-bell dom-hover"
        :class="{ 'is-open': open }"
        :aria-expanded="open"
        v-click-log="{ module: '通知中心', operation: '打开通知铃铛' }"
      >
        <SvgIcon :src="icon.settings.notification" size="24" aria-hidden="true" />
        <span v-if="unreadTotal > 0" class="nt-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
      </BButton>
    </BTooltip>

    <template #content>
      <NotificationCenterPanel
        :items="items"
        :groups="groupedItems"
        :tabs="tabs"
        :active-tab="activeTab"
        :unread-total="unreadTotal"
        :total="total"
        :loading="loading"
        :completing-todo-id="completingTodoId"
        :tab-unread="tabUnread"
        :render-title="renderTitle"
        :render-content="renderContent"
        :format-time="fmtTime"
        :todo-id="getTodoId"
        :todo-action-state="todoActionState"
        @mark-all="onMarkAll"
        @switch-tab="switchTab"
        @item-click="onItemClick"
        @complete-todo="completeReminderTodo"
        @delete="onDelete"
        @load-more="loadMore"
      />
    </template>
  </BPopover>
  <template v-else>
    <BTooltip :title="t('notification.title')">
      <BButton class="nt-bell" @click="openMobileNotifications">
        <SvgIcon :src="icon.settings.notification" size="24" aria-hidden="true" />
        <span v-if="unreadTotal > 0" class="nt-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
      </BButton>
    </BTooltip>
  </template>
  <MobilePageActionsDrawer
    v-model:open="notificationActionsOpen"
    :object-title="activeNotification ? renderTitle(activeNotification) : t('notification.title')"
    :actions="notificationActions"
    @action="handleNotificationAction"
  />
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
  import { inboxStore, useUserStore } from '@/store';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import { useNotification, type NotificationItem } from '@/composables/useNotification.ts';
  import WeeklyReportModal from '@/components/growth/WeeklyReportModal.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { completeTodo } from '@/api/todoApi';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { NOTIFICATION_PANEL_OPEN_EVENT } from '@/utils/notificationEntry';
  import NotificationCenterPanel from '@/components/notification/NotificationCenterPanel.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';

  const props = withDefaults(defineProps<{ page?: boolean }>(), { page: false });

  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const inbox = inboxStore();
  const isMobileLayout = useMobileLayout();
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
  const completingTodoId = ref('');
  const notificationActionsOpen = ref(false);
  const activeNotification = ref<NotificationItem | null>(null);
  const activeTab = ref('all');
  const currentPage = ref(1);
  const pageSize = 20;

  const tabs = computed(() => [
    { value: 'all', label: t('notification.tabAll') },
    { value: 'todo_reminder', label: t('notification.tabTodo') },
    { value: 'system', label: t('notification.tabSystem') },
    { value: 'opinion_reply', label: t('notification.tabFeedback') },
  ]);
  // 各 tab 未读角标:全部=总数,其余=该类型未读数
  // 「其他」tab 兜底:非三大已知类型(如 streak_risk 签到提醒)都归它,与后端 list 口径一致
  function tabUnread(v: string): number {
    if (v === 'all') return unreadTotal.value;
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
  function todoActionState(n: NotificationItem): 'pending' | 'completed' | 'unavailable' {
    if (!String(parseMeta(n.meta).todoId || '').trim()) return 'unavailable';
    return n.todoState === 'completed' || n.todoState === 'unavailable' ? n.todoState : 'pending';
  }
  async function markNotificationRead(n: NotificationItem) {
    if (n.isRead) return;
    n.isRead = 1;
    await markRead([n.id]);
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
  function openMobileNotifications() {
    void router.push({ name: 'notifications' });
  }
  function handleExternalOpen() {
    if (props.page) {
      void load(true);
      return;
    }
    if (isMobileLayout.value) {
      openMobileNotifications();
      return;
    }
    if (open.value) return;
    open.value = true;
    void load(true);
  }

  function leaveNotificationPage() {
    if (typeof router.options.history.state.back === 'string') {
      router.back();
      return;
    }
    void router.replace({ name: 'workbenches' });
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
    if (n.type === 'todo_reminder' && todoActionState(n) === 'unavailable') {
      message.warning(t('notification.todoUnavailable'));
      return;
    }
    // 周报通知:点击弹出周报大图,不跳转
    const m = parseMeta(n.meta);
    if (m?.weeklyReport) {
      wrData.value = m.weeklyReport;
      await closePanelThen(() => {
        wrVisible.value = true;
      });
      return;
    }
    if (n.link) {
      // 升级/反馈等带跳转链接的通知:关闭面板并跳转
      await closePanelThen(() => router.push(n.link).catch(() => {}));
    } else {
      // 系统/其他等无跳转链接的通知:弹框展示完整标题+正文(列表里被截成两行,弹框看全)
      detailItem.value = n;
      await closePanelThen(() => {
        detailVisible.value = true;
      });
    }
  }
  async function completeReminderTodo(n: NotificationItem) {
    const todoId = getTodoId(n);
    if (!todoId || completingTodoId.value) return;
    completingTodoId.value = todoId;
    try {
      const res = await completeTodo(todoId, { silent: true });
      if (res.status === 200) {
        n.todoState = 'completed';
        // 通知、顶部导航与移动底栏分别持有通知未读数和待办注意力计数。
        // 完成成功后同步两份权威读模型，不能依赖进入待办页时顺带刷新角标。
        await Promise.all([markNotificationRead(n), inbox.refreshCount()]);
        message.success(t('notification.todoCompleted'));
      } else if (res.status === 404) {
        n.todoState = 'unavailable';
        await markNotificationRead(n);
        message.warning(t('notification.todoUnavailable'));
      } else {
        message.warning(t('notification.todoCompleteFailed'));
      }
    } catch {
      message.warning(t('notification.todoCompleteFailed'));
    } finally {
      completingTodoId.value = '';
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

  function getTodoId(n: NotificationItem) {
    return String(parseMeta(n.meta).todoId || '');
  }

  async function closePanelThen(next: () => void | Promise<unknown>) {
    if (props.page) {
      await next();
      return;
    }
    open.value = false;
    await next();
  }

  const notificationActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'delete',
      label: t('notification.delete'),
      icon: icon.noteDetail.delete,
      danger: true,
      description: t('notification.deleteDescription'),
    },
  ]);

  function openNotificationActions(item: NotificationItem) {
    activeNotification.value = item;
    notificationActionsOpen.value = true;
  }

  function handleNotificationAction(action: MobilePageActionItem) {
    if (action.key === 'delete' && activeNotification.value) void onDelete(activeNotification.value);
  }

  // 未读数:进来拉一次 + 定时轮询(2 分钟) + 切号刷新
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    refreshUnread();
    if (props.page) void load(true);
    timer = setInterval(() => refreshUnread(), 120000);
    window.addEventListener(NOTIFICATION_PANEL_OPEN_EVENT, handleExternalOpen);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
    window.removeEventListener(NOTIFICATION_PANEL_OPEN_EVENT, handleExternalOpen);
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
    background: transparent !important;
    box-sizing: border-box;
    transition:
      color 0.2s,
      background-color 0.2s;
  }
  @media (min-width: 600px) {
    .nt-bell:hover {
      background-color: var(--menu-item-h-bg-color) !important;
    }
    .nt-bell.is-open {
      color: var(--primary-color);
      background-color: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
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

  .nt-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .nt-page__header {
    position: relative;
    min-height: calc(56px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 12px 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--surface-divider-color, var(--card-border-color));
    background: var(--card-background);
  }

  .nt-page__header h1 {
    position: absolute;
    left: 50%;
    margin: 0;
    transform: translateX(-50%);
    color: var(--text-color);
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
  }

  .nt-page__back,
  .nt-page__markall {
    position: relative;
    z-index: 1;
    height: 44px;
    padding: 0;
    background: transparent !important;
  }

  .nt-page__back {
    width: 44px;
    min-width: 44px;
    color: var(--text-color);
  }

  .nt-page__markall {
    min-width: 72px;
    padding-inline: 6px;
    color: var(--primary-color);
    font-size: 13px;
  }

  .nt-page__markall:disabled {
    color: var(--desc-color);
  }

  .nt-page > :deep(.nt-panel) {
    min-height: 0;
    flex: 1 1 auto;
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
  /* 暗色下通知项与面板默认同为 --card-background,整片糊在一起;
     面板改用更深的 panel 底,形成「页面 < 面板 < 通知卡」三层递进 */
  [data-theme='night'] .notification-popover {
    background: var(--surface-panel-bg, var(--menu-body-bg-color));
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
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--primary-color);
    cursor: pointer;
  }
  .notification-popover .nt-markall:disabled {
    color: var(--desc-color);
    cursor: default;
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
    border-color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
    color: var(--primary-color);
    font-weight: 700;
  }
  .notification-popover .nt-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 15px;
    height: 15px;
    padding: 0;
    border-radius: 999px;
    background: #ff4d4f;
    color: #fff;
    font-size: 10px;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    box-sizing: border-box;
    font-variant-numeric: tabular-nums;
  }
  .notification-popover .nt-tab-badge.is-wide {
    min-width: 22px;
    padding: 0 5px;
  }
  .notification-popover .nt-tab-badge.is-capped {
    min-width: 28px;
  }
  .notification-popover .nt-tab.active .nt-tab-badge {
    background: var(--danger-fill-bg, #d93b3b);
    color: var(--danger-fill-fg, #fff);
  }
  .notification-popover .nt-list {
    max-height: 380px;
    overflow-y: auto;
    padding: 6px;
  }
  /* 移动端顶栏铃铛打开时:面板近全宽,列表限高避免盖过底部导航 */
  @media (max-width: 767px) {
    .notification-popover .nt-list {
      max-height: min(380px, 52vh);
    }
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
    border: 1px solid color-mix(in srgb, var(--card-border-color) 68%, transparent);
    border-radius: 10px;
    background: var(--card-background);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .notification-popover .nt-item + .nt-item {
    margin-top: 6px;
  }
  .notification-popover .nt-del {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    min-width: 22px;
    height: 22px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--desc-color);
    cursor: pointer;
    opacity: 1;
    z-index: 1;
    transition:
      opacity 0.15s,
      color 0.15s,
      background 0.15s;
  }
  .notification-popover .nt-item.unread {
    background: var(--card-background);
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
  .notification-popover .nt-item.unread .nt-item-title {
    font-weight: 700;
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
  .notification-popover .nt-todo-actions {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    margin-top: 8px;
  }
  .notification-popover .nt-todo-action {
    flex: 0 0 auto;
    width: auto;
    min-width: 0;
    height: 26px;
    padding: 0 10px;
    border-radius: 7px;
    line-height: 26px;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
  }
  .notification-popover .nt-todo-action--complete {
    border: 1px solid var(--primary-color);
    box-shadow: none;
  }
  .notification-popover .nt-todo-action--open {
    border: 1px solid var(--notification-secondary-action-border);
    background: var(--notification-secondary-action-bg);
    box-shadow: none;
    color: var(--primary-color);
  }
  .notification-popover .nt-todo-action--open:hover {
    background: var(--notification-secondary-action-hover-bg);
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
  .notification-popover .nt-item:focus-within {
    border-color: color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .notification-popover .nt-item:focus-within .nt-del {
    opacity: 1;
  }
  @media (hover: hover) and (pointer: fine) {
    .notification-popover .nt-item:hover {
      border-color: color-mix(in srgb, var(--primary-color) 18%, var(--card-border-color));
      background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
    }
    .notification-popover .nt-item:hover .nt-del {
      opacity: 1;
    }
    .notification-popover .nt-del:hover {
      opacity: 1;
      color: #ef4444;
      background: color-mix(in srgb, #ef4444 12%, transparent);
    }
  }
</style>
