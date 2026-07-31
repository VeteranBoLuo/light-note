<template>
  <div class="resource-mention-picker">
    <BInput
      ref="keywordInputRef"
      v-model:value="keyword"
      class="resource-mention-picker__search"
      :placeholder="t('note.resourceMention.searchPlaceholder')"
      clearable
      @enter="chooseActive"
      @keydown.down.prevent="moveActive(1)"
      @keydown.up.prevent="moveActive(-1)"
      @keydown.esc="close"
    >
      <template #prefix>
        <SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" />
      </template>
    </BInput>

    <BLoading :loading="loading" inline :title="t('note.resourceMention.searching')" />
    <div v-if="!loading" class="resource-mention-picker__results" role="listbox">
      <BButton
        v-for="(item, index) in results"
        :key="`${item.type}:${item.id}`"
        class="resource-mention-picker__item"
        :class="{ 'is-active': index === activeIndex }"
        :aria-selected="index === activeIndex"
        @mouseenter="activeIndex = index"
        @click="choose(item)"
      >
        <span class="resource-mention-picker__icon" :class="`is-${item.type}`">
          <SvgIcon :src="resourceIcon(item.type)" size="17" aria-hidden="true" />
        </span>
        <span class="resource-mention-picker__copy">
          <strong>{{ item.title }}</strong>
          <small>{{ typeLabel(item.type) }}</small>
        </span>
      </BButton>
      <div v-if="!results.length" class="resource-mention-picker__empty">
        {{ keyword.trim() ? t('note.resourceMention.empty') : t('note.resourceMention.emptyHint') }}
      </div>
    </div>
    <p class="resource-mention-picker__hint">{{ t('note.resourceMention.hint') }}</p>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useResourcePickerSearch } from '@/composables/useResourcePickerSearch';
  import type { ResourceRef, ResourceRefType } from '@/utils/noteResourceRefs';

  interface ResourceMentionItem extends ResourceRef {
    title: string;
  }

  type BInputExpose = { focus?: () => void };

  // initialKeyword:从输入框 @ 后面的字带过来,省得用户在这里重新输一遍
  const props = withDefaults(defineProps<{ initialKeyword?: string; autoFocus?: boolean }>(), {
    initialKeyword: '',
    autoFocus: true,
  });
  const emit = defineEmits<{ select: [value: ResourceMentionItem]; close: [] }>();
  const { t } = useI18n();
  const keyword = ref('');
  const keywordInputRef = ref<BInputExpose | null>(null);
  // 搜索/防抖/竞态/去重统一走公共内核
  const { results, loading, activeIndex, search, searchNow, moveActive, reset } = useResourcePickerSearch({
    allowedTypes: ['bookmark', 'note', 'file'],
    limit: 24,
    debounceMs: 260,
  });

  function resourceIcon(type: ResourceRefType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  function typeLabel(type: ResourceRefType) {
    return t(`ai.sourceTypes.${type}`);
  }

  function choose(item: ResourceMentionItem) {
    emit('select', item);
  }

  function chooseActive() {
    const item = results.value[activeIndex.value];
    if (item) choose(item);
  }

  function close() {
    emit('close');
  }

  onMounted(async () => {
    keyword.value = props.initialKeyword || '';
    reset();
    await nextTick();
    if (props.autoFocus) keywordInputRef.value?.focus?.();
    // 打开即展示结果(带初始词则直接搜),不必等用户输入
    void searchNow(keyword.value);
  });

  watch(keyword, (value) => search(String(value || '')));

  onBeforeUnmount(reset);
</script>

<style scoped lang="less">
  .resource-mention-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: min(420px, calc(90vw - 40px));
    max-width: calc(90vw - 40px);
  }

  .resource-mention-picker__results {
    display: grid;
    gap: 5px;
    max-height: min(360px, calc(100dvh - 260px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .resource-mention-picker__item {
    width: 100%;
    min-height: 44px;
    height: auto;
    justify-content: flex-start;
    gap: 10px;
    padding: 7px 10px;
    text-align: left;

    &.is-active,
    &:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, var(--primary-btn-bg-color));
    }
  }

  .resource-mention-picker__icon {
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
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

  .resource-mention-picker__copy {
    display: grid;
    min-width: 0;
    gap: 2px;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--text-color);
      font-weight: 600;
    }

    small {
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .resource-mention-picker__empty {
    padding: 26px 12px;
    color: var(--desc-color);
    text-align: center;
    font-size: 13px;
  }

  .resource-mention-picker__hint {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  @media (max-width: 767px) {
    .resource-mention-picker {
      min-width: 0;
      max-width: none;
    }
  }
</style>
