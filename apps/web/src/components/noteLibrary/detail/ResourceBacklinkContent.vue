<template>
  <div class="resource-backlinks__content" :class="{ 'resource-backlinks__content--compact': compact }">
    <section v-for="group in groups" :key="group.type" class="resource-backlinks__group">
      <h3>{{
        t(`note.resourceBacklinks.group.${group.type}`, {
          count: `${group.items.length}${group.hasMore ? '+' : ''}`,
        })
      }}</h3>
      <BButton
        v-for="item in group.items"
        :key="`${item.sourceType}:${item.id}`"
        class="resource-backlinks__item"
        @click="emit('open-source', item)"
      >
        <span class="resource-backlinks__item-copy">
          <strong>{{
            item.title ||
            t(item.sourceType === 'todo' ? 'note.resourceBacklinks.untitledTodo' : 'note.resourceBacklinks.untitled')
          }}</strong>
          <span class="resource-backlinks__item-meta">
            <small v-if="item.sourceType === 'todo'">{{
              t(item.status === 'completed' ? 'inbox.todoCompleted' : 'inbox.todoPending')
            }}</small>
            <small v-if="item.updateTime">{{
              t('note.resourceBacklinks.updatedAt', { time: formatTime(item.updateTime) })
            }}</small>
            <small class="resource-backlinks__locate">{{
              t(compact ? 'note.resourceBacklinks.locateReferenceCompact' : 'note.resourceBacklinks.locateReference')
            }}</small>
          </span>
        </span>
      </BButton>
    </section>
    <BButton
      v-if="hasMore"
      class="resource-backlinks__more"
      :loading="loading"
      :disabled="loading"
      @click="emit('show-more')"
    >
      {{ t('note.resourceBacklinks.showMore') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { ResourceBacklinkItem } from '@/api/noteReferences';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  defineProps<{
    groups: Array<{
      type: ResourceBacklinkItem['sourceType'];
      items: ResourceBacklinkItem[];
      hasMore: boolean;
    }>;
    compact: boolean;
    loading: boolean;
    hasMore: boolean;
  }>();
  const emit = defineEmits<{
    'open-source': [item: ResourceBacklinkItem];
    'show-more': [];
  }>();
  const { t, locale } = useI18n();

  function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { month: 'numeric', day: 'numeric' }).format(date);
  }
</script>

<style scoped lang="less">
  .resource-backlinks__content {
    display: grid;
    gap: 3px;
    padding: 5px;
    border-top: 1px solid color-mix(in srgb, var(--surface-border-color) 76%, transparent);
    background: color-mix(in srgb, var(--primary-color) 2%, var(--card-background));
  }

  .resource-backlinks__group {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .resource-backlinks__group + .resource-backlinks__group {
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--surface-divider-color, var(--surface-border-color));
  }

  .resource-backlinks__group h3 {
    margin: 0;
    padding: 3px 8px 1px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
  }

  :deep(.resource-backlinks__item.b_btn.default_btn) {
    width: 100%;
    min-height: 40px;
    height: auto;
    justify-content: flex-start;
    padding: 7px 12px;
    border-radius: 7px;
    background: transparent;
    box-shadow: none;
    text-align: left;
    white-space: normal;
    transition:
      background-color 0.2s,
      color 0.2s;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    }
  }

  .resource-backlinks__item-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .resource-backlinks__item-meta {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .resource-backlinks__item-copy strong,
  .resource-backlinks__item-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-backlinks__item-copy strong {
    color: var(--text-color);
    font-weight: 550;
    line-height: 1.35;
  }

  .resource-backlinks__item-copy small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.35;
  }

  .resource-backlinks__content--compact {
    gap: 1px;
    padding: 3px;

    :deep(.resource-backlinks__item.b_btn.default_btn) {
      min-height: 44px;
      padding: 6px 8px;
    }

    .resource-backlinks__item-copy {
      width: 100%;
      gap: 3px;
    }

    .resource-backlinks__item-copy strong {
      font-size: 13px;
      line-height: 1.3;
    }

    .resource-backlinks__item-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
    }

    .resource-backlinks__item-meta small {
      min-width: 0;
      font-size: 11px;
      line-height: 1.3;
    }

    .resource-backlinks__locate {
      flex: 1 1 auto;
      color: var(--primary-color);
    }

    .resource-backlinks__item-meta small:not(.resource-backlinks__locate) {
      flex: 0 0 auto;
    }

    .resource-backlinks__item-meta small + small::before {
      margin-right: 6px;
      color: var(--desc-color);
      content: '·';
    }

    :deep(.resource-backlinks__more.b_btn.default_btn) {
      min-height: 32px;
      padding: 4px 8px;
      line-height: 1.2;
    }
  }

  :deep(.resource-backlinks__more.b_btn.default_btn) {
    width: auto;
    min-height: 40px;
    height: auto;
    justify-self: start;
    padding: 7px 12px;
    border-radius: 6px;
    color: var(--primary-color);
    background: transparent;
    box-shadow: none;
    font-size: 12px;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    }
  }

  @media (max-width: 767px) {
    :deep(.resource-backlinks__item.b_btn.default_btn),
    :deep(.resource-backlinks__more.b_btn.default_btn),
    .resource-backlinks__content--compact :deep(.resource-backlinks__more.b_btn.default_btn) {
      min-height: 44px;
    }
  }
</style>
