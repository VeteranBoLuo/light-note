<template>
  <div class="nt-panel" :class="{ 'is-mobile': mobile }">
    <div v-if="showHeader" class="nt-head">
      <span class="nt-title">{{ t('notification.title') }}</span>
      <BButton class="nt-markall" :disabled="unreadTotal <= 0" @click="emit('mark-all')">
        <SvgIcon :src="icon.settings.notificationReadAll" size="15" aria-hidden="true" />
        {{ t('notification.markAllRead') }}
      </BButton>
    </div>

    <div class="nt-tabs">
      <BButton
        v-for="tab in tabs"
        :key="tab.value"
        class="nt-tab"
        :class="{ active: activeTab === tab.value }"
        @click="emit('switch-tab', tab.value)"
      >
        {{ tab.label }}
        <span v-if="tabUnread(tab.value) > 0" class="nt-tab-badge">
          {{ tabUnread(tab.value) > 99 ? '99+' : tabUnread(tab.value) }}
        </span>
      </BButton>
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
              :class="{ unread: !item.isRead }"
              @click="emit('item-click', item)"
            >
              <span class="nt-dot" :class="`type-${item.type}`" aria-hidden="true"></span>
              <div class="nt-item-main">
                <div class="nt-item-title">{{ renderTitle(item) }}</div>
                <div v-if="renderContent(item)" class="nt-item-content">{{ renderContent(item) }}</div>
                <div class="nt-item-time">{{ formatTime(item.createTime) }}</div>
                <div v-if="item.type === 'todo_reminder'" class="nt-todo-actions">
                  <BButton
                    size="small"
                    type="primary"
                    class="nt-todo-action"
                    :loading="completingTodoId === todoId(item)"
                    @click.stop="emit('complete-todo', item)"
                  >
                    {{ t('notification.todoComplete') }}
                  </BButton>
                  <BButton size="small" class="nt-todo-action" @click.stop="emit('open-todo', item)">
                    {{ t('notification.todoOpen') }}
                  </BButton>
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
      items: NotificationItem[];
      groups: NotificationGroup[];
      tabs: NotificationTab[];
      activeTab: string;
      unreadTotal: number;
      total: number;
      loading: boolean;
      completingTodoId: string;
      mobile?: boolean;
      showHeader?: boolean;
      tabUnread: (value: string) => number;
      renderTitle: (item: NotificationItem) => string;
      renderContent: (item: NotificationItem) => string;
      formatTime: (value: string) => string;
      todoId: (item: NotificationItem) => string;
    }>(),
    { mobile: false, showHeader: true },
  );
  const emit = defineEmits<{
    'mark-all': [];
    'switch-tab': [value: string];
    'item-click': [item: NotificationItem];
    'complete-todo': [item: NotificationItem];
    'open-todo': [item: NotificationItem];
    more: [item: NotificationItem];
    delete: [item: NotificationItem];
    'load-more': [];
  }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .nt-panel {
    width: 370px;
    max-width: calc(100vw - 24px);
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
    padding: 12px 14px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .nt-title {
    font-size: 14px;
    font-weight: 700;
  }

  .nt-markall {
    gap: 5px;
    color: var(--primary-color);
    background: transparent !important;
    font-size: 12px;
  }

  .nt-tabs {
    gap: 6px;
    padding: 10px 12px 6px;
  }

  .nt-tab {
    min-width: 0;
    flex: 1 1 0;
    gap: 4px;
    border: 1px solid transparent;
    border-radius: var(--mobile-control-radius, 10px);
    color: var(--desc-color);
    background: transparent !important;
    font-size: 12px;
  }

  .nt-tab.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--mobile-selected-bg) !important;
    font-weight: 700;
  }

  .nt-tab-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    color: var(--danger-fill-fg, #fff);
    background: var(--danger-fill-bg, #d93b3b);
    font-size: 10px;
    line-height: 16px;
    text-align: center;
  }

  .nt-list {
    max-height: 420px;
    overflow-y: auto;
    padding: 6px;
  }

  .is-mobile .nt-list {
    max-height: none;
    flex: 1 1 auto;
    padding: 6px var(--mobile-page-gutter, 14px) max(24px, env(safe-area-inset-bottom));
  }

  .nt-state {
    min-height: 220px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    color: var(--desc-color);
    font-size: 13px;
  }

  .nt-group-label {
    margin: 0;
    padding: 12px 2px 7px;
    color: var(--text-color);
    font-size: 14px;
    font-weight: 700;
  }

  .nt-group-surface {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: var(--mobile-surface-radius, 16px);
    background: var(--card-background);
  }

  .nt-item {
    position: relative;
    min-height: 72px;
    box-sizing: border-box;
    display: flex;
    gap: 10px;
    padding: 12px 52px 12px 12px;
    border-left: 3px solid transparent;
    background: var(--card-background);
    cursor: pointer;
  }

  .nt-item + .nt-item {
    border-top: 1px solid var(--mobile-row-divider, var(--surface-divider-color));
  }

  .nt-item.unread {
    border-left-color: var(--primary-color);
    background: var(--mobile-selected-bg);
  }

  .nt-dot {
    width: 8px;
    height: 8px;
    margin-top: 6px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--surface-border-color);
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
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .nt-item.unread .nt-item-title {
    font-weight: 750;
  }

  .nt-item-content {
    margin-top: 2px;
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .nt-item-time {
    margin-top: 4px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .nt-item-action {
    position: absolute;
    top: 8px;
    right: 6px;
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    color: var(--desc-color);
    background: transparent !important;
  }

  .nt-todo-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
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
    margin-top: 8px;
    color: var(--primary-color);
    background: transparent !important;
  }
</style>
