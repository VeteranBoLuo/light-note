<template>
  <BButton class="gs-suggestion" :class="`gs-suggestion--${item.type}`" @click="emit('open', item)">
    <span class="gs-suggestion__badge" aria-hidden="true">
      <SvgIcon :src="typeIcon" size="17" />
    </span>
    <span class="gs-suggestion__main">
      <span class="gs-suggestion__title" v-html="highlightedTitle"></span>
      <small class="gs-suggestion__meta">{{ metaText }}</small>
    </span>
  </BButton>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { SearchResultItem } from '@/api/search';
  import type { GlobalSearchType } from '@/utils/globalSearchTypes';
  import { highlightKeyword } from '@/utils/globalSearchHighlight';

  const props = defineProps<{ item: SearchResultItem; keyword: string }>();
  const emit = defineEmits<{ open: [item: SearchResultItem] }>();

  const { t } = useI18n();

  const TYPE_ICONS: Record<GlobalSearchType, string> = {
    bookmark: icon.resource.bookmark,
    note: icon.resource.note,
    file: icon.resource.file,
    tag: icon.resource.tag,
    todo: icon.noteDetail.toolbar.todo,
  };

  const typeIcon = computed(() => TYPE_ICONS[props.item.type] || icon.resource.bookmark);
  const highlightedTitle = computed(() => highlightKeyword(props.item.title, props.keyword));

  // 副标题统一为「类型 · 状态或时间」：待办等类型的状态串由服务端按语言拼好，
  // 前端不重复实现一套状态文案。
  const metaText = computed(() => {
    const typeLabel = t(`resourceCenter.types.${props.item.type}`);
    const detail = String(props.item.extra || props.item.description || '').trim();
    return detail ? `${typeLabel} · ${detail}` : typeLabel;
  });
</script>

<style scoped lang="less">
  .gs-suggestion {
    width: 100%;
    min-height: 56px;
    padding: 10px 10px;
    gap: 10px;
    justify-content: flex-start;
    border-radius: 12px;
    color: var(--text-color);
    background: transparent !important;
    text-align: left;
  }

  .gs-suggestion:active {
    background: var(--hover-background) !important;
  }

  @media (hover: hover) and (pointer: fine) {
    .gs-suggestion:hover {
      background: var(--hover-background) !important;
    }
  }

  .gs-suggestion__badge {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }

  .gs-suggestion--bookmark .gs-suggestion__badge {
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 12%, transparent);
  }

  .gs-suggestion--note .gs-suggestion__badge {
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 12%, transparent);
  }

  .gs-suggestion--file .gs-suggestion__badge {
    color: var(--resource-file-color);
    background: color-mix(in srgb, var(--resource-file-color) 12%, transparent);
  }

  .gs-suggestion--tag .gs-suggestion__badge {
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 12%, transparent);
  }

  .gs-suggestion__main {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gs-suggestion__title {
    display: block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
  }

  .gs-suggestion__meta {
    display: block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
  }

  .gs-suggestion__title :deep(.gs-highlight) {
    padding: 0 1px;
    border-radius: 3px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 16%, transparent);
  }
</style>
