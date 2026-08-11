<template>
  <section class="todo-matrix" :class="{ 'is-mobile': mobile }" :aria-label="t('inbox.todoMatrixLabel')">
    <p v-if="!mobile" class="todo-matrix__guide">{{ t('inbox.todoMatrixGuide') }}</p>

    <section v-if="mobile" class="todo-matrix__overview" :aria-label="t('inbox.todoMatrixLabel')">
      <BButton
        v-for="quadrant in quadrants"
        :key="quadrant.key"
        class="todo-matrix__overview-button"
        :class="[`is-${quadrant.key}`, { 'is-selected': selectedQuadrantKey === quadrant.key }]"
        :aria-pressed="selectedQuadrantKey === quadrant.key"
        :disabled="disabled"
        @click="selectQuadrant(quadrant.key)"
      >
        <span class="todo-matrix__overview-heading">
          <span class="todo-matrix__overview-title">
            <span class="todo-matrix__dot" aria-hidden="true"></span>
            <strong>{{ t(`inbox.todoMatrixQuadrants.${quadrant.key}`) }}</strong>
          </span>
          <span class="todo-matrix__count" :aria-label="t('inbox.todoMatrixCount', { count: quadrant.items.length })">
            {{ quadrant.items.length }}
          </span>
        </span>
        <span class="todo-matrix__overview-description">
          {{ t(`inbox.todoMatrixDescriptions.${quadrant.key}`) }}
        </span>
        <span v-if="selectedQuadrantKey === quadrant.key" class="todo-matrix__selected-dot" aria-hidden="true"></span>
      </BButton>
    </section>

    <div class="todo-matrix__grid">
      <section
        v-for="quadrant in visibleQuadrants"
        :key="quadrant.key"
        class="todo-matrix__quadrant"
        :class="`is-${quadrant.key}`"
        :data-quadrant="quadrant.key"
      >
        <header class="todo-matrix__header">
          <div class="todo-matrix__heading">
            <strong>{{ t(`inbox.todoMatrixQuadrants.${quadrant.key}`) }}</strong>
            <p>{{ t(`inbox.todoMatrixDescriptions.${quadrant.key}`) }}</p>
          </div>
          <span class="todo-matrix__count" :aria-label="t('inbox.todoMatrixCount', { count: quadrant.items.length })">
            {{ quadrant.items.length }}
          </span>
        </header>

        <MobileListSurface
          v-if="quadrant.items.length"
          class="todo-matrix__items"
          :aria-label="t(`inbox.todoMatrixQuadrants.${quadrant.key}`)"
        >
          <MobileListRow
            v-for="item in quadrant.items"
            :key="item.id"
            class="todo-matrix-card"
            :class="{ 'is-completed': item.status === 'completed' }"
          >
            <template #leading>
              <BCheckbox
                class="todo-matrix-card__checkbox"
                :model-value="item.status === 'completed'"
                :disabled="disabled"
                :aria-label="t('inbox.todoSelect', { title: item.title })"
                @click.stop
                @update:model-value="emit('toggle-complete', item, $event)"
              />
            </template>

            <BButton
              class="todo-matrix-card__content"
              :disabled="disabled"
              :title="item.title"
              @click="emit('edit', item)"
            >
              <span class="todo-matrix-card__title">{{ item.title }}</span>
              <span class="todo-matrix-card__meta">
                <span class="todo-matrix-card__priority" :class="`is-priority-${item.priority}`">
                  {{ t(`inbox.todoPriority${item.priority}`) }}
                </span>
                <span v-if="dueLabel(item)" class="todo-matrix-card__due" :class="{ 'is-overdue': isOverdue(item) }">
                  {{ dueLabel(item) }}
                </span>
              </span>
            </BButton>

            <template #trailing>
              <BButton
                v-if="mobile"
                class="todo-matrix-card__more"
                :disabled="disabled"
                :loading="deletingId === item.id"
                :aria-label="t('common.more')"
                @click="openMobileActions(item)"
              >
                <SvgIcon v-if="deletingId !== item.id" :src="icon.common.more" size="18" aria-hidden="true" />
              </BButton>
              <BActionMenu
                v-else
                class="todo-matrix-card__menu"
                :items="rowActions(item)"
                :disabled="disabled"
                placement="bottom-right"
                :width="148"
                :aria-label="t('common.more')"
                @select="(key) => handleRowAction(key, item)"
              >
                <BButton
                  class="todo-matrix-card__more"
                  :disabled="disabled"
                  :loading="deletingId === item.id"
                  :aria-label="t('common.more')"
                >
                  <SvgIcon v-if="deletingId !== item.id" :src="icon.common.more" size="18" aria-hidden="true" />
                </BButton>
              </BActionMenu>
            </template>
          </MobileListRow>
        </MobileListSurface>
        <p v-else class="todo-matrix__empty">{{ t('inbox.todoMatrixEmpty') }}</p>
      </section>
    </div>

    <MobilePageActionsDrawer
      v-if="mobile"
      v-model:open="mobileActionsOpen"
      :object-title="mobileActionItem?.title || ''"
      :title="t('common.more')"
      :actions="mobileRowActions"
      @action="handleMobileAction"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TodoItem } from '@/api/todoApi';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import icon from '@/config/icon';
  import { formatTodoDateTime, parseTodoDate } from '@/utils/todoPlanning';
  import { groupTodosByMatrix, TODO_MATRIX_QUADRANT_ORDER, type TodoMatrixQuadrantKey } from '@/utils/todoMatrix';

  const props = withDefaults(
    defineProps<{
      items: TodoItem[];
      mobile?: boolean;
      disabled?: boolean;
      deletingId?: string;
    }>(),
    {
      mobile: false,
      disabled: false,
      deletingId: '',
    },
  );
  const emit = defineEmits<{
    edit: [item: TodoItem];
    delete: [item: TodoItem];
    'toggle-complete': [item: TodoItem, completed: boolean];
  }>();
  const { t, locale } = useI18n();
  const matrixNow = ref(new Date());
  let midnightTimer = 0;

  const groupedItems = computed(() => groupTodosByMatrix(props.items, matrixNow.value));
  const quadrants = computed(() =>
    TODO_MATRIX_QUADRANT_ORDER.map((key) => ({
      key,
      items: groupedItems.value[key],
    })),
  );
  const selectedQuadrantKey = ref<TodoMatrixQuadrantKey>(
    TODO_MATRIX_QUADRANT_ORDER.find((key) => groupedItems.value[key].length > 0) || 'importantUrgent',
  );
  const selectedQuadrant = computed(
    () =>
      quadrants.value.find((quadrant) => quadrant.key === selectedQuadrantKey.value) || {
        key: 'importantUrgent' as const,
        items: groupedItems.value.importantUrgent,
      },
  );
  const visibleQuadrants = computed(() => (props.mobile ? [selectedQuadrant.value] : quadrants.value));
  const mobileActionsOpen = ref(false);
  const mobileActionItem = ref<TodoItem | null>(null);
  const mobileRowActions = computed<MobilePageActionItem[]>(() => {
    const item = mobileActionItem.value;
    return [
      {
        key: 'edit',
        label: t('inbox.editTodo'),
        icon: icon.table_edit,
        disabled: props.disabled || !item,
      },
      {
        key: 'delete',
        label: t('inbox.deleteTodo'),
        icon: icon.table_delete,
        danger: true,
        dividerBefore: true,
        disabled: props.disabled || !item,
        loading: Boolean(item && props.deletingId === item.id),
      },
    ];
  });

  function isOverdue(item: TodoItem) {
    if (item.status !== 'pending' || !item.dueAt) return false;
    const dueAt = parseTodoDate(item.dueAt).getTime();
    return Number.isFinite(dueAt) && dueAt < matrixNow.value.getTime();
  }

  function dueLabel(item: TodoItem) {
    if (!item.dueAt) return '';
    const value = formatTodoDateTime(item.dueAt, locale.value, {
      relative: true,
      includeYear: false,
      now: matrixNow.value,
      relativeLabels: {
        today: t('inbox.todoToday'),
        tomorrow: t('inbox.todoTomorrow'),
      },
    });
    if (!value) return '';
    return isOverdue(item) ? t('inbox.todoOverdue', { time: value }) : t('inbox.todoDue', { time: value });
  }

  function rowActions(item: TodoItem): BActionMenuItem[] {
    return [
      { key: 'edit', label: t('inbox.editTodo'), icon: icon.table_edit, disabled: props.disabled },
      { key: `divider-${item.id}`, divider: true },
      {
        key: 'delete',
        label: t('inbox.deleteTodo'),
        icon: icon.table_delete,
        danger: true,
        disabled: props.disabled,
      },
    ];
  }

  function handleRowAction(key: string, item: TodoItem) {
    if (props.disabled) return;
    if (key === 'edit') emit('edit', item);
    if (key === 'delete') emit('delete', item);
  }

  function selectQuadrant(key: TodoMatrixQuadrantKey) {
    if (props.disabled) return;
    selectedQuadrantKey.value = key;
    mobileActionsOpen.value = false;
    mobileActionItem.value = null;
  }

  function openMobileActions(item: TodoItem) {
    if (props.disabled) return;
    mobileActionItem.value = item;
    mobileActionsOpen.value = true;
  }

  function handleMobileAction(action: MobilePageActionItem) {
    const item = mobileActionItem.value;
    if (!item || props.disabled) return;
    if (action.key === 'edit') emit('edit', item);
    if (action.key === 'delete') emit('delete', item);
    mobileActionItem.value = null;
  }

  function scheduleNextDayRefresh() {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 100);
    midnightTimer = window.setTimeout(() => {
      matrixNow.value = new Date();
      scheduleNextDayRefresh();
    }, nextDay.getTime() - now.getTime());
  }

  watch(
    () => props.items.map((item) => item.id),
    (itemIds) => {
      if (mobileActionItem.value && !itemIds.includes(mobileActionItem.value.id)) {
        mobileActionsOpen.value = false;
        mobileActionItem.value = null;
      }
    },
  );

  onMounted(scheduleNextDayRefresh);
  onBeforeUnmount(() => window.clearTimeout(midnightTimer));
</script>

<style scoped lang="less">
  .todo-matrix {
    display: grid;
    gap: 12px;
    padding: 6px 2px 24px;
  }

  .todo-matrix__guide {
    margin: 0;
    padding: 10px 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .todo-matrix__grid {
    min-width: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--surface-divider-color, var(--surface-border-color));
  }

  .todo-matrix__quadrant,
  .todo-matrix__overview-button {
    --matrix-accent: var(--todo-matrix-other-not-urgent-accent);
    --matrix-border: var(--todo-matrix-other-not-urgent-border);
    --matrix-soft: var(--todo-matrix-other-not-urgent-bg);
  }

  .todo-matrix__quadrant.is-importantUrgent,
  .todo-matrix__overview-button.is-importantUrgent {
    --matrix-accent: var(--todo-matrix-important-urgent-accent);
    --matrix-border: var(--todo-matrix-important-urgent-border);
    --matrix-soft: var(--todo-matrix-important-urgent-bg);
  }

  .todo-matrix__quadrant.is-importantNotUrgent,
  .todo-matrix__overview-button.is-importantNotUrgent {
    --matrix-accent: var(--todo-matrix-important-not-urgent-accent);
    --matrix-border: var(--todo-matrix-important-not-urgent-border);
    --matrix-soft: var(--todo-matrix-important-not-urgent-bg);
  }

  .todo-matrix__quadrant.is-otherUrgent,
  .todo-matrix__overview-button.is-otherUrgent {
    --matrix-accent: var(--todo-matrix-other-urgent-accent);
    --matrix-border: var(--todo-matrix-other-urgent-border);
    --matrix-soft: var(--todo-matrix-other-urgent-bg);
  }

  .todo-matrix__quadrant {
    min-width: 0;
    min-height: 178px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 17px;
    background: var(--card-background);
  }

  .todo-matrix__header {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .todo-matrix__heading {
    position: relative;
    min-width: 0;
    display: grid;
    gap: 4px;
    padding-left: 12px;
  }

  .todo-matrix__heading::before {
    position: absolute;
    top: 1px;
    bottom: 1px;
    left: 0;
    width: 3px;
    border-radius: 999px;
    background: var(--matrix-accent);
    content: '';
  }

  .todo-matrix__heading strong {
    min-width: 0;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.35;
  }

  .todo-matrix__heading p {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-matrix__count {
    min-width: 26px;
    box-sizing: border-box;
    flex: 0 0 auto;
    padding: 2px 8px;
    border: 1px solid var(--matrix-border);
    border-radius: 999px;
    background: var(--matrix-soft);
    color: var(--matrix-accent);
    font-size: 11px;
    font-weight: 650;
    line-height: 18px;
    text-align: center;
  }

  .todo-matrix__items {
    --mobile-row-min-height: 58px;
    --mobile-row-padding-x: 10px;
    --mobile-row-padding-y: 7px;

    width: 100%;
    border-radius: 12px;
  }

  .todo-matrix__items :deep(.todo-matrix-card) {
    min-width: 0;
    gap: 8px;
  }

  .todo-matrix__items :deep(.mobile-list-row__leading) {
    width: auto;
  }

  .todo-matrix__items :deep(.mobile-list-row__body) {
    min-width: 0;
    gap: 0;
  }

  .todo-matrix__items :deep(.mobile-list-row__trailing) {
    min-width: 32px;
  }

  .todo-matrix-card :deep(.todo-matrix-card__content) {
    width: 100%;
    height: auto;
    min-height: 42px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
    padding: 2px 0;
    overflow: hidden;
    border: 0;
    border-radius: 5px;
    background: transparent !important;
    color: var(--text-color);
    line-height: 1.35;
    text-align: left;
    white-space: normal;
  }

  .todo-matrix-card__title {
    width: 100%;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-matrix-card__meta {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
  }

  .todo-matrix-card__priority {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .todo-matrix-card__priority.is-priority-2,
  .todo-matrix-card__due.is-overdue {
    color: var(--danger-color, #d83c45);
  }

  .todo-matrix-card__due {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .todo-matrix-card__menu {
    display: inline-flex;
  }

  .todo-matrix-card :deep(.todo-matrix-card__more) {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--desc-color);
  }

  .todo-matrix-card :deep(.todo-matrix-card__more:hover),
  .todo-matrix-card :deep(.todo-matrix-card__more:focus-visible) {
    border-color: var(--surface-border-color);
    background: var(--hover-background);
    color: var(--text-color);
  }

  .todo-matrix-card.is-completed .todo-matrix-card__title {
    color: var(--disabled-text-color);
    text-decoration: line-through;
  }

  .todo-matrix__empty {
    min-height: 76px;
    margin: 0;
    display: grid;
    flex: 1;
    place-items: center;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .todo-matrix__overview {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .todo-matrix :deep(.todo-matrix__overview-button) {
    position: relative;
    width: 100%;
    height: auto;
    min-height: 102px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 8px;
    padding: 13px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 14px;
    background: var(--card-background) !important;
    color: var(--text-color);
    line-height: normal;
    text-align: left;
    white-space: normal;
  }

  .todo-matrix :deep(.todo-matrix__overview-button.is-selected) {
    border: 2px solid var(--todo-accent-color) !important;
    padding: 12px;
    color: var(--todo-accent-color);
  }

  .todo-matrix__overview-heading,
  .todo-matrix__overview-title {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .todo-matrix__overview-heading {
    justify-content: space-between;
    gap: 8px;
  }

  .todo-matrix__overview-title {
    gap: 7px;
    overflow: hidden;
  }

  .todo-matrix__overview-title strong {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
  }

  .todo-matrix__dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--matrix-accent);
  }

  .todo-matrix__overview-description {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
    text-overflow: ellipsis;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .todo-matrix__selected-dot {
    position: absolute;
    right: 11px;
    bottom: 10px;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--todo-accent-color);
  }

  .todo-matrix.is-mobile {
    gap: 12px;
    padding: 0 0 18px;
  }

  .todo-matrix.is-mobile .todo-matrix__grid {
    grid-template-columns: minmax(0, 1fr);
    border-radius: 16px;
  }

  .todo-matrix.is-mobile .todo-matrix__quadrant {
    min-height: 0;
    gap: 13px;
    padding: 15px;
  }

  .todo-matrix.is-mobile .todo-matrix__heading strong {
    font-size: 15px;
  }

  .todo-matrix.is-mobile .todo-matrix__heading p {
    white-space: normal;
  }

  .todo-matrix.is-mobile .todo-matrix__items {
    --mobile-row-min-height: 68px;
    --mobile-row-padding-x: 10px;
    --mobile-row-padding-y: 8px;

    border-radius: 13px;
  }

  .todo-matrix.is-mobile .todo-matrix-card :deep(.todo-matrix-card__content),
  .todo-matrix.is-mobile .todo-matrix-card :deep(.todo-matrix-card__more) {
    min-height: 44px;
  }

  .todo-matrix.is-mobile .todo-matrix-card :deep(.todo-matrix-card__more) {
    width: 44px;
    min-width: 44px;
    height: 44px;
  }

  .todo-matrix.is-mobile .todo-matrix__items :deep(.mobile-list-row__trailing) {
    min-width: 44px;
  }

  .todo-matrix.is-mobile .todo-matrix__empty {
    min-height: 88px;
  }

  @media (max-width: 359px) {
    .todo-matrix :deep(.todo-matrix__overview-button) {
      min-height: 96px;
      padding: 11px;
    }

    .todo-matrix :deep(.todo-matrix__overview-button.is-selected) {
      padding: 10px;
    }

    .todo-matrix__overview-title strong {
      font-size: 11px;
    }
  }
</style>
