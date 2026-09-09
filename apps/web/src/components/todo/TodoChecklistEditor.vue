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
          @click="emit('update:open', !open)"
          >{{ open ? t('common.collapse') : t('inbox.todoShowChecklist') }}</BButton
        >
      </div>
    </header>
    <div v-if="open" class="todo-checklist-editor__list">
      <div v-for="(item, index) in modelValue" :key="item.id" class="todo-checklist-editor__row">
        <BInput
          :ref="(component) => setInput(item.id, component)"
          :value="item.text"
          :maxlength="200"
          :disabled="disabled"
          :placeholder="t('inbox.todoChecklistPlaceholder')"
          @update:value="changeText(index, $event)"
          @enter="item.text.trim() && add(index)"
        />
        <BButton size="small" :disabled="disabled" @click="remove(index)">{{ t('common.delete') }}</BButton>
      </div>
      <BButton size="small" :disabled="disabled || modelValue.length >= 50" @click="add()">{{
        t('inbox.todoAddChecklistItem')
      }}</BButton>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import TodoBreakdownButton from './TodoBreakdownButton.vue';
  import type { TodoChecklistItem } from '@/api/todoApi';
  import { generateUUID } from '@/utils/common';
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
    gap: 18px;
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
    color: var(--primary-color);
    background: var(--card-background);
  }
  .todo-checklist-editor__list {
    display: grid;
    gap: 9px;
  }
  .todo-checklist-editor__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .todo-checklist-editor .todo-checklist-editor__row :deep(.b-input) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid transparent !important;
    border-radius: 8px;
    background: var(--bl-input-noBorder-bg-color) !important;
    box-shadow: none !important;
  }
  .todo-checklist-editor .todo-checklist-editor__row :deep(.b-input:focus-visible) {
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }
</style>
