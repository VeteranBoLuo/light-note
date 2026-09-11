<template>
  <section class="todo-checklist-editor">
    <header class="todo-checklist-editor__header">
      <div class="todo-checklist-editor__heading">
        <strong>{{ t('todoWorkspace.subitems') }}</strong>
        <small>{{ t('inbox.todoChecklistHint') }}</small>
      </div>
      <div class="todo-checklist-editor__actions">
        <TodoBreakdownButton
          :todo-id="todoId"
          :title="title"
          :description="description"
          :checklist="modelValue"
          :disabled="disabled"
          @apply="applyBreakdown"
        />
        <BButton
          class="todo-checklist-editor__toggle"
          size="small"
          :aria-expanded="open"
          :aria-controls="panelId"
          @click="emit('update:open', !open)"
        >
          <span>{{ open ? t('common.collapse') : t('common.expand') }}</span>
          <SvgIcon
            class="todo-checklist-editor__chevron"
            :class="{ 'is-open': open }"
            :src="icon.noteTree.chevron"
            size="14"
            aria-hidden="true"
          />
        </BButton>
      </div>
    </header>
    <div v-if="open" :id="panelId" class="todo-checklist-editor__list">
      <div v-for="(item, index) in modelValue" :key="item.id" class="todo-checklist-editor__row">
        <span class="todo-checklist-editor__number" aria-hidden="true">{{ index + 1 }}</span>
        <BInput
          :ref="(component) => setInput(item.id, component)"
          :value="item.text"
          :maxlength="200"
          :disabled="disabled"
          :placeholder="t('inbox.todoChecklistPlaceholder')"
          @update:value="changeText(index, $event)"
          @enter="item.text.trim() && add(index)"
        />
        <BButton
          class="todo-checklist-editor__remove"
          size="small"
          :disabled="disabled"
          :aria-label="`${t('common.delete')} ${index + 1}`"
          :title="t('common.delete')"
          @click="remove(index)"
        >
          <SvgIcon :src="icon.table_delete" size="16" aria-hidden="true" />
        </BButton>
      </div>
      <BButton
        class="todo-checklist-editor__add"
        size="small"
        :disabled="disabled || modelValue.length >= 50"
        @click="add()"
      >
        <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />
        {{ t('inbox.todoAddChecklistItem') }}
      </BButton>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { nextTick, useId } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import TodoBreakdownButton from './TodoBreakdownButton.vue';
  import type { TodoChecklistItem } from '@/api/todoApi';
  import { generateUUID } from '@/utils/common';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{
    modelValue: TodoChecklistItem[];
    open: boolean;
    todoId?: string;
    title: string;
    description: string;
    disabled?: boolean;
  }>();
  const emit = defineEmits<{ 'update:modelValue': [items: TodoChecklistItem[]]; 'update:open': [open: boolean] }>();
  const { t } = useI18n();
  const panelId = `todo-checklist-editor-${useId()}`;
  const inputs = new Map<string, { focus: () => void }>();
  function setInput(id: string, component: any) {
    if (component) inputs.set(id, component);
    else inputs.delete(id);
  }
  function focus(id: string) {
    nextTick(() => inputs.get(id)?.focus());
  }
  function changeText(index: number, text: string) {
    emit(
      'update:modelValue',
      props.modelValue.map((item, i) => (i === index ? { ...item, text } : item)),
    );
  }
  function add(index = props.modelValue.length - 1) {
    if (props.disabled || props.modelValue.length >= 50) return;
    const current = props.modelValue[index];
    if (current && !current.text.trim()) {
      focus(current.id);
      return;
    }
    const item = { id: generateUUID(), text: '', done: false };
    const items = [...props.modelValue];
    items.splice(index + 1, 0, item);
    emit('update:modelValue', items);
    focus(item.id);
  }
  function remove(index: number) {
    if (props.disabled) return;
    const items = props.modelValue.filter((_, i) => i !== index);
    if (!items.length) items.push({ id: generateUUID(), text: '', done: false });
    emit('update:modelValue', items);
    focus(items[Math.min(index, items.length - 1)].id);
  }
  function applyBreakdown(items: TodoChecklistItem[]) {
    emit('update:modelValue', items);
    emit('update:open', true);
  }
</script>
<style scoped lang="less">
  .todo-checklist-editor {
    display: grid;
    gap: 12px;
    min-width: 0;
    scroll-margin-top: 16px;
  }
  .todo-checklist-editor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .todo-checklist-editor__heading {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .todo-checklist-editor__heading strong {
    font-size: 14px;
    color: var(--text-color);
  }
  .todo-checklist-editor__heading small {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .todo-checklist-editor__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .todo-checklist-editor .todo-checklist-editor__toggle {
    gap: 4px;
    color: var(--workspace-purple-text);
    background: transparent;
  }
  @media (hover: hover) and (pointer: fine) {
    .todo-checklist-editor .todo-checklist-editor__toggle:hover {
      background: var(--workspace-hover);
    }
  }
  .todo-checklist-editor__chevron {
    flex-shrink: 0;
  }
  .todo-checklist-editor__chevron.is-open {
    transform: rotate(180deg);
  }
  .todo-checklist-editor__list {
    display: grid;
    gap: 9px;
    padding: 0 12px 4px;
  }
  .todo-checklist-editor__row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 32px;
    align-items: center;
    gap: 8px;
  }
  .todo-checklist-editor__number {
    text-align: center;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--desc-color);
  }
  .todo-checklist-editor .todo-checklist-editor__remove {
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .todo-checklist-editor .todo-checklist-editor__add {
    gap: 5px;
    height: 30px;
    margin-left: 28px;
    padding: 0 6px;
    color: var(--workspace-purple-text);
    background: transparent;
  }
  @media (hover: hover) and (pointer: fine) {
    .todo-checklist-editor .todo-checklist-editor__remove:hover {
      color: var(--danger-color);
      background: var(--action-menu-danger-hover-bg);
    }
    .todo-checklist-editor .todo-checklist-editor__add:hover {
      background: var(--workspace-hover);
    }
  }
  .todo-checklist-editor .todo-checklist-editor__row :deep(.b-input) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--bl-input-bg-color);
  }
</style>
