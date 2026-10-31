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
        <SvgIcon :src="icon.navigation.search" size="26" />
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
                <span>{{ t('featureShortcut.subtitle') }}</span>
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
                <template #suffix
                  ><kbd>{{ searchShortcutLabel }}</kbd></template
                >
              </BInput>
            </div>
            <PublicSearchScopeControl class="global-search-scope" publication-entry @publish="openPublications" />
          </header>

          <p v-if="publicFailed" class="global-search-public-error" role="status">{{
            t('publicResources.publicFailed')
          }}</p>
          <div
            ref="bodyRef"
            class="global-search-dialog__body"
            :class="{ 'is-loading': loading }"
            :aria-busy="loading"
          >
            <section v-if="featureMatches.length" class="global-search-group global-search-features" data-gs-group>
              <h3>{{ t('featureShortcut.group') }}</h3>
              <GlobalSearchFeatureRow
                v-for="(match, index) in featureMatches"
                :key="match.feature.id"
                :feature="match.feature"
                :alias="match.alias"
                :keyword="trimmedKeyword"
                :nav-index="index"
                :active="activeIndex === index"
                @activate="activeIndex = index"
                @open="openFeature(match.feature)"
              />
            </section>
            <section v-else-if="showFeatured" class="global-search-featured" data-gs-group>
              <div class="global-search-featured__head">
                <h3>{{ t('featureShortcut.featured') }}</h3>
                <span class="global-search-featured__links">
                  <BButton type="text" @click="openUpdateLogs">{{ t('featureShortcut.updateLogs') }} ›</BButton>
                  <BButton v-if="isRoot" type="text" class="global-search-featured__manage" @click="openFeaturedManager">
                    {{ t('featureShortcut.manage') }}
                  </BButton>
                </span>
              </div>
              <GlobalSearchFeatureRow
                v-for="(entry, index) in featuredEntries"
                :key="entry.feature.id"
                variant="featured"
                :feature="entry.feature"
                :description="entry.item.description"
                :date="formatFeaturedDate(entry.item.publishDate)"
                :nav-index="index"
                :active="activeIndex === index"
                @activate="activeIndex = index"
                @open="openFeature(entry.feature)"
              />
              <p v-if="!featuredEntries.length" class="global-search-featured__empty">{{ t('featureShortcut.rootEmpty') }}</p>
            </section>
            <div v-if="loading" class="global-search__loading" aria-hidden="true">
              <section v-for="group in 3" :key="group" class="global-search-group">
                <h3 class="global-search__skeleton global-search__skeleton-heading"></h3>
                <div v-for="row in 3" :key="row" class="global-search__skeleton-row">
                  <span class="global-search__skeleton global-search__skeleton-dot"></span>
                  <div class="global-search__skeleton-copy">
                    <span
                      class="global-search__skeleton global-search__skeleton-title"
                      :class="{ 'is-short': row === 2 }"
                    ></span>
                    <span
                      class="global-search__skeleton global-search__skeleton-description"
                      :class="{ 'is-short': row === 3 }"
                    ></span>
                  </div>
                  <span class="global-search__skeleton global-search__skeleton-meta"></span>
                </div>
              </section>
            </div>

            <template v-else-if="suggestGroups.length">
              <section v-for="group in suggestGroups" :key="group.type" class="global-search-group" data-gs-group>
                <h3>{{ getGroupLabel(group.type) }}</h3>
                <div
                  v-for="item in group.items"
                  :key="`${item.origin || 'personal'}-${item.type}-${item.id}`"
                  class="global-search-result"
                  :class="{ 'is-active': isActiveItem(item) }"
                  :data-gs-nav="navIndexOf(item)"
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
                        <span v-if="item.origin === 'public'" class="global-search-public-badge"
                          >{{ t('publicResources.public') }} · {{ item.publicResource?.author.name }}</span
                        >
                        <span v-if="item.origin !== 'public' && item.tags?.length" class="global-search-result__tags">
                          <ResourceTagChip
                            v-for="tag in item.tags"
                            :key="tag.id"
                            :tag="tag"
                            :selected="isTagHit(tag.name)"
                            show-hash
                            max-width="var(--ui-layout-100, 100px)"
                          />
                        </span>
                      </span>
                      <span
                        class="global-search-result__description"
                        v-html="highlightText(getItemDescription(item), keyword)"
                      ></span>
                    </span>
                  </BButton>
                  <span class="global-search-result__extra">
                    <BTooltip
                      v-if="item.origin !== 'public' && (item.type === 'bookmark' || item.type === 'file')"
                      :title="t(item.type === 'file' ? 'resourceCenter.locateFile' : 'resourceCenter.locate')"
                    >
                      <BButton
                        icon-only
                        :aria-label="`${t(item.type === 'file' ? 'resourceCenter.locateFile' : 'resourceCenter.locate')}：${item.title}`"
                        @click.stop="locateItem(item)"
                      >
                        <SvgIcon :src="icon.toolbox.locate" size="14" />
                      </BButton>
                    </BTooltip>
                    <span>{{ getItemExtra(item) }}</span>
                  </span>
                </div>
              </section>
            </template>

            <div v-else-if="featureMatches.length && trimmedKeyword && !searchError" class="global-search__empty-inline">
              <strong>{{ t('featureShortcut.resourceNoMatch', { keyword: trimmedKeyword }) }}</strong>
              <span>{{ t('featureShortcut.resourceNoMatchDesc') }}</span>
            </div>
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
            <BButton class="global-search-dialog__view-all" @click="goSearch">
              {{ t('resourceCenter.viewAll') }}<SvgIcon :src="icon.toolbox.arrow" size="14" />
            </BButton>
          </footer>
        </section>
      </div>
    </Teleport>
    <FeaturedFeaturesManager v-if="managerOpen" v-model:visible="managerOpen" />
  </div>
</template>

<script setup lang="ts">
  import PublicSearchScopeControl from '@/components/publicResources/PublicSearchScopeControl.vue';
  import { usePublicResourceScope } from '@/store/publicResourceScope';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { type SearchResultItem } from '@/api/search';
  import { recordOperation } from '@/api/commonApi';
  import { getSearchTypeLabel } from '@/components/searchCenter/searchMeta';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY, getCloudFileCategory } from '@/constants/cloudFileCategory';
  import { useGlobalSearchSuggestions } from '@/composables/useGlobalSearchSuggestions';
  import { type GlobalSearchType } from '@/utils/globalSearchTypes';
  import { locateSearchResult, navigateToSearchResult, searchNavigationKey } from '@/utils/globalSearchNavigation';
  import { GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES } from '@/config/navigation';
  import { getGlobalShortcutKeys, isEditableShortcutTarget, matchesGlobalShortcut } from '@/config/keyboardShortcuts';
  import icon from '@/config/icon';
  import GlobalSearchFeatureRow from '@/components/search/GlobalSearchFeatureRow.vue';
  import FeaturedFeaturesManager from '@/components/search/FeaturedFeaturesManager.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { isGuestUser } from '@/utils/savePreference';
  import { scrollNearestIntoContainer } from '@/utils/scrolling';
  import type { FeatureShortcutDefinition } from '@/config/featureShortcuts';
  import { matchFeatureShortcuts, resolveFeaturedFeatures, type FeatureShortcutContext } from '@/utils/featureShortcuts';
  import { runFeatureShortcut, useFeaturedFeatures } from '@/composables/useFeatureShortcuts';

  /** 未输入时各类最近资料只保留 2 条，给「最近上线」腾出位置。 */
  const EMPTY_GROUP_LIMIT = 2;
  const GROUP_ORDER = ['bookmark', 'note', 'file', 'todo', 'tag'] as const;

  const publicScope = usePublicResourceScope();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const featured = useFeaturedFeatures();
  const router = useRouter();
  const route = useRoute();
  const { t } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  const dialogRef = ref<HTMLElement | null>(null);
  const inputRef = ref<{ focus?: () => void } | null>(null);
  const keyword = ref('');
  const visible = ref(false);
  const {
    items,
    loading,
    failed: searchError,
    publicFailed,
    schedule,
    run,
    reset,
  } = useGlobalSearchSuggestions(undefined, undefined, {
    includeRecent: true,
    suggestLayout: 'grouped',
    allowPublicScope: true,
  });
  const trimmedKeyword = computed(() => keyword.value.trim());
  /**
   * 有关键词时，组的先后按每组最匹配的那一条排（服务端已按相关度排序），组内条数与顺序不变；
   * 未输入时保持固定顺序，位置稳定、好记。
   */
  const suggestGroups = computed(() => {
    const searching = Boolean(trimmedKeyword.value);
    const order = searching
      ? [...new Set([...items.value.map((item) => item.type), ...GROUP_ORDER])]
      : [...GROUP_ORDER];
    return order
      .filter((type): type is (typeof GROUP_ORDER)[number] => (GROUP_ORDER as readonly string[]).includes(type))
      .map((type) => {
        const groupItems = items.value.filter((item) => item.type === type);
        return { type, items: searching ? groupItems : groupItems.slice(0, EMPTY_GROUP_LIMIT) };
      })
      .filter((group) => group.items.length);
  });
  const isRoot = computed(() => user.role === 'root');
  const featureContext = computed<FeatureShortcutContext>(() => ({
    platform: bookmark.isDesktop ? 'desktop' : 'mobile',
    isGuest: isGuestUser(),
  }));
  const featureMatches = computed(() =>
    matchFeatureShortcuts(trimmedKeyword.value, featureContext.value, (feature) =>
      t(`featureShortcut.items.${feature.key}.title`),
    ),
  );
  const featuredEntries = computed(() =>
    trimmedKeyword.value ? [] : resolveFeaturedFeatures(featured.state.items, featureContext.value),
  );
  // Root 在没有展示项时也要看到区块标题，才能进入「管理」。
  const showFeatured = computed(() => !trimmedKeyword.value && (featuredEntries.value.length > 0 || isRoot.value));
  const featureNavItems = computed<FeatureShortcutDefinition[]>(() =>
    trimmedKeyword.value
      ? featureMatches.value.map((match) => match.feature)
      : featuredEntries.value.map((entry) => entry.feature),
  );
  const activeIndex = ref(-1);
  let previousBodyOverflow = '';
  const searchShortcutLabel = getGlobalShortcutKeys('globalSearch').join('+');
  const routeName = computed(() => String(route.name || ''));
  const isSearchAvailable = computed(() => !GLOBAL_SEARCH_HIDDEN_ROUTE_NAMES.includes(routeName.value));
  const placeholder = computed(() =>
    route.path.includes('/search') ? t('resourceCenter.continueSearch') : t('featureShortcut.placeholder'),
  );
  const flatItems = computed(() => suggestGroups.value.flatMap((group) => group.items));
  /** 键盘导航顺序：功能（或最近上线）在前，资料在后。 */
  const navCount = computed(() => featureNavItems.value.length + flatItems.value.length);
  function navIndexOf(item: SearchResultItem) {
    const index = flatItems.value.indexOf(item);
    return index < 0 ? -1 : featureNavItems.value.length + index;
  }
  function formatFeaturedDate(date: string) {
    return date.slice(5);
  }

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
  function getGroupLabel(type: GlobalSearchType) {
    return getSearchTypeLabel(t, type);
  }
  function getItemDescription(item: SearchResultItem) {
    if (item.type !== 'file') return item.description || item.extra || '';
    const category = getCloudFileCategory({
      fileName: item.title,
      fileType: item.raw?.fileType ?? item.raw?.file_type,
      category: item.category,
    });
    const typeLabel = t(CLOUD_FILE_CATEGORY_LABEL_KEY[category]);
    const folderName = item.raw?.folderName ?? item.raw?.folder_name;
    return folderName && item.description ? `${typeLabel} · ${item.description}` : typeLabel;
  }
  function getItemExtra(item: SearchResultItem) {
    if (item.type !== 'file') return item.extra;
    const size = Number(item.raw?.fileSize ?? item.raw?.file_size);
    return Number.isFinite(size) && size > 0 ? `${(size / 1024 / 1024).toFixed(2)} MB` : '';
  }
  function isActiveItem(item: SearchResultItem) {
    return activeIndex.value >= 0 && navIndexOf(item) === activeIndex.value;
  }
  function activateItem(item: SearchResultItem) {
    const index = navIndexOf(item);
    if (index >= 0) activeIndex.value = index;
  }

  function handleInput() {
    activeIndex.value = -1;
    schedule(keyword.value);
  }
  function syncNavigationLayer(opened: boolean) {
    document.querySelector('.navigation')?.classList.toggle('navigation--search-open', opened);
  }
  async function open() {
    if (visible.value) return;
    visible.value = true;
    void publicScope.ensure(true);
    void featured.ensure();
    activeIndex.value = -1;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    syncNavigationLayer(true);
    void run(keyword.value);
    await nextTick();
    inputRef.value?.focus?.();
  }
  function triggerElement() {
    return rootRef.value?.querySelector<HTMLButtonElement>('.global-search__trigger') || null;
  }
  function close({ restoreFocus = true } = {}) {
    if (!visible.value) return;
    visible.value = false;
    reset();
    activeIndex.value = -1;
    document.body.style.overflow = previousBodyOverflow;
    syncNavigationLayer(false);
    if (restoreFocus) nextTick(() => triggerElement()?.focus());
  }
  const handleCloseSearch = () => close();
  const bodyRef = ref<HTMLElement | null>(null);
  /** 只在键盘移动时滚动：选中项刚好完整露出；移到组内第一项时把组标题一起露出。 */
  function revealActive() {
    const container = bodyRef.value;
    if (!container || activeIndex.value < 0) return;
    if (activeIndex.value === 0) {
      container.scrollTo({ top: 0 });
      return;
    }
    const row = container.querySelector<HTMLElement>(`[data-gs-nav="${activeIndex.value}"]`);
    if (!row) return;
    scrollNearestIntoContainer(container, row);
    const group = row.closest<HTMLElement>('[data-gs-group]');
    const heading = group?.querySelector<HTMLElement>('h3');
    if (heading && group?.querySelector('[data-gs-nav]') === row) scrollNearestIntoContainer(container, heading);
  }
  function moveActive(offset: number) {
    const length = navCount.value;
    if (!length) return;
    activeIndex.value = (activeIndex.value + offset + length) % length;
    void nextTick(revealActive);
  }
  function onResultKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Escape') {
      handleDialogKeydown(event);
    }
  }
  function onEnter() {
    const featureCount = featureNavItems.value.length;
    if (activeIndex.value >= 0 && activeIndex.value < featureCount) {
      openFeature(featureNavItems.value[activeIndex.value]);
      return;
    }
    const item = flatItems.value[activeIndex.value - featureCount];
    if (item) openItem(item);
    else goSearch();
  }
  function openFeature(feature: FeatureShortcutDefinition) {
    close({ restoreFocus: false });
    void runFeatureShortcut(feature, router, '【桌面快捷搜索】');
  }
  function openUpdateLogs() {
    close({ restoreFocus: false });
    void router.push('/updateLogs');
  }
  // 管理弹框层级低于搜索浮层，先收起搜索再打开。
  const managerOpen = ref(false);
  function openFeaturedManager() {
    close({ restoreFocus: false });
    managerOpen.value = true;
  }
  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (event.repeat) return;
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
  function openPublications() {
    recordOperation({ module: '公开管理', operation: '进入公开管理【桌面快捷搜索】' });
    close({ restoreFocus: false });
    void router.push('/search/publications');
  }
  function goSearch() {
    const query = String(keyword.value || '').trim();
    recordOperation({ module: '全局搜索', operation: '进入资源中心' });
    close({ restoreFocus: false });
    void router.push({
      path: '/search',
      query: { ...(query ? { q: query } : {}), public: publicScope.included ? '1' : '0' },
    });
  }
  function openItem(item: SearchResultItem) {
    const from = route.fullPath;
    close({ restoreFocus: false });
    if (item.origin === 'public') navigateToSearchResult(router, item, { publicReturnPath: from });
    else navigateToSearchResult(router, item);
  }
  function locateItem(item: SearchResultItem) {
    close({ restoreFocus: false });
    recordOperation({
      module: '全局搜索',
      operation: item.type === 'file' ? '定位文件搜索结果' : `定位书签【${item.title}】`,
    });
    locateSearchResult(router, item);
  }
  function handleShortcut(event: KeyboardEvent) {
    if (!matchesGlobalShortcut(event, 'globalSearch') || !isSearchAvailable.value) return;
    // Search inputs keep the explicit search command after route autofocus; ordinary typing and editors retain theirs.
    const inSearchInput =
      (event.ctrlKey || event.metaKey) &&
      event.target instanceof Element &&
      !!event.target.closest('#search-center-input, #global-search-input');
    if (isEditableShortcutTarget(event.target) && !inSearchInput) return;
    event.preventDefault();
    recordOperation({ module: '全局搜索', operation: '使用快捷键唤起搜索' });
    void open();
  }

  watch(
    () => publicScope.included,
    () => {
      reset();
      if (visible.value) void run(keyword.value);
    },
  );
  watch(
    () => publicScope.identity,
    () => {
      keyword.value = '';
      close();
    },
  );
  watch([suggestGroups, featureNavItems], () => {
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
    () => searchNavigationKey(route),
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
    if (visible.value) document.body.style.overflow = previousBodyOverflow;
    syncNavigationLayer(false);
  });
</script>

<style scoped lang="less">
  .global-search-scope {
    margin-top: var(--ui-space-12, 12px);
  }
  .global-search-public-error {
    margin: 0;
    padding: var(--ui-space-8, 8px) var(--ui-space-20, 20px);
    color: var(--warning-color);
    font-size: var(--ui-font-12, 12px);
  }
  .global-search-public-badge {
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-11, 11px);
    white-space: nowrap;
  }
  .global-search {
    width: var(--ui-layout-38, 38px);
    flex: 0 0 var(--ui-layout-38, 38px);
  }
  .global-search__trigger {
    width: var(--ui-control-36, 36px);
    height: var(--ui-control-36, 36px);
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
    padding: var(--ui-space-76, 76px) var(--ui-space-20, 20px) var(--ui-space-24, 24px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    box-sizing: border-box;
    background: rgba(22, 23, 38, 0.18);
    backdrop-filter: blur(7px);
    animation: global-search-fade 0.14s ease-out;
  }
  .global-search-dialog {
    font-size: var(--ui-font-16, 16px);
    width: min(var(--ui-layout-720, 720px), calc(100vw - var(--ui-space-40, 40px)));
    // 各搜索状态共用固定外框；小窗口按可用高度收缩，结果区独立滚动。
    height: min(var(--ui-layout-600, 600px), calc(100vh - var(--ui-space-100, 100px)));
    box-sizing: border-box;
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
    flex-shrink: 0;
    padding: var(--ui-space-18, 18px) var(--ui-space-18, 18px) var(--ui-space-14, 14px);
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .global-search-dialog__heading {
    margin-bottom: var(--ui-space-13, 13px);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ui-space-14, 14px);
  }
  .global-search-dialog__heading > div {
    display: grid;
    gap: var(--ui-space-3, 3px);
  }
  .global-search-dialog__heading strong {
    font-size: var(--ui-font-18, 18px);
  }
  .global-search-dialog__heading span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .global-search-dialog__heading > .b_btn {
    width: var(--ui-control-32, 32px);
    height: var(--ui-control-32, 32px);
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .global-search-dialog__input {
    position: relative;
  }
  .global-search-dialog__input .b-input {
    padding-right: var(--ui-space-72, 72px) !important;
    border-radius: 14px;
    font-size: var(--ui-font-15, 15px);
  }
  .global-search-dialog__input .prefix-icon {
    color: var(--workspace-purple-text);
  }
  .global-search-dialog__input kbd {
    padding: var(--ui-space-2, 2px) var(--ui-space-5, 5px);
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    color: var(--desc-color);
    background: transparent;
    font-family: inherit;
    font-size: var(--ui-font-10, 10px);
  }
  .global-search-dialog__body {
    flex: 1 1 0;
    min-height: 0;
    padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px) var(--ui-space-12, 12px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .global-search-group {
    margin-top: var(--ui-space-10, 10px);
  }
  .global-search-group h3 {
    margin: 0 var(--ui-space-8, 8px) var(--ui-space-5, 5px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .global-search-result {
    width: 100%;
    min-height: var(--ui-layout-58, 58px);
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
    min-height: var(--ui-layout-58, 58px);
    padding: var(--ui-space-8, 8px) var(--ui-space-7, 7px) var(--ui-space-8, 8px) var(--ui-space-9, 9px);
    display: grid;
    grid-template-columns: 9px minmax(0, 1fr);
    align-items: center;
    gap: var(--ui-space-10, 10px);
    border-radius: 12px;
    text-align: left;
    white-space: normal;
    /* 结果行统一承载 hover / 键盘选中背景，避免 BButton 自身的状态色只覆盖左栏。 */
    background: transparent !important;
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
  .global-search-result__dot.is-todo {
    background: var(--todo-accent-color);
  }
  .global-search-result__dot.is-tag {
    background: var(--resource-tag-color);
  }
  .global-search-result__main {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-3, 3px);
  }
  .global-search-result__title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .global-search-result__title {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 680;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .global-search-result__tags {
    min-width: 0;
    display: flex;
    gap: var(--ui-space-4, 4px);
    overflow: hidden;
  }
  .global-search-result__description {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .global-search-result__extra {
    max-width: var(--ui-layout-170, 170px);
    padding-right: var(--ui-space-9, 9px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .global-search-result__extra > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .global-search-result__extra .b_btn {
    width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    padding: 0;
    color: var(--desc-color);
    background: transparent !important;
  }
  .global-search-dialog mark.gs-hl {
    padding: 0 var(--ui-space-1, 1px);
    border-radius: 3px;
    color: inherit;
    background: color-mix(in srgb, var(--primary-color) 25%, transparent);
  }
  .global-search-dialog__body.is-loading {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .global-search-dialog__body.is-loading > .global-search-features {
    flex-shrink: 0;
  }
  .global-search-featured {
    margin-top: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) var(--ui-space-4, 4px) var(--ui-space-4, 4px);
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 5%, transparent);
  }
  .global-search-featured__head {
    margin: 0 var(--ui-space-8, 8px) var(--ui-space-4, 4px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }
  .global-search-featured__head h3 {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .global-search-featured__links {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
  }
  .global-search-featured__links .b_btn {
    height: var(--ui-control-24, 24px);
    padding: 0 var(--ui-space-6, 6px);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-11, 11px);
  }
  .global-search-featured__links .global-search-featured__manage {
    border: 1px dashed color-mix(in srgb, var(--primary-color) 50%, transparent);
    border-radius: 999px;
  }
  .global-search-featured__empty {
    margin: 0;
    padding: var(--ui-space-8, 8px) var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .global-search-featured + .global-search__empty {
    min-height: auto;
    padding: var(--ui-space-32, 32px) 0;
  }
  .global-search__empty-inline {
    margin: var(--ui-space-14, 14px) var(--ui-space-8, 8px) 0;
    padding: var(--ui-space-14, 14px);
    display: grid;
    gap: var(--ui-space-4, 4px);
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .global-search__empty-inline strong {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 650;
  }
  .global-search__loading {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }
  .global-search__skeleton {
    display: block;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--hover-background), var(--background-color), var(--hover-background));
    background-size: 200% 100%;
    animation: global-search-shimmer 1.4s infinite;
  }
  .global-search-group h3.global-search__skeleton-heading {
    width: var(--ui-layout-48, 48px);
    height: 12px;
    margin: 0 var(--ui-space-8, 8px) var(--ui-space-5, 5px);
  }
  .global-search__skeleton-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    height: var(--ui-layout-58, 58px);
    padding: var(--ui-space-8, 8px) var(--ui-space-9, 9px);
    box-sizing: border-box;
  }
  .global-search__skeleton-dot {
    flex: 0 0 8px;
    height: 8px;
    border-radius: 50%;
  }
  .global-search__skeleton-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--ui-space-9, 9px);
  }
  .global-search__skeleton-title {
    width: 62%;
    height: 13px;
  }
  .global-search__skeleton-title.is-short {
    width: 43%;
  }
  .global-search__skeleton-description {
    width: 94%;
    height: 10px;
  }
  .global-search__skeleton-description.is-short {
    width: 72%;
  }
  .global-search__skeleton-meta {
    flex: 0 0 var(--ui-layout-68, 68px);
    height: 10px;
  }
  .global-search__empty {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
    text-align: center;
  }
  .global-search__empty-icon {
    width: var(--ui-layout-54, 54px);
    height: var(--ui-layout-54, 54px);
    margin-bottom: var(--ui-space-12, 12px);
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
    margin-top: var(--ui-space-5, 5px);
    font-size: var(--ui-font-12, 12px);
  }
  .global-search-dialog__footer {
    flex-shrink: 0;
    min-height: var(--ui-layout-49, 49px);
    padding: var(--ui-space-8, 8px) var(--ui-space-14, 14px);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-13, 13px);
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
  }
  .global-search-dialog__footer span {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    white-space: nowrap;
  }
  .global-search-dialog__footer kbd {
    padding: var(--ui-space-2, 2px) var(--ui-space-5, 5px);
    border: 1px solid var(--surface-border-color);
    border-radius: 5px;
    background: var(--card-background);
    font-family: inherit;
  }
  .global-search-dialog__footer > .global-search-dialog__view-all {
    margin-left: auto;
    flex-shrink: 0;
    gap: var(--ui-space-8, 8px);
    padding: 0 var(--ui-space-12, 12px);
    border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--surface-border-color));
    border-radius: 9px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease;
  }
  .global-search-dialog__footer > .global-search-dialog__view-all:focus-visible {
    outline-color: var(--focus-ring-color);
  }
  .global-search-dialog__footer > .global-search-dialog__view-all:active {
    border-color: var(--workspace-purple-text);
  }
  @media (hover: hover) and (pointer: fine) {
    .global-search-dialog__footer > .global-search-dialog__view-all:hover {
      border-color: var(--workspace-purple-text);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--workspace-purple-selected));
    }
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
      height: min(600px, calc(100vh - 82px));
      border-radius: 18px;
    }
    .global-search-result__extra > span:last-child {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .global-search-dialog__footer > .global-search-dialog__view-all {
      transition: none;
    }
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
