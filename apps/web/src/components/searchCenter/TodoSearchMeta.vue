<template>
  <span class="todo-search-meta">
    <span
      class="todo-search-meta__status"
      :class="{ 'is-overdue': overdue, 'is-completed': item.status === 'completed' }"
    >
      {{ t(`resourceCenter.todo.${item.status === 'completed' ? 'completed' : overdue ? 'overdue' : 'pending'}`) }}
    </span>
    <span>{{ item.dueAt || t('resourceCenter.todo.noDue') }}</span>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { SearchResultItem } from '@/api/search';

  const props = defineProps<{ item: SearchResultItem }>();
  const { t } = useI18n();
  const overdue = computed(
    () =>
      props.item.status === 'pending' &&
      Boolean(props.item.dueAt) &&
      Date.parse(props.item.dueAt!.replace(' ', 'T')) < Date.now(),
  );
</script>

<style scoped lang="less">
  .todo-search-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .todo-search-meta__status {
    padding: 0 5px;
    border: 1px solid currentColor;
    border-radius: 5px;
    color: var(--todo-accent-color);
    white-space: nowrap;
  }
  .todo-search-meta__status.is-completed {
    color: var(--success-color);
  }
  .todo-search-meta__status.is-overdue {
    color: var(--danger-color);
  }
</style>
