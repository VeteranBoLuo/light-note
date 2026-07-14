<template>
  <div class="ai-context-picker">
    <div v-if="modelValue.length" class="ai-context-chips">
      <BButton v-for="item in modelValue" :key="`${item.type}:${item.id}`" size="small" @click="remove(item)">
        @{{ item.title }} ×
      </BButton>
    </div>
    <BPopover v-model:open="open" trigger="click" placement="bottom-left" overlay-class-name="ai-context-popover">
      <BButton size="small" :disabled="modelValue.length >= 5">@ {{ t('ai.addContext') }}</BButton>
      <template #content>
        <div class="ai-context-panel">
          <BInput v-model:value="keyword" :placeholder="t('ai.searchContext')" clearable @enter="search" />
          <div class="ai-context-results">
            <BButton v-if="currentPageContext && !selected(currentPageContext)" @click="add(currentPageContext)">
              <span>{{ t('ai.currentPage') }}</span><strong>{{ currentPageContext.title }}</strong>
            </BButton>
            <BButton v-for="item in results" :key="`${item.type}:${item.id}`" :disabled="selected(item)" @click="add(item)">
              <span>{{ typeLabel(item.type) }}</span><strong>{{ item.title }}</strong>
            </BButton>
            <span v-if="!loading && !results.length && !currentPageContext" class="ai-context-empty">{{ t('ai.noContext') }}</span>
          </div>
        </div>
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { fetchGlobalSearch, type SearchResultItem, type SearchType } from '@/api/search';

  export interface AiResourceContext {
    type: SearchType;
    id: string;
    title: string;
  }

  const props = defineProps<{ modelValue: AiResourceContext[] }>();
  const emit = defineEmits<{ 'update:modelValue': [value: AiResourceContext[]] }>();
  const { t } = useI18n();
  const route = useRoute();
  const open = ref(false);
  const keyword = ref('');
  const results = ref<AiResourceContext[]>([]);
  const loading = ref(false);

  const currentPageContext = computed<AiResourceContext | null>(() => {
    const id = String(route.params.id || '');
    if (route.path.startsWith('/noteLibrary/') && id && id !== 'add') return { type: 'note', id, title: document.title || t('ai.currentNote') };
    if (route.path.startsWith('/manage/editBookmark/') && id && id !== 'add') return { type: 'bookmark', id, title: document.title || t('ai.currentBookmark') };
    if (route.path.startsWith('/tag/') && id) return { type: 'tag', id, title: document.title || t('ai.currentTag') };
    return null;
  });
  const typeLabel = (type: SearchType) => t(`ai.sourceTypes.${type}`);
  const selected = (item: AiResourceContext) => props.modelValue.some((value) => value.type === item.type && value.id === item.id);

  watch(open, (value) => { if (value) search(); });

  async function search() {
    loading.value = true;
    try {
      const data = await fetchGlobalSearch(keyword.value, 5, true);
      results.value = (data.items || [])
        .filter((item: SearchResultItem) => ['bookmark', 'note', 'file', 'tag'].includes(item.type))
        .slice(0, 12)
        .map((item) => ({ type: item.type, id: String(item.id), title: item.title }));
    } finally { loading.value = false; }
  }
  function add(item: AiResourceContext) {
    if (selected(item) || props.modelValue.length >= 5) return;
    emit('update:modelValue', [...props.modelValue, item]);
    open.value = false;
  }
  function remove(item: AiResourceContext) {
    emit('update:modelValue', props.modelValue.filter((value) => value.type !== item.type || value.id !== item.id));
  }
</script>

<style scoped lang="less">
  .ai-context-picker { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .ai-context-chips { display: flex; gap: 5px; flex-wrap: wrap; }
  .ai-context-panel { width: 320px; max-width: calc(100vw - 24px); padding: 10px; box-sizing: border-box; }
  .ai-context-results { display: grid; gap: 5px; max-height: 260px; margin-top: 8px; overflow: auto; }
  .ai-context-results :deep(.b_btn) { width: 100%; height: auto; min-height: 34px; justify-content: flex-start; gap: 8px; text-align: left; }
  .ai-context-results span { color: var(--desc-color); font-size: 11px; } .ai-context-results strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-context-empty { display: block; padding: 14px; color: var(--desc-color); text-align: center; }
</style>
