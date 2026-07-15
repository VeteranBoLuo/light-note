<template>
  <b-loading :loading="loading">
    <div
      class="tag-manage-page"
      :class="{
        'tag-manage-page--night': user.currentTheme === 'night',
        'tag-manage-page--compact': isCompactHeader,
      }"
    >
      <section class="manage-header">
        <div class="manage-header__top">
          <div class="manage-copy">
            <div class="eyebrow">{{ t('tagManage.workspaceEyebrow') }}</div>
            <h1>{{ t('tagManage.title') }}</h1>
            <p>{{ t('tagManage.subtitle') }}</p>
          </div>

          <div class="overview-strip" :aria-label="t('tagManage.overview')">
            <div v-for="stat in stats" :key="stat.key" class="overview-item" :class="`overview-item--${stat.key}`">
              <span class="overview-dot"></span>
              <strong>{{ stat.value }}</strong>
              <span>{{ stat.label }}</span>
            </div>
          </div>

          <div class="header-actions">
            <b-button
              v-click-log="OPERATION_LOG_MAP.tagMg.addTag"
              type="primary"
              @click="$router.push({ path: '/manage/editTag/add' })"
            >
              {{ t('tagManage.createTag') }}
            </b-button>
            <b-button @click="handleToBack" v-click-log="{ module: '标签管理', operation: '返回' }">
              {{ t('common.back') }}
            </b-button>
          </div>
        </div>
      </section>

      <section class="workspace-panel">
        <div class="primary-toolbar">
          <b-input v-model:value="keyword" class="tag-search" :placeholder="t('tagManage.searchPlaceholder')">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="18" />
            </template>
          </b-input>

          <div class="toolbar-actions">
            <BSelect v-model:value="sortMode" class="sort-select" :options="sortOptions" />
            <div class="view-switch" :aria-label="t('tagManage.viewMode')">
              <b-button
                size="small"
                class="view-button"
                :class="{ active: viewMode === 'card' }"
                :aria-pressed="viewMode === 'card'"
                @click="setTagView('card')"
              >
                {{ t('resourceCenter.view.card') }}
              </b-button>
              <b-button
                size="small"
                class="view-button"
                :class="{ active: viewMode === 'list' }"
                :aria-pressed="viewMode === 'list'"
                @click="setTagView('list')"
              >
                {{ t('resourceCenter.view.list') }}
              </b-button>
            </div>
          </div>
        </div>

        <div class="filter-toolbar" :aria-label="t('tagManage.filtersTitle')">
          <b-button
            v-for="filter in filters"
            :key="filter.value"
            size="small"
            class="filter-chip"
            :class="[`filter-chip--${filter.value}`, { active: activeFilter === filter.value }]"
            :aria-pressed="activeFilter === filter.value"
            @click="activeFilter = filter.value"
            v-click-log="{ module: '标签管理', operation: `筛选标签【${filter.label}】` }"
          >
            <span class="filter-dot"></span>
            <span>{{ filter.label }}</span>
            <span class="filter-count">{{ filter.count }}</span>
          </b-button>
        </div>

        <div class="result-toolbar">
          <div>
            <div class="result-title">{{ t('tagManage.resultTitle') }}</div>
            <div class="result-subtitle">{{ resultSubtitle }}</div>
          </div>
          <span v-if="activeFilter !== 'all' || keyword" class="active-query-hint">
            {{ t('tagManage.filteredResult') }}
          </span>
        </div>

        <div
          class="results-viewport"
          :class="{
            'results-viewport--above': hasScrollAbove,
            'results-viewport--below': hasScrollBelow,
          }"
        >
          <div ref="resultScrollerRef" class="result-scroller" @scroll.passive="handleResultScroll">
            <div v-if="visibleTags.length && viewMode === 'card'" class="tag-grid">
              <article
                v-for="tag in visibleTags"
                :key="tag.id"
                class="tag-card"
                role="button"
                tabindex="0"
                @click="openTagDetail(tag.id)"
                @keydown.enter="openTagDetail(tag.id)"
                v-click-log="{ module: '标签管理', operation: `查看标签详情【${tag.name}】` }"
              >
                <div class="tag-card__head">
                  <div class="tag-identity">
                    <div class="tag-icon-wrap">
                      <svg-icon v-if="tag.iconUrl" :src="tag.iconUrl" size="24" />
                      <span v-else>#</span>
                    </div>
                    <div class="tag-meta">
                      <div class="tag-name">{{ tag.name }}</div>
                      <div class="tag-summary">
                        {{ t('tagManage.resourceTotal', { count: getTotalResourceCount(tag) }) }}
                      </div>
                    </div>
                  </div>

                  <div class="tag-actions">
                    <BActionButton
                      action="edit"
                      :label="t('common.edit')"
                      :tooltip="t('common.edit')"
                      @click="edit(tag.id)"
                      v-click-log="{ module: '标签管理', operation: `编辑标签【${tag.name}】` }"
                    />
                    <BActionButton
                      action="delete"
                      :label="t('common.delete')"
                      :tooltip="t('common.delete')"
                      @click="handleDeleteTag(tag)"
                    />
                  </div>
                </div>

                <div class="resource-metrics">
                  <div class="resource-metric resource-metric--bookmark">
                    <span>{{ t('tagManage.bookmark') }}</span>
                    <strong>{{ tag.bookmarkList?.length || 0 }}</strong>
                  </div>
                  <div class="resource-metric resource-metric--note">
                    <span>{{ t('tagManage.note') }}</span>
                    <strong>{{ tag.noteList?.length || 0 }}</strong>
                  </div>
                  <div class="resource-metric resource-metric--file">
                    <span>{{ t('tagManage.file') }}</span>
                    <strong>{{ tag.fileList?.length || 0 }}</strong>
                  </div>
                </div>

                <div class="tag-card__content">
                  <div v-if="tag.relatedTagList?.length" class="compact-row">
                    <span class="compact-label">{{ t('tagManage.relatedTag') }}</span>
                    <div class="compact-values">
                      <span v-for="related in tag.relatedTagList.slice(0, 2)" :key="related.id" class="related-chip">
                        {{ related.name }}
                      </span>
                      <span v-if="tag.relatedTagList.length > 2" class="more-count"
                        >+{{ tag.relatedTagList.length - 2 }}</span
                      >
                    </div>
                  </div>

                  <div v-if="getPreviewResources(tag).length" class="compact-row compact-row--resources">
                    <span class="compact-label">{{ t('tagManage.previewContent') }}</span>
                    <div class="preview-list">
                      <b-button
                        v-for="item in getPreviewResources(tag)"
                        :key="`${item.type}-${item.id}`"
                        size="small"
                        class="preview-chip"
                        :class="`preview-chip--${item.type}`"
                        :title="item.name"
                        @click.stop="openResource(item)"
                      >
                        <span class="preview-dot"></span>
                        <span class="preview-name">{{ item.name }}</span>
                      </b-button>
                      <span v-if="getRemainingResourceCount(tag)" class="more-count">
                        +{{ getRemainingResourceCount(tag) }}
                      </span>
                    </div>
                  </div>

                  <div v-if="!getTotalResourceCount(tag) && !tag.relatedTagList?.length" class="unlinked-hint">
                    {{ t('tagManage.unlinkedHint') }}
                  </div>
                </div>

                <div class="tag-card__footer">
                  <span>{{ t('tagManage.openDetail') }}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </article>
            </div>

            <div v-else-if="visibleTags.length" class="tag-list">
              <div class="tag-list__header" aria-hidden="true">
                <span>{{ t('tagManage.tagColumn') }}</span>
                <span>{{ t('tagManage.resourceDistribution') }}</span>
                <span>{{ t('tagManage.relatedTag') }}</span>
                <span>{{ t('tagManage.actions') }}</span>
              </div>
              <article
                v-for="tag in visibleTags"
                :key="tag.id"
                class="tag-row"
                role="button"
                tabindex="0"
                @click="openTagDetail(tag.id)"
                @keydown.enter="openTagDetail(tag.id)"
                v-click-log="{ module: '标签管理', operation: `查看标签详情【${tag.name}】` }"
              >
                <div class="tag-row__identity">
                  <div class="tag-row-icon">
                    <svg-icon v-if="tag.iconUrl" :src="tag.iconUrl" size="18" />
                    <span v-else>#</span>
                  </div>
                  <div class="tag-row-copy">
                    <strong>{{ tag.name }}</strong>
                    <span>{{ t('tagManage.resourceTotal', { count: getTotalResourceCount(tag) }) }}</span>
                  </div>
                </div>
                <div class="row-metrics">
                  <span class="row-metric row-metric--bookmark"
                    >{{ t('tagManage.bookmarkShort') }} {{ tag.bookmarkList?.length || 0 }}</span
                  >
                  <span class="row-metric row-metric--note"
                    >{{ t('tagManage.noteShort') }} {{ tag.noteList?.length || 0 }}</span
                  >
                  <span class="row-metric row-metric--file"
                    >{{ t('tagManage.fileShort') }} {{ tag.fileList?.length || 0 }}</span
                  >
                </div>
                <div class="row-related">
                  <span v-for="related in tag.relatedTagList?.slice(0, 2)" :key="related.id" class="related-chip">
                    {{ related.name }}
                  </span>
                  <span v-if="!tag.relatedTagList?.length" class="row-empty">{{ t('tagManage.none') }}</span>
                  <span v-else-if="tag.relatedTagList.length > 2" class="more-count"
                    >+{{ tag.relatedTagList.length - 2 }}</span
                  >
                </div>
                <div class="tag-row-actions">
                  <BActionButton
                    action="edit"
                    :label="t('common.edit')"
                    :tooltip="t('common.edit')"
                    @click="edit(tag.id)"
                  />
                  <BActionButton
                    action="delete"
                    :label="t('common.delete')"
                    :tooltip="t('common.delete')"
                    @click="handleDeleteTag(tag)"
                  />
                </div>
              </article>
            </div>

            <div v-else class="empty-state">
              <div class="empty-symbol">#</div>
              <h3>{{ t('tagManage.emptyTitle') }}</h3>
              <p>{{ t('tagManage.emptyDesc') }}</p>
              <b-button v-if="!keyword" type="primary" @click="$router.push('/manage/editTag/add')">
                {{ t('tagManage.createTag') }}
              </b-button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <FilePreview v-model:visible="filePreviewVisible" :fileInfo="previewFileInfo" @close="filePreviewVisible = false" />
  </b-loading>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import icon from '@/config/icon.ts';
  import router from '@/router';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { updatePreference } from '@/utils/savePreference';
  import { openPage } from '@/utils/common.ts';
  import {
    getTotalResourceCount,
    type RelatedItem,
    type TagFilterValue,
    type TagRecord,
    useTagManage,
  } from './useTagManage';

  interface PreviewResource extends RelatedItem {
    type: 'bookmark' | 'note' | 'file';
  }

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});
  const viewMode = ref<'card' | 'list'>((user.preferences.tagManageView as 'card' | 'list') || 'card');
  const resultScrollerRef = ref<HTMLElement>();
  const isCompactHeader = ref(false);
  const hasScrollAbove = ref(false);
  const hasScrollBelow = ref(false);
  let resultResizeObserver: ResizeObserver | undefined;
  const { loading, keyword, activeFilter, sortMode, filterCounts, visibleTags, overview, reload } = useTagManage();

  const stats = computed(() => [
    { key: 'tag', label: t('tagManage.statTotal'), value: overview.value.tag },
    { key: 'bookmark', label: t('tagManage.taggedBookmark'), value: overview.value.bookmark },
    { key: 'note', label: t('tagManage.taggedNote'), value: overview.value.note },
    { key: 'file', label: t('tagManage.taggedFile'), value: overview.value.file },
  ]);

  const filters = computed(() => [
    { value: 'all' as TagFilterValue, label: t('tagManage.filterAll'), count: filterCounts.value.all },
    { value: 'active' as TagFilterValue, label: t('tagManage.filterActive'), count: filterCounts.value.active },
    { value: 'bookmark' as TagFilterValue, label: t('tagManage.bookmark'), count: filterCounts.value.bookmark },
    { value: 'note' as TagFilterValue, label: t('tagManage.note'), count: filterCounts.value.note },
    { value: 'file' as TagFilterValue, label: t('tagManage.file'), count: filterCounts.value.file },
    { value: 'empty' as TagFilterValue, label: t('tagManage.filterEmpty'), count: filterCounts.value.empty },
  ]);

  const sortOptions = computed<BaseOptions[]>(() => [
    { label: t('tagManage.sortDefault'), value: 'default' },
    { label: t('tagManage.sortResourceDesc'), value: 'resourceDesc' },
    { label: t('tagManage.sortNameAsc'), value: 'nameAsc' },
    { label: t('tagManage.sortEmptyFirst'), value: 'emptyFirst' },
  ]);

  const resultSubtitle = computed(() => {
    const searchKeyword = keyword.value.trim();
    return searchKeyword
      ? t('tagManage.resultSubtitleKeyword', { keyword: searchKeyword, count: visibleTags.value.length })
      : t('tagManage.resultSubtitle', { count: visibleTags.value.length });
  });

  function setTagView(mode: 'card' | 'list') {
    if (viewMode.value === mode) return;
    viewMode.value = mode;
    updatePreference({ tagManageView: mode }).catch(() => {});
  }

  function updateScrollState() {
    const scroller = resultScrollerRef.value;
    if (!scroller) return;
    const remainingScroll = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    hasScrollAbove.value = scroller.scrollTop > 4;
    hasScrollBelow.value = remainingScroll > 4;
    isCompactHeader.value = scroller.scrollTop > 28;
  }

  function handleResultScroll() {
    updateScrollState();
  }

  function resetResultScroll() {
    const scroller = resultScrollerRef.value;
    if (scroller) scroller.scrollTop = 0;
    isCompactHeader.value = false;
    hasScrollAbove.value = false;
    nextTick(updateScrollState);
  }

  async function loadTags() {
    await reload();
    await nextTick();
    updateScrollState();
  }

  function getPreviewResources(tag: TagRecord): PreviewResource[] {
    return [
      ...(tag.bookmarkList || []).map((item) => ({ ...item, type: 'bookmark' as const })),
      ...(tag.noteList || []).map((item) => ({ ...item, type: 'note' as const })),
      ...(tag.fileList || []).map((item) => ({ ...item, type: 'file' as const })),
    ].slice(0, 3);
  }

  function getRemainingResourceCount(tag: TagRecord) {
    return Math.max(0, getTotalResourceCount(tag) - getPreviewResources(tag).length);
  }

  function edit(id: string) {
    router.push({ path: `/manage/editTag/${id}` });
  }

  function openTagDetail(id: string) {
    router.push({ path: `/tag/${id}` });
  }

  function openNote(id: string) {
    if (id) router.push(`/noteLibrary/${id}`);
  }

  async function previewFile(id: string) {
    if (!id) return;
    const res = await apiBasePost('/api/file/getFileInfo', { id });
    if (res.status !== 200 || !res.data) return;
    previewFileInfo.value = {
      ...res.data,
      fileName: res.data.file_name || res.data.fileName,
      fileType: res.data.file_type || res.data.fileType,
      fileUrl: res.data.fileUrl,
      category: res.data.category,
    };
    filePreviewVisible.value = true;
  }

  function openResource(item: PreviewResource) {
    if (item.type === 'bookmark' && item.url) openPage(item.url);
    else if (item.type === 'note') openNote(item.id);
    else if (item.type === 'file') previewFile(item.id);
  }

  function handleDeleteTag(tag: TagRecord) {
    if (blockGuestWrite('delete-tag')) return;
    Alert.alert({
      title: t('tagManage.confirmDeleteTitle'),
      content: t('tagManage.confirmDeleteContent', { name: tag.name }),
      onOk() {
        apiBasePost('/api/bookmark/delTag', { id: tag.id }).then((res) => {
          if (res.status !== 200) return;
          recordOperation({ module: '标签管理', operation: `删除标签成功【${tag.name}】` });
          message.success(t('tagManage.deleteSuccess'));
          loadTags();
        });
      },
    });
  }

  function handleToBack() {
    if (bookmark.isMobile) router.push('/personCenter');
    else router.back();
  }

  watch([keyword, activeFilter, sortMode, viewMode], resetResultScroll);

  onMounted(() => {
    if (resultScrollerRef.value && typeof ResizeObserver !== 'undefined') {
      resultResizeObserver = new ResizeObserver(updateScrollState);
      resultResizeObserver.observe(resultScrollerRef.value);
    }
    updateScrollState();
  });

  onBeforeUnmount(() => {
    resultResizeObserver?.disconnect();
  });

  loadTags();
</script>

<style lang="less" scoped>
  @radius-panel: 18px;
  @radius-card: 14px;
  @muted-opacity: 0.62;

  .tag-manage-page {
    --tag-panel-bg: var(--background-color);
    --tag-card-bg: var(--menu-body-bg-color);
    --tag-muted-bg: var(--bl-input-noBorder-bg-color);
    --tag-soft-shadow: 0 14px 36px -30px rgba(15, 23, 42, 0.42);

    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    padding: 14px 24px 18px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .tag-manage-page--night {
    --tag-panel-bg: #202126;
    --tag-card-bg: #26272d;
    --tag-muted-bg: #2d2e35;
    --tag-soft-shadow: none;
  }

  .manage-header,
  .workspace-panel {
    border: 1px solid var(--workbench-border-color);
    background: var(--tag-panel-bg);
    box-shadow: var(--tag-soft-shadow);
  }

  .manage-header {
    position: relative;
    flex-shrink: 0;
    border-radius: @radius-panel;
    padding: 16px 18px;
    overflow: hidden;
    transition: padding 0.22s ease;

    &::after {
      content: '';
      position: absolute;
      top: -100px;
      right: -60px;
      width: 280px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--resource-tag-color) 9%, transparent),
        transparent 72%
      );
      pointer-events: none;
    }
  }

  .manage-header__top {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px 24px;
  }

  .manage-copy {
    flex: 1;
    min-width: 0;

    h1 {
      margin: 3px 0 0;
      font-size: 22px;
      line-height: 1.25;
      transition: font-size 0.22s ease;
    }

    p {
      max-height: 48px;
      margin: 6px 0 0;
      max-width: 720px;
      overflow: hidden;
      font-size: 13px;
      line-height: 1.55;
      opacity: @muted-opacity;
      transition:
        max-height 0.22s ease,
        margin 0.22s ease,
        opacity 0.16s ease;
    }
  }

  .eyebrow {
    max-height: 20px;
    overflow: hidden;
    color: var(--resource-tag-color);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    transition:
      max-height 0.18s ease,
      opacity 0.16s ease;
  }

  .header-actions,
  .toolbar-actions,
  .view-switch,
  .filter-toolbar,
  .tag-actions,
  .tag-row-actions {
    display: flex;
    align-items: center;
  }

  .header-actions {
    gap: 10px;
    flex-shrink: 0;
  }

  .overview-strip {
    position: relative;
    z-index: 1;
    order: 3;
    flex-basis: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 22px;
    margin-top: 0;
    padding: 9px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--tag-muted-bg) 72%, transparent);
    transition:
      padding 0.22s ease,
      background 0.22s ease;
  }

  .overview-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    opacity: 0.78;
    white-space: nowrap;

    strong {
      font-size: 17px;
      color: var(--text-color);
      opacity: 1;
      font-variant-numeric: tabular-nums;
    }
  }

  .overview-dot,
  .filter-dot,
  .preview-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--resource-tag-color);
    flex-shrink: 0;
  }

  .overview-item--bookmark .overview-dot,
  .filter-chip--bookmark .filter-dot,
  .preview-chip--bookmark .preview-dot {
    background: var(--resource-bookmark-color);
  }

  .overview-item--note .overview-dot,
  .filter-chip--note .filter-dot,
  .preview-chip--note .preview-dot {
    background: var(--resource-note-color);
  }

  .overview-item--file .overview-dot,
  .filter-chip--file .filter-dot,
  .preview-chip--file .preview-dot {
    background: var(--resource-file-color);
  }

  .filter-chip--empty .filter-dot {
    background: #94a3b8;
  }

  .workspace-panel {
    position: relative;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: @radius-panel;
    padding: 14px 16px 0;
    min-width: 0;
  }

  .primary-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .tag-search {
    width: min(480px, 100%);
  }

  .toolbar-actions {
    gap: 10px;
    flex-shrink: 0;
  }

  .sort-select {
    width: 170px;
  }

  .view-switch {
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: var(--tag-muted-bg);
  }

  .view-button,
  .filter-chip,
  .preview-chip {
    border-radius: 8px;
  }

  .view-button.active {
    background: var(--resource-tag-color) !important;
    color: #fff !important;
  }

  .filter-toolbar {
    gap: 8px;
    margin-top: 9px;
    padding-bottom: 9px;
    overflow-x: auto;
    border-bottom: 1px solid var(--workbench-border-color);
  }

  .filter-chip {
    gap: 7px;
    flex-shrink: 0;
    background: transparent;
  }

  .filter-chip.active {
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 11%, var(--tag-muted-bg)) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 20%, transparent);
  }

  .filter-count {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 18px;
    color: var(--sub-text-color);
    background: color-mix(in srgb, var(--tag-muted-bg) 80%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    margin: 9px 2px 8px;
  }

  .result-title {
    font-size: 17px;
    font-weight: 700;
  }

  .result-subtitle,
  .active-query-hint {
    margin-top: 3px;
    font-size: 12px;
    opacity: @muted-opacity;
  }

  .active-query-hint {
    margin: 0;
    padding: 5px 9px;
    border-radius: 999px;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 8%, transparent);
  }

  .results-viewport {
    position: relative;
    min-height: 0;
    flex: 1;
    isolation: isolate;

    &::before,
    &::after {
      content: '';
      position: absolute;
      z-index: 3;
      left: 0;
      right: 0;
      height: 26px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.18s ease;
    }

    &::before {
      top: 0;
      background: linear-gradient(180deg, var(--tag-panel-bg), transparent);
    }

    &::after {
      bottom: 0;
      background: linear-gradient(0deg, var(--tag-panel-bg), transparent);
    }
  }

  .results-viewport--above::before,
  .results-viewport--below::after {
    opacity: 1;
  }

  .result-scroller {
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: 2px 4px 18px 2px;
    box-sizing: border-box;
  }

  .tag-manage-page--compact {
    .manage-header {
      padding: 9px 14px;
    }

    .manage-header__top {
      flex-wrap: nowrap;
      align-items: center;
      gap: 16px;
    }

    .manage-copy {
      flex: 0 0 auto;

      h1 {
        margin: 0;
        font-size: 18px;
      }

      p {
        max-height: 0;
        margin: 0;
        opacity: 0;
      }
    }

    .eyebrow {
      max-height: 0;
      opacity: 0;
    }

    .overview-strip {
      order: initial;
      min-width: 0;
      flex: 1;
      flex-basis: auto;
      flex-wrap: nowrap;
      gap: 12px;
      overflow: hidden;
      padding: 0;
      background: transparent;
    }

    .overview-item {
      gap: 5px;
      font-size: 11px;

      strong {
        font-size: 14px;
      }
    }
  }

  .tag-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 14px;
  }

  .tag-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 236px;
    border: 1px solid var(--workbench-border-color);
    border-radius: @radius-card;
    background: var(--tag-card-bg);
    overflow: hidden;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;

    &:hover,
    &:focus-visible {
      outline: none;
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--resource-tag-color) 32%, var(--workbench-border-color));
      box-shadow: 0 12px 28px -22px rgba(15, 23, 42, 0.5);
    }
  }

  .tag-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 15px 15px 11px;
  }

  .tag-identity,
  .tag-row__identity {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .tag-identity {
    gap: 11px;
  }

  .tag-icon-wrap,
  .tag-row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 9%, var(--tag-muted-bg));
  }

  .tag-icon-wrap {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    font-size: 20px;
    font-weight: 700;
  }

  .tag-meta,
  .tag-row-copy {
    min-width: 0;
  }

  .tag-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 16px;
    font-weight: 700;
  }

  .tag-summary {
    margin-top: 4px;
    font-size: 12px;
    opacity: @muted-opacity;
  }

  .tag-actions,
  .tag-row-actions {
    gap: 5px;
    flex-shrink: 0;
  }

  .resource-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    padding: 0 15px 12px;
  }

  .resource-metric {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 7px 9px;
    border-radius: 9px;
    font-size: 11px;
    color: var(--sub-text-color);
    background: var(--tag-muted-bg);

    strong {
      font-size: 13px;
      color: var(--text-color);
      font-variant-numeric: tabular-nums;
    }
  }

  .resource-metric--bookmark strong,
  .row-metric--bookmark {
    color: var(--resource-bookmark-color);
  }

  .resource-metric--note strong,
  .row-metric--note {
    color: var(--resource-note-color);
  }

  .resource-metric--file strong,
  .row-metric--file {
    color: var(--resource-file-color);
  }

  .tag-card__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 9px;
    padding: 0 15px 12px;
  }

  .compact-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }

  .compact-label {
    width: 58px;
    flex-shrink: 0;
    padding-top: 4px;
    font-size: 11px;
    color: var(--sub-text-color);
  }

  .compact-values,
  .preview-list,
  .row-related,
  .row-metrics {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 5px;
  }

  .compact-values,
  .preview-list {
    flex: 1;
    overflow: hidden;
  }

  .related-chip,
  .more-count,
  .row-empty {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    white-space: nowrap;
  }

  .related-chip {
    max-width: 112px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 9%, var(--tag-muted-bg));
  }

  .more-count,
  .row-empty {
    color: var(--sub-text-color);
    background: var(--tag-muted-bg);
  }

  .preview-chip {
    min-width: 0;
    max-width: 150px;
    gap: 6px;
    padding: 0 8px;
    background: transparent;
  }

  .preview-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unlinked-hint {
    padding: 9px 10px;
    border-radius: 9px;
    font-size: 12px;
    color: var(--sub-text-color);
    background: var(--tag-muted-bg);
  }

  .tag-card__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 15px;
    border-top: 1px solid var(--workbench-border-color);
    font-size: 11px;
    color: var(--sub-text-color);
    transition:
      color 0.2s ease,
      background 0.2s ease;
  }

  .tag-card:hover .tag-card__footer {
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 4%, transparent);
  }

  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .tag-list__header,
  .tag-row {
    display: grid;
    grid-template-columns: minmax(190px, 1.1fr) minmax(230px, 1fr) minmax(160px, 0.8fr) auto;
    gap: 14px;
    align-items: center;
  }

  .tag-list__header {
    position: sticky;
    z-index: 2;
    top: 0;
    padding: 6px 14px 8px;
    font-size: 11px;
    color: var(--sub-text-color);
    background: var(--tag-panel-bg);
  }

  .tag-row {
    padding: 10px 12px;
    border: 1px solid var(--workbench-border-color);
    border-radius: 11px;
    background: var(--tag-card-bg);
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;

    &:hover,
    &:focus-visible {
      outline: none;
      border-color: color-mix(in srgb, var(--resource-tag-color) 28%, var(--workbench-border-color));
      background: color-mix(in srgb, var(--resource-tag-color) 3%, var(--tag-card-bg));
    }
  }

  .tag-row__identity {
    gap: 10px;
  }

  .tag-row-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    font-weight: 700;
  }

  .tag-row-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }

    span {
      font-size: 11px;
      color: var(--sub-text-color);
    }
  }

  .row-metrics {
    gap: 6px;
  }

  .row-metric {
    padding: 4px 7px;
    border-radius: 7px;
    font-size: 11px;
    background: var(--tag-muted-bg);
  }

  .empty-state {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-radius: 14px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--resource-tag-color) 5%, transparent), transparent);

    h3 {
      margin: 12px 0 0;
      font-size: 20px;
    }

    p {
      margin: 8px 0 18px;
      font-size: 13px;
      color: var(--sub-text-color);
    }
  }

  .empty-symbol {
    width: 58px;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 18px;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 10%, var(--tag-muted-bg));
    font-size: 28px;
    font-weight: 700;
  }

  @media (max-width: 1180px) {
    .tag-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tag-list__header,
    .tag-row {
      grid-template-columns: minmax(180px, 1fr) minmax(210px, 1fr) auto;
    }

    .tag-list__header span:nth-child(3),
    .row-related {
      display: none;
    }
  }

  @media (max-width: 860px) {
    .tag-manage-page {
      padding: 12px 14px 16px;
    }

    .primary-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .header-actions {
      justify-content: flex-end;
    }

    .tag-search {
      width: 100%;
    }

    .toolbar-actions {
      justify-content: space-between;
    }

    .tag-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
