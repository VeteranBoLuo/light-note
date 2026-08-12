<template>
  <section class="archive-preview" :aria-label="t('cloudSpace.previewPanel.archiveTitle')">
    <div class="archive-toolbar">
      <div class="archive-search">
        <BInput
          v-model:value="searchInput"
          clearable
          :placeholder="t('cloudSpace.previewPanel.archiveSearchPlaceholder')"
          @enter="applySearch"
        />
        <BButton type="primary" :loading="loading" @click="applySearch">
          {{ t('common.search') }}
        </BButton>
      </div>
      <div class="archive-summary">
        <span>{{ t('cloudSpace.previewPanel.archiveEntryCount', { count: summary.entryCount }) }}</span>
        <span>{{ formatSize(summary.totalUncompressedSize) }}</span>
      </div>
    </div>

    <div
      v-if="summary.containsEncrypted || summary.suspiciousExpansion || summary.skippedUnsafeEntries"
      class="archive-warning"
    >
      <SvgIcon :src="icon.common.important" size="18" />
      <span v-if="summary.containsEncrypted">{{ t('cloudSpace.previewPanel.archiveEncryptedNotice') }}</span>
      <span v-if="summary.suspiciousExpansion">{{ t('cloudSpace.previewPanel.archiveExpansionNotice') }}</span>
      <span v-if="summary.skippedUnsafeEntries">
        {{ t('cloudSpace.previewPanel.archiveUnsafeEntries', { count: summary.skippedUnsafeEntries }) }}
      </span>
    </div>

    <nav v-if="!activeQuery" class="archive-breadcrumbs" :aria-label="t('cloudSpace.previewPanel.archivePath')">
      <BButton size="small" class="archive-breadcrumb" @click="openDirectory('')">
        <SvgIcon :src="icon.common.folder" size="17" />
        {{ t('cloudSpace.previewPanel.archiveRoot') }}
      </BButton>
      <template v-for="crumb in breadcrumbs" :key="crumb.path">
        <span class="archive-separator">/</span>
        <BButton size="small" class="archive-breadcrumb" @click="openDirectory(crumb.path)">
          {{ crumb.name }}
        </BButton>
      </template>
    </nav>

    <div v-if="activeQuery" class="archive-search-state">
      <span>{{ t('cloudSpace.previewPanel.archiveSearchResults', { query: activeQuery, count: total }) }}</span>
      <BButton size="small" @click="clearSearch">{{ t('common.clear') }}</BButton>
    </div>

    <div v-if="loading && !items.length" class="archive-loading">
      <BLoading inline loading :title="t('cloudSpace.previewPanel.archiveLoading')" />
    </div>
    <div v-else-if="!items.length" class="archive-empty">
      {{ t('cloudSpace.previewPanel.archiveEmpty') }}
    </div>
    <div v-else v-auto-scrollbar class="archive-list">
      <div v-for="entry in items" :key="entry.path" class="archive-entry">
        <SvgIcon
          :src="entry.isDirectory ? icon.common.folder : icon.cloudSpace.fileIcon.other"
          size="22"
          class="archive-entry-icon"
        />
        <div class="archive-entry-main">
          <BButton
            v-if="entry.isDirectory && !activeQuery"
            class="archive-entry-action"
            :title="entry.path"
            @click="openDirectory(entry.path)"
          >
            {{ entry.name }}
          </BButton>
          <span v-else class="archive-entry-name" :title="entry.path">{{ activeQuery ? entry.path : entry.name }}</span>
          <span class="archive-entry-meta">
            {{ entry.isDirectory ? t('cloudSpace.folder') : formatSize(entry.size) }}
            <template v-if="entry.encrypted"> · {{ t('cloudSpace.previewPanel.archiveEncryptedEntry') }}</template>
          </span>
        </div>
      </div>
      <div v-if="nextOffset !== null" class="archive-load-more">
        <BButton :loading="loadingMore" @click="loadMore">{{ t('common.loadMore') }}</BButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import {
    listOwnedArchivePreview,
    listSharedArchivePreview,
    type ArchivePreviewEntry,
    type ArchivePreviewSummary,
  } from '@/api/filePreviewApi.ts';

  const props = defineProps<{
    fileId: string;
    previewTicket?: string;
  }>();
  const emit = defineEmits<{ error: [error: unknown] }>();
  const { t } = useI18n();
  const directory = ref('');
  const searchInput = ref('');
  const activeQuery = ref('');
  const items = ref<ArchivePreviewEntry[]>([]);
  const summary = ref<ArchivePreviewSummary>({
    entryCount: 0,
    totalUncompressedSize: 0,
    containsEncrypted: false,
    suspiciousExpansion: false,
    skippedUnsafeEntries: 0,
  });
  const total = ref(0);
  const nextOffset = ref<number | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  let requestId = 0;

  const breadcrumbs = computed(() => {
    const parts = directory.value.split('/').filter(Boolean);
    return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }));
  });

  function formatSize(bytes: number) {
    const value = Math.max(0, Number(bytes || 0));
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
  }

  async function requestPage(offset = 0, append = false) {
    const currentRequest = ++requestId;
    if (append) loadingMore.value = true;
    else loading.value = true;
    try {
      const input = {
        directory: activeQuery.value ? '' : directory.value,
        query: activeQuery.value,
        offset,
        limit: 200,
      };
      const page = props.previewTicket
        ? await listSharedArchivePreview(props.previewTicket, input)
        : await listOwnedArchivePreview(props.fileId, input);
      if (currentRequest !== requestId) return;
      items.value = append ? [...items.value, ...page.items] : page.items;
      summary.value = page.summary;
      total.value = page.total;
      nextOffset.value = page.nextOffset;
    } catch (error) {
      if (currentRequest === requestId) emit('error', error);
    } finally {
      if (currentRequest === requestId) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  function openDirectory(path: string) {
    directory.value = path;
    activeQuery.value = '';
    searchInput.value = '';
    void requestPage();
  }

  function applySearch() {
    activeQuery.value = String(searchInput.value || '').trim();
    void requestPage();
  }

  function clearSearch() {
    activeQuery.value = '';
    searchInput.value = '';
    void requestPage();
  }

  function loadMore() {
    if (nextOffset.value === null || loadingMore.value) return;
    void requestPage(nextOffset.value, true);
  }

  watch(
    () => [props.fileId, props.previewTicket],
    () => {
      directory.value = '';
      activeQuery.value = '';
      searchInput.value = '';
      items.value = [];
      void requestPage();
    },
  );
  onMounted(() => void requestPage());
</script>

<style scoped lang="less">
  .archive-preview {
    width: min(1080px, calc(100% - 32px));
    height: min(760px, calc(100% - 32px));
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    color: var(--text-color);
  }

  .archive-toolbar,
  .archive-search,
  .archive-summary,
  .archive-breadcrumbs,
  .archive-search-state,
  .archive-warning,
  .archive-entry,
  .archive-entry-meta {
    display: flex;
    align-items: center;
  }

  .archive-toolbar {
    justify-content: space-between;
    gap: 16px;
  }

  .archive-search {
    flex: 1;
    max-width: 520px;
    gap: 8px;
  }

  .archive-summary,
  .archive-entry-meta {
    gap: 10px;
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .archive-warning {
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 9px 12px;
    border: 1px solid var(--warning-color, #d97706);
    border-radius: 8px;
    color: var(--warning-color, #b45309);
    font-weight: 600;
  }

  .archive-breadcrumbs {
    min-width: 0;
    gap: 4px;
    overflow-x: auto;
  }

  .archive-breadcrumb,
  .archive-entry-action {
    gap: 5px;
  }

  .archive-separator {
    color: var(--sub-text-color);
  }

  .archive-search-state {
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .archive-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding-right: 4px;
    border-top: 1px solid var(--surface-border-color);
  }

  .archive-entry {
    min-height: 52px;
    gap: 12px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .archive-entry-icon {
    flex: none;
  }

  .archive-entry-main {
    min-width: 0;
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .archive-entry-action {
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .archive-entry-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archive-loading,
  .archive-empty,
  .archive-load-more {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    color: var(--sub-text-color);
  }

  .archive-loading,
  .archive-empty {
    flex: 1;
  }

  .archive-load-more {
    min-height: 56px;
  }

  @media (max-width: 767px) {
    .archive-preview {
      width: calc(100% - 16px);
      height: calc(100% - 16px);
      padding: 12px;
    }

    .archive-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .archive-entry {
      min-height: 64px;
      gap: 10px;
      padding: 8px 4px;
    }

    .archive-entry-main {
      min-width: 0;
      align-items: center;
      flex-direction: row;
    }

    .archive-summary {
      justify-content: space-between;
    }

    .archive-entry-action,
    .archive-entry-name {
      max-width: 100%;
    }

    .archive-entry-action,
    .archive-breadcrumb {
      min-height: 44px;
    }

    .archive-entry-action {
      min-width: 0;
      max-width: none;
      flex: 1;
      justify-content: flex-start;
      padding: 0 4px;
      border: 0;
      background: transparent;
      text-align: left;
    }

    .archive-entry-meta {
      flex: 0 0 auto;
      justify-content: flex-end;
      white-space: nowrap;
    }
  }
</style>
