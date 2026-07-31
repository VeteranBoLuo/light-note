<template>
  <Teleport to="body">
    <div v-if="open" class="gs-layer" :style="layerStyle" role="dialog" aria-modal="true" @keydown.esc="cancel">
      <header class="gs-layer__head">
        <BButton class="gs-layer__back" :aria-label="t('common.back')" @click="cancel">
          <SvgIcon :src="icon.noteDetail.back" size="19" aria-hidden="true" />
        </BButton>
        <div class="gs-layer__input">
          <BInput
            id="mobile-global-search-input"
            ref="inputRef"
            v-model:value="keyword"
            :placeholder="t('globalSearch.placeholder')"
            height="38px"
            clearable
            @enter="submitFullSearch"
          >
            <template #prefix>
              <SvgIcon :src="icon.navigation.search" size="15" aria-hidden="true" />
            </template>
          </BInput>
        </div>
        <BButton class="gs-layer__cancel" @click="cancel">{{ t('globalSearch.cancel') }}</BButton>
      </header>

      <div class="gs-layer__body">
        <template v-if="!trimmedKeyword">
          <section v-if="recentKeywords.length" class="gs-layer__section">
            <div class="gs-layer__section-head">
              <span>{{ t('globalSearch.recent') }}</span>
              <BButton class="gs-layer__text-action" @click="clearRecentKeywords">
                {{ t('globalSearch.clearRecent') }}
              </BButton>
            </div>
            <div class="gs-layer__recent">
              <BButton
                v-for="word in recentKeywords"
                :key="word"
                class="gs-layer__chip"
                @click="applyRecent(word)"
              >
                {{ word }}
              </BButton>
            </div>
          </section>

          <section class="gs-layer__section">
            <div class="gs-layer__section-head">
              <span>{{ t('globalSearch.searchable') }}</span>
            </div>
            <div class="gs-layer__types">
              <span v-for="type in GLOBAL_SEARCH_TYPES" :key="type" class="gs-layer__type" :class="`is-${type}`">
                <SvgIcon :src="typeIcons[type]" size="14" aria-hidden="true" />
                {{ t(`resourceCenter.types.${type}`) }}
              </span>
            </div>
          </section>

          <p v-if="!recentKeywords.length" class="gs-layer__hint">{{ t('globalSearch.emptyHint') }}</p>
        </template>

        <template v-else>
          <div v-if="loading" class="gs-layer__skeleton" aria-hidden="true">
            <span v-for="index in 5" :key="`gs-skeleton-${index}`" class="gs-layer__skeleton-row"></span>
          </div>

          <div v-else-if="failed" class="gs-layer__state" role="alert">
            <strong>{{ t('globalSearch.failedTitle') }}</strong>
            <span>{{ t('globalSearch.failedDesc') }}</span>
            <BButton type="primary" size="small" @click="retry">{{ t('common.retry') }}</BButton>
          </div>

          <template v-else-if="items.length">
            <div class="gs-layer__section-head gs-layer__section-head--tight">
              <span>{{ t('globalSearch.bestMatch') }}</span>
            </div>
            <GlobalSearchSuggestionItem
              v-for="item in items"
              :key="`${item.type}-${item.id}`"
              :item="item"
              :keyword="trimmedKeyword"
              @open="openItem"
            />
            <BButton class="gs-layer__view-all" @click="submitFullSearch">
              {{ t('globalSearch.viewAll') }}
            </BButton>
          </template>

          <div v-else class="gs-layer__state">
            <strong>{{ t('globalSearch.noResultTitle', { keyword: trimmedKeyword }) }}</strong>
            <span>{{ t('globalSearch.noResultDesc') }}</span>
            <BButton type="primary" size="small" @click="submitFullSearch">
              {{ t('globalSearch.openFullSearch') }}
            </BButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import GlobalSearchSuggestionItem from '@/components/globalSearch/GlobalSearchSuggestionItem.vue';
  import icon from '@/config/icon';
  import type { SearchResultItem } from '@/api/search';
  import { GLOBAL_SEARCH_TYPES, type GlobalSearchType } from '@/utils/globalSearchTypes';
  import { navigateToSearchResult } from '@/utils/globalSearchNavigation';
  import { useGlobalSearchSuggestions } from '@/composables/useGlobalSearchSuggestions';
  import { useMobileGlobalSearch } from '@/composables/useMobileGlobalSearch';
  import { getMobileTopBarBinding } from '@/composables/useMobileTopBar';
  import { recordOperation } from '@/api/commonApi';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const { open, keyword, recentKeywords, closeSearch, dismiss, rememberKeyword, clearRecentKeywords } =
    useMobileGlobalSearch();
  // 搜索层是全局单例，来源页按打开时所在路由的顶栏绑定决定
  const { items, loading, failed, schedule, run, reset } = useGlobalSearchSuggestions(
    GLOBAL_SEARCH_TYPES,
    () => getMobileTopBarBinding(route.name)?.searchSourceType || '',
  );

  const inputRef = ref<InstanceType<typeof BInput> | null>(null);
  const layerHeight = ref('');
  const layerTop = ref('0px');

  const typeIcons: Record<GlobalSearchType, string> = {
    bookmark: icon.resource.bookmark,
    note: icon.resource.note,
    file: icon.resource.file,
    tag: icon.resource.tag,
    todo: icon.noteDetail.toolbar.todo,
  };

  const trimmedKeyword = computed(() => keyword.value.trim());
  const layerStyle = computed(() => ({
    top: layerTop.value,
    height: layerHeight.value || '100%',
  }));

  // 软键盘弹出后 100dvh 在部分 Android WebView 仍是键盘前的高度，
  // 会把结果推到键盘下面；这里以 visualViewport 为准。
  function syncViewport() {
    const viewport = window.visualViewport;
    if (!viewport) {
      layerTop.value = '0px';
      layerHeight.value = '';
      return;
    }
    layerTop.value = `${viewport.offsetTop}px`;
    layerHeight.value = `${viewport.height}px`;
  }

  function applyRecent(word: string) {
    keyword.value = word;
  }

  function retry() {
    void run(trimmedKeyword.value);
  }

  function cancel() {
    closeSearch();
  }

  function openItem(item: SearchResultItem) {
    rememberKeyword(trimmedKeyword.value);
    recordOperation({ module: '全局搜索', operation: `打开移动端搜索结果【${item.type}】` });
    // 先让 sentinel 出栈，再跳目标路由，否则返回键会把新页面一起弹掉
    closeSearch(() => navigateToSearchResult(router, item));
  }

  function submitFullSearch() {
    const query = trimmedKeyword.value;
    rememberKeyword(query);
    closeSearch(() => {
      void router.push({ path: '/search', query: query ? { q: query } : {} });
    });
  }

  // 由 keyword 单点驱动取数：输入、点最近搜索、点清除按钮、关闭时清空都走同一条路径，
  // 不依赖 BInput 是否为每种交互都派发 input 事件。
  watch(keyword, (value) => schedule(value));

  watch(open, (visible) => {
    if (visible) {
      syncViewport();
      window.visualViewport?.addEventListener('resize', syncViewport);
      window.visualViewport?.addEventListener('scroll', syncViewport);
      void nextTick(() => document.getElementById('mobile-global-search-input')?.focus());
      return;
    }
    window.visualViewport?.removeEventListener('resize', syncViewport);
    window.visualViewport?.removeEventListener('scroll', syncViewport);
    reset();
  });

  // 兜底：路由若由其他来源改变（sentinel 已失效），只收起界面，不再动 history
  watch(
    () => route.fullPath,
    () => {
      if (open.value) dismiss();
    },
  );

  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', syncViewport);
    window.visualViewport?.removeEventListener('scroll', syncViewport);
  });
</script>

<style scoped lang="less">
  .gs-layer {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .gs-layer__head {
    height: 56px;
    padding: 0 8px 0 4px;
    flex: 0 0 56px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .gs-layer__back {
    width: 38px;
    min-width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent !important;
  }

  .gs-layer__input {
    min-width: 0;
    flex: 1 1 auto;
  }

  .gs-layer__input :deep(.b-input) {
    border-radius: 10px;
    font-size: 13px;
  }

  .gs-layer__cancel {
    flex: 0 0 auto;
    height: 38px;
    padding: 0 8px;
    color: var(--desc-color);
    background: transparent !important;
    font-size: 13px;
  }

  .gs-layer__body {
    min-height: 0;
    flex: 1 1 auto;
    padding: 10px 10px calc(16px + env(safe-area-inset-bottom));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .gs-layer__section + .gs-layer__section {
    margin-top: 16px;
  }

  .gs-layer__section-head {
    padding: 0 4px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--desc-color);
    font-size: 12px;
  }

  .gs-layer__section-head--tight {
    margin-bottom: 4px;
  }

  .gs-layer__text-action {
    height: 26px;
    padding: 0 6px;
    color: var(--primary-color);
    background: transparent !important;
    font-size: 12px;
  }

  .gs-layer__recent {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .gs-layer__chip {
    max-width: 100%;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--text-color);
    background: var(--card-background) !important;
    font-size: 12px;
  }

  .gs-layer__types {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .gs-layer__type {
    height: 28px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
  }

  .gs-layer__type.is-bookmark {
    color: var(--resource-bookmark-color);
  }

  .gs-layer__type.is-note {
    color: var(--resource-note-color);
  }

  .gs-layer__type.is-file {
    color: var(--resource-file-color);
  }

  .gs-layer__type.is-tag {
    color: var(--resource-tag-color);
  }

  .gs-layer__type.is-todo {
    color: var(--primary-color);
  }

  .gs-layer__hint {
    margin: 20px 4px 0;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .gs-layer__skeleton {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .gs-layer__skeleton-row {
    height: 54px;
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    animation: gs-skeleton 1.3s ease-in-out infinite;
  }

  .gs-layer__state {
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .gs-layer__state strong {
    font-size: 14px;
  }

  .gs-layer__state span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .gs-layer__view-all {
    width: 100%;
    height: 42px;
    margin-top: 10px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 42%, transparent);
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent) !important;
    font-size: 13px;
  }

  @keyframes gs-skeleton {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gs-layer__skeleton-row {
      animation: none;
    }
  }
</style>
