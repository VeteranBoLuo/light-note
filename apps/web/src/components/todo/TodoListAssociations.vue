<template>
  <BModal
    :visible="open"
    @update:visible="emit('update:open', $event)"
    :title="`${list.name} · ${t('todoWorkspace.manageAssociations')}`"
    width="720px"
    :show-footer="false"
  >
    <div class="todo-list-associations">
      <p>{{ t('todoWorkspace.associationHint') }}</p>
      <BTabs
        v-model:active-tab="tab"
        variant="pill"
        :options="[
          { key: 'linked', label: t('todoWorkspace.linkedTodos') },
          { key: 'all', label: t('todoWorkspace.allPendingTodos') },
        ]"
      />
      <BInput
        v-model:value="keyword"
        :placeholder="t('inbox.todoSearchPlaceholder')"
        :aria-label="t('inbox.todoSearchPlaceholder')"
      />
      <div v-if="failed" role="alert" class="todo-list-associations__error"
        ><span>{{ t('todoWorkspace.loadFailed') }}</span
        ><BButton @click="load(!loaded)">{{ t('common.retry') }}</BButton></div
      >
      <p v-if="loaded && !rows.length && !failed" role="status">{{ t('todoWorkspace.empty') }}</p>
      <BVirtualList
        class="todo-list-associations__rows"
        :items="rows"
        dynamic-height
        :item-height="150"
        :loading="loading"
        :loading-text="t('todoWorkspace.loadingNext')"
        :has-more="!!cursor"
        :paused="!open || failed || !!mutating"
        @load-more="load()"
      >
        <template #default="{ item }">
          <div class="todo-list-associations__row">
            <div class="todo-list-associations__content">
              <div class="todo-list-associations__heading">
                <strong>{{ item.title }}</strong>
                <BChip :tone="item.priority === 2 ? 'danger' : item.priority === 1 ? 'pending' : 'neutral'">
                  {{ t(`inbox.todoPriority${item.priority}`) }}
                </BChip>
              </div>
              <p v-if="item.description" class="todo-list-associations__description">{{ item.description }}</p>
              <div class="todo-list-associations__metadata">
                <span class="todo-list-associations__list">
                  <SvgIcon :src="icon.common.folderOutline" size="14" aria-hidden="true" />
                  {{ item.list?.name || t('todoWorkspace.unassigned') }}
                </span>
                <ResourceTagChip v-for="tag in item.tags" :key="tag.id" :tag="tag" max-width="180px" />
              </div>
              <div v-if="item.startAt || item.dueAt || item.occurrenceDate" class="todo-list-associations__dates">
                <span v-if="item.startAt">{{ t('inbox.todoStarts', { time: formatTime(item.startAt) }) }}</span>
                <span v-if="item.dueAt" :class="{ 'is-overdue': isTodoOverdue(item) }">
                  {{ t(isTodoOverdue(item) ? 'inbox.todoOverdue' : 'inbox.todoDue', { time: formatTime(item.dueAt) }) }}
                </span>
                <span v-if="!item.startAt && !item.dueAt && item.occurrenceDate">
                  {{ t('inbox.todoScheduledDate', { time: formatTime(item.occurrenceDate, false) }) }}
                </span>
              </div>
              <div v-if="item.seriesId || item.checklist?.length" class="todo-list-associations__metadata">
                <span v-if="item.seriesId">
                  <SvgIcon :src="icon.todo.repeat" size="14" aria-hidden="true" />
                  {{ t('todoWorkspace.associationOccurrence', { number: item.occurrenceNo || '—' }) }}
                </span>
                <span v-if="item.checklist?.length">
                  <SvgIcon :src="icon.todoWorkspace.checkSquare" size="14" aria-hidden="true" />
                  {{ t('todoWorkspace.subitems') }} {{ item.checklist.filter((check) => check.done).length }}/{{
                    item.checklist.length
                  }}
                </span>
              </div>
            </div>
            <BButton
              size="small"
              :class="{ 'is-linked': item.listId === list.id }"
              :disabled="!!mutating || readonly"
              :loading="mutating === item.id"
              @click="toggle(item)"
              >{{ t(item.listId === list.id ? 'todoWorkspace.unlinkTodo' : 'todoWorkspace.linkTodo') }}</BButton
            >
          </div>
        </template>
      </BVirtualList>
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { formatTodoDateTime, isTodoOverdue } from '@/utils/todoPlanning';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { getTodoWorkspace, organizeTodos, type TodoItem, type TodoList } from '@/api/todoApi';
  import useUserStore from '@/store/useUser';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  const props = defineProps<{ open: boolean; list: TodoList }>();
  const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [] }>();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const readonly = computed(() => user.adminContext?.mode === 'readonly');
  const tab = ref('linked'),
    keyword = ref(''),
    rows = ref<TodoItem[]>([]),
    cursor = ref<string | null>(null);
  const loading = ref(false),
    loaded = ref(false),
    failed = ref(false),
    mutating = ref('');
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const formatTime = (value: string, includeTime = true) =>
    formatTodoDateTime(value, locale.value, {
      relative: true,
      includeTime,
      relativeLabels: { today: t('inbox.todoToday'), tomorrow: t('inbox.todoTomorrow') },
    });
  async function load(reset = false) {
    if (!props.open || loading.value || (!reset && !cursor.value)) return;
    const epoch = generation,
      owner = user.id;
    loading.value = true;
    failed.value = false;
    try {
      const response = await getTodoWorkspace({
        status: 'pending',
        sort: 'action',
        keyword: keyword.value.trim(),
        limit: 30,
        ...(tab.value === 'linked' ? { listId: props.list.id } : {}),
        ...(reset ? {} : { cursor: cursor.value || undefined }),
      });
      if (epoch !== generation || owner !== user.id) return;
      if (response.status !== 200) throw new Error();
      rows.value = reset
        ? response.data.items
        : [...new Map([...rows.value, ...response.data.items].map((item) => [item.id, item])).values()];
      cursor.value = response.data.nextCursor || null;
      loaded.value = true;
    } catch {
      if (epoch === generation && owner === user.id) failed.value = true;
    } finally {
      if (epoch === generation && owner === user.id) loading.value = false;
    }
  }
  function reset() {
    generation++;
    loading.value = false;
    loaded.value = false;
    failed.value = false;
    cursor.value = null;
    rows.value = [];
    if (timer) clearTimeout(timer);
    if (props.open) void load(true);
  }
  watch(
    () => [props.open, props.list.id, user.id],
    () => {
      tab.value = 'linked';
      keyword.value = '';
      mutating.value = '';
      reset();
    },
    { immediate: true },
  );
  watch([tab, keyword], () => {
    generation++;
    loading.value = false;
    loaded.value = false;
    failed.value = false;
    rows.value = [];
    cursor.value = null;
    if (timer) clearTimeout(timer);
    if (props.open) timer = setTimeout(() => void load(true), 220);
  });
  async function toggle(item: TodoItem) {
    if (mutating.value || readonly.value || blockGuestWrite('todo-update', t('inbox.guestPrompt'))) return;
    const owner = user.id,
      target = props.list.id;
    const linked = item.listId === target;
    mutating.value = item.id;
    // Discard an in-flight read before changing membership, so it cannot restore the old row.
    generation++;
    loading.value = false;
    const writeGeneration = generation;
    try {
      const response = await organizeTodos(
        { ids: [item.id], scope: 'current', listId: linked ? null : target },
        { silent: true },
      );
      if (owner !== user.id || target !== props.list.id || !props.open) return;
      if (response.status !== 200) throw new Error();
      if (writeGeneration === generation) {
        if (tab.value === 'linked' && linked) rows.value = rows.value.filter((row) => row.id !== item.id);
        else
          rows.value = rows.value.map((row) =>
            row.id === item.id ? { ...row, listId: linked ? null : target, list: linked ? null : props.list } : row,
          );
      }
      if (writeGeneration !== generation) reset();
      emit('changed');
    } catch {
      if (owner === user.id && target === props.list.id && props.open) message.error(t('todoWorkspace.saveFailed'));
    } finally {
      if (owner === user.id && target === props.list.id) mutating.value = '';
    }
  }
  onBeforeUnmount(() => {
    generation++;
    if (timer) clearTimeout(timer);
  });
</script>
<style scoped lang="less">
  .todo-list-associations {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .todo-list-associations > p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .todo-list-associations__rows {
    height: 430px;
    max-height: 50vh;
  }
  .todo-list-associations__row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 18px 12px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .todo-list-associations__content {
    display: grid;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .todo-list-associations__row strong {
    font-weight: 600;
    overflow-wrap: anywhere;
    font-size: 14px;
  }
  .todo-list-associations__heading,
  .todo-list-associations__metadata,
  .todo-list-associations__dates {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 12px;
    line-height: 1.6;
  }
  .todo-list-associations__heading {
    gap: 6px 8px;
  }
  .todo-list-associations__metadata,
  .todo-list-associations__dates,
  .todo-list-associations__description {
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-list-associations__metadata > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .todo-list-associations__description {
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
    line-height: 1.6;
  }
  .todo-list-associations__dates .is-overdue {
    color: var(--danger-color);
    font-weight: 600;
  }
  .todo-list-associations__row:focus-within {
    outline: 1px solid var(--primary-color);
    outline-offset: -1px;
  }
  @media (hover: hover) {
    .todo-list-associations__row:hover {
      background: var(--hover-background);
    }
  }
  @media (max-width: 600px) {
    .todo-list-associations__row {
      padding: 16px 2px;
      gap: 10px;
    }
    .todo-list-associations__dates {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
  }
  .todo-list-associations__row .b_btn {
    flex: none;
    color: var(--primary-color);
  }
  .todo-list-associations__row .b_btn.is-linked {
    color: var(--desc-color);
  }
  .todo-list-associations__error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--danger-color);
    font-size: 12px;
  }
</style>
