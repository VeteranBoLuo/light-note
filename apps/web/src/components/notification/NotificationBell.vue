<template>
  <BPopover
    trigger="click"
    placement="bottom-right"
    overlay-class-name="notification-popover"
    v-model:open="open"
    @openChange="onOpenChange"
  >
    <div class="nt-bell dom-hover" :title="t('notification.title')">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span v-if="unreadTotal > 0" class="nt-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
    </div>

    <template #content>
      <div class="nt-panel">
        <div class="nt-head">
          <span class="nt-title">{{ t('notification.title') }}</span>
          <span v-if="unreadTotal > 0" class="nt-markall dom-hover" @click="onMarkAll">{{ t('notification.markAllRead') }}</span>
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
          </button>
        </div>

        <div class="nt-list">
          <div v-if="loading && !items.length" class="nt-state">{{ t('notification.loading') }}</div>
          <div v-else-if="!items.length" class="nt-state">
            <div class="nt-empty-icon">🔔</div>
            <div>{{ t('notification.empty') }}</div>
          </div>
          <template v-else>
            <div
              v-for="n in items"
              :key="n.id"
              class="nt-item dom-hover"
              :class="{ unread: !n.isRead }"
              @click="onItemClick(n)"
            >
              <span class="nt-dot" :class="`type-${n.type}`"></span>
              <div class="nt-item-main">
                <div class="nt-item-title">{{ renderTitle(n) }}</div>
                <div v-if="renderContent(n)" class="nt-item-content">{{ renderContent(n) }}</div>
                <div class="nt-item-time">{{ fmtTime(n.createTime) }}</div>
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
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import { useNotification, type NotificationItem } from '@/composables/useNotification.ts';

  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const { unreadTotal, refreshUnread, fetchList, markRead, markAllRead } = useNotification();

  const open = ref(false);
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
      return t('notification.levelUpTitle', { level: m.level, name: m.name });
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
    await markAllRead();
    items.value.forEach((n) => (n.isRead = 1));
  }
  async function onItemClick(n: NotificationItem) {
    if (!n.isRead) {
      n.isRead = 1;
      markRead([n.id]);
    }
    open.value = false;
    if (n.link) router.push(n.link).catch(() => {});
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
    padding: 0 3px;
  }
  .nt-badge {
    position: absolute;
    top: -4px;
    right: -3px;
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
    width: 340px;
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
  .notification-popover .nt-item {
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
  }
  .notification-popover .nt-item:hover {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
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
