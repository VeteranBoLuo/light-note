<template>
  <div class="todo-resource-links" role="list" :aria-label="ariaLabel || t('inbox.todoResourceRefsTitle')">
    <div
      v-for="ref in visibleItems"
      :key="`${ref.type}:${ref.id}`"
      class="todo-resource-link"
      :class="[`is-${ref.type}`, { 'is-unavailable': !ref.available, 'is-removable': removable }]"
      role="listitem"
    >
      <BButton
        size="small"
        class="todo-resource-link__open"
        :disabled="disabled || !ref.available"
        :title="ref.available ? ref.title : t('inbox.todoResourceUnavailable')"
        :aria-label="
          ref.available
            ? t('inbox.todoOpenResource', { type: t(`ai.sourceTypes.${ref.type}`), title: ref.title })
            : t('inbox.todoResourceUnavailable')
        "
        @click.stop="emit('open', ref)"
      >
        <SvgIcon :src="resourceIcon(ref.type)" size="12" aria-hidden="true" />
        <span class="todo-resource-link__type">{{ t(`ai.sourceTypes.${ref.type}`) }}</span>
        <span class="todo-resource-link__title">{{ displayTitle(ref) }}</span>
      </BButton>
      <BButton
        v-if="removable"
        size="small"
        class="todo-resource-link__remove"
        :disabled="disabled"
        :aria-label="t('inbox.todoRemoveResource', { title: displayTitle(ref) })"
        @click.stop="emit('remove', ref)"
      >
        <SvgIcon :src="icon.common.close" size="11" aria-hidden="true" />
      </BButton>
    </div>
    <span
      v-if="hiddenCount"
      class="todo-resource-links__more"
      :aria-label="t('inbox.todoMoreResources', { count: hiddenCount })"
    >
      +{{ hiddenCount }}
    </span>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TodoResourceRefView } from '@/api/todoApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      items: TodoResourceRefView[];
      maxVisible?: number;
      removable?: boolean;
      disabled?: boolean;
      ariaLabel?: string;
    }>(),
    {
      maxVisible: 0,
      removable: false,
      disabled: false,
      ariaLabel: '',
    },
  );
  const emit = defineEmits<{
    open: [resource: TodoResourceRefView];
    remove: [resource: TodoResourceRefView];
  }>();
  const { t } = useI18n();

  const visibleItems = computed(() => (props.maxVisible > 0 ? props.items.slice(0, props.maxVisible) : props.items));
  const hiddenCount = computed(() => Math.max(0, props.items.length - visibleItems.value.length));

  function displayTitle(ref: TodoResourceRefView) {
    return ref.title || ref.snapshotTitle || t('inbox.todoResourceUnavailable');
  }

  function resourceIcon(type: TodoResourceRefView['type']) {
    return icon.resource[type];
  }
</script>

<style scoped lang="less">
  .todo-resource-links {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .todo-resource-link {
    --todo-resource-tone: var(--primary-color);
    min-width: 0;
    max-width: min(220px, 100%);
    height: 24px;
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 999px;
    background: var(--card-background, var(--background-color));
  }

  .todo-resource-link.is-bookmark {
    --todo-resource-tone: var(--resource-bookmark-color, #615ced);
  }

  .todo-resource-link.is-note {
    --todo-resource-tone: var(--resource-note-color, #00a884);
  }

  .todo-resource-link.is-file {
    --todo-resource-tone: var(--resource-file-color, #ff8a00);
  }

  .todo-resource-link.is-unavailable {
    opacity: 0.58;
  }

  :deep(.b_btn.todo-resource-link__open),
  :deep(.b_btn.todo-resource-link__remove) {
    height: 22px;
    min-height: 22px;
    line-height: 1;
    border: 0;
    border-radius: 999px;
    background: transparent !important;
  }

  :deep(.b_btn.todo-resource-link__open) {
    min-width: 0;
    max-width: 100%;
    gap: 4px;
    justify-content: flex-start;
    padding: 0 7px;
    color: var(--todo-resource-tone);
    font-size: 11px;
  }

  .todo-resource-link.is-removable :deep(.b_btn.todo-resource-link__open) {
    padding-right: 4px;
  }

  .todo-resource-link__type {
    flex: 0 0 auto;
    font-weight: 600;
  }

  .todo-resource-link__title {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.b_btn.todo-resource-link__remove) {
    width: 22px;
    min-width: 22px;
    flex: 0 0 22px;
    padding: 0;
    border-left: 1px solid var(--surface-divider-color, var(--surface-border-color));
    border-radius: 0;
    color: var(--desc-color);
  }

  .todo-resource-links__more {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 24px;
  }

  @media (hover: hover) and (pointer: fine) {
    :deep(.b_btn.todo-resource-link__open:not(.disabled):hover) {
      background: var(--hover-background) !important;
    }

    :deep(.b_btn.todo-resource-link__remove:not(.disabled):hover) {
      color: var(--danger-color, #d83c45);
      background: var(--hover-background) !important;
    }
  }
</style>
