<template>
  <div v-if="isSearchAvailable" ref="rootRef" class="global-search">
    <BTooltip :title="`${t('resourceCenter.searchPlaceholder')} · ${searchShortcutLabel}`">
      <BButton
        class="global-search__trigger"
        :aria-label="t('resourceCenter.searchPlaceholder')"
        :aria-expanded="visible"
        aria-haspopup="dialog"
        @click="open"
        v-click-log="{ module: '全局搜索', operation: '打开全局搜索' }"
      >
        <SvgIcon :src="icon.navigation.search" size="20" />
      </BButton>
    </BTooltip>

    <Teleport to="body">
      <div v-if="visible" class="global-search-layer" @mousedown.self="close()">
        <section
          ref="dialogRef"
          class="global-search-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('resourceCenter.title')"
          @keydown="handleDialogKeydown"
        >
          <header class="global-search-dialog__header">
            <div class="global-search-dialog__heading">
              <div>
                <strong>{{ t('resourceCenter.title') }}</strong>
                <span>{{ t('resourceCenter.suggestSubtitle') }}</span>
              </div>
              <BButton :aria-label="t('resourceCenter.cancel')" @click="close()">
                <SvgIcon :src="icon.navigation.close" size="18" />
              </BButton>
            </div>
            <div class="global-search-dialog__input">
              <BInput
                id="global-search-input"
                ref="inputRef"
                v-model:value="keyword"
                clearable
                :placeholder="placeholder"
                height="48px"
                @input="handleInput"
                @enter="onEnter"
                @keydown="onResultKeydown"
              >
                <template #prefix><SvgIcon :src="icon.navigation.search" size="19" /></template>
              </BInput>
              <kbd>{{ searchShortcutLabel }}</kbd>
            </div>
          </header>

          <div class="global-search-dialog__body">
            <div v-if="loading" class="global-search__loading" aria-live="polite">
              <div v-for="n in 6" :key="n" class="global-search__skeleton"></div>
            </div>

            <template v-else-if="suggestGroups.length">
              <section v-for="group in suggestGroups" :key="group.type" class="global-search-group">
                <h3>{{ getGroupLabel(group.type) }}</h3>
                <div
                  v-for="item in group.items"
                  :key="`${item.type}-${item.id}`"
                  class="global-search-result"
                  :class="{ 'is-active': isActiveItem(item) }"
                  @mousemove="activateItem(item)"
                >
                  <BButton
                    class="global-search-result__open"
                    @click="openItem(item)"
                    v-click-log="{ module: '全局搜索', operation: `打开搜索建议【${item.type}:${item.title}】` }"
                  >
                    <span class="global-search-result__dot" :class="`is-${item.type}`"></span>
                    <span class="global-search-result__main">
                      <span class="global-search-result__title-row">
                        <span class="global-search-result__title" v-html="highlightText(item.title, keyword)"></span>
                        <span v-if="item.tags?.length" class="global-search-result__tags">
                          <ResourceTagChip
                            v-for="tag in item.tags"
                            :key="tag.id"
                            :tag="tag"
                            :selected="isTagHit(tag.name)"
                            show-hash
                            max-width="100px"
                          />
                        </span>
                      </span>
                      <span
                        class="global-search-result__description"
                        v-html="highlightText(item.description || item.extra, keyword)"
                      ></span>
                    </span>
                  </BButton>
                  <span class="global-search-result__extra">
                    <BTooltip v-if="item.type === 'bookmark'" :title="t('resourceCenter.locate')">
                      <BButton :aria-label="t('resourceCenter.locate')" @click="locateItem(item)">
                        <SvgIcon :src="icon.toolbox.locate" size="14" />
                      </BButton>
                    </BTooltip>
                    <span>{{ item.extra }}</span>
                  </span>
                </div>
              </section>
            </template>

            <div v-else class="global-search__empty">
              <span class="global-search__empty-icon"><SvgIcon :src="icon.navigation.search" size="26" /></span>
              <strong>
                {{
                  searchError
                    ? t('resourceCenter.searchError')
                    : keyword
                      ? t('resourceCenter.noMatch')
                      : t('resourceCenter.startSearch')
                }}
              </strong>
              <span>{{ t('resourceCenter.emptyDesc') }}</span>
            </div>
          </div>

          <footer class="global-search-dialog__footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('resourceCenter.keyboardSelect') }}</span>
            <span><kbd>Enter</kbd> {{ t('resourceCenter.keyboardOpen') }}</span>
            <BButton size="small" @click="goSearch">
              {{ t('resourceCenter.viewAll') }}<SvgIcon :src="icon.toolbox.arrow" size="14" />
            </BButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { fetchGlobalSearch, type SearchGroup, type SearchResultItem, type SearchType } from '@/api/search';
  import { recordOperation } from '@/api/commonApi';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta';
  import { rankByRelevance } from '@/components/searchCenter/searchUtils';
  import { GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES } from '@/config/navigation';
  import { getGlobalShortcutKeys, isEditableShortcutTarget, matchesGlobalShortcut } from '@/config/keyboardShortcuts';
  import icon from '@/config/icon';
  import { openBookmarkUrl } from '@/utils/openBookmark';

  const router = useRouter();
  const route = useRoute();
  const { t } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  const dialogRef = ref<HTMLElement | null>(null);
  const inputRef = ref<{ focus?: () => void } | null>(null);
  const keyword = ref('');
  const visible = ref(false);
  const loading = ref(false);
  const searchError = ref(false);
  const suggestGroups = ref<SearchGroup[]>([]);
  const activeIndex = ref(-1);
  let searchTimer = 0;
  let requestSeq = 0;
  let previousBodyOverflow = '';
  const searchShortcutLabel = getGlobalShortcutKeys('globalSearch').join('+');
  const routeName = computed(() => String(route.name || ''));
  const isSearchAvailable = computed(() => !GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES.includes(routeName.value));
  const placeholder = computed(() =>
    route.path.includes('/search') ? t('resourceCenter.continueSearch') : t('resourceCenter.searchPlaceholder'),
  );
  const flatItems = computed(() => suggestGroups.value.flatMap((group) => group.items));

  function escapeHtml(input: string) {
    return String(input ?? '').replace(
      /[&<>"']/g,
      (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string,
    );
  }
  function highlightText(text: string, query: string) {
    const safe = escapeHtml(text);
    const normalized = String(query || '').trim();
    if (!normalized) return safe;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${escaped})`, 'giu'), '<mark class="gs-hl">$1</mark>');
  }
  function isTagHit(name: string) {
    const query = String(keyword.value || '')
      .trim()
      .toLowerCase();
    return (
      Boolean(query) &&
      String(name || '')
        .toLowerCase()
        .includes(query)
    );
  }
  function getGroupLabel(type: string) {
    return getSearchTypeLabel(t, ['bookmark', 'note', 'file', 'tag'].includes(type) ? (type as SearchType) : 'all');
  }
  function isActiveItem(item: SearchResultItem) {
    return activeIndex.value >= 0 && flatItems.value[activeIndex.value] === item;
  }
  function activateItem(item: SearchResultItem) {
    const index = flatItems.value.indexOf(item);
    if (index >= 0) activeIndex.value = index;
  }

  async function ensureData(force = false) {
    const seq = ++requestSeq;
    loading.value = true;
    try {
      const result = await fetchGlobalSearch(keyword.value, 10, force);
      if (seq !== requestSeq) return;
      searchError.value = false;
      suggestGroups.value = result.groups.map((group) => ({
        ...group,
        items: rankByRelevance(group.items, keyword.value).slice(0, 3),
      }));
    } catch (error) {
      if (seq === requestSeq) {
        searchError.value = true;
        suggestGroups.value = [];
      }
      console.warn('全局搜索失败:', error);
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }
  function scheduleSearch() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void ensureData(), 220);
  }
  function handleInput() {
    scheduleSearch();
  }
  function syncNavigationLayer(opened: boolean) {
    document.querySelector('.navigation')?.classList.toggle('navigation--search-open', opened);
  }
  async function open() {
    if (visible.value) return;
    visible.value = true;
    activeIndex.value = -1;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    syncNavigationLayer(true);
    void ensureData(true);
    await nextTick();
    inputRef.value?.focus?.();
  }
  function triggerElement() {
    return rootRef.value?.querySelector<HTMLButtonElement>('.global-search__trigger') || null;
  }
  function close({ restoreFocus = true } = {}) {
    if (!visible.value) return;
    visible.value = false;
    activeIndex.value = -1;
    document.body.style.overflow = previousBodyOverflow;
    syncNavigationLayer(false);
    if (restoreFocus) nextTick(() => triggerElement()?.focus());
  }
  const handleCloseSearch = () => close();
  function moveActive(offset: number) {
    const length = flatItems.value.length;
    if (length) activeIndex.value = (activeIndex.value + offset + length) % length;
  }
  function onResultKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  function onEnter() {
    const item = flatItems.value[activeIndex.value];
    if (item) openItem(item);
    else goSearch();
  }
  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.value) return;
    const focusable = [
      ...dialogRef.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function goSearch() {
    const query = String(keyword.value || '').trim();
    recordOperation({ module: '全局搜索', operation: query ? `进入资源中心搜索【${query}】` : '进入资源中心' });
    close({ restoreFocus: false });
    void router.push({ path: '/search', query: query ? { q: query } : {} });
  }
  function openItem(item: SearchResultItem) {
    close({ restoreFocus: false });
    if (item.type === 'bookmark' && item.url) {
      openBookmarkUrl(item.url);
      return;
    }
    if (item.type === 'file') {
      void router.push({ path: '/cloudSpace', query: { fileName: item.title } });
      return;
    }
    if (item.route) void router.push(item.route);
  }
  function locateItem(item: SearchResultItem) {
    close({ restoreFocus: false });
    if (item.type !== 'bookmark') return;
    recordOperation({ module: '全局搜索', operation: `定位书签【${item.title}】` });
    void router.push({ path: '/home', query: { locate: item.id } });
  }
  function handleShortcut(event: KeyboardEvent) {
    if (
      !matchesGlobalShortcut(event, 'globalSearch') ||
      isEditableShortcutTarget(event.target) ||
      !isSearchAvailable.value
    )
      return;
    event.preventDefault();
    recordOperation({ module: '全局搜索', operation: '使用快捷键唤起搜索' });
    void open();
  }

  watch(suggestGroups, () => {
    activeIndex.value = -1;
  });
  watch(
    () => route.query.q,
    (value) => {
      if (route.path.includes('/search')) {
        keyword.value = Array.isArray(value) ? String(value[0] || '') : String(value || '');
      }
    },
    { immediate: true },
  );
  watch(
    () => route.fullPath,
    () => {
      if (visible.value) close({ restoreFocus: false });
    },
  );
  onMounted(() => {
    document.addEventListener('keydown', handleShortcut);
    window.addEventListener('light-note:close-search', handleCloseSearch);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleShortcut);
    window.removeEventListener('light-note:close-search', handleCloseSearch);
    window.clearTimeout(searchTimer);
    if (visible.value) document.body.style.overflow = previousBodyOverflow;
    syncNavigationLayer(false);
  });
</script>

<style scoped lang="less">
  .global-search {
    width: 38px;
    flex: 0 0 38px;
  }
  .global-search__trigger {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 10px;
    color: var(--text-color);
    background: transparent;
  }
  .global-search__trigger[aria-expanded='true'] {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
  }
</style>

<style lang="less">
  .global-search-layer {
    position: fixed;
    z-index: 1000;
    inset: 0;
    padding: 76px 20px 24px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    box-sizing: border-box;
    background: rgba(22, 23, 38, 0.18);
    backdrop-filter: blur(7px);
    animation: global-search-fade 0.14s ease-out;
  }
  .global-search-dialog {
    width: min(720px, calc(100vw - 40px));
    max-height: min(760px, calc(100vh - 100px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 22px;
    color: var(--text-color);
    background: var(--menu-body-bg-color, var(--card-background));
    box-shadow: 0 30px 90px rgba(18, 20, 45, 0.24);
    animation: global-search-rise 0.18s ease-out;
  }
  .global-search-dialog__header {
    padding: 18px 18px 14px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .global-search-dialog__heading {
    margin-bottom: 13px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }
  .global-search-dialog__heading > div {
    display: grid;
    gap: 3px;
  }
  .global-search-dialog__heading strong {
    font-size: 18px;
  }
  .global-search-dialog__heading span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .global-search-dialog__heading > .b_btn {
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .global-search-dialog__input {
    position: relative;
  }
  .global-search-dialog__input .b-input {
    padding-right: 72px !important;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--surface-border-color)) !important;
    border-radius: 14px !important;
    background: var(--surface-subtle-bg, var(--hover-background));
    font-size: 15px;
  }
  .global-search-dialog__input > kbd {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    padding: 3px 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    color: var(--desc-color);
    background: var(--card-background);
    font-family: inherit;
    font-size: 10px;
  }
  .global-search-dialog__body {
    min-height: 240px;
    padding: 6px 12px 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .global-search-group {
    margin-top: 10px;
  }
  .global-search-group h3 {
    margin: 0 8px 5px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .global-search-result {
    width: 100%;
    min-height: 58px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    border-radius: 12px;
    background: transparent;
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }
  .global-search-result__open.b_btn {
    width: 100%;
    height: auto;
    min-height: 58px;
    padding: 8px 7px 8px 9px;
    display: grid;
    grid-template-columns: 9px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border-radius: 12px;
    text-align: left;
    white-space: normal;
    background: transparent;
  }
  .global-search-result.is-active {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .global-search-result__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--desc-color);
  }
  .global-search-result__dot.is-bookmark {
    background: var(--resource-bookmark-color);
  }
  .global-search-result__dot.is-note {
    background: var(--resource-note-color);
  }
  .global-search-result__dot.is-file {
    background: var(--resource-file-color);
  }
  .global-search-result__dot.is-tag {
    background: var(--resource-tag-color);
  }
  .global-search-result__main {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .global-search-result__title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .global-search-result__title {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 680;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .global-search-result__tags {
    min-width: 0;
    display: flex;
    gap: 4px;
    overflow: hidden;
  }
  .global-search-result__description {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .global-search-result__extra {
    max-width: 170px;
    padding-right: 9px;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .global-search-result__extra > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .global-search-result__extra .b_btn {
    width: 28px;
    height: 28px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .global-search-dialog mark.gs-hl {
    padding: 0 1px;
    border-radius: 3px;
    color: inherit;
    background: color-mix(in srgb, var(--primary-color) 25%, transparent);
  }
  .global-search__loading {
    padding: 14px 3px;
  }
  .global-search__skeleton {
    height: 46px;
    margin-bottom: 8px;
    border-radius: 11px;
    background: linear-gradient(90deg, var(--hover-background), var(--background-color), var(--hover-background));
    background-size: 200% 100%;
    animation: global-search-shimmer 1.4s infinite;
  }
  .global-search__empty {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
    text-align: center;
  }
  .global-search__empty-icon {
    width: 54px;
    height: 54px;
    margin-bottom: 12px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    color: var(--primary-color);
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .global-search__empty strong {
    color: var(--text-color);
  }
  .global-search__empty > span:last-child {
    margin-top: 5px;
    font-size: 12px;
  }
  .global-search-dialog__footer {
    min-height: 49px;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 13px;
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 10px;
  }
  .global-search-dialog__footer span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .global-search-dialog__footer kbd {
    padding: 2px 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 5px;
    background: var(--card-background);
    font-family: inherit;
  }
  .global-search-dialog__footer > .b_btn {
    margin-left: auto;
    gap: 5px;
  }
  @media (hover: hover) and (pointer: fine) {
    .global-search-result:hover {
      transform: translateY(-1px);
      background: var(--hover-background);
    }
  }
  @media (max-width: 820px) {
    .global-search-layer {
      padding: 68px 12px 14px;
    }
    .global-search-dialog {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 82px);
      border-radius: 18px;
    }
    .global-search-result__extra > span:last-child {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .global-search-layer,
    .global-search-dialog,
    .global-search__skeleton {
      animation: none;
    }
  }
  @keyframes global-search-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes global-search-rise {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.99);
    }
  }
  @keyframes global-search-shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }
</style>
