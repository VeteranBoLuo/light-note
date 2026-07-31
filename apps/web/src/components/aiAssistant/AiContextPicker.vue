<template>
  <div class="ai-context-picker">
    <div v-if="modelValue.length" class="ai-context-chips">
      <BButton
        v-for="item in modelValue"
        :key="`${item.type}:${item.id}`"
        size="small"
        class="ai-context-chip"
        :title="`${item.title} · ${t('ai.material.onceTooltip')}`"
        :aria-label="t('ai.contextLens.removeMaterial')"
        @click="remove(item)"
      >
        <SvgIcon :src="resourceIcon(item.type)" size="12" aria-hidden="true" />
        <span class="ai-context-chip__title">{{ item.title }}</span>
        <span class="ai-context-chip__once">{{ t('ai.material.once') }}</span>
        <SvgIcon class="ai-context-chip__x" :src="icon.common.close" size="10" aria-hidden="true" />
      </BButton>
      <!-- 一次性语义下发送即消费;此按钮是「发送前反悔」的辅助操作 -->
      <BButton
        size="small"
        class="ai-context-clear"
        :title="t('ai.material.onceTooltip')"
        @click="clearAll"
      >
        {{ t('ai.material.clearOnce') }}
      </BButton>
    </div>
    <BPopover v-model:open="open" trigger="click" placement="top-left" overlay-class-name="ai-context-popover">
      <BButton size="small">@ {{ t('ai.addContext') }}</BButton>
      <template #content>
        <div class="ai-context-panel">
          <BInput v-model:value="keyword" :placeholder="t('ai.searchContext')" clearable @enter="searchNow" />
          <div class="ai-context-results">
            <BButton
              v-if="currentPageContext && !selected(currentPageContext)"
              :disabled="modelValue.length >= 5"
              @click="add(currentPageContext)"
            >
              <span class="ai-context-type ai-context-type--current">{{ t('ai.currentPage') }}</span
              ><strong>{{ currentPageContext.title }}</strong>
            </BButton>
            <BButton
              v-for="item in results"
              :key="`${item.type}:${item.id}`"
              :disabled="selected(item) || (item.type !== 'file' && modelValue.length >= 5)"
              @click="add(item)"
            >
              <span class="ai-context-type" :style="{ color: typeColor(item.type) }">{{ typeLabel(item.type) }}</span
              ><strong>{{ item.title }}</strong>
            </BButton>
            <span v-if="!loading && !results.length && !currentPageContext" class="ai-context-empty">{{
              t('ai.noContext')
            }}</span>
          </div>
        </div>
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { fetchGlobalSearch, type SearchResultItem, type SearchType } from '@/api/search';
  import { useCurrentPageResource } from '@/composables/useCurrentPageResource';
  import { RESOURCE_COLOR_CSS_VAR, type ResourceType } from '@/config/resourceColor';

  export interface AiResourceContext {
    type: SearchType;
    id: string;
    title: string;
  }

  const props = defineProps<{ modelValue: AiResourceContext[] }>();
  const emit = defineEmits<{
    'update:modelValue': [value: AiResourceContext[]];
    fileSelected: [value: AiResourceContext];
  }>();
  const { t } = useI18n();
  const open = ref(false);
  const keyword = ref('');
  const results = ref<AiResourceContext[]>([]);
  const loading = ref(false);
  let debounceTimer: number | null = null;
  let searchRequestId = 0;

  // 推导逻辑与 @ 浮层共用,避免两处口径漂移
  const currentPageContext = useCurrentPageResource();
  const typeLabel = (type: SearchType) => t(`ai.sourceTypes.${type}`);
  const typeColor = (type: SearchType) => {
    const cssVar = RESOURCE_COLOR_CSS_VAR[type as ResourceType];
    return cssVar ? `var(${cssVar})` : 'var(--desc-color)';
  };
  function resourceIcon(type: SearchType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    return icon.resource.bookmark;
  }
  const selected = (item: AiResourceContext) =>
    props.modelValue.some((value) => value.type === item.type && value.id === item.id);

  watch(open, (value) => {
    if (value) searchNow();
    else clearDebounce();
  });
  watch(keyword, () => {
    if (!open.value) return;
    clearDebounce();
    debounceTimer = window.setTimeout(searchNow, 320);
  });

  function clearDebounce() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  async function searchNow() {
    clearDebounce();
    const requestId = ++searchRequestId;
    loading.value = true;
    try {
      const data = await fetchGlobalSearch(keyword.value, 5, true);
      if (requestId !== searchRequestId) return;
      results.value = (data.items || [])
        .filter((item: SearchResultItem) => ['bookmark', 'note', 'file', 'tag'].includes(item.type))
        .slice(0, 12)
        .map((item) => ({ type: item.type, id: String(item.id), title: item.title }));
    } catch {
      if (requestId === searchRequestId) results.value = [];
    } finally {
      if (requestId === searchRequestId) loading.value = false;
    }
  }
  function add(item: AiResourceContext) {
    if (item.type === 'file') {
      emit('fileSelected', item);
      open.value = false;
      return;
    }
    if (selected(item) || props.modelValue.length >= 5) return;
    emit('update:modelValue', [...props.modelValue, item]);
    open.value = false;
  }
  function clearAll() {
    emit('update:modelValue', []);
  }
  function remove(item: AiResourceContext) {
    emit(
      'update:modelValue',
      props.modelValue.filter((value) => value.type !== item.type || value.id !== item.id),
    );
  }
  function closePopover() {
    open.value = false;
  }
  onMounted(() => {
    window.addEventListener('light-note:close-ai-overlays', closePopover);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('light-note:close-ai-overlays', closePopover);
    clearDebounce();
    searchRequestId += 1;
  });
</script>

<style scoped lang="less">
  .ai-context-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    width: auto;
    max-width: 100%;
    min-width: 0;
  }
  .ai-context-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }
  /* 已选材料 = 带主色调的"标签",跟右边中性的「@添加资源 / 上传文件」按钮明显区分,
     一眼能看出这是"选中的内容"而非可点的操作按钮。 */
  .ai-context-chips :deep(.b_btn) {
    gap: 4px;
    height: auto;
    min-height: 24px;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 32%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
    color: var(--primary-color);
    font-weight: 500;
  }
  .ai-context-chip__once {
    flex: 0 0 auto;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    font-size: 10px;
    line-height: 16px;
    opacity: 0.85;
  }
  /* 清空是「撤销选择」而非材料本身:中性描边,与主色 chips 区分 */
  .ai-context-chips :deep(.ai-context-clear) {
    border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent);
    background: transparent;
    color: var(--desc-color);
    font-weight: 400;
  }
  .ai-context-chips :deep(.ai-context-clear:hover) {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 40%, transparent);
    color: var(--danger-color, #e5484d);
  }
  .ai-context-chip__title {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-context-chip__x {
    opacity: 0.55;
  }
  .ai-context-panel {
    display: flex;
    flex-direction: column;
    width: 320px;
    max-width: calc(100vw - 24px);
    max-height: min(360px, calc(100dvh - 120px));
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;
  }
  .ai-context-results {
    display: grid;
    gap: 5px;
    min-height: 0;
    min-width: 0;
    max-height: 260px;
    margin-top: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .ai-context-results :deep(.b_btn) {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: auto;
    min-height: 34px;
    justify-content: flex-start;
    gap: 8px;
    overflow: hidden;
    text-align: left;
  }
  .ai-context-results span {
    font-size: 11px;
  }
  .ai-context-results .ai-context-type {
    flex: 0 0 auto;
    font-weight: 600;
  }
  /* 「当前页面」是特殊入口,用独立于四种资源色(尤其别撞书签=主色 #615ced)的强调色文字突出,不加背景 */
  .ai-context-results .ai-context-type--current {
    color: #0ea5e9;
  }
  .ai-context-results strong {
    flex: 1 1 auto;
    min-width: 0;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-context-empty {
    display: block;
    padding: 14px;
    color: var(--desc-color);
    text-align: center;
  }

  @media (pointer: coarse) {
    /* 触发按钮(@添加资源)压到 36px,与右侧「上传文件」一致、不再突兀过高;
       下拉结果列表项仍保留 44px 便于触屏点选 */
    .ai-context-picker :deep(.b_btn) {
      min-height: 36px;
    }
    .ai-context-results :deep(.b_btn) {
      min-height: 44px;
    }
  }

  @media (max-width: 600px) {
    .ai-context-picker,
    .ai-context-chips {
      max-width: none;
      flex: 0 0 auto;
      flex-wrap: nowrap;
    }

    .ai-context-picker {
      gap: 4px;
    }

    .ai-context-chips {
      gap: 4px;
    }

    .ai-context-picker :deep(.b_btn) {
      height: 36px;
      min-height: 36px;
    }

    .ai-context-chip__title {
      max-width: 112px;
    }
  }
</style>
