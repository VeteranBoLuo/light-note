<template>
  <div
    class="nt-panel"
    :class="{
      'is-mobile': mobile,
      'is-desktop-page': desktopPage,
      'is-wide-desktop-page': wideDesktopPage,
    }"
  >
    <div v-if="showHeader" class="nt-head">
      <span class="nt-title">{{ t('notification.title') }}</span>
      <BButton class="nt-markall" :disabled="unreadTotal <= 0" @click="emit('mark-all')">
        <SvgIcon :src="icon.settings.notificationReadAll" size="15" aria-hidden="true" />
        {{ t('notification.markAllRead') }}
      </BButton>
    </div>

    <slot name="browser-push-prompt" />
    <div class="nt-tabs" role="tablist" :aria-label="t('notification.categoryLabel')">
      <BButton
        v-for="tab in tabs"
        :key="tab.value"
        class="nt-tab"
        :class="{ active: activeTab === tab.value }"
        role="tab"
        :aria-selected="activeTab === tab.value"
        @click="emit('switch-tab', tab.value)"
      >
        {{ tab.label }}
        <span
          v-if="tabUnread(tab.value) > 0"
          class="nt-tab-badge"
          :class="{
            'is-wide': tabUnread(tab.value) > 9,
            'is-capped': tabUnread(tab.value) > 99,
          }"
        >
          {{ tabUnread(tab.value) > 99 ? '99+' : tabUnread(tab.value) }}
        </span>
      </BButton>
    </div>

    <div v-if="locateState !== 'idle'" class="nt-locate-state" role="status">
      <span>{{
        locateState === 'loading'
          ? t('notification.loading')
          : locateState === 'found'
            ? t('browserPush.located')
            : locateState === 'error'
              ? t('browserPush.locateFailed')
              : t('browserPush.unavailable')
      }}</span>
      <BButton v-if="locateState === 'error'" size="small" @click="emit('retry-locate')">{{
        t('browserPush.retry')
      }}</BButton>
    </div>
    <div class="nt-list">
      <div v-if="loading && !items.length" class="nt-state">{{ t('notification.loading') }}</div>
      <div v-else-if="!items.length" class="nt-state">
        <SvgIcon :src="icon.settings.notification" size="30" aria-hidden="true" />
        <span>{{ t('notification.empty') }}</span>
      </div>
      <template v-else>
        <section v-for="group in groups" :key="group.key" class="nt-group">
          <h3 class="nt-group-label">{{ group.label }}</h3>
          <div class="nt-group-surface">
            <article
              v-for="item in group.items"
              :key="item.id"
              class="nt-item"
              :class="{ unread: !item.isRead, 'is-target': item.id === targetId }"
              :data-notification-id="item.id"
              @click="emit('item-click', item)"
              v-click-log="{ module: '通知中心', operation: `查看通知【${renderTitle(item)}】` }"
            >
              <span class="nt-dot" :class="`type-${item.type}`" aria-hidden="true"></span>
              <span class="nt-type-icon" :class="`type-${item.type}`" aria-hidden="true">
                <SvgIcon :src="notificationIcon(item)" size="17" />
              </span>
              <div class="nt-item-main">
                <div class="nt-item-title">{{ renderTitle(item) }}</div>
                <div v-if="renderContent(item)" class="nt-item-content">{{ renderContent(item) }}</div>
                <div class="nt-item-time">{{ formatTime(item.createTime) }}</div>
                <div v-if="item.type === 'todo_reminder'" class="nt-todo-actions">
                  <BButton
                    v-if="todoActionState(item) === 'pending'"
                    size="small"
                    type="primary"
                    class="nt-todo-action"
                    :loading="completingTodoId === todoId(item)"
                    @click.stop="emit('complete-todo', item)"
                  >
                    {{ t('notification.todoComplete') }}
                  </BButton>
                  <BChip
                    v-else
                    class="nt-todo-state"
                    :tone="todoActionState(item) === 'completed' ? 'success' : 'neutral'"
                  >
                    {{
                      t(
                        todoActionState(item) === 'completed'
                          ? 'notification.todoCompletedState'
                          : 'notification.todoUnavailable',
                      )
                    }}
                  </BChip>
                </div>
              </div>
              <BButton
                class="nt-item-action"
                :aria-label="mobile ? t('common.more') : t('notification.delete')"
                @click.stop="mobile ? emit('more', item) : emit('delete', item)"
              >
                <SvgIcon :src="mobile ? icon.common.more : icon.noteDetail.delete" size="18" aria-hidden="true" />
              </BButton>
            </article>
          </div>
        </section>
        <BButton v-if="items.length < total" class="nt-more" :disabled="loading" @click="emit('load-more')">
          {{ loading ? t('notification.loading') : t('notification.loadMore') }}
        </BButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { NotificationItem } from '@/composables/useNotification';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  interface NotificationTab {
    value: string;
    label: string;
  }
  interface NotificationGroup {
    key: string;
    label: string;
    items: NotificationItem[];
  }

  withDefaults(
    defineProps<{
      targetId?: string;
      locateState?: 'idle' | 'loading' | 'found' | 'unavailable' | 'error';
      items: NotificationItem[];
      groups: NotificationGroup[];
      tabs: NotificationTab[];
      activeTab: string;
      unreadTotal: number;
      total: number;
      loading: boolean;
      completingTodoId: string;
      mobile?: boolean;
      desktopPage?: boolean;
      wideDesktopPage?: boolean;
      showHeader?: boolean;
      tabUnread: (value: string) => number;
      renderTitle: (item: NotificationItem) => string;
      renderContent: (item: NotificationItem) => string;
      formatTime: (value: string) => string;
      todoId: (item: NotificationItem) => string;
      todoActionState: (item: NotificationItem) => 'pending' | 'completed' | 'unavailable';
    }>(),
    { targetId: '', locateState: 'idle', mobile: false, desktopPage: false, wideDesktopPage: false, showHeader: true },
  );
  const emit = defineEmits<{
    'retry-locate': [];
    'mark-all': [];
    'switch-tab': [value: string];
    'item-click': [item: NotificationItem];
    'complete-todo': [item: NotificationItem];
    more: [item: NotificationItem];
    delete: [item: NotificationItem];
    'load-more': [];
  }>();
  const { t } = useI18n();

  function notificationIcon(item: NotificationItem) {
    if (item.type === 'todo_reminder') return icon.growth.action;
    if (item.type === 'level_up') return icon.growth.level;
    if (item.type === 'streak_risk') return icon.growth.checkin;
    if (item.type === 'daily_brief' || item.type === 'ai_routine') return icon.ai.summary;
    if (item.type === 'opinion_reply' || item.type === 'feature_request') return icon.userCenter.menu.feedback;
    if (item.type === 'community_chat') return icon.ai.conversations;
    return icon.settings.notification;
  }
</script>

<style scoped lang="less">
  .nt-locate-state {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
    font-size: var(--ui-font-12, 12px);
    color: var(--primary-color);
  }
  .nt-item.is-target {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }
  .nt-item.is-target .nt-item-title {
    color: var(--primary-color);
  }

  .nt-panel {
    font-size: var(--ui-font-16, 16px);
    width: var(--ui-layout-370, 370px);
    max-width: calc(100vw - var(--ui-space-24, 24px));
    color: var(--text-color);
    background: var(--card-background);
  }

  .nt-panel.is-mobile {
    width: 100%;
    max-width: none;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--surface-page-bg);
  }

  .nt-head,
  .nt-tabs {
    display: flex;
    align-items: center;
  }

  .nt-head {
    justify-content: space-between;
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .nt-title {
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
  }

  .nt-markall {
    gap: var(--ui-space-5, 5px);
    color: var(--primary-color);
    background: transparent !important;
    font-size: var(--ui-font-12, 12px);
  }

  .nt-tabs {
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px) var(--ui-space-6, 6px);
  }

  .nt-tab {
    min-width: 0;
    flex: 1 1 0;
    gap: var(--ui-space-4, 4px);
    border: 1px solid transparent;
    border-radius: var(--mobile-control-radius, 10px);
    color: var(--desc-color);
    background: transparent !important;
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
    transition:
      color 0.15s,
      background-color 0.15s,
      border-color 0.15s;
  }

  .nt-tab.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
  }

  .nt-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: var(--ui-layout-16, 16px);
    height: var(--ui-layout-16, 16px);
    padding: 0;
    border-radius: 999px;
    color: var(--danger-fill-fg, #fff);
    background: var(--danger-fill-bg, #d93b3b);
    font-size: var(--ui-font-10, 10px);
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    box-sizing: border-box;
    font-variant-numeric: tabular-nums;
  }

  .nt-tab-badge.is-wide {
    min-width: var(--ui-layout-22, 22px);
    padding: 0 var(--ui-space-5, 5px);
  }

  .nt-tab-badge.is-capped {
    min-width: var(--ui-layout-28, 28px);
  }

  .nt-list {
    max-height: var(--ui-layout-420, 420px);
    overflow-y: auto;
    padding: var(--ui-space-6, 6px);
  }

  .is-mobile .nt-list {
    max-height: none;
    min-height: 0;
    flex: 1 1 auto;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 6px var(--mobile-page-gutter, 14px) max(24px, env(safe-area-inset-bottom));
  }

  .nt-state {
    min-height: var(--ui-layout-220, 220px);
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--ui-space-10, 10px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }

  .nt-group-label {
    margin: 0;
    padding: var(--ui-space-12, 12px) var(--ui-space-2, 2px) var(--ui-space-7, 7px);
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
  }

  .nt-item {
    position: relative;
    min-height: var(--ui-layout-72, 72px);
    box-sizing: border-box;
    display: flex;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-12, 12px) var(--ui-space-52, 52px) var(--ui-space-12, 12px) var(--ui-space-12, 12px);
    border-left: 0;
    background: var(--card-background);
    cursor: pointer;
  }

  .nt-item + .nt-item {
    border-top: 1px solid var(--mobile-row-divider, var(--surface-divider-color));
  }

  .nt-item.unread {
    background: var(--card-background);
  }

  .nt-dot {
    width: 8px;
    height: 8px;
    margin-top: var(--ui-space-6, 6px);
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--surface-border-color);
  }

  .nt-type-icon {
    display: none;
  }

  .nt-item.unread .nt-dot {
    background: var(--primary-color);
  }

  .nt-item.unread .nt-dot.type-level_up {
    background: var(--resource-file-color);
  }

  .nt-item.unread .nt-dot.type-system {
    background: var(--success-color);
  }

  .nt-item-main {
    min-width: 0;
    flex: 1 1 auto;
  }

  .nt-item-title {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    line-height: 1.4;
  }

  .nt-item.unread .nt-item-title {
    font-weight: 750;
  }

  .nt-item-content {
    margin-top: var(--ui-space-2, 2px);
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.45;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .nt-item-time {
    margin-top: var(--ui-space-4, 4px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .nt-item-action {
    position: absolute;
    top: 0;
    right: var(--ui-space-6, 6px);
    width: var(--ui-control-44, 44px);
    min-width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
    padding: 0;
    color: var(--desc-color);
    background: transparent !important;
  }

  .nt-todo-actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    margin-top: var(--ui-space-8, 8px);
  }

  .nt-todo-state {
    min-height: var(--ui-control-24, 24px);
    padding: var(--ui-space-1, 1px) var(--ui-space-9, 9px);
    border-radius: 7px;
    font-size: var(--ui-font-11, 11px);
    line-height: var(--ui-layout-20, 20px);
  }

  .nt-todo-action {
    width: auto;
    min-width: 0;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    color: var(--primary-color);
    background: var(--card-background) !important;
  }

  .is-mobile .nt-todo-action {
    min-height: 44px;
  }

  .nt-more {
    width: 100%;
    margin-top: var(--ui-space-8, 8px);
    color: var(--primary-color);
    background: transparent !important;
  }

  /* 独立桌面页面是宽屏清单；这些规则不会泄漏到铃铛 popover。 */
  .nt-panel.is-desktop-page {
    width: 100%;
    max-width: none;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--card-background);
  }

  .is-desktop-page .nt-tabs {
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .is-desktop-page .nt-tab {
    min-width: var(--ui-layout-92, 92px);
    min-height: var(--ui-control-36, 36px);
    flex: 0 0 auto;
    padding: 0 var(--ui-space-14, 14px);
    border-color: var(--surface-border-color);
    border-radius: 9px;
    font-size: var(--ui-font-13, 13px);
  }

  .is-desktop-page .nt-tab.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
  }

  .is-desktop-page .nt-list {
    max-height: none;
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--ui-space-8, 8px) var(--ui-space-16, 16px) var(--ui-space-24, 24px);
  }

  .is-desktop-page .nt-group-label {
    padding: var(--ui-space-14, 14px) var(--ui-space-3, 3px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
  }

  .is-desktop-page .nt-group-surface {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .is-desktop-page .nt-item {
    min-height: var(--ui-layout-78, 78px);
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px) var(--ui-space-56, 56px) var(--ui-space-14, 14px) var(--ui-space-16, 16px);
    border-left: 3px solid transparent;
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .is-desktop-page .nt-item:hover {
    background: var(--menu-item-h-bg-color);
  }

  .is-desktop-page .nt-item.unread {
    border-left-color: var(--primary-color);
    background: var(--card-background);
  }

  .is-desktop-page .nt-item.unread:hover {
    background: var(--menu-item-h-bg-color);
  }

  .is-desktop-page .nt-item-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--ui-space-24, 24px);
  }

  .is-desktop-page .nt-item-title,
  .is-desktop-page .nt-item-content,
  .is-desktop-page .nt-todo-actions {
    grid-column: 1;
  }

  .is-desktop-page .nt-item-title {
    font-size: var(--ui-font-14, 14px);
  }

  .is-desktop-page .nt-item-content {
    max-width: var(--ui-layout-920, 920px);
  }

  .is-desktop-page .nt-item-time {
    grid-column: 2;
    grid-row: 1;
    margin: var(--ui-space-1, 1px) 0 0;
    white-space: nowrap;
  }

  .is-desktop-page .nt-item-action {
    top: var(--ui-space-10, 10px);
    right: var(--ui-space-8, 8px);
  }

  .is-desktop-page .nt-state {
    min-height: var(--ui-layout-320, 320px);
  }

  /* 原型式宽桌面页：一个外层画布承载日期分组，去掉组内再套卡片的层级。 */
  .is-wide-desktop-page .nt-tabs {
    gap: var(--ui-space-9, 9px);
    padding: var(--ui-space-13, 13px) var(--ui-space-16, 16px) var(--ui-space-12, 12px);
  }

  .is-wide-desktop-page .nt-tab {
    min-width: var(--ui-layout-96, 96px);
    min-height: var(--ui-control-35, 35px);
    border-radius: 9px;
  }

  .is-wide-desktop-page .nt-list {
    padding: var(--ui-space-4, 4px) var(--ui-space-16, 16px) var(--ui-space-24, 24px);
  }

  .is-wide-desktop-page .nt-group-label {
    padding: var(--ui-space-15, 15px) var(--ui-space-4, 4px) var(--ui-space-8, 8px);
  }

  .is-wide-desktop-page .nt-group-surface {
    border: 0;
    border-top: 1px solid var(--surface-divider-color);
    border-radius: 0;
    background: transparent;
  }

  .is-wide-desktop-page .nt-item {
    min-height: var(--ui-layout-70, 70px);
    padding: var(--ui-space-12, 12px) var(--ui-space-58, 58px) var(--ui-space-12, 12px) var(--ui-space-12, 12px);
    align-items: flex-start;
    gap: var(--ui-space-12, 12px);
  }

  .is-wide-desktop-page .nt-dot {
    display: none;
  }

  .is-wide-desktop-page .nt-type-icon {
    width: var(--ui-layout-30, 30px);
    height: var(--ui-layout-30, 30px);
    flex: 0 0 var(--ui-layout-30, 30px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--surface-border-color));
    border-radius: 9px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }

  .is-wide-desktop-page .nt-type-icon.type-todo_reminder {
    color: var(--resource-todo-color, var(--primary-color));
  }

  .is-wide-desktop-page .nt-type-icon.type-level_up,
  .is-wide-desktop-page .nt-type-icon.type-streak_risk {
    color: var(--resource-file-color);
  }

  .is-wide-desktop-page .nt-type-icon.type-daily_brief,
  .is-wide-desktop-page .nt-type-icon.type-ai_routine {
    color: var(--primary-color);
  }

  .is-wide-desktop-page .nt-type-icon.type-system {
    color: var(--success-color);
  }

  .is-wide-desktop-page .nt-type-icon.type-opinion_reply,
  .is-wide-desktop-page .nt-type-icon.type-feature_request,
  .is-wide-desktop-page .nt-type-icon.type-community_chat {
    color: var(--resource-note-color);
  }

  .is-wide-desktop-page .nt-item.unread {
    border-left-color: var(--primary-color);
    background: var(--mobile-selected-bg);
  }

  .is-wide-desktop-page .nt-item.unread:hover {
    background: var(--mobile-selected-bg);
  }

  .is-mobile .nt-tabs {
    gap: 4px;
    margin: 14px 14px 6px;
    padding: 4px;
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .is-mobile .nt-tab {
    min-height: 36px;
    border: 1px solid transparent;
    border-radius: 10px;
    font-size: 13px;
  }

  .is-mobile .nt-tab.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
    box-shadow: none;
  }

  .is-mobile .nt-group-label {
    padding: 12px 2px 9px;
    font-size: 16px;
  }

  .is-mobile .nt-group-surface {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: var(--card-background);
  }

  .is-mobile .nt-item {
    min-height: 88px;
    gap: 10px;
    padding: 13px 52px 13px 13px;
  }

  .is-mobile .nt-item-title {
    font-size: 15px;
    font-weight: 700;
  }

  .is-mobile .nt-dot {
    width: 9px;
    height: 9px;
    margin-top: 7px;
    flex-basis: 9px;
  }

  .is-mobile .nt-todo-action {
    position: relative;
    z-index: 0;
    isolation: isolate;
    height: 44px;
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    color: var(--primary-color);
    background: transparent !important;
    font-size: 11px;
  }

  .is-mobile .nt-todo-action::before {
    position: absolute;
    z-index: -1;
    inset: 10px 0;
    border: 1px solid var(--primary-color);
    border-radius: 7px;
    background: var(--mobile-selected-bg);
    content: '';
  }
</style>
