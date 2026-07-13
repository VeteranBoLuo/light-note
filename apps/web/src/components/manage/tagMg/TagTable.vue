<template>
  <b-loading :loading="loading">
    <div class="tag-manage-page" :class="{ 'tag-manage-page--night': user.currentTheme === 'night' }">
      <section class="hero-card">
        <div class="hero-copy">
          <div class="eyebrow">{{ t('navigation.workbench') }}</div>
          <h1>{{ t('tagManage.title') }}</h1>
          <p>{{ t('tagManage.subtitle') }}</p>
        </div>

        <div class="hero-actions">
          <b-input v-model:value="tableSearchValue" class="hero-search" :placeholder="$t('home.tagSearch')">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="18" />
            </template>
          </b-input>
          <div class="hero-btns">
            <b-button
              config_id="test"
              v-click-log="OPERATION_LOG_MAP.tagMg.addTag"
              type="primary"
              @click="$router.push({ path: `/manage/editTag/add` })"
            >
              {{ $t('common.add') }}
            </b-button>
            <b-button @click="handleToBack" v-click-log="{ module: '标签管理', operation: `返回` }">
              {{ $t('common.back') }}
            </b-button>
          </div>
        </div>

        <div class="hero-stats">
          <div v-for="stat in stats" :key="stat.key" class="stat-card" :class="`stat-card--${stat.key}`">
            <div class="stat-label">{{ stat.label }}</div>
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-desc">{{ stat.desc }}</div>
          </div>
        </div>
      </section>

      <section class="content-layout">
        <aside class="filter-panel">
          <div class="filter-title">{{ t('tagManage.filtersTitle') }}</div>
          <button
            v-for="filter in filters"
            :key="filter.value"
            class="filter-item"
            :class="{ active: activeFilter === filter.value }"
            @click="activeFilter = filter.value"
            v-click-log="{ module: '标签管理', operation: `筛选标签【${filter.label}】` }"
          >
            <span class="filter-left">
              <span class="filter-dot" :class="`filter-dot--${filter.value}`"></span>
              <span>{{ filter.label }}</span>
            </span>
            <span class="filter-count">{{ filter.count }}</span>
          </button>
        </aside>

        <main class="result-panel">
          <div class="result-toolbar">
            <div>
              <div class="result-title">{{ t('tagManage.resultTitle') }}</div>
              <div class="result-subtitle">{{ resultSubtitle }}</div>
            </div>
            <div class="view-switch" v-if="!bookmark.isMobile">
              <button class="view-btn" :class="{ active: viewMode === 'card' }" @click="setTagView('card')">
                {{ t('resourceCenter.view.card') }}
              </button>
              <button class="view-btn" :class="{ active: viewMode === 'list' }" @click="setTagView('list')">
                {{ t('resourceCenter.view.list') }}
              </button>
            </div>
          </div>

          <div v-if="visibleTags.length && effectiveView === 'card'" class="tag-grid">
            <article
              v-for="tag in visibleTags"
              :key="tag.id"
              class="tag-card"
              @click="openTagDetail(tag.id)"
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
                      {{
                        t('tagManage.tagSummary', {
                          count: getTotalResourceCount(tag),
                          related: tag.relatedTagList?.length || 0,
                        })
                      }}
                    </div>
                  </div>
                </div>

                <div class="tag-actions">
                  <button
                    class="action-btn"
                    @click.stop="edit(tag.id)"
                    v-click-log="{ module: '标签管理', operation: `编辑标签【${tag.name}】` }"
                  >
                    <svg-icon :src="icon.table_edit" size="15" />
                    <span>{{ t('common.edit') }}</span>
                  </button>
                  <button class="action-btn action-btn--danger" @click.stop="handleDeleteTag(tag)">
                    <svg-icon :src="icon.table_delete" size="15" />
                    <span>{{ t('common.delete') }}</span>
                  </button>
                </div>
              </div>

              <div v-if="tag.relatedTagList?.length" class="section-block">
                <div class="section-title">{{ t('tagManage.relatedTag') }}</div>
                <div class="chip-list">
                  <span v-for="related in tag.relatedTagList" :key="related.id" class="common-chip">
                    {{ related.name }}
                  </span>
                </div>
              </div>

              <div v-if="getTotalResourceCount(tag)" class="section-block">
                <div class="section-title">{{ t('tagManage.relatedContent') }}</div>
                <div class="resource-stack">
                  <div v-if="tag.bookmarkList?.length" class="resource-row">
                    <div class="resource-row__label resource-row__label--bookmark">{{ t('tagManage.bookmark') }}</div>
                    <div class="chip-list">
                      <button
                        v-for="bookmarkItem in tag.bookmarkList.slice(0, 4)"
                        :key="bookmarkItem.id"
                        class="resource-chip resource-chip--bookmark"
                        :title="bookmarkItem.name"
                        @click.stop="openPage(bookmarkItem.url)"
                        v-click-log="{ module: '标签管理', operation: `打开关联书签【${bookmarkItem.name}】` }"
                      >
                        {{ bookmarkItem.name }}
                      </button>
                    </div>
                  </div>

                  <div v-if="tag.noteList?.length" class="resource-row">
                    <div class="resource-row__label resource-row__label--note">{{ t('tagManage.note') }}</div>
                    <div class="chip-list">
                      <button
                        v-for="noteItem in tag.noteList.slice(0, 4)"
                        :key="noteItem.id"
                        class="resource-chip resource-chip--note"
                        :title="noteItem.name"
                        @click.stop="openNote(noteItem.id)"
                        v-click-log="{ module: '标签管理', operation: `打开关联笔记【${noteItem.name}】` }"
                      >
                        {{ noteItem.name }}
                      </button>
                    </div>
                  </div>

                  <div v-if="tag.fileList?.length" class="resource-row">
                    <div class="resource-row__label resource-row__label--file">{{ t('tagManage.file') }}</div>
                    <div class="chip-list">
                      <button
                        v-for="fileItem in tag.fileList.slice(0, 4)"
                        :key="fileItem.id"
                        class="resource-chip resource-chip--file"
                        :title="fileItem.name"
                        @click.stop="previewFile(fileItem.id)"
                        v-click-log="{ module: '标签管理', operation: `预览关联文件【${fileItem.name}】` }"
                      >
                        {{ fileItem.name }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div v-else-if="visibleTags.length" class="tag-list">
            <article
              v-for="tag in visibleTags"
              :key="tag.id"
              class="tag-row"
              @click="openTagDetail(tag.id)"
              v-click-log="{ module: '标签管理', operation: `查看标签详情【${tag.name}】` }"
            >
              <div class="tag-row-icon">
                <svg-icon v-if="tag.iconUrl" :src="tag.iconUrl" size="18" />
                <span v-else>#</span>
              </div>
              <div class="tag-row-name">{{ tag.name }}</div>
              <div class="tag-row-summary">
                {{ t('tagManage.tagSummary', { count: getTotalResourceCount(tag), related: tag.relatedTagList?.length || 0 }) }}
              </div>
              <div class="tag-row-actions">
                <button
                  class="action-btn"
                  @click.stop="edit(tag.id)"
                  v-click-log="{ module: '标签管理', operation: `编辑标签【${tag.name}】` }"
                >
                  <svg-icon :src="icon.table_edit" size="15" />
                  <span>{{ t('common.edit') }}</span>
                </button>
                <button class="action-btn action-btn--danger" @click.stop="handleDeleteTag(tag)">
                  <svg-icon :src="icon.table_delete" size="15" />
                  <span>{{ t('common.delete') }}</span>
                </button>
              </div>
            </article>
          </div>

          <div v-else class="empty-state">
            <div class="empty-orbit"></div>
            <h3>{{ t('tagManage.emptyTitle') }}</h3>
            <p>{{ t('tagManage.emptyDesc') }}</p>
          </div>
        </main>
      </section>
    </div>

    <FilePreview v-model:visible="filePreviewVisible" :fileInfo="previewFileInfo" @close="filePreviewVisible = false" />
  </b-loading>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import router from '@/router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { openPage } from '@/utils/common.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { updatePreference } from '@/utils/savePreference';

  interface RelatedItem {
    id: string;
    name: string;
    url?: string;
  }

  interface TagRecord {
    id: string;
    name: string;
    iconUrl?: string;
    relatedTagList?: RelatedItem[];
    bookmarkList?: RelatedItem[];
    noteList?: RelatedItem[];
    fileList?: RelatedItem[];
  }

  type FilterValue = 'all' | 'active' | 'bookmark' | 'note' | 'file' | 'empty';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const loading = ref(false);
  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});
  const tableSearchValue = ref('');
  const activeFilter = ref<FilterValue>('all');
  const tableData = ref<TagRecord[]>([]);

  // 视图优先取用户偏好(设置页「标签管理视图」/跨设备);移动端强制卡片(窄屏列表无优势)
  const viewMode = ref<'card' | 'list'>((user.preferences.tagManageView as 'card' | 'list') || 'card');
  const effectiveView = computed<'card' | 'list'>(() => (bookmark.isMobile ? 'card' : viewMode.value));
  function setTagView(mode: 'card' | 'list') {
    if (viewMode.value === mode) return;
    viewMode.value = mode;
    updatePreference({ tagManageView: mode }).catch(() => {});
  }

  const filteredByKeyword = computed(() => {
    const keyword = tableSearchValue.value.trim().toLowerCase();
    if (!keyword) return tableData.value;
    return tableData.value.filter((item) => item.name?.toLowerCase().includes(keyword));
  });

  const visibleTags = computed(() => {
    const data = filteredByKeyword.value;
    switch (activeFilter.value) {
      case 'active':
        return data.filter((item) => getTotalResourceCount(item) > 0);
      case 'bookmark':
        return data.filter((item) => (item.bookmarkList?.length || 0) > 0);
      case 'note':
        return data.filter((item) => (item.noteList?.length || 0) > 0);
      case 'file':
        return data.filter((item) => (item.fileList?.length || 0) > 0);
      case 'empty':
        return data.filter((item) => getTotalResourceCount(item) === 0);
      default:
        return data;
    }
  });

  const uniqueBookmarkTotal = computed(() => getUniqueResourceCount('bookmarkList'));
  const uniqueNoteTotal = computed(() => getUniqueResourceCount('noteList'));
  const uniqueFileTotal = computed(() => getUniqueResourceCount('fileList'));

  const stats = computed(() => [
    {
      key: 'tag',
      label: t('tagManage.statTotal'),
      value: tableData.value.length,
      desc: t('tagManage.statTotalDesc'),
    },
    {
      key: 'bookmark',
      label: t('tagManage.bookmark'),
      value: uniqueBookmarkTotal.value,
      desc: t('tagManage.statBookmarkDesc'),
    },
    {
      key: 'note',
      label: t('tagManage.note'),
      value: uniqueNoteTotal.value,
      desc: t('tagManage.statNoteDesc'),
    },
    {
      key: 'file',
      label: t('tagManage.file'),
      value: uniqueFileTotal.value,
      desc: t('tagManage.statFileDesc'),
    },
  ]);

  const filters = computed(() => [
    { value: 'all' as const, label: t('tagManage.filterAll'), count: filteredByKeyword.value.length },
    {
      value: 'active' as const,
      label: t('tagManage.filterActive'),
      count: filteredByKeyword.value.filter((item) => getTotalResourceCount(item) > 0).length,
    },
    {
      value: 'bookmark' as const,
      label: t('tagManage.bookmark'),
      count: filteredByKeyword.value.filter((item) => (item.bookmarkList?.length || 0) > 0).length,
    },
    {
      value: 'note' as const,
      label: t('tagManage.note'),
      count: filteredByKeyword.value.filter((item) => (item.noteList?.length || 0) > 0).length,
    },
    {
      value: 'file' as const,
      label: t('tagManage.file'),
      count: filteredByKeyword.value.filter((item) => (item.fileList?.length || 0) > 0).length,
    },
    {
      value: 'empty' as const,
      label: t('tagManage.filterEmpty'),
      count: filteredByKeyword.value.filter((item) => getTotalResourceCount(item) === 0).length,
    },
  ]);

  const resultSubtitle = computed(() => {
    const keyword = tableSearchValue.value.trim();
    if (keyword) {
      return t('tagManage.resultSubtitleKeyword', { keyword, count: visibleTags.value.length });
    }
    return t('tagManage.resultSubtitle', { count: visibleTags.value.length });
  });

  function getTotalResourceCount(tag: TagRecord) {
    return (tag.bookmarkList?.length || 0) + (tag.noteList?.length || 0) + (tag.fileList?.length || 0);
  }

  function getUniqueResourceCount(key: 'bookmarkList' | 'noteList' | 'fileList') {
    const ids = new Set<string>();
    tableData.value.forEach((tag) => {
      (tag[key] || []).forEach((item) => {
        if (item?.id) {
          ids.add(item.id);
        }
      });
    });
    return ids.size;
  }

  const edit = (id: string) => {
    router.push({ path: `/manage/editTag/${id}` });
  };

  const openTagDetail = (id: string) => {
    router.push({ path: `/tag/${id}` });
  };

  function openNote(id: string) {
    if (!id) return;
    router.push(`/noteLibrary/${id}`);
  }

  async function previewFile(id: string) {
    if (!id) return;
    const res = await apiBasePost('/api/file/getFileInfo', { id });
    if (res.status === 200 && res.data) {
      previewFileInfo.value = {
        ...res.data,
        fileName: res.data.file_name || res.data.fileName,
        fileType: res.data.file_type || res.data.fileType,
        fileUrl: res.data.fileUrl,
        category: res.data.category,
      };
      filePreviewVisible.value = true;
    }
  }

  function handleDeleteTag(tag: TagRecord) {
    if (blockGuestWrite('delete-tag')) return;
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${tag.name}】？`,
      onOk() {
        apiBasePost('/api/bookmark/delTag', { id: tag.id }).then((res) => {
          if (res.status == 200) {
            recordOperation({ module: '标签管理', operation: `删除标签成功【${tag.name}】` });
            message.success('删除成功');
            init();
          }
        });
      },
    });
  }

  function handleToBack() {
    if (bookmark.isMobile) {
      router.push('/personCenter');
    } else {
      router.back();
    }
  }

  function init() {
    loading.value = true;
    apiQueryPost('/api/bookmark/queryTagList', {
      filters: {
        userId: user.id,
      },
    })
      .then((res) => {
        if (res.status === 200) {
          tableData.value = res.data || [];
        }
      })
      .finally(() => {
        loading.value = false;
      });
  }

  init();
</script>

<style lang="less" scoped>
  // ── 统一变量 ──
  @color-mix-hover: 10%;
  @color-mix-active: 14%;
  @color-mix-border-light: 26%;
  @color-mix-border-strong: 38%;
  @opacity-primary: 0.72;
  @opacity-secondary: 0.54;
  @radius-card: 16px;
  @radius-sm: 10px;
  @radius-xs: 8px;

  .tag-manage-page {
    --tag-hero-bg: linear-gradient(135deg, var(--background-color), var(--menu-body-bg-color));
    --tag-stat-bg: rgba(255, 255, 255, 0.48);
    --tag-panel-bg: var(--background-color);
    --tag-card-bg: var(--menu-body-bg-color);
    --tag-muted-bg: var(--bl-input-noBorder-bg-color);

    height: 100%;
    overflow: auto;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .tag-manage-page--night {
    --tag-hero-bg: linear-gradient(135deg, #1b1c21, #24252a);
    --tag-stat-bg: #27282e;
    --tag-panel-bg: #1f2025;
    --tag-card-bg: #26272d;
    --tag-muted-bg: #2c2d34;
  }

  // ═══════════════════════════════════════
  //  Hero 区域
  // ═══════════════════════════════════════
  .hero-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: 20px;
    background: var(--tag-hero-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: 22px;
    padding: 18px 20px;
    overflow: hidden;

    // 右上角装饰光晕
    &::before {
      content: '';
      position: absolute;
      top: -60px;
      right: -40px;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--resource-tag-color) 8%, transparent) 0%,
        transparent 70%
      );
      pointer-events: none;
    }
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 10px;

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
    }

    p {
      margin: 0;
      max-width: 640px;
      font-size: 14px;
      line-height: 1.7;
      opacity: @opacity-primary;
    }
  }

  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--resource-tag-color);
  }

  .hero-actions {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: stretch;
  }

  .hero-search {
    width: 100%;
  }

  .hero-btns {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  // ═══════════════════════════════════════
  //  统计卡片
  // ═══════════════════════════════════════
  .hero-stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .stat-card {
    border-radius: @radius-card;
    padding: 11px 14px;
    background: var(--tag-stat-bg);
    border: 1px solid var(--workbench-border-color);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
    }
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07);
  }

  .stat-card--tag::before {
    background: var(--resource-tag-color);
  }
  .stat-card--bookmark::before {
    background: var(--resource-bookmark-color);
  }
  .stat-card--note::before {
    background: var(--resource-note-color);
  }
  .stat-card--file::before {
    background: var(--resource-file-color);
  }

  .stat-label {
    font-size: 12px;
    opacity: @opacity-secondary;
  }

  .stat-value {
    margin-top: 4px;
    font-size: 22px;
    font-weight: 700;
  }

  .stat-desc {
    margin-top: 4px;
    font-size: 12px;
    opacity: @opacity-secondary;
  }

  // ═══════════════════════════════════════
  //  内容布局
  // ═══════════════════════════════════════
  .content-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 18px;
    margin-top: 22px;
    min-height: 0;
  }

  .filter-panel,
  .result-panel {
    background: var(--tag-panel-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: @radius-card;
  }

  .filter-panel {
    padding: 16px;
    height: fit-content;
    position: sticky;
    top: 0;
  }

  .filter-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: @opacity-secondary;
    margin-bottom: 10px;
    padding: 0 4px;
  }

  .filter-item {
    width: 100%;
    border: 0;
    border-radius: @radius-sm;
    background: transparent;
    color: inherit;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .filter-item + .filter-item {
    margin-top: 4px;
  }

  .filter-item:hover {
    background: color-mix(in srgb, var(--resource-tag-color) @color-mix-hover, var(--tag-muted-bg));
  }

  .filter-item.active {
    background: color-mix(in srgb, var(--resource-tag-color) @color-mix-active, var(--tag-muted-bg));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 20%, transparent);
  }

  .filter-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .filter-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--resource-tag-color);
  }

  .filter-dot--bookmark {
    background: var(--resource-bookmark-color);
  }
  .filter-dot--note {
    background: var(--resource-note-color);
  }
  .filter-dot--file {
    background: var(--resource-file-color);
  }
  .filter-dot--empty {
    background: #94a3b8;
  }

  .filter-count {
    font-size: 12px;
    opacity: @opacity-secondary;
    font-variant-numeric: tabular-nums;
  }

  // ═══════════════════════════════════════
  //  结果面板
  // ═══════════════════════════════════════
  .result-panel {
    padding: 20px;
    min-width: 0;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }

  .view-switch {
    display: inline-flex;
    border: 1px solid var(--workbench-border-color);
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .view-btn {
    border: 0;
    cursor: pointer;
    font: inherit;
    color: inherit;
    padding: 6px 12px;
    background: transparent;
  }

  .view-btn.active {
    background: var(--resource-tag-color);
    color: #fff;
  }

  .result-title {
    font-size: 20px;
    font-weight: 700;
  }

  .result-subtitle {
    margin-top: 4px;
    font-size: 13px;
    opacity: @opacity-primary;
  }

  // ═══════════════════════════════════════
  //  标签卡片
  // ═══════════════════════════════════════
  .tag-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  // ═══════════════════════════════════════
  //  列表视图(紧凑横向行)
  // ═══════════════════════════════════════
  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tag-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--workbench-border-color);
    background: var(--tag-card-bg);
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .tag-row:hover {
    border-color: color-mix(in srgb, var(--resource-tag-color) 30%, var(--workbench-border-color));
    box-shadow: 0 4px 14px -6px rgba(0, 0, 0, 0.12);
  }

  .tag-row-icon {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 12%, transparent);
    font-size: 15px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .tag-row-name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 30%;
    flex-shrink: 0;
  }

  .tag-row-summary {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    opacity: @opacity-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-row-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 0.2s ease;
  }

  .tag-row:hover .tag-row-actions {
    opacity: 1;
  }

  .tag-card {
    position: relative;
    cursor: pointer;
    border-radius: @radius-card;
    padding: 0;
    background: var(--tag-card-bg);
    border: 1px solid var(--workbench-border-color);
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    transition:
      box-shadow 0.3s ease,
      border-color 0.3s ease,
      transform 0.3s ease;

    // 顶部渐变光晕
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(
        90deg,
        var(--resource-tag-color),
        color-mix(in srgb, var(--resource-tag-color) 50%, transparent)
      );
      opacity: 0.6;
      transition: opacity 0.3s ease;
    }

    &:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 36px -8px rgba(0, 0, 0, 0.1);
      border-color: color-mix(in srgb, var(--resource-tag-color) 30%, var(--workbench-border-color));

      &::before {
        opacity: 1;
      }
    }
  }

  // 卡片头部略缩进
  .tag-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 18px 18px 14px;
  }

  .tag-identity {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .tag-icon-wrap {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--resource-tag-color);
    font-size: 22px;
    flex-shrink: 0;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
    transition:
      transform 0.3s ease,
      background 0.3s ease;
  }

  .tag-card:hover .tag-icon-wrap {
    transform: scale(1.05);
  }

  .tag-meta {
    min-width: 0;
  }

  .tag-name {
    font-size: 17px;
    font-weight: 700;
    word-break: break-word;
  }

  .tag-summary {
    margin-top: 4px;
    font-size: 12px;
    opacity: @opacity-primary;
  }

  .tag-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 0.25s ease;
  }

  .tag-card:hover .tag-actions {
    opacity: 1;
  }

  .action-btn {
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--tag-muted-bg) 60%, transparent);
    color: inherit;
    border-radius: @radius-xs;
    height: 30px;
    padding: 0 9px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.18s ease;
  }

  .action-btn:hover {
    background: color-mix(in srgb, var(--resource-tag-color) @color-mix-hover, var(--tag-muted-bg));
    border-color: color-mix(in srgb, var(--resource-tag-color) 20%, transparent);
  }

  .action-btn--danger:hover {
    background: color-mix(in srgb, #ef4444 @color-mix-hover, var(--tag-muted-bg));
    border-color: color-mix(in srgb, #ef4444 20%, transparent);
    color: #ef4444;
  }

  // ═══════════════════════════════════════
  //  区块（相关标签 / 关联内容）
  // ═══════════════════════════════════════
  .section-block {
    padding: 0 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-block + .section-block {
    border-top: 1px solid var(--workbench-border-color);
    padding-top: 14px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    display: flex;
    align-items: center;
    gap: 6px;

    &::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--resource-tag-color);
      opacity: 0.5;
    }
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .common-chip,
  .resource-chip {
    border-radius: 999px;
    padding: 5px 11px;
    font-size: 12px;
    line-height: 1.4;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .common-chip {
    background: color-mix(in srgb, var(--resource-tag-color) 10%, var(--tag-muted-bg));
    color: var(--resource-tag-color);
    transition: background 0.2s ease;
  }

  .common-chip:hover {
    background: color-mix(in srgb, var(--resource-tag-color) 16%, var(--tag-muted-bg));
  }

  .resource-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .resource-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .resource-row__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .resource-row__label--bookmark {
    color: var(--resource-bookmark-color);
  }
  .resource-row__label--note {
    color: var(--resource-note-color);
  }
  .resource-row__label--file {
    color: var(--resource-file-color);
  }

  .resource-chip {
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;
  }

  .resource-chip:hover {
    filter: brightness(1.12);
    transform: translateY(-1px);
  }

  .resource-chip--bookmark {
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 18%, transparent);
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 7%, transparent);
  }

  .resource-chip--note {
    border-color: color-mix(in srgb, var(--resource-note-color) 18%, transparent);
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 7%, transparent);
  }

  .resource-chip--file {
    border-color: color-mix(in srgb, var(--resource-file-color) 18%, transparent);
    color: var(--resource-file-color);
    background: color-mix(in srgb, var(--resource-file-color) 7%, transparent);
  }

  .empty-inline {
    font-size: 12px;
    opacity: @opacity-secondary;
  }

  // ═══════════════════════════════════════
  //  空状态
  // ═══════════════════════════════════════
  .empty-state {
    min-height: 420px;
    border-radius: @radius-card;
    border: 1px dashed color-mix(in srgb, var(--resource-tag-color) 22%, var(--workbench-border-color));
    background: linear-gradient(180deg, color-mix(in srgb, var(--resource-tag-color) 4%, transparent), transparent);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    h3 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
    }

    p {
      margin: 10px 0 0;
      max-width: 420px;
      font-size: 14px;
      line-height: 1.7;
      opacity: @opacity-primary;
    }
  }

  .empty-orbit {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    margin-bottom: 20px;
    border: 3px solid color-mix(in srgb, var(--resource-tag-color) 14%, transparent);
    border-top-color: var(--resource-tag-color);
    animation: empty-spin 1.2s linear infinite;
  }

  @keyframes empty-spin {
    to {
      transform: rotate(360deg);
    }
  }

  // ═══════════════════════════════════════
  //  响应式
  // ═══════════════════════════════════════
  @media (max-width: 1280px) {
    .hero-card {
      grid-template-columns: 1fr;
    }

    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .content-layout {
      grid-template-columns: 1fr;
    }

    .filter-panel {
      position: static;
    }

    .tag-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
