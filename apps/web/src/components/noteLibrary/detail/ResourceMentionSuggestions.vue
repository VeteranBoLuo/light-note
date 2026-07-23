<template>
  <div class="resource-mention-suggestions" @mousedown.prevent>
    <div class="resource-mention-suggestions__heading">
      <span>{{ t('note.resourceMention.quickTitle') }}</span>
      <span v-if="query" class="resource-mention-suggestions__query">@{{ query }}</span>
    </div>
    <BLoading :loading="loading" inline :title="t('note.resourceMention.searching')" />
    <div v-if="!loading" class="resource-mention-suggestions__results" role="listbox">
      <BButton
        v-for="(item, index) in results"
        :key="`${item.type}:${item.id}`"
        class="resource-mention-suggestions__item"
        :class="{ 'is-active': index === activeIndex }"
        :aria-selected="index === activeIndex"
        @mouseenter="activeIndex = index"
        @click="choose(item)"
      >
        <span class="resource-mention-suggestions__icon" :class="`is-${item.type}`">
          <SvgIcon :src="resourceIcon(item.type)" size="16" aria-hidden="true" />
        </span>
        <span class="resource-mention-suggestions__copy">
          <strong>{{ item.title }}</strong>
          <small>{{ typeLabel(item.type) }}</small>
        </span>
      </BButton>
      <div v-if="!results.length" class="resource-mention-suggestions__empty">
        {{ query.trim() ? t('note.resourceMention.empty') : t('note.resourceMention.emptyHint') }}
      </div>
    </div>
    <BButton class="resource-mention-suggestions__all" @click="$emit('open-full')">
      {{ t('note.resourceMention.openFull') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { fetchGlobalSearch, type SearchResultItem } from '@/api/search';
  import type { ResourceRef, ResourceRefType } from '@/utils/noteResourceRefs';

  interface ResourceMentionItem extends ResourceRef {
    title: string;
  }

  const props = defineProps<{ query: string }>();
  const emit = defineEmits<{ select: [value: ResourceMentionItem]; 'open-full': [] }>();
  const { t } = useI18n();
  const results = ref<ResourceMentionItem[]>([]);
  const loading = ref(false);
  const activeIndex = ref(0);
  let debounceTimer: number | null = null;
  let requestId = 0;

  function resourceIcon(type: ResourceRefType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  function typeLabel(type: ResourceRefType) {
    return t(`ai.sourceTypes.${type}`);
  }

  function clearDebounce() {
    if (debounceTimer === null) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  async function searchNow() {
    clearDebounce();
    const currentRequest = ++requestId;
    loading.value = true;
    try {
      const data = await fetchGlobalSearch(props.query, 8, true);
      if (currentRequest !== requestId) return;
      const seen = new Set<string>();
      results.value = (data.items || [])
        .filter((item: SearchResultItem) => ['bookmark', 'note', 'file'].includes(item.type))
        .map((item) => ({
          type: item.type as ResourceRefType,
          id: String(item.id || ''),
          title: String(item.title || ''),
        }))
        .filter((item) => {
          const key = `${item.type}:${item.id}`;
          if (!item.id || !item.title || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8);
      activeIndex.value = 0;
    } catch {
      if (currentRequest !== requestId) return;
      results.value = [];
      activeIndex.value = 0;
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function choose(item: ResourceMentionItem) {
    emit('select', item);
  }

  function chooseActive() {
    const item = results.value[activeIndex.value];
    if (item) choose(item);
  }

  function moveActive(offset: number) {
    const total = results.value.length;
    if (!total) return;
    activeIndex.value = (activeIndex.value + offset + total) % total;
  }

  watch(
    () => props.query,
    () => {
      clearDebounce();
      debounceTimer = window.setTimeout(() => void searchNow(), 180);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearDebounce();
    requestId += 1;
  });

  defineExpose({ chooseActive, moveActive });
</script>

<style scoped lang="less">
  .resource-mention-suggestions {
    width: min(340px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    box-shadow: var(--surface-raised-shadow);
  }

  .resource-mention-suggestions__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 34px;
    padding: 0 10px;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-mention-suggestions__query {
    overflow: hidden;
    color: var(--primary-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-mention-suggestions__results {
    display: grid;
    gap: 2px;
    max-height: min(288px, calc(100dvh - 160px));
    padding: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  :deep(.resource-mention-suggestions__item.b_btn.default_btn) {
    width: 100%;
    min-height: 36px;
    height: auto;
    justify-content: flex-start;
    gap: 9px;
    padding: 4px 8px;
    line-height: 1.25;
    text-align: left;

    &.is-active,
    &:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, var(--primary-btn-bg-color));
    }
  }

  .resource-mention-suggestions__icon {
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 7px;
    color: var(--resource-note-color, var(--primary-color));
    background: color-mix(in srgb, var(--resource-note-color, var(--primary-color)) 12%, transparent);

    &.is-bookmark {
      color: var(--resource-bookmark-color, var(--primary-color));
      background: color-mix(in srgb, var(--resource-bookmark-color, var(--primary-color)) 12%, transparent);
    }

    &.is-file {
      color: var(--resource-file-color, var(--primary-color));
      background: color-mix(in srgb, var(--resource-file-color, var(--primary-color)) 12%, transparent);
    }
  }

  .resource-mention-suggestions__copy {
    display: grid;
    min-width: 0;
    gap: 1px;
    line-height: 1.25;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 600;
    }

    small {
      color: var(--desc-color);
      font-size: 11px;
    }
  }

  .resource-mention-suggestions__empty {
    padding: 20px 10px;
    color: var(--desc-color);
    text-align: center;
    font-size: 12px;
  }

  :deep(.resource-mention-suggestions__all.b_btn.default_btn) {
    width: 100%;
    min-height: 36px;
    justify-content: flex-start;
    border-top: 1px solid var(--surface-border-color);
    border-radius: 0;
    color: var(--primary-color);
    background: transparent;
    font-size: 12px;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
    }
  }
</style>
