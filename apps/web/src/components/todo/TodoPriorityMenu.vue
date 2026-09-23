<template>
  <div class="todo-priority-menu" role="group" :aria-label="t('inbox.todoPriority')">
    <span class="todo-priority-menu__label">{{ t('inbox.todoPriority') }}</span>
    <div class="todo-priority-menu__options">
      <BButton
        v-for="priority in priorities"
        :key="priority"
        role="menuitemradio"
        :aria-checked="value === priority"
        :disabled="disabled"
        :class="{ 'is-selected': value === priority }"
        @click="emit('select', priority)"
        >{{ t(`inbox.todoPriority${priority}`) }}</BButton
      >
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { TodoPriority } from '@/api/todoApi';
  defineProps<{ value: TodoPriority; disabled?: boolean }>();
  const emit = defineEmits<{ select: [priority: TodoPriority] }>();
  const priorities: TodoPriority[] = [0, 1, 2];
  const { t } = useI18n();
</script>
<style scoped lang="less">
  .todo-priority-menu {
    padding: var(--ui-space-7, 7px) var(--ui-space-12, 12px);
  }
  .todo-priority-menu__label {
    display: block;
    margin-bottom: var(--ui-space-7, 7px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .todo-priority-menu__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-3, 3px);
  }
  .todo-priority-menu__options .b_btn {
    width: 100%;
    height: var(--ui-layout-30, 30px);
    padding: 0 var(--ui-space-3, 3px);
    font-size: var(--ui-font-12, 12px);
    background: transparent;
    border: 1px solid var(--surface-border-color);
  }
  .todo-priority-menu__options .b_btn.is-selected {
    color: var(--workspace-purple-text);
    border-color: var(--workspace-purple-text);
    background: var(--workspace-hover);
  }
</style>
