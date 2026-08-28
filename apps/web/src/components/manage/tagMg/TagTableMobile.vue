<template>
  <!-- 作为移动资料区第四个页签渲染:顶栏(搜索/新建)与底部导航由移动壳提供,不再自带页头 -->
  <b-loading :loading="loading">
    <div
      ref="scrollRef"
      class="mobile-tag-page"
      @touchstart.passive="pullRefresh.onTouchStart"
      @touchmove="pullRefresh.onTouchMove"
      @touchend.passive="pullRefresh.onTouchEnd"
      @touchcancel.passive="pullRefresh.onTouchCancel"
    >
      <BCard as="section" variant="raised" padding="14px 15px" class="mobile-overview">
        <div class="mobile-overview__total">
          <strong>{{ overview.tag }}</strong>
          <span>{{ t('tagManage.statTotal') }}</span>
        </div>
        <div class="mobile-overview__coverage">
          <span class="mobile-overview__coverage-label">{{ t('tagManage.coverageLabel') }}</span>
          <div class="mobile-overview__metrics">
            <span class="mobile-overview__metric mobile-overview__metric--bookmark">
              <i></i>
              <span>{{ t('tagManage.bookmarkShort') }}</span>
              <strong>{{ overview.bookmark }}</strong>
            </span>
            <span class="mobile-overview__metric mobile-overview__metric--note">
              <i></i>
              <span>{{ t('tagManage.noteShort') }}</span>
              <strong>{{ overview.note }}</strong>
            </span>
            <span class="mobile-overview__metric mobile-overview__metric--file">
              <i></i>
              <span>{{ t('tagManage.fileShort') }}</span>
              <strong>{{ overview.file }}</strong>
            </span>
          </div>
        </div>
      </BCard>

      <!-- 移动端不放第二个文本搜索框：找标签统一走顶栏全局搜索，这里只保留结构化筛选 -->
      <div ref="filterRowRef" class="mobile-filter-row no-scrollbar" :aria-label="t('tagManage.filtersTitle')">
        <BButton
          v-for="filter in filters"
          :key="filter.value"
          size="small"
          class="mobile-filter"
          :class="[`mobile-filter--${filter.value}`, { active: activeFilter === filter.value }]"
          :aria-pressed="activeFilter === filter.value"
          @click="selectFilter(filter.value, $event)"
        >
          <span class="filter-dot"></span>
          <span>{{ filter.label }}</span>
          <span class="filter-count">{{ filter.count }}</span>
        </BButton>
      </div>

      <div class="mobile-result-bar">
        <div>
          <strong>{{ t('tagManage.resultTitle') }}</strong>
          <span>{{ resultSubtitle }}</span>
        </div>
        <BSelect v-model:value="sortMode" class="mobile-sort" :options="sortOptions" />
      </div>

      <div v-if="selectionMode" class="mobile-tag-batch-toolbar">
        <span>{{ t('tagManage.batchSelected', { count: selectedIds.length }) }}</span>
        <div>
          <BButton class="mobile-tag-batch-button" @click="toggleSelectAll">
            {{ t(allVisibleSelected ? 'tagManage.batchDeselectAll' : 'tagManage.batchSelectAll') }}
          </BButton>
          <BButton
            type="danger"
            class="mobile-tag-batch-button"
            :disabled="!selectedIds.length"
            :loading="mutating"
            @click="handleBatchDelete"
          >
            {{ t('tagManage.batchDelete') }}
          </BButton>
        </div>
      </div>

      <div v-if="visibleTags.length" class="mobile-tag-list">
        <BCard
          v-for="tag in visibleTags"
          :key="tag.id"
          as="article"
          variant="card"
          interactive
          padding="0"
          class="mobile-tag-card"
          :class="{
            'mobile-tag-card--empty': !getTotalResourceCount(tag),
            'is-selected': selectedIds.includes(String(tag.id)),
          }"
          role="button"
          tabindex="0"
          @click="handleTagClick(tag)"
          @keydown.enter="handleTagClick(tag)"
        >
          <div class="mobile-tag-head">
            <div class="mobile-tag-identity">
              <div class="mobile-tag-icon">
                <svg-icon v-if="tag.iconUrl" :src="tag.iconUrl" size="22" />
                <span v-else>#</span>
              </div>
              <div class="mobile-tag-copy">
                <strong>{{ tag.name }}</strong>
                <span>{{ t('tagManage.resourceTotal', { count: getTotalResourceCount(tag) }) }}</span>
              </div>
            </div>
            <BCheckbox
              v-if="selectionMode"
              :checked="selectedIds.includes(String(tag.id))"
              :aria-label="tag.name"
              @click.stop
              @update:checked="toggleSelection(tag.id)"
            />
          </div>

          <!-- 只展示非零类型:多数标签只挂一两类资源,显示「书签 0 · 笔记 0」纯属噪音 -->
          <div v-if="tagMetrics(tag).length" class="mobile-resource-metrics">
            <span
              v-for="metric in tagMetrics(tag)"
              :key="metric.key"
              class="mobile-metric"
              :class="`mobile-metric--${metric.key}`"
            >
              <i></i>
              <span>{{ metric.label }}</span>
              <strong>{{ metric.count }}</strong>
            </span>
          </div>

          <!-- 卡片去管理化:编辑/删除收敛到标签详情与编辑页,卡片专注「点击进入主题」。
               相关标签不在列表展示——既避免卡片变高,也避免为列表里每个标签计算共现关系。 -->
        </BCard>
      </div>

      <div v-else class="mobile-empty">
        <div class="empty-symbol">#</div>
        <strong>{{ t('tagManage.emptyTitle') }}</strong>
        <span>{{ t('tagManage.emptyDesc') }}</span>
        <BButton v-if="!keyword" type="primary" @click="router.push('/manage/editTag/add')">
          {{ t('tagManage.createTag') }}
        </BButton>
      </div>
    </div>
  </b-loading>
  <MobilePageActionsDrawer
    v-model:open="mobilePageActionsOpen"
    :title="t('common.more')"
    :actions="mobilePageActions"
    @action="handleMobilePageAction"
  />
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { scrollChipIntoCenter } from '@/utils/horizontalChipScroll';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { getTotalResourceCount, type TagFilterValue, type TagRecord, useTagManage } from './useTagManage';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';

  const { t } = useI18n();
  const { loading, refreshing, keyword, activeFilter, sortMode, filterCounts, visibleTags, overview, reload } =
    useTagManage();
  const selectionMode = ref(false);
  const selectedIds = ref<string[]>([]);
  const mutating = ref(false);
  const mobilePageActionsOpen = ref(false);
  const scrollRef = ref<HTMLElement | null>(null);

  // 下拉刷新只刷新标签数据本身:activeFilter / sortMode / keyword 和横向筛选条位置
  // 都是页面自己的 ref,reload 不碰它们,所以刷新后当前筛选原地保留。
  // overview(总数、覆盖率)由 tags 计算得出,自动跟着更新,不需要额外请求。
  const pullRefresh = useAndroidPullRefresh({
    enabled: computed(() => !selectionMode.value),
    externalBusy: computed(() => loading.value || refreshing.value || mutating.value),
    getScrollContainer: () => scrollRef.value,
    onRefresh: () => reload({ silent: true }),
  });
  /* 从后台切回来时补一次数据,提示由顶栏那条全局细条负责。 */
  useForegroundRefresh({
    refresh: () => reload({ silent: true }),
    canRefresh: () => !selectionMode.value && !loading.value && !refreshing.value && !mutating.value,
  });
  const mobilePageActions = computed<MobilePageActionItem[]>(() => [
    {
      key: 'spaces',
      label: t('tagSpace.backToSpaces'),
      description: t('tagSpace.backToSpacesHint'),
      icon: icon.arrow_left,
    },
    {
      key: 'batch',
      label: t('tagManage.batchSelect'),
      icon: icon.filterPanel.check,
    },
  ]);
  const allVisibleSelected = computed(
    () => visibleTags.value.length > 0 && visibleTags.value.every((tag) => selectedIds.value.includes(String(tag.id))),
  );

  // 顶栏搜索/新建接管原页内搜索框与页头按钮,与书签/笔记/云空间页签保持一致的操作位。
  useMobileTopBar(['tagMg'], {
    searchSourceType: 'tag',
    onAuxiliaryAction: () => {
      if (selectionMode.value) {
        exitSelection();
        return;
      }
      mobilePageActionsOpen.value = true;
    },
    auxiliaryActionLabel: () => t(selectionMode.value ? 'tagManage.batchCancel' : 'common.more'),
    auxiliaryActionIcon: () => (selectionMode.value ? icon.common.close : icon.common.more),
    onAdd: () => router.push('/manage/editTag/add'),
    addLabel: () => t('tagManage.createTag'),
  });

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

  function tagMetrics(tag: TagRecord) {
    return [
      { key: 'bookmark', label: t('tagManage.bookmarkShort'), count: tag.bookmarkList?.length || 0 },
      { key: 'note', label: t('tagManage.noteShort'), count: tag.noteList?.length || 0 },
      { key: 'file', label: t('tagManage.fileShort'), count: tag.fileList?.length || 0 },
    ].filter((metric) => metric.count > 0);
  }

  function openTagDetail(id: string) {
    router.push({ path: `/tag/${id}` });
  }

  function handleTagClick(tag: TagRecord) {
    if (selectionMode.value) {
      toggleSelection(tag.id);
      return;
    }
    openTagDetail(tag.id);
  }

  function toggleSelection(id: string | number) {
    const key = String(id);
    selectedIds.value = selectedIds.value.includes(key)
      ? selectedIds.value.filter((item) => item !== key)
      : [...selectedIds.value, key];
  }

  function enterSelection() {
    selectedIds.value = [];
    selectionMode.value = true;
  }

  function exitSelection() {
    selectedIds.value = [];
    selectionMode.value = false;
  }

  function toggleSelectAll() {
    const visibleIds = visibleTags.value.map((tag) => String(tag.id));
    if (allVisibleSelected.value) {
      selectedIds.value = selectedIds.value.filter((id) => !visibleIds.includes(id));
      return;
    }
    selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds])];
  }

  function handleMobilePageAction(action: MobilePageActionItem) {
    if (action.key === 'spaces') {
      router.push('/manage/tagMg');
      return;
    }
    if (action.key === 'batch') enterSelection();
  }

  function handleBatchDelete() {
    if (blockGuestWrite('delete-tag')) return;
    const ids = [...selectedIds.value];
    if (!ids.length) {
      message.warning(t('tagManage.batchDeleteNoSelection'));
      return;
    }
    Alert.alert({
      title: t('tagManage.batchDeleteConfirmTitle'),
      content: t('tagManage.batchDeleteConfirmContent', { count: ids.length }),
      async onOk() {
        mutating.value = true;
        try {
          const res = await batchDeleteSearchResources(ids.map((id) => ({ id, type: 'tag' })));
          if (Number(res?.status) !== 200) {
            message.error(res?.msg || t('tagManage.batchDeleteFailed'));
            return;
          }
          const successCount = Number(res?.data?.affectedItemCount || 0);
          const skippedCount = Number(res?.data?.invalidItemCount || 0);
          if (!successCount) {
            message.warning(t('tagManage.batchDeleteNoChanges'));
            return;
          }
          recordOperation({
            module: '标签管理',
            operation:
              skippedCount > 0
                ? `批量删除标签部分成功【${successCount}成功/${skippedCount}跳过】`
                : `批量删除标签成功【${successCount}个】`,
          });
          message[skippedCount > 0 ? 'warning' : 'success'](
            skippedCount > 0
              ? t('tagManage.batchDeletePartial', { count: successCount, skipped: skippedCount })
              : t('tagManage.batchDeleteSuccess', { count: successCount }),
          );
          clearGlobalSearchCache();
          exitSelection();
          await reload();
        } catch {
          message.error(t('tagManage.batchDeleteFailed'));
        } finally {
          mutating.value = false;
        }
      },
    });
  }

  const filterRowRef = ref<HTMLElement | null>(null);

  function selectFilter(value: TagFilterValue, event: Event) {
    activeFilter.value = value;
    // 选中贴边/半可见的筛选项时自动滚入视野,与搜索中心类型筛选一致
    scrollChipIntoCenter(filterRowRef.value, event.currentTarget);
  }

  reload();
</script>

<style lang="less" scoped>
  .mobile-tag-page {
    --mobile-tag-card-bg: var(--card-background);
    --mobile-tag-muted-bg: var(--bl-input-noBorder-bg-color);
    --mobile-tag-border: var(--surface-border-color);

    /* 下拉刷新指示器以此为定位基准(它靠负 top 藏在内容上方) */
    position: relative;
    height: 100%;
    min-height: 0;
    /* 壳内页签形态:内容区自带四周留白(原由 ResourcePageShell 提供) */
    padding: 12px 12px 22px;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    color: var(--text-color);
  }

  :deep(.resource-page-body) {
    min-height: 0;
    overflow: hidden;
  }

  .mobile-overview {
    --b-card-background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--resource-tag-color) 5%, var(--card-background)),
      var(--card-background)
    );
    --b-card-border-color: color-mix(in srgb, var(--resource-tag-color) 18%, var(--mobile-tag-border));
    --b-card-shadow: var(--surface-raised-shadow);

    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    align-items: center;
    border-radius: 15px;
  }

  .mobile-overview__total {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 12px;
    border-right: 1px solid color-mix(in srgb, var(--resource-tag-color) 16%, var(--mobile-tag-border));

    strong {
      color: var(--resource-tag-color);
      font-size: 23px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    span {
      color: var(--sub-text-color);
      font-size: 11px;
      white-space: nowrap;
    }
  }

  .mobile-overview__coverage {
    min-width: 0;
    padding-left: 12px;
  }

  .mobile-overview__coverage-label {
    display: block;
    margin-bottom: 6px;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 700;
  }

  .mobile-overview__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .mobile-overview__metric {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 4px;
    color: var(--sub-text-color);
    font-size: 10px;

    i {
      width: 5px;
      height: 5px;
      flex-shrink: 0;
      border-radius: 999px;
      background: var(--resource-tag-color);
    }

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* 数字紧跟自己的名称,避免被推到格子右端、视觉上贴到下一项 */
    strong {
      margin-left: 2px;
      color: var(--text-color);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
  }

  .mobile-overview__metric--bookmark i {
    background: var(--resource-bookmark-color);
  }

  .mobile-overview__metric--note i {
    background: var(--resource-note-color);
  }

  .mobile-overview__metric--file i {
    background: var(--resource-file-color);
  }

  .mobile-filter-row {
    /* 作为 offsetParent,供选中项自动滚动按 offsetLeft 计算(见 horizontalChipScroll) */
    position: relative;
    display: flex;
    gap: 7px;
    margin: 11px 0 0;
    padding: 0 24px 7px 0;
    overflow-x: auto;
    box-shadow: inset -20px 0 16px -18px color-mix(in srgb, var(--text-color) 46%, transparent);
  }

  .mobile-filter {
    flex-shrink: 0;
    min-height: 40px;
    padding-inline: 12px;
    gap: 6px;
    border-radius: 999px;
    background: transparent;
  }

  .mobile-filter.active {
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 10%, var(--mobile-tag-muted-bg)) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 18%, transparent);
  }

  .filter-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--resource-tag-color);
  }

  .mobile-filter--bookmark .filter-dot {
    background: var(--resource-bookmark-color);
  }

  .mobile-filter--note .filter-dot {
    background: var(--resource-note-color);
  }

  .mobile-filter--file .filter-dot {
    background: var(--resource-file-color);
  }

  .mobile-filter--empty .filter-dot {
    background: #94a3b8;
  }

  .filter-count {
    min-width: 17px;
    padding: 0 5px;
    border-radius: 999px;
    line-height: 17px;
    font-size: 10px;
    color: var(--sub-text-color);
    background: var(--mobile-tag-muted-bg);
  }

  .mobile-result-bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    margin: 8px 0 10px;
    padding: 0 2px;

    > div:first-child {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    strong {
      font-size: 16px;
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--sub-text-color);
      font-size: 11px;
    }
  }

  .mobile-sort {
    width: 132px;
    flex-shrink: 0;
  }

  .mobile-tag-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .mobile-tag-batch-toolbar {
    min-height: 48px;
    margin-bottom: 10px;
    padding: 6px 8px 6px 12px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 24%, var(--mobile-tag-border));
    border-radius: 12px;
    background: color-mix(in srgb, var(--resource-tag-color) 7%, var(--mobile-tag-card-bg));
    color: var(--sub-text-color);
    font-size: 12px;

    > div {
      display: flex;
      gap: 5px;
    }
  }

  .mobile-tag-batch-button {
    min-height: 40px;
    padding-inline: 10px;
  }

  .mobile-tag-card {
    --b-card-background: var(--mobile-tag-card-bg);
    --b-card-border-color: var(--mobile-tag-border);
    --b-card-shadow: var(--surface-card-shadow);
    --b-card-hover-shadow: var(--surface-hover-shadow);

    border-radius: 14px;
    overflow: hidden;
    transition:
      border-color 0.2s ease,
      transform 0.2s ease;

    &:active {
      transform: scale(0.995);
      border-color: color-mix(in srgb, var(--resource-tag-color) 30%, var(--mobile-tag-border));
    }

    &.is-selected {
      --b-card-border-color: color-mix(in srgb, var(--resource-tag-color) 68%, var(--mobile-tag-border));
      --b-card-background: color-mix(in srgb, var(--resource-tag-color) 6%, var(--mobile-tag-card-bg));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 14%, transparent);
    }
  }

  /* 卡片收紧到 ~80px:标签多时长列表更好扫读(方案 3.3) */
  .mobile-tag-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px 7px;
  }

  .mobile-tag-identity {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .mobile-tag-icon {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 11px;
    color: var(--resource-tag-color);
    font-size: 18px;
    font-weight: 700;
  }

  .mobile-tag-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong,
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 14px;
    }

    span {
      color: var(--sub-text-color);
      font-size: 11px;
    }
  }

  .mobile-resource-metrics {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 12px 8px;
  }

  /* 空标签弱化:不占视觉重心,但仍可点进去补内容 */
  .mobile-tag-card--empty {
    opacity: 0.66;
  }

  .mobile-metric {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 4px;
    padding: 0 8px;
    color: var(--sub-text-color);
    font-size: 10px;

    &:first-child {
      padding-left: 0;
    }

    &:not(:last-child)::after {
      content: '';
      width: 1px;
      height: 12px;
      margin-left: 5px;
      background: var(--mobile-tag-border);
    }

    i {
      width: 5px;
      height: 5px;
      flex-shrink: 0;
      border-radius: 999px;
      background: var(--resource-tag-color);
    }

    strong {
      color: var(--text-color);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
  }

  .mobile-metric--bookmark i {
    background: var(--resource-bookmark-color);
  }

  .mobile-metric--note i {
    background: var(--resource-note-color);
  }

  .mobile-metric--file i {
    background: var(--resource-file-color);
  }

  .mobile-empty {
    min-height: 330px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 9px;
    text-align: center;

    > strong {
      font-size: 17px;
    }

    > span {
      max-width: 260px;
      color: var(--sub-text-color);
      font-size: 12px;
      line-height: 1.6;
    }
  }

  .empty-symbol {
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 10%, var(--mobile-tag-muted-bg));
    font-size: 25px;
    font-weight: 700;
  }
</style>
