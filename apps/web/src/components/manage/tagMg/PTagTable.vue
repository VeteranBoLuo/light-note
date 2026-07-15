<template>
  <b-loading :loading="loading">
    <CommonContainer :title="t('tagManage.title')">
      <div class="mobile-tag-page">
        <section class="mobile-overview">
          <div>
            <strong>{{ overview.tag }}</strong>
            <span>{{ t('tagManage.statTotal') }}</span>
          </div>
          <p>
            {{
              t('tagManage.mobileOverview', {
                bookmark: overview.bookmark,
                note: overview.note,
                file: overview.file,
              })
            }}
          </p>
        </section>

        <div class="mobile-search-row">
          <b-input v-model:value="keyword" class="mobile-search" :placeholder="t('tagManage.searchPlaceholder')">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <b-button type="primary" class="mobile-add" @click="router.push('/manage/editTag/add')">
            {{ t('common.add') }}
          </b-button>
        </div>

        <div class="mobile-filter-row no-scrollbar" :aria-label="t('tagManage.filtersTitle')">
          <b-button
            v-for="filter in filters"
            :key="filter.value"
            size="small"
            class="mobile-filter"
            :class="[`mobile-filter--${filter.value}`, { active: activeFilter === filter.value }]"
            :aria-pressed="activeFilter === filter.value"
            @click="activeFilter = filter.value"
          >
            <span class="filter-dot"></span>
            <span>{{ filter.label }}</span>
            <span class="filter-count">{{ filter.count }}</span>
          </b-button>
        </div>

        <div class="mobile-result-bar">
          <div>
            <strong>{{ t('tagManage.resultTitle') }}</strong>
            <span>{{ resultSubtitle }}</span>
          </div>
          <BSelect v-model:value="sortMode" class="mobile-sort" :options="sortOptions" />
        </div>

        <div v-if="visibleTags.length" class="mobile-tag-list">
          <article
            v-for="tag in visibleTags"
            :key="tag.id"
            class="mobile-tag-card"
            role="button"
            tabindex="0"
            @click="openTagDetail(tag.id)"
            @keydown.enter="openTagDetail(tag.id)"
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
              <span class="detail-arrow" aria-hidden="true">→</span>
            </div>

            <div class="mobile-resource-metrics">
              <span class="mobile-metric mobile-metric--bookmark">
                {{ t('tagManage.bookmarkShort') }} <strong>{{ tag.bookmarkList?.length || 0 }}</strong>
              </span>
              <span class="mobile-metric mobile-metric--note">
                {{ t('tagManage.noteShort') }} <strong>{{ tag.noteList?.length || 0 }}</strong>
              </span>
              <span class="mobile-metric mobile-metric--file">
                {{ t('tagManage.fileShort') }} <strong>{{ tag.fileList?.length || 0 }}</strong>
              </span>
            </div>

            <div v-if="tag.relatedTagList?.length" class="mobile-related">
              <span class="mobile-related-label">{{ t('tagManage.relatedTag') }}</span>
              <span v-for="related in tag.relatedTagList.slice(0, 2)" :key="related.id" class="related-chip">
                {{ related.name }}
              </span>
              <span v-if="tag.relatedTagList.length > 2" class="more-count">+{{ tag.relatedTagList.length - 2 }}</span>
            </div>

            <div class="mobile-card-actions">
              <b-button size="small" class="mobile-action" @click.stop="edit(tag.id)">
                <svg-icon :src="icon.table_edit" size="14" />
                <span>{{ t('common.edit') }}</span>
              </b-button>
              <b-button size="small" class="mobile-action mobile-action--danger" @click.stop="handleDeleteTag(tag)">
                <svg-icon :src="icon.table_delete" size="14" />
                <span>{{ t('common.delete') }}</span>
              </b-button>
            </div>
          </article>
        </div>

        <div v-else class="mobile-empty">
          <div class="empty-symbol">#</div>
          <strong>{{ t('tagManage.emptyTitle') }}</strong>
          <span>{{ t('tagManage.emptyDesc') }}</span>
          <b-button v-if="!keyword" type="primary" @click="router.push('/manage/editTag/add')">
            {{ t('tagManage.createTag') }}
          </b-button>
        </div>
      </div>
    </CommonContainer>
  </b-loading>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { getTotalResourceCount, type TagFilterValue, type TagRecord, useTagManage } from './useTagManage';

  const { t } = useI18n();
  const { loading, keyword, activeFilter, sortMode, filterCounts, visibleTags, overview, reload } = useTagManage();

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

  function edit(id: string) {
    router.push({ path: `/manage/editTag/${id}` });
  }

  function openTagDetail(id: string) {
    router.push({ path: `/tag/${id}` });
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
          reload();
        });
      },
    });
  }

  reload();
</script>

<style lang="less" scoped>
  .mobile-tag-page {
    --mobile-tag-card-bg: var(--menu-body-bg-color);
    --mobile-tag-muted-bg: var(--bl-input-noBorder-bg-color);

    min-height: 100%;
    padding-bottom: 22px;
    color: var(--text-color);
  }

  .mobile-overview {
    padding: 14px 15px;
    border: 1px solid color-mix(in srgb, var(--resource-tag-color) 18%, var(--workbench-border-color));
    border-radius: 15px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--resource-tag-color) 8%, transparent), transparent);

    div {
      display: flex;
      align-items: baseline;
      gap: 7px;
    }

    strong {
      font-size: 24px;
      color: var(--resource-tag-color);
    }

    span,
    p {
      color: var(--sub-text-color);
      font-size: 12px;
    }

    p {
      margin: 6px 0 0;
      line-height: 1.55;
    }
  }

  .mobile-search-row {
    display: flex;
    gap: 9px;
    margin-top: 12px;
  }

  .mobile-search {
    flex: 1;
    min-width: 0;
  }

  .mobile-add {
    flex-shrink: 0;
  }

  .mobile-filter-row {
    display: flex;
    gap: 7px;
    margin: 11px 0 0;
    padding-bottom: 7px;
    overflow-x: auto;
  }

  .mobile-filter {
    flex-shrink: 0;
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

  .mobile-tag-card {
    border: 1px solid var(--workbench-border-color);
    border-radius: 14px;
    background: var(--mobile-tag-card-bg);
    overflow: hidden;
    transition:
      border-color 0.2s ease,
      transform 0.2s ease;

    &:active {
      transform: scale(0.995);
      border-color: color-mix(in srgb, var(--resource-tag-color) 30%, var(--workbench-border-color));
    }
  }

  .mobile-tag-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 12px 9px;
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
    background: color-mix(in srgb, var(--resource-tag-color) 9%, var(--mobile-tag-muted-bg));
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

  .detail-arrow {
    color: var(--resource-tag-color);
    font-size: 17px;
  }

  .mobile-resource-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 0 12px 9px;
  }

  .mobile-metric {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    padding: 6px 8px;
    border-radius: 8px;
    color: var(--sub-text-color);
    background: var(--mobile-tag-muted-bg);
    font-size: 10px;
  }

  .mobile-metric--bookmark strong {
    color: var(--resource-bookmark-color);
  }

  .mobile-metric--note strong {
    color: var(--resource-note-color);
  }

  .mobile-metric--file strong {
    color: var(--resource-file-color);
  }

  .mobile-related {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 0 12px 9px;
    overflow: hidden;
  }

  .mobile-related-label {
    flex-shrink: 0;
    color: var(--sub-text-color);
    font-size: 10px;
  }

  .related-chip,
  .more-count {
    min-width: 0;
    height: 22px;
    display: inline-flex;
    align-items: center;
    padding: 0 7px;
    border-radius: 999px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }

  .related-chip {
    max-width: 100px;
    color: var(--resource-tag-color);
    background: color-mix(in srgb, var(--resource-tag-color) 9%, var(--mobile-tag-muted-bg));
  }

  .more-count {
    flex-shrink: 0;
    color: var(--sub-text-color);
    background: var(--mobile-tag-muted-bg);
  }

  .mobile-card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid var(--workbench-border-color);
  }

  .mobile-action {
    gap: 4px;
    border-radius: 8px;
  }

  .mobile-action--danger:hover {
    color: #ef4444;
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
