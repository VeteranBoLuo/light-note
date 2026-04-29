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
          </div>

          <div v-if="visibleTags.length" class="tag-grid">
            <article v-for="tag in visibleTags" :key="tag.id" class="tag-card">
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
                  <button class="action-btn" @click="edit(tag.id)">
                    <svg-icon :src="icon.table_edit" size="15" />
                    <span>{{ t('common.edit') }}</span>
                  </button>
                  <button class="action-btn action-btn--danger" @click="handleDeleteTag(tag)">
                    <svg-icon :src="icon.table_delete" size="15" />
                    <span>{{ t('common.delete') }}</span>
                  </button>
                </div>
              </div>

              <div class="resource-stats">
                <div class="resource-stat resource-stat--bookmark">
                  <span class="resource-stat__label">{{ t('tagManage.bookmark') }}</span>
                  <span class="resource-stat__value">{{ tag.bookmarkList?.length || 0 }}</span>
                </div>
                <div class="resource-stat resource-stat--note">
                  <span class="resource-stat__label">{{ t('tagManage.note') }}</span>
                  <span class="resource-stat__value">{{ tag.noteList?.length || 0 }}</span>
                </div>
                <div class="resource-stat resource-stat--file">
                  <span class="resource-stat__label">{{ t('tagManage.file') }}</span>
                  <span class="resource-stat__value">{{ tag.fileList?.length || 0 }}</span>
                </div>
              </div>

              <div class="section-block">
                <div class="section-title">{{ t('tagManage.relatedTag') }}</div>
                <div v-if="tag.relatedTagList?.length" class="chip-list">
                  <span v-for="related in tag.relatedTagList" :key="related.id" class="common-chip">
                    {{ related.name }}
                  </span>
                </div>
                <div v-else class="empty-inline">{{ t('tagManage.noRelatedTags') }}</div>
              </div>

              <div class="section-block">
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
                        @click="openPage(bookmarkItem.url)"
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
                        @click="openNote(noteItem.id)"
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
                        @click="previewFile(fileItem.id)"
                      >
                        {{ fileItem.name }}
                      </button>
                    </div>
                  </div>

                  <div v-if="!getTotalResourceCount(tag)" class="empty-inline">{{
                    t('tagManage.noRelatedContent')
                  }}</div>
                </div>
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
  import { message } from 'ant-design-vue';
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
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${tag.name}】？`,
      onOk() {
        apiBasePost('/api/bookmark/delTag', { id: tag.id }).then((res) => {
          if (res.status == 200) {
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
        userId: localStorage.getItem('userId'),
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
  .tag-manage-page {
    --tag-hero-bg: linear-gradient(135deg, var(--background-color), var(--menu-body-bg-color));
    --tag-stat-bg: rgba(255, 255, 255, 0.52);
    --tag-panel-bg: var(--background-color);
    --tag-card-bg: var(--menu-body-bg-color);
    --tag-card-shadow: rgba(20, 20, 43, 0.14);
    --tag-muted-bg: var(--bl-input-noBorder-bg-color);

    height: 100%;
    overflow: auto;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .tag-manage-page--night {
    --tag-hero-bg: linear-gradient(135deg, #25272d, #303033);
    --tag-stat-bg: #30333b;
    --tag-panel-bg: #262629;
    --tag-card-bg: #303033;
    --tag-card-shadow: rgba(0, 0, 0, 0.36);
    --tag-muted-bg: #35363d;
  }

  .hero-card {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: 20px;
    background: var(--tag-hero-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: 26px;
    padding: 24px;
    box-shadow: 0 24px 48px -36px var(--tag-card-shadow);
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 10px;

    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.1;
    }

    p {
      margin: 0;
      max-width: 640px;
      font-size: 14px;
      line-height: 1.7;
      opacity: 0.78;
    }
  }

  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
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

  .hero-stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .stat-card {
    border-radius: 18px;
    padding: 16px 18px;
    background: var(--tag-stat-bg);
    border: 1px solid var(--workbench-border-color);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  .stat-label {
    font-size: 12px;
    opacity: 0.72;
  }

  .stat-value {
    margin-top: 10px;
    font-size: 30px;
    font-weight: 700;
  }

  .stat-desc {
    margin-top: 6px;
    font-size: 12px;
    opacity: 0.64;
  }

  .stat-card--tag {
    border-color: color-mix(in srgb, var(--resource-tag-color) 42%, var(--workbench-border-color));
  }

  .stat-card--bookmark {
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 42%, var(--workbench-border-color));
  }

  .stat-card--note {
    border-color: color-mix(in srgb, var(--resource-note-color) 42%, var(--workbench-border-color));
  }

  .stat-card--file {
    border-color: color-mix(in srgb, var(--resource-file-color) 42%, var(--workbench-border-color));
  }

  .content-layout {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 18px;
    margin-top: 22px;
    min-height: 0;
  }

  .filter-panel,
  .result-panel {
    background: var(--tag-panel-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: 24px;
    box-shadow: 0 24px 48px -36px var(--tag-card-shadow);
  }

  .filter-panel {
    padding: 18px;
    height: fit-content;
    position: sticky;
    top: 0;
  }

  .filter-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .filter-item {
    width: 100%;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: inherit;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-item + .filter-item {
    margin-top: 8px;
  }

  .filter-item:hover,
  .filter-item.active {
    background: color-mix(in srgb, var(--resource-tag-color) 12%, var(--tag-muted-bg));
  }

  .filter-item.active {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 36%, transparent);
  }

  .filter-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .filter-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
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
    opacity: 0.6;
  }

  .result-panel {
    padding: 20px;
    min-width: 0;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .result-title {
    font-size: 20px;
    font-weight: 700;
  }

  .result-subtitle {
    margin-top: 6px;
    font-size: 13px;
    opacity: 0.68;
  }

  .tag-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .tag-card {
    border-radius: 20px;
    padding: 18px;
    background: var(--tag-card-bg);
    border: 1px solid var(--workbench-border-color);
    box-shadow: 0 20px 40px -34px var(--tag-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .tag-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .tag-identity {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .tag-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--resource-tag-color) 16%, var(--tag-muted-bg));
    color: var(--resource-tag-color);
    font-size: 20px;
    flex-shrink: 0;
  }

  .tag-meta {
    min-width: 0;
  }

  .tag-name {
    font-size: 18px;
    font-weight: 700;
    word-break: break-word;
  }

  .tag-summary {
    margin-top: 6px;
    font-size: 12px;
    opacity: 0.68;
  }

  .tag-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .action-btn {
    border: 1px solid var(--workbench-border-color);
    background: transparent;
    color: inherit;
    border-radius: 12px;
    height: 34px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: color-mix(in srgb, var(--resource-tag-color) 10%, var(--tag-muted-bg));
    border-color: color-mix(in srgb, var(--resource-tag-color) 36%, var(--workbench-border-color));
  }

  .action-btn--danger:hover {
    background: color-mix(in srgb, #ef4444 10%, var(--tag-muted-bg));
    border-color: color-mix(in srgb, #ef4444 34%, var(--workbench-border-color));
  }

  .resource-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .resource-stat {
    border-radius: 14px;
    padding: 12px;
    background: color-mix(in srgb, var(--tag-muted-bg) 92%, transparent);
    border: 1px solid var(--workbench-border-color);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .resource-stat--bookmark {
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 36%, var(--workbench-border-color));
  }

  .resource-stat--note {
    border-color: color-mix(in srgb, var(--resource-note-color) 36%, var(--workbench-border-color));
  }

  .resource-stat--file {
    border-color: color-mix(in srgb, var(--resource-file-color) 36%, var(--workbench-border-color));
  }

  .resource-stat__label {
    font-size: 12px;
    opacity: 0.68;
  }

  .resource-stat__value {
    font-size: 20px;
    font-weight: 700;
  }

  .section-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .common-chip,
  .resource-chip {
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    line-height: 1.2;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .common-chip {
    background: color-mix(in srgb, var(--resource-tag-color) 12%, var(--tag-muted-bg));
    color: var(--resource-tag-color);
  }

  .resource-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .resource-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .resource-row__label {
    font-size: 12px;
    font-weight: 700;
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
  }

  .resource-chip--bookmark {
    border-color: color-mix(in srgb, var(--resource-bookmark-color) 28%, transparent);
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 9%, transparent);
  }

  .resource-chip--note {
    border-color: color-mix(in srgb, var(--resource-note-color) 28%, transparent);
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 9%, transparent);
  }

  .resource-chip--file {
    border-color: color-mix(in srgb, var(--resource-file-color) 28%, transparent);
    color: var(--resource-file-color);
    background: color-mix(in srgb, var(--resource-file-color) 9%, transparent);
  }

  .empty-inline {
    font-size: 12px;
    opacity: 0.6;
  }

  .empty-state {
    min-height: 420px;
    border-radius: 24px;
    border: 1px dashed color-mix(in srgb, var(--resource-tag-color) 30%, var(--workbench-border-color));
    background: linear-gradient(180deg, color-mix(in srgb, var(--resource-tag-color) 5%, transparent), transparent);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    position: relative;
    overflow: hidden;

    h3 {
      margin: 0;
      font-size: 24px;
    }

    p {
      margin: 12px 0 0;
      max-width: 420px;
      font-size: 14px;
      line-height: 1.7;
      opacity: 0.72;
    }
  }

  .empty-orbit {
    width: 130px;
    height: 130px;
    border-radius: 999px;
    margin-bottom: 18px;
    background:
      radial-gradient(
        circle at center,
        color-mix(in srgb, var(--resource-tag-color) 26%, transparent) 0 26%,
        transparent 27%
      ),
      radial-gradient(
        circle at center,
        transparent 0 54%,
        color-mix(in srgb, var(--resource-tag-color) 18%, transparent) 55% 58%,
        transparent 59%
      ),
      radial-gradient(
        circle at center,
        transparent 0 72%,
        color-mix(in srgb, var(--resource-tag-color) 12%, transparent) 73% 76%,
        transparent 77%
      );
  }

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
