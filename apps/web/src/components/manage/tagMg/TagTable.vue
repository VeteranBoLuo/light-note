<template>
  <b-loading :loading="loading">
    <ResourcePageShell
      :title="t('tagManage.title')"
      :subtitle="t('tagManage.subtitle')"
      accent="tag"
      layout="workspace"
      show-back
      @back="handleToBack"
    >
      <template #actions>
        <BButton
          v-click-log="OPERATION_LOG_MAP.tagMg.addTag"
          type="primary"
          @click="$router.push({ path: '/manage/editTag/add' })"
        >
          {{ t('tagManage.createTag') }}
        </BButton>
        <BButton @click="handleToBack" v-click-log="{ module: '标签管理', operation: '返回' }">
          {{ t('common.back') }}
        </BButton>
      </template>
      <div
        class="tag-manage-page"
        :class="{
          'tag-manage-page--night': user.currentTheme === 'night',
          'tag-manage-page--compact': isCompactHeader,
        }"
      >
        <BCard as="section" variant="raised" padding="12px 16px" class="manage-header">
          <div class="overview-stage" :aria-label="t('tagManage.overview')">
            <div class="overview-expanded" :aria-hidden="isCompactHeader">
              <div class="overview-total">
                <span class="overview-dot"></span>
                <div class="overview-total__copy">
                  <span>{{ totalStat.label }}</span>
                  <small>{{ totalStat.desc }}</small>
                </div>
                <strong>{{ totalStat.value }}</strong>
              </div>

              <div class="overview-coverage">
                <div class="overview-coverage__copy">
                  <span>{{ t('tagManage.coverageLabel') }}</span>
                  <small>{{ t('tagManage.coverageHint') }}</small>
                </div>
                <div
                  v-for="stat in coveredStats"
                  :key="stat.key"
                  class="overview-coverage__item"
                  :class="`overview-coverage__item--${stat.key}`"
                >
                  <span class="overview-dot"></span>
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </div>
              </div>
            </div>

            <div class="overview-strip" :aria-hidden="!isCompactHeader">
              <div class="overview-item overview-item--tag">
                <span class="overview-dot"></span>
                <strong>{{ totalStat.value }}</strong>
                <span>{{ totalStat.label }}</span>
              </div>
              <span class="overview-strip__divider" aria-hidden="true"></span>
              <div v-for="stat in coveredStats" :key="stat.key" class="overview-item" :class="`overview-item--${stat.key}`">
                <span class="overview-dot"></span>
                <strong>{{ stat.value }}</strong>
                <span>{{ stat.label }}</span>
              </div>
            </div>
          </div>
        </BCard>

        <BCard as="section" variant="panel" padding="14px 16px 0" class="workspace-panel">
          <div class="primary-toolbar">
            <BInput v-model:value="keyword" class="tag-search" :placeholder="t('tagManage.searchPlaceholder')">
              <template #prefix>
                <svg-icon :src="icon.navigation.search" size="18" />
              </template>
            </BInput>

            <div class="toolbar-actions">
              <BSelect v-model:value="sortMode" class="sort-select" :options="sortOptions" />
              <div class="view-switch" :aria-label="t('tagManage.viewMode')">
                <BButton
                  size="small"
                  class="view-button"
                  :class="{ active: viewMode === 'card' }"
                  :aria-pressed="viewMode === 'card'"
                  @click="setTagView('card')"
                >
                  {{ t('resourceCenter.view.card') }}
                </BButton>
                <BButton
                  size="small"
                  class="view-button"
                  :class="{ active: viewMode === 'list' }"
                  :aria-pressed="viewMode === 'list'"
                  @click="setTagView('list')"
                >
                  {{ t('resourceCenter.view.list') }}
                </BButton>
              </div>
            </div>
          </div>

          <div class="filter-toolbar" :aria-label="t('tagManage.filtersTitle')">
            <BButton
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
            </BButton>
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
                <BCard
                  v-for="tag in visibleTags"
                  :key="tag.id"
                  as="article"
                  variant="card"
                  interactive
                  padding="0"
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

                    <div class="tag-card__tools">
                      <span class="tag-card__open" aria-hidden="true">→</span>
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
                  </div>

                  <div class="resource-metrics">
                    <span class="resource-metric resource-metric--bookmark">
                      <span class="resource-metric__dot"></span>
                      <span>{{ t('tagManage.bookmark') }}</span>
                      <strong>{{ tag.bookmarkList?.length || 0 }}</strong>
                    </span>
                    <span class="resource-metric resource-metric--note">
                      <span class="resource-metric__dot"></span>
                      <span>{{ t('tagManage.note') }}</span>
                      <strong>{{ tag.noteList?.length || 0 }}</strong>
                    </span>
                    <span class="resource-metric resource-metric--file">
                      <span class="resource-metric__dot"></span>
                      <span>{{ t('tagManage.file') }}</span>
                      <strong>{{ tag.fileList?.length || 0 }}</strong>
                    </span>
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

                </BCard>
              </div>

              <div v-else-if="visibleTags.length" class="tag-list">
                <div class="tag-list__header" aria-hidden="true">
                  <span>{{ t('tagManage.tagColumn') }}</span>
                  <span>{{ t('tagManage.resourceDistribution') }}</span>
                  <span>{{ t('tagManage.relatedTag') }}</span>
                  <span>{{ t('tagManage.actions') }}</span>
                </div>
                <BCard
                  v-for="tag in visibleTags"
                  :key="tag.id"
                  as="article"
                  variant="card"
                  interactive
                  padding="10px 12px"
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
                </BCard>
              </div>

              <div v-else class="empty-state">
                <div class="empty-symbol">#</div>
                <h3>{{ t('tagManage.emptyTitle') }}</h3>
                <p>{{ t('tagManage.emptyDesc') }}</p>
                <BButton v-if="!keyword" type="primary" @click="$router.push('/manage/editTag/add')">
                  {{ t('tagManage.createTag') }}
                </BButton>
              </div>
            </div>
          </div>
        </BCard>
      </div>

      <FilePreview
        v-model:visible="filePreviewVisible"
        :fileInfo="previewFileInfo"
        @close="filePreviewVisible = false"
      />
    </ResourcePageShell>
  </b-loading>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
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
  const COMPACT_ENTER_SCROLL_TOP = 96;
  const COMPACT_EXIT_SCROLL_TOP = 16;
  const resultScrollerRef = ref<HTMLElement>();
  const isCompactHeader = ref(false);
  const hasScrollAbove = ref(false);
  const hasScrollBelow = ref(false);
  let resultResizeObserver: ResizeObserver | undefined;
  const { loading, keyword, activeFilter, sortMode, filterCounts, visibleTags, overview, reload } = useTagManage();

  const stats = computed(() => [
    {
      key: 'tag',
      label: t('tagManage.statTotal'),
      desc: t('tagManage.statTotalDesc'),
      value: overview.value.tag,
    },
    {
      key: 'bookmark',
      label: t('tagManage.coveredBookmark'),
      desc: t('tagManage.statBookmarkDesc'),
      value: overview.value.bookmark,
    },
    {
      key: 'note',
      label: t('tagManage.coveredNote'),
      desc: t('tagManage.statNoteDesc'),
      value: overview.value.note,
    },
    {
      key: 'file',
      label: t('tagManage.coveredFile'),
      desc: t('tagManage.statFileDesc'),
      value: overview.value.file,
    },
  ]);
  const totalStat = computed(() => stats.value[0]);
  const coveredStats = computed(() => stats.value.slice(1));

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
    if (isCompactHeader.value) {
      if (scroller.scrollTop <= COMPACT_EXIT_SCROLL_TOP) isCompactHeader.value = false;
    } else if (scroller.scrollTop >= COMPACT_ENTER_SCROLL_TOP) {
      isCompactHeader.value = true;
    }
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
    ].slice(0, 1);
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
    --tag-panel-bg: var(--workspace-panel-bg-color);
    --tag-card-bg: var(--card-background);
    --tag-muted-bg: var(--bl-input-noBorder-bg-color);
    --tag-border-color: var(--surface-border-color);

    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .tag-manage-page--night {
    --tag-panel-bg: var(--workspace-panel-bg-color);
    --tag-card-bg: var(--card-background);
    --tag-muted-bg: var(--bl-input-noBorder-bg-color);
  }

  .manage-header {
    --b-card-background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--resource-tag-color) 4%, var(--card-background)),
      var(--card-background)
    );
    --b-card-border-color: color-mix(in srgb, var(--resource-tag-color) 16%, var(--tag-border-color));
    --b-card-shadow: var(--surface-raised-shadow);

    position: relative;
    flex-shrink: 0;
    border-radius: @radius-panel;
    padding: 12px 16px;
    overflow: hidden;
    transition: padding 0.18s ease;

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

  .toolbar-actions,
  .view-switch,
  .filter-toolbar,
  .tag-actions,
  .tag-row-actions {
    display: flex;
    align-items: center;
  }

  .overview-stage {
    position: relative;
    z-index: 1;
    height: 70px;
    min-width: 0;
    transition: height 0.18s ease;
  }

  .overview-expanded,
  .overview-strip {
    position: absolute;
    inset: 0;
    transition:
      opacity 0.15s ease,
      transform 0.18s ease,
      visibility 0s linear 0s;
  }

  .overview-expanded {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(0, 3.2fr);
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 13%, var(--tag-border-color));
    border-radius: 13px;
    background: color-mix(in srgb, var(--card-background) 82%, transparent);
  }

  .overview-total {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    box-sizing: border-box;
    border-right: 1px solid color-mix(in srgb, var(--resource-tag-color) 13%, var(--tag-border-color));
    background: color-mix(in srgb, var(--resource-tag-color) 5%, transparent);

    strong {
      color: var(--resource-tag-color);
      font-size: 25px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
  }

  .overview-total__copy,
  .overview-coverage__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    span,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 650;
    }

    small {
      color: var(--desc-color);
      font-size: 11px;
      line-height: 1.3;
    }
  }

  .overview-total__copy {
    span {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 700;
    }
  }

  .overview-coverage {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(152px, 1.35fr) repeat(3, minmax(0, 1fr));
    align-items: center;
  }

  .overview-coverage__copy {
    padding: 10px 15px;

    span {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 700;
    }
  }

  .overview-coverage__item {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 9px 12px;
    border-left: 1px solid color-mix(in srgb, var(--tag-border-color) 82%, transparent);
    color: var(--sub-text-color);
    font-size: 12px;

    > span:nth-child(2) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--text-color);
      font-size: 18px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
  }

  .overview-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 20px;
    max-height: 34px;
    margin-top: 0;
    padding: 7px 10px;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 10%, var(--tag-border-color));
    background: color-mix(in srgb, var(--card-background) 78%, transparent);
    opacity: 0;
    visibility: hidden;
    transform: translateY(5px);
  }

  .overview-strip__divider {
    width: 1px;
    height: 18px;
    background: var(--tag-border-color);
  }

  .overview-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    opacity: 0.78;
    white-space: nowrap;

    strong {
      font-size: 16px;
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
  .overview-coverage__item--bookmark .overview-dot,
  .filter-chip--bookmark .filter-dot,
  .preview-chip--bookmark .preview-dot {
    background: var(--resource-bookmark-color);
  }

  .overview-item--note .overview-dot,
  .overview-coverage__item--note .overview-dot,
  .filter-chip--note .filter-dot,
  .preview-chip--note .preview-dot {
    background: var(--resource-note-color);
  }

  .overview-item--file .overview-dot,
  .overview-coverage__item--file .overview-dot,
  .filter-chip--file .filter-dot,
  .preview-chip--file .preview-dot {
    background: var(--resource-file-color);
  }

  .filter-chip--empty .filter-dot {
    background: #94a3b8;
  }

  .workspace-panel {
    --b-card-background: var(--tag-panel-bg);
    --b-card-border-color: var(--tag-border-color);

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
    border-bottom: 1px solid var(--tag-border-color);
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
      padding: 8px 16px;
    }

    .overview-stage {
      height: 34px;
    }

    .overview-expanded {
      opacity: 0;
      visibility: hidden;
      transform: translateY(-5px);
      transition-delay: 0s, 0s, 0.15s;
    }

    .overview-strip {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition-delay: 0.03s, 0.03s, 0s;
    }
  }

  .tag-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 14px;
  }

  .tag-card {
    --b-card-background: var(--tag-card-bg);
    --b-card-border-color: var(--tag-border-color);
    --b-card-shadow: var(--surface-card-shadow);
    --b-card-hover-shadow: var(--surface-hover-shadow);

    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 182px;
    border-radius: @radius-card;
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;

    &:hover,
    &:focus-visible {
      outline: none;
      border-color: color-mix(in srgb, var(--resource-tag-color) 32%, var(--tag-border-color));
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

  .tag-card__tools {
    position: relative;
    width: 72px;
    height: 30px;
    flex-shrink: 0;
  }

  .tag-card__open {
    position: absolute;
    top: 4px;
    right: 1px;
    color: var(--sub-text-color);
    font-size: 17px;
    line-height: 1;
    transition:
      color 0.18s ease,
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .tag-actions {
    position: absolute;
    top: 0;
    right: 0;
    opacity: 0;
    pointer-events: none;
    transform: translateX(4px);
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }

  .tag-card:hover,
  .tag-card:focus-visible,
  .tag-card:focus-within {
    .tag-actions {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(0);
    }

    .tag-card__open {
      color: var(--resource-tag-color);
      opacity: 0;
      transform: translateX(4px);
    }
  }

  .resource-metrics {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 15px 11px;
  }

  .resource-metric {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
    padding: 0 11px;
    font-size: 11px;
    color: var(--sub-text-color);

    &:first-child {
      padding-left: 0;
    }

    &:not(:last-child)::after {
      content: '';
      width: 1px;
      height: 14px;
      margin-left: 5px;
      background: var(--tag-border-color);
    }

    strong {
      font-size: 13px;
      color: var(--text-color);
      font-variant-numeric: tabular-nums;
    }
  }

  .resource-metric__dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--resource-tag-color);
  }

  .resource-metric--bookmark .resource-metric__dot {
    background: var(--resource-bookmark-color);
  }

  .resource-metric--note .resource-metric__dot {
    background: var(--resource-note-color);
  }

  .resource-metric--file .resource-metric__dot {
    background: var(--resource-file-color);
  }

  .row-metric--bookmark {
    color: var(--resource-bookmark-color);
  }

  .row-metric--note {
    color: var(--resource-note-color);
  }

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
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 0;
    font-size: 12px;
    color: var(--sub-text-color);

    &::before {
      content: '';
      width: 6px;
      height: 6px;
      flex-shrink: 0;
      border-radius: 999px;
      background: color-mix(in srgb, var(--resource-tag-color) 56%, var(--tag-muted-bg));
    }
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
    --b-card-background: var(--tag-card-bg);
    --b-card-border-color: var(--tag-border-color);
    --b-card-shadow: var(--surface-card-shadow);
    --b-card-hover-shadow: var(--surface-hover-shadow);

    border-radius: 11px;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;

    &:hover,
    &:focus-visible {
      outline: none;
      border-color: color-mix(in srgb, var(--resource-tag-color) 28%, var(--tag-border-color));
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

  @media (prefers-reduced-motion: reduce) {
    .manage-header,
    .overview-stage,
    .overview-expanded,
    .overview-strip {
      transition: none;
    }
  }

  @media (hover: none) {
    .tag-actions {
      opacity: 1;
      pointer-events: auto;
      transform: none;
    }

    .tag-card__open {
      opacity: 0;
    }
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

    .overview-stage {
      height: 132px;
    }

    .overview-expanded {
      grid-template-columns: 1fr;
    }

    .overview-total {
      border-right: 0;
      border-bottom: 1px solid color-mix(in srgb, var(--resource-tag-color) 13%, var(--tag-border-color));
    }

    .overview-coverage {
      grid-template-columns: minmax(112px, 1.2fr) repeat(3, minmax(0, 1fr));
    }

    .overview-coverage__copy,
    .overview-coverage__item {
      padding-block: 8px;
    }

    .overview-coverage__copy small {
      display: none;
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
