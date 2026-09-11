<template>
  <aside
    class="todo-workspace-sidebar"
    :class="{ 'todo-workspace-sidebar--picker': picker }"
    :aria-label="t('todoWorkspace.chooseScope')"
  >
    <div v-if="!picker" class="todo-workspace-sidebar__caption"
      ><SvgIcon :src="icon.todoWorkspace.quick" size="16" />{{ t('todoWorkspace.quick') }}</div
    >
    <BButton
      v-for="scope in scopes"
      :key="scope.key"
      :class="{ active: current === scope.key }"
      :aria-pressed="current === scope.key"
      @click="select(scope.key)"
    >
      <SvgIcon :src="scope.icon" size="20" /><span>{{ scope.label }}</span
      ><small>{{ store.loadFailed ? '—' : (scope.count ?? '—') }}</small>
    </BButton>
    <header
      ><SvgIcon :src="icon.common.folderOutline" size="20" /><strong>{{ t('todoWorkspace.lists') }}</strong
      ><BButton
        size="small"
        :disabled="user.adminContext?.mode === 'readonly'"
        :aria-label="t('todoWorkspace.newList')"
        @click="edit()"
        >+</BButton
      ></header
    >
    <BActionMenu
      v-for="list in store.lists"
      :key="list.id"
      class="todo-workspace-sidebar__list"
      :items="listActions"
      :triggers="bookmark.isMobile ? [] : ['hover', 'contextmenu']"
      placement="right-start"
      :z-index="650"
      :disabled="user.adminContext?.mode === 'readonly'"
      @select="handleListAction(list, $event)"
    >
      <BButton
        class="todo-workspace-sidebar__list-title"
        :class="{ active: current === list.id }"
        :aria-pressed="current === list.id"
        @click="select(list.id)"
        ><i :style="{ background: list.color }"></i><span>{{ list.name }}</span
        ><small>{{ store.loadFailed ? '—' : countForStatus(list.pendingTotal, list.completedTotal) }}</small></BButton
      >
      <BActionMenu
        v-if="bookmark.isMobile"
        :items="listActions"
        :triggers="['click']"
        :z-index="650"
        :disabled="user.adminContext?.mode === 'readonly'"
        @select="handleListAction(list, $event)"
        ><BButton
          class="todo-workspace-sidebar__mobile-more"
          size="small"
          :aria-label="`${t('common.more')} ${list.name}`"
          >…</BButton
        ></BActionMenu
      >
    </BActionMenu>
    <BButton
      :class="{ active: current === 'unassigned' }"
      :aria-pressed="current === 'unassigned'"
      @click="select('unassigned')"
      ><SvgIcon :src="icon.contextMenu.inbox" size="20" /><span>{{ t('todoWorkspace.unassigned') }}</span
      ><small>{{ store.loadFailed ? '—' : scopeCount('unassigned') }}</small></BButton
    >
    <TodoListAssociations
      v-if="associationList"
      v-model:open="associationsOpen"
      :list="associationList"
      @changed="
        store.organizationEpoch++;
        emit('changed');
      "
    />
    <BModal
      v-model:visible="editing"
      :title="t(form.id ? 'todoWorkspace.editList' : 'todoWorkspace.newList')"
      :show-footer="false"
      width="420px"
    >
      <div class="todo-list-form">
        <label>{{ t('todoWorkspace.listName') }}<BInput v-model:value="form.name" :maxlength="40" /></label>
        <label>{{ t('todoWorkspace.color') }}<BSelect v-model:value="form.color" :options="colors" /></label>
        <footer
          ><BButton v-if="form.id" :disabled="saving" @click="remove()">{{ t('todoWorkspace.deleteList') }}</BButton
          ><BButton type="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">{{
            t('common.save')
          }}</BButton></footer
        >
      </div>
    </BModal>
  </aside>
</template>
<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import TodoListAssociations from './TodoListAssociations.vue';
  import { bookmarkStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import useTodoStore from '@/store/todo';
  import useUserStore from '@/store/useUser';
  import { saveTodoList, removeTodoList, type TodoList } from '@/api/todoApi';
  withDefaults(defineProps<{ picker?: boolean }>(), { picker: false });
  const emit = defineEmits<{ changed: [] }>();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const associationsOpen = ref(false),
    associationList = ref<TodoList | null>(null);
  const listActions = computed<BActionMenuItem[]>(() => [
    { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
    { key: 'associate', label: t('todoWorkspace.manageAssociations'), icon: icon.manage_categoryBtn_bookmark },
    { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true },
  ]);
  function handleListAction(list: TodoList, action: string) {
    if (user.adminContext?.mode === 'readonly' || blockGuestWrite('todo-update', t('inbox.guestPrompt'))) return;
    if (action === 'edit') edit(list);
    else if (action === 'delete') remove(list);
    else {
      associationList.value = { ...list };
      associationsOpen.value = true;
    }
  }
  watch(
    () => user.id,
    () => {
      editing.value = false;
      saving.value = false;
      associationsOpen.value = false;
      associationList.value = null;
    },
  );
  const store = useTodoStore();
  const { t } = useI18n();
  const editing = ref(false),
    saving = ref(false);
  const form = reactive({ id: '', name: '', color: '#6554ed' });
  const colors = computed(() =>
    ['#6554ed', '#00a884', '#ff8a00', '#0ea5e9', '#ec4899'].map((value, index) => ({
      value,
      label: t(`todoWorkspace.color${index}`),
    })),
  );
  const current = computed(() =>
    store.filters.listId === null ? 'unassigned' : store.filters.listId || store.filters.scope || 'all',
  );
  function countForStatus(pending = 0, completed = 0) {
    return store.effectiveStatus === 'all'
      ? pending + completed
      : store.effectiveStatus === 'completed'
        ? completed
        : pending;
  }
  function scopeCount(key: string) {
    if (!Object.keys(store.navigationCounts).length) return '—';
    return countForStatus(store.navigationCounts.pending?.[key], store.navigationCounts.completed?.[key]);
  }
  const scopes = computed(() =>
    ['all', 'today', 'week', 'important'].map((key) => ({
      key,
      label: t(`todoWorkspace.${key}`),
      count: scopeCount(key === 'all' ? 'allTotal' : key),
      icon:
        key === 'all'
          ? icon.todoWorkspace.checkSquare
          : key === 'important'
            ? icon.todoWorkspace.star
            : icon.todoWorkspace.calendar,
    })),
  );
  function select(key: string) {
    store.filters = { ...store.filters, scope: scopes.value.some((scope) => scope.key === key) ? key : 'all' };
    delete store.filters.listId;
    if (key === 'unassigned') store.filters.listId = null;
    else if (!scopes.value.some((scope) => scope.key === key)) store.filters.listId = key;
    emit('changed');
  }
  function edit(list?: TodoList) {
    if (user.adminContext?.mode === 'readonly') return;
    if (blockGuestWrite('todo-update', t('inbox.guestPrompt'))) return;
    Object.assign(form, { id: list?.id || '', name: list?.name || '', color: list?.color || '#6554ed' });
    editing.value = true;
  }
  async function save() {
    if (saving.value || user.adminContext?.mode === 'readonly') return;
    const owner = user.id;
    saving.value = true;
    try {
      const res = await saveTodoList({ ...form, id: form.id || undefined });
      if (owner !== user.id) return;
      if (res.status !== 200) throw new Error();
      if (res.status === 200) {
        editing.value = false;
        store.organizationEpoch++;
        emit('changed');
      }
    } catch {
      if (owner === user.id) message.error(t('todoWorkspace.saveFailed'));
    } finally {
      if (owner === user.id) saving.value = false;
    }
  }
  function remove(list?: TodoList) {
    const targetId = list?.id || form.id;
    const owner = user.id;
    Alert.alert({
      title: t('todoWorkspace.deleteList'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      content: t('todoWorkspace.deleteListHint'),
      onOk: async () => {
        if (saving.value || owner !== user.id || user.adminContext?.mode === 'readonly') return;
        saving.value = true;
        try {
          const res = await removeTodoList(targetId);
          if (owner !== user.id) return;
          if (res.status !== 200) throw new Error();
          if (res.status === 200) {
            if (store.filters.listId === targetId) delete store.filters.listId;
            editing.value = false;
            store.organizationEpoch++;
            emit('changed');
          }
        } catch {
          if (owner === user.id) message.error(t('todoWorkspace.saveFailed'));
        } finally {
          if (owner === user.id) saving.value = false;
        }
      },
    });
  }
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .todo-workspace-sidebar {
    --primary-color: var(--todo-workspace-accent);
    --todo-navigation-soft-color: var(--todo-workspace-selected);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 16px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
  }
  .todo-workspace-sidebar > :deep(button),
  .todo-workspace-sidebar__list-title {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    justify-content: flex-start;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    box-shadow: none;
    background: transparent;
    color: var(--desc-color);
    font-size: 14px;
    text-align: left;
  }
  .todo-workspace-sidebar :deep(button:focus-visible) {
    outline: 2px solid var(--focus-ring-color, var(--primary-color));
    outline-offset: 1px;
  }
  @media (hover: hover) and (pointer: fine) {
    .todo-workspace-sidebar :deep(button:not(.active):not(:disabled):hover) {
      background: var(--category-item-ba-color);
      color: var(--text-color);
    }
  }
  .todo-workspace-sidebar :deep(button.active) {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--todo-navigation-soft-color, var(--card-background));
    font-weight: 600;
  }
  .todo-workspace-sidebar span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-workspace-sidebar small {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--desc-color);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .todo-workspace-sidebar :deep(.active) small {
    color: var(--primary-color);
  }
  .todo-workspace-sidebar__caption {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 10px 8px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .todo-workspace-sidebar header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
    padding: 16px 10px 6px;
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
  }
  .todo-workspace-sidebar header strong {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
  }
  .todo-workspace-sidebar header :deep(button) {
    min-width: 26px;
    min-height: 26px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
    box-shadow: none;
  }
  .todo-workspace-sidebar__list {
    position: relative;
    min-width: 0;
  }
  .todo-workspace-sidebar__list {
    display: flex;
    align-items: center;
  }
  .todo-workspace-sidebar__list-title {
    flex: 1;
  }
  .todo-workspace-sidebar__mobile-more {
    padding: 0 8px;
  }
  .todo-workspace-sidebar i {
    width: 9px;
    height: 9px;
    margin-inline: 5px 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .todo-workspace-sidebar--picker {
    padding: 0;
    border: 0;
    border-radius: 0;
    gap: 4px;
  }
  .todo-workspace-sidebar--picker > :deep(button),
  .todo-workspace-sidebar--picker .todo-workspace-sidebar__list-title {
    min-height: 44px;
    padding: 8px 10px;
  }
  .todo-workspace-sidebar--picker header {
    margin-top: 8px;
    padding: 8px 10px 0;
  }
  .todo-workspace-sidebar--picker header :deep(button),
  .todo-workspace-sidebar--picker .todo-workspace-sidebar__mobile-more {
    min-width: 44px;
    min-height: 44px;
  }
  .todo-list-form,
  .todo-list-form label {
    display: grid;
    gap: 12px;
  }
  .todo-list-form footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .todo-workspace-sidebar {
    .workspace-open-surface();
  }

  .todo-workspace-sidebar {
    .workspace-navigation-colors();
  }
  .todo-workspace-sidebar :deep(button:not(.active):not(:disabled):hover) {
    .workspace-navigation-hover();
  }
  .todo-workspace-sidebar :deep(button.active) {
    .workspace-navigation-selected();
  }
</style>
