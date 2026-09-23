<template>
  <section v-if="item.checklist?.length" class="todo-subitems">
    <BButton
      v-if="!detail"
      class="todo-subitems__toggle"
      size="small"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="store.expandedSubitems[item.id] = !open"
    >
      <span>{{ t('todoWorkspace.subitems') }} {{ done }}/{{ item.checklist.length }}</span>
      <SvgIcon
        class="todo-subitems__chevron"
        :class="{ 'is-open': open }"
        :src="icon.noteTree.chevron"
        size="14"
        aria-hidden="true"
      />
    </BButton>
    <div
      v-if="open || detail"
      :id="panelId"
      class="todo-subitems__panel"
      @click.stop
      role="group"
      :aria-label="t('todoWorkspace.subitems')"
    >
      <BCheckbox
        v-for="entry in visibleItems"
        :key="entry.id"
        class="todo-subitems__row"
        controlled
        :model-value="entry.done"
        :disabled="disabled || pending || item.status === 'completed'"
        @update:model-value="toggle(entry.id, $event)"
      >
        <span :class="{ done: entry.done }">{{ entry.text }}</span>
      </BCheckbox>
      <small v-if="pending" role="status">{{ t('todoWorkspace.saving') }}</small>
      <p v-if="store.checklistErrors[item.id]" role="alert"
        >{{ t('todoWorkspace.saveFailed') }}
        <BButton
          size="small"
          :disabled="pending || disabled || item.status === 'completed'"
          @click="emit('update-checklist', store.checklistErrors[item.id])"
          >{{ t('common.retry') }}</BButton
        ></p
      >
      <footer>
        <BButton v-if="item.checklist.length > 5 && !detail" size="small" @click="showAll = !showAll">{{
          showAll
            ? t('todoWorkspace.lessSubitems')
            : t('todoWorkspace.moreSubitems', { count: item.checklist.length - 5 })
        }}</BButton>
        <BButton
          v-if="editable !== false && item.status !== 'completed'"
          class="todo-subitems__edit"
          size="small"
          :disabled="disabled || pending || item.status === 'completed'"
          @click="emit('edit')"
        >
          <SvgIcon :src="icon.card_edit" size="15" aria-hidden="true" />
          <span>{{ t('todoWorkspace.editSubitems') }}</span>
        </BButton>
      </footer>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, useId } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import useTodoStore from '@/store/todo';
  import useUserStore from '@/store/useUser';
  import type { TodoItem, TodoChecklistItem } from '@/api/todoApi';
  const props = defineProps<{ item: TodoItem; disabled?: boolean; detail?: boolean; editable?: boolean }>();
  const emit = defineEmits<{ 'update-checklist': [items: TodoChecklistItem[]]; edit: [] }>();
  const { t } = useI18n();
  const store = useTodoStore();
  const showAll = ref(false);
  const panelId = `todo-subitems-${useId()}`;
  const user = useUserStore();
  // An explicit session override (including false) takes precedence over the account default.
  const open = computed(() => store.expandedSubitems[props.item.id] ?? user.preferences.todoSubitemsExpanded === true);
  const done = computed(() => props.item.checklist.filter((item) => item.done).length);
  const pending = computed(() => Boolean(store.checklistPending[props.item.id]));
  const visibleItems = computed(() =>
    props.detail || showAll.value ? props.item.checklist : props.item.checklist.slice(0, 5),
  );
  function toggle(id: string, done: boolean) {
    emit(
      'update-checklist',
      props.item.checklist.map((item) => (item.id === id ? { ...item, done } : item)),
    );
  }
</script>
<style scoped lang="less">
  .todo-subitems {
    min-width: 0;
    margin-top: var(--ui-space-8, 8px);
  }
  .todo-subitems__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
  }
  .todo-subitems__chevron {
    flex: 0 0 var(--ui-layout-14, 14px);
    transform-origin: center;
  }
  .todo-subitems__chevron.is-open {
    transform: rotate(180deg);
  }
  .todo-subitems__panel {
    display: grid;
    gap: 0;
    padding: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    margin-top: var(--ui-space-8, 8px);
    background: transparent;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
  }
  .todo-subitems__panel .todo-subitems__row {
    box-sizing: border-box;
    min-height: var(--ui-layout-44, 44px);
    height: auto;
    padding: var(--ui-space-10, 10px) var(--ui-space-4, 4px);
    gap: var(--ui-space-8, 8px);
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .todo-subitems__row + .todo-subitems__row {
    border-top: 1px solid var(--workspace-divider);
  }
  .todo-subitems .done {
    text-decoration: line-through;
    color: var(--desc-color);
  }
  .todo-subitems footer {
    display: flex;
    justify-content: flex-start;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
    border-top: 1px solid var(--workspace-divider);
    padding-top: var(--ui-space-4, 4px);
    margin-top: var(--ui-space-2, 2px);
  }
  .todo-subitems footer .todo-subitems__edit {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-height: var(--ui-layout-32, 32px);
    padding: var(--ui-space-4, 4px) var(--ui-space-6, 6px);
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.4;
  }
  .todo-subitems footer .todo-subitems__edit:not(:disabled):hover {
    color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .todo-subitems__edit:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  html.light-note-mobile-rendering .todo-subitems footer .todo-subitems__edit {
    min-height: var(--ui-layout-44, 44px);
  }
  .todo-subitems p {
    color: var(--error-color, #d14355);
  }
  html.light-note-mobile-rendering .todo-subitems__panel {
    margin-left: var(--ui-space-12, 12px);
    padding: 0 0 0 var(--ui-space-12, 12px);
    border: 0;
    border-left: 1px solid var(--workspace-divider);
    border-radius: 0;
  }
</style>
