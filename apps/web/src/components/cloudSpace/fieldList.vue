<template>
  <div class="field-list">
    <div v-if="viewMode === 'card'" class="card-toolbar">
      <b-input
        v-model:value="cloud.searchFileName"
        :placeholder="$t('cloudSpace.fileName')"
        @input="onSearchInput"
        class="card-search-input"
      >
        <template #suffix>
          <svg-icon class="dom-hover" :src="icon.navigation.search" size="16" @click="cloud.queryFieldList" />
        </template>
      </b-input>
      <div v-if="batchMode" class="batch-actions">
        <b-space :size="10">
          <BCheckbox
            v-if="viewMode === 'card'"
            :indeterminate="indeterminate"
            :checked="selectAll"
            @change="(checked: boolean) => onToggleSelectAll({ target: { checked } })"
            class="batch-select-all"
          />
          <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
          <b-button size="small" type="danger" @click="handleBatchDelete">{{ $t('cloudSpace.batchDelete') }}</b-button>
          <b-button
            size="small"
            type="primary"
            @click="handleBatchMove"
            v-click-log="{ module: '云空间', operation: '点击批量移动文件' }"
            >{{ $t('cloudSpace.batchMove') }}</b-button
          >
          <b-button size="small" type="success" :loading="batchDownloadLoading" @click="handleBatchDownload">
            {{ $t('cloudSpace.batchDownload') }}
          </b-button>
        </b-space>
      </div>
    </div>
    <div v-if="viewMode === 'card'" class="file-card-grid">
      <article
        v-for="item in cloud.fileList"
        :key="item.id"
        class="file-card"
        :class="{ 'file-card--batch': batchMode, 'file-card--selected': batchMode && selectedRows.includes(item.id) }"
        @click="onCardClick(item)"
      >
        <div class="file-card-cover">
          <span v-if="batchMode" class="card-checkbox" @click.stop>
            <b-checkbox
              :checked="selectedRows.includes(item.id)"
              @update:checked="(val: boolean) => toggleRow(item.id, val)"
            />
          </span>
          <img
            v-if="isPreviewableImage(item)"
            :src="item.fileUrl"
            class="file-card-thumb"
            :alt="item.fileName"
            loading="lazy"
            decoding="async"
          />
          <video
            v-else-if="isPreviewableVideo(item)"
            class="file-card-thumb"
            :src="item.fileUrl"
            preload="metadata"
            muted
            playsinline
          />
          <div v-else-if="isTextFile(item)" class="file-card-text-preview">
            <div class="file-card-text-preview-head">{{ getFileTypeLabel(item) }}</div>
            <div
              class="file-card-text-preview-body"
              :class="{ 'file-card-text-preview-body--loading': getTextPreviewState(item.id).loading }"
            >
              {{ getTextPreviewState(item.id).text || '正在加载内容预览...' }}
            </div>
          </div>
          <div v-else class="file-card-placeholder" :class="`file-card-placeholder--${getFileCategory(item)}`">
            <div class="file-card-placeholder-inner">
              <svg-icon :src="icon.cloudSpace.fileIcon[getFileCategory(item)]" size="34" />
              <span>{{ getFilePreviewLabel(item) }}</span>
            </div>
          </div>
          <div v-if="!batchMode" class="file-card-overlay">
            <BTooltip :title="$t('cloudSpace.download')">
              <svg-icon
                class="overlay-btn"
                :src="icon.cloudSpace.download"
                size="18"
                @click.stop="handleDownloadFile(item)"
              />
            </BTooltip>
            <BTooltip :title="$t('common.delete')">
              <svg-icon class="overlay-btn" :src="icon.noteDetail.delete" size="18" @click.stop="handleDelFile(item)" />
            </BTooltip>
          </div>
          <div v-if="!batchMode" class="file-card-more" @click.stop>
            <b-dropdown
              class="card-more-menu"
              :trigger="'click'"
              :menu-options="[
                {
                  label: $t('common.reName'),
                  icon: icon.cloudSpace.rename,
                  function: () => openRenameModal(item),
                },
                {
                  label: $t('cloudSpace.share'),
                  icon: icon.cloudSpace.share,
                  function: () => handleShareFile(item.id, item.fileName, item.fileType, item.shareToken),
                },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', [item]),
                },
                {
                  label: $t('cloudSpace.relateTags'),
                  icon: icon.manage_categoryBtn_tag,
                  function: () => openTagDialog(item),
                },
                {
                  label: $t('inbox.addExisting'),
                  icon: icon.common.more,
                  function: () => addFileToInbox(item),
                },
              ]"
            >
              <BTooltip :title="$t('common.more')">
                <svg-icon class="more-icon" :src="icon.common.more" size="20" />
              </BTooltip>
            </b-dropdown>
          </div>
        </div>
        <div class="file-card-body">
          <div class="file-card-headline">
            <span class="file-card-type" :class="`file-card-type--${getFileCategory(item)}`">{{
              getFileTypeLabel(item)
            }}</span>
            <InboxPendingBadge v-if="item.isPending" />
            <span class="file-card-size">{{ formatFileSize(item.fileSize) }}</span>
          </div>
          <div class="file-card-name" :title="item.fileName">{{ item.fileName }}</div>
          <div class="file-card-meta">
            <span class="meta-label">{{ $t('cloudSpace.uploadTime') }}</span>
            <span class="text-hidden">{{ item.uploadTime || '-' }}</span>
          </div>
          <div class="file-card-meta">
            <span class="meta-label">{{ $t('cloudSpace.relateTags') }}</span>
            <span class="text-hidden">{{
              item.tags?.length ? item.tags.map((tag) => tag.name).join(' / ') : '-'
            }}</span>
          </div>
        </div>
      </article>
    </div>
    <div v-if="downloadProgress.visible" class="download-progress-floating">
      <div class="download-progress-header">
        <div class="download-progress-title">{{ downloadProgress.phaseText }}</div>
        <div class="download-progress-ops">
          <span>{{ downloadProgress.current }}/{{ downloadProgress.total }}</span>
          <BButton size="small" class="download-cancel-btn" @click="cancelBatchDownload">
            {{ $t('common.cancel') }}
          </BButton>
        </div>
      </div>
      <a-progress :percent="downloadProgress.percent" :show-info="false" size="small" />
    </div>
    <div v-if="viewMode === 'table'" class="field-header">
      <div class="flex-align-center-gap" :style="{ width: fieldNameWidth }">
        <span class="field-header-label">{{ $t('cloudSpace.fileName') }}</span>
        <b-input
          v-model:value="cloud.searchFileName"
          :placeholder="$t('cloudSpace.fileName')"
          class="header-search-input"
          height="28px"
          @input="onSearchInput"
        >
          <template #suffix>
            <svg-icon class="dom-hover" :src="icon.navigation.search" size="14" @click="cloud.queryFieldList" />
          </template>
        </b-input>
      </div>
      <div class="default-area" v-if="!bookmark.isMobile">
        <div>{{ $t('cloudSpace.folder') }}</div>
        <div>{{ $t('cloudSpace.relateTags') }}</div>
        <div>{{ $t('cloudSpace.fileSize') }}</div>
        <div> {{ $t('cloudSpace.uploadTime') }} </div>
      </div>
    </div>
    <div
      v-if="viewMode === 'table' && batchMode"
      class="batch-actions"
      style="
        padding: 8px 20px;
        background: var(--table-header-bg-color);
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      "
    >
      <BCheckbox
        :indeterminate="indeterminate"
        :checked="selectAll"
        @change="(checked: boolean) => onToggleSelectAll({ target: { checked } })"
      />
      <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
      <b-button size="small" type="danger" @click="handleBatchDelete">{{ $t('cloudSpace.batchDelete') }}</b-button>
      <b-button
        size="small"
        type="primary"
        @click="handleBatchMove"
        v-click-log="{ module: '云空间', operation: '点击批量移动文件' }"
        >{{ $t('cloudSpace.batchMove') }}</b-button
      >
      <b-button size="small" type="success" :loading="batchDownloadLoading" @click="handleBatchDownload">
        {{ $t('cloudSpace.batchDownload') }}
      </b-button>
    </div>
    <div v-if="viewMode === 'table'" class="file-container">
      <div
        class="field-item"
        :class="{ 'field-item-draggable': canDragFile(item) }"
        :draggable="canDragFile(item)"
        @dragstart="onFileDragStart($event, item)"
        @dragend="onFileDragEnd"
        v-for="(item, index) in cloud.fileList"
        :key="index"
      >
        <div class="flex-align-center" :style="{ position: 'relative', width: fieldNameWidth }">
          <span v-if="batchMode" class="row-checkbox" @click.stop>
            <b-checkbox
              :checked="selectedRows.includes(item.id)"
              @update:checked="(val: boolean) => toggleRow(item.id, val)"
            />
          </span>
          <div
            v-if="!item.isRename"
            class="file-label flex-align-center"
            @click="emit('previewFile', item)"
            v-click-log="{ module: '云空间', operation: `预览文件【${item.fileName}】` }"
          >
            <svg-icon :src="icon.cloudSpace.fileIcon[getFileCategory(item)]" size="20" style="min-width: 20px" />
            <span style="width: 100%" class="text-hidden">{{ item.fileName }}</span>
            <InboxPendingBadge v-if="item.isPending" />
          </div>
          <b-input v-else class="edit-file-input" v-model:value="item.fileName" @click.stop @enter="submitReName(item)">
            <template #suffix>
              <div class="flex-align-center-gap">
                <svg-icon :src="icon.filterPanel.check" size="18" class="dom-hover" @click="submitReName(item)" />
                <svg-icon :src="icon.common.close" size="18" class="dom-hover" @click="cloud.queryFieldList()"
              /></div>
            </template>
          </b-input>
          <div class="flex-align-center handle-btn" v-if="!item.isRename">
            <BTooltip :title="$t('cloudSpace.download')">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.download"
                size="20"
                @click="handleDownloadFile(item)"
              />
            </BTooltip>
            <BTooltip :title="$t('common.reName')" v-if="!bookmark.isMobile">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.rename"
                size="20"
                @click="handleReName(item)"
                v-click-log="{ module: '云空间', operation: `编辑文件名【${item.fileName}】` }"
              />
            </BTooltip>
            <BTooltip :title="$t('cloudSpace.relateTags')">
              <svg-icon
                class="download-icon"
                :src="icon.manage_categoryBtn_tag"
                size="20"
                @click="openTagDialog(item)"
                v-click-log="{ module: '云空间', operation: `打开文件标签配置【${item.fileName}】` }"
              />
            </BTooltip>
            <!-- 删除按钮 -->
            <BTooltip :title="$t('common.delete')">
              <svg-icon class="delete-icon" :src="icon.noteDetail.delete" size="20" @click="handleDelFile(item)" />
            </BTooltip>
            <b-dropdown
              v-if="!bookmark.isMobile"
              :trigger="'click'"
              :menu-options="[
                {
                  label: $t('cloudSpace.share'),
                  icon: icon.cloudSpace.share,
                  function: () => handleShareFile(item.id, item.fileName, item.fileType, item.shareToken),
                },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', [item]),
                },
                {
                  label: $t('inbox.addExisting'),
                  icon: icon.common.more,
                  function: () => addFileToInbox(item),
                },
              ]"
            >
              <svg-icon class="download-icon" :src="icon.common.more" size="20" />
            </b-dropdown>
          </div>
        </div>
        <div class="default-area" v-if="!bookmark.isMobile">
          <div>{{ item.folderName }}</div>
          <div class="file-tags-cell">
            <span v-if="!item.tags?.length" class="file-tags-empty">-</span>
            <div v-else class="file-tags-list">
              <span
                v-for="tag in item.tags"
                :key="tag.id"
                class="file-tag-chip text-hidden dom-hover"
                @click.stop="goToTagDetail(tag.id)"
                v-click-log="{ module: '云空间', operation: `点击文件关联标签【${tag.name}】` }"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>
          <div>{{
            item.fileSize >= 1024 * 1024
              ? Number(item.fileSize / (1024 * 1024))
                  .toFixed(1)
                  .replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' MB'
              : Number(item.fileSize / 1024)
                  .toFixed()
                  .replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' KB'
          }}</div>
          <div v-if="!bookmark.isMobile" class="text-hidden" :title="item.uploadTime">{{ item.uploadTime }} </div>
        </div>
      </div>
    </div>
    <div
      v-if="!cloud.loading && !cloud.fileList.length"
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 64px 20px;
        text-align: center;
        color: var(--text-second-color, #888);
      "
    >
      <div style="font-size: 44px; opacity: 0.7">📁</div>
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-color)">还没有文件</p>
      <p style="margin: 0; font-size: 13px">点下方按钮上传，或直接把文件拖拽到这里</p>
      <BButton
        type="primary"
        @click="triggerUpload"
        style="
          margin-top: 6px;
          border: 0;
          cursor: pointer;
          color: #fff;
          background: #615ced;
          font-size: 14px;
          padding: 8px 18px;
          border-radius: 8px;
        "
      >
        上传文件
      </BButton>
    </div>
    <b-loading :loading="cloud.loading" class="both-center" />

    <b-modal v-model:visible="shareDescVisible" :title="$t('cloudSpace.share')" width="450px" :show-footer="false">
      <div class="share-desc-body">
        <div class="share-desc-tip">{{ $t('cloudSpace.shareDescTip') }}</div>
        <b-input
          type="textarea"
          v-model:value="shareDescValue"
          :maxlength="200"
          :placeholder="$t('cloudSpace.shareDescPlaceholder')"
        />
        <div class="share-desc-actions">
          <b-button :loading="shareSubmitting" type="primary" @click="submitShare">{{
            $t('cloudSpace.share')
          }}</b-button>
          <b-button :disabled="shareSubmitting" @click="closeShareDialog">{{ $t('common.cancel') }}</b-button>
        </div>
      </div>
    </b-modal>

    <FileTagConfig
      v-if="tagModalVisible"
      v-model:visible="tagModalVisible"
      :file="activeTagFile"
      @saved="cloud.queryFieldList"
    />

    <b-modal
      v-model:visible="renameModalVisible"
      :title="$t('common.reName')"
      width="400px"
      :show-footer="false"
      :mask-closable="true"
      @close="renameModalFile = null"
    >
      <div class="rename-modal-field">
        <b-input v-model:value="renameModalValue" class="rename-modal-input" @enter="confirmRename" @click.stop />
        <span v-if="renameModalFile" class="rename-modal-ext">.{{ originalExt }}</span>
      </div>
      <div class="rename-modal-actions">
        <b-button type="primary" @click="confirmRename">{{ $t('common.confirm') }}</b-button>
        <b-button @click="renameModalVisible = false">{{ $t('common.cancel') }}</b-button>
      </div>
    </b-modal>
  </div>
</template>
<script setup lang="ts">
  import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon.ts';
  import { deleteField, downloadField, shareField } from '@/http/common.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { cloneDeep } from 'lodash-es';
  import { debounce } from '@/utils/common';
  import { useI18n } from 'vue-i18n';
  import JSZip from 'jszip';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY, getCloudFileCategory } from '@/constants/cloudFileCategory.ts';
  import { useRouter } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useInboxEnqueue } from '@/composables/useInboxEnqueue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';

  const FileTagConfig = defineAsyncComponent(() => import('@/components/cloudSpace/FileTagConfig.vue'));

  const { t } = useI18n();
  const emit = defineEmits(['previewFile', 'moveField']);

  // 首屏空状态引导:复用 CloudFolder 的隐藏上传 input(桌面端);移动端则靠拖拽/上方入口
  function triggerUpload() {
    const el = document.getElementById('folder-upload-input') as HTMLInputElement | null;
    if (el) el.click();
  }
  const cloud = cloudSpaceStore();
  const bookmark = bookmarkStore();
  const router = useRouter();
  const { addResourcesToInbox } = useInboxEnqueue();
  const props = defineProps<{ clearKey?: number; batchMode: boolean; viewMode?: 'card' | 'table' }>();
  const viewMode = computed(() => props.viewMode ?? 'table');

  const batchMode = computed(() => props.batchMode ?? false);
  function addFileToInbox(file: any) {
    addResourcesToInbox([{ resourceType: 'file', resourceId: String(file.id) }], '云空间');
  }
  const selectedRows = ref<string[]>([]);
  const selectAll = ref(false);
  const hasSelection = computed(() => selectedRows.value.length > 0);
  const indeterminate = computed(
    () => selectedRows.value.length > 0 && selectedRows.value.length < cloud.fileList.length,
  );

  const onToggleSelectAll = (e: any) => {
    const checked = e.target.checked;
    selectAll.value = checked;
    selectedRows.value = checked ? cloud.fileList.map((item) => item.id) : [];
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedRows.value.includes(id)) selectedRows.value.push(id);
    } else {
      selectedRows.value = selectedRows.value.filter((itemId) => itemId !== id);
    }
    selectAll.value = cloud.fileList.length > 0 && selectedRows.value.length === cloud.fileList.length;
  };

  const onCardClick = (item: any) => {
    if (batchMode.value) {
      toggleRow(item.id, !selectedRows.value.includes(item.id));
    } else {
      emit('previewFile', item);
    }
  };

  const goToTagDetail = (tagId: string) => {
    if (!tagId) return;
    router.push(`/tag/${tagId}`);
  };

  const fieldNameWidth = computed(() => {
    if (bookmark.isMobile) {
      return '100%';
    }
    return '42%';
  });

  const shareDescVisible = ref(false);
  const shareDescValue = ref('');
  const shareSubmitting = ref(false);
  const shareTarget = ref<{ id: string; fileName?: string; fileType?: string } | null>(null);
  const batchDownloadLoading = ref(false);
  const batchDownloadAbortController = ref<AbortController | null>(null);
  const batchDownloadCancelled = ref(false);
  const tagModalVisible = ref(false);
  const activeTagFile = ref<any>(null);
  const renameModalVisible = ref(false);
  const renameModalFile = ref<any>(null);
  const renameModalValue = ref('');
  const downloadProgress = ref({
    visible: false,
    percent: 0,
    current: 0,
    total: 0,
    phaseText: '',
  });

  const getFileCategory = (file: { category?: string }) => getCloudFileCategory(file);
  const onSearchInput = debounce(() => cloud.queryFieldList(), 500);
  const getFileTypeLabel = (file: { category?: string }) => t(CLOUD_FILE_CATEGORY_LABEL_KEY[getFileCategory(file)]);
  const TEXT_PREVIEW_CHAR_LIMIT = 180;
  const TEXT_PREVIEW_LOAD_MAX = 32;
  const textPreviewMap = ref<Record<string, { loading: boolean; text: string }>>({});
  const textPreviewTaskMap = new Map<string, Promise<void>>();

  function formatFileSize(bytes: number): string {
    if (!bytes || bytes < 0) return '0 KB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  function isPreviewableImage(file: any): boolean {
    return getFileCategory(file) === 'image' && !!file.fileUrl;
  }

  function isPreviewableVideo(file: any): boolean {
    return getFileCategory(file) === 'video' && !!file.fileUrl;
  }

  function isTextFile(file: any): boolean {
    return getFileCategory(file) === 'text' && !!file?.fileUrl;
  }

  function getFilePreviewLabel(file: any): string {
    const ext = getFileExt(String(file?.fileName || '')).toUpperCase();
    return ext || getFileTypeLabel(file);
  }

  function normalizePreviewText(raw: string): string {
    const compact = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!compact) return '（文本内容为空）';
    if (compact.length <= TEXT_PREVIEW_CHAR_LIMIT) return compact;
    return compact.slice(0, TEXT_PREVIEW_CHAR_LIMIT) + '...';
  }

  async function readTextSnippet(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }
    if (!response.body) {
      const text = await response.text();
      return normalizePreviewText(text);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let content = '';
    const readLimit = TEXT_PREVIEW_CHAR_LIMIT + 80;
    while (content.length < readLimit) {
      const { done, value } = await reader.read();
      if (done) break;
      content += decoder.decode(value, { stream: true });
      if (content.length >= readLimit) {
        await reader.cancel();
        break;
      }
    }
    content += decoder.decode();
    return normalizePreviewText(content);
  }

  async function ensureTextPreview(file: any) {
    if (!isTextFile(file)) return;
    const key = String(file.id || '');
    if (!key) return;
    if (textPreviewMap.value[key] && !textPreviewMap.value[key].loading) return;
    if (textPreviewTaskMap.has(key)) return;

    textPreviewMap.value[key] = { loading: true, text: '' };
    const task = (async () => {
      try {
        const text = await readTextSnippet(String(file.fileUrl || ''));
        textPreviewMap.value[key] = { loading: false, text };
      } catch (error) {
        textPreviewMap.value[key] = { loading: false, text: '内容预览加载失败' };
      } finally {
        textPreviewTaskMap.delete(key);
      }
    })();

    textPreviewTaskMap.set(key, task);
    await task;
  }

  async function warmupTextPreviews() {
    if (viewMode.value !== 'card' || batchMode.value) return;
    const targets = cloud.fileList.filter((item) => isTextFile(item)).slice(0, TEXT_PREVIEW_LOAD_MAX);
    for (const item of targets) {
      await ensureTextPreview(item);
    }
  }

  function getTextPreviewState(fileId: string | number) {
    return textPreviewMap.value[String(fileId)] || { loading: false, text: '' };
  }

  watch(
    () => cloud.fileList,
    (list) => {
      // 当列表刷新时，同步全选状态，移除已不存在的选项
      const ids = list.map((item) => item.id);
      selectedRows.value = selectedRows.value.filter((id) => ids.includes(id));
      selectAll.value = list.length > 0 && selectedRows.value.length === list.length;

      const idSet = new Set(ids.map((id) => String(id)));
      Object.keys(textPreviewMap.value).forEach((key) => {
        if (!idSet.has(key)) {
          delete textPreviewMap.value[key];
          textPreviewTaskMap.delete(key);
        }
      });
    },
    { deep: true },
  );

  watch(
    () => [viewMode.value, batchMode.value, cloud.fileList.map((item) => String(item.id)).join(',')],
    () => {
      warmupTextPreviews();
    },
    { immediate: true },
  );

  watch(
    () => props.clearKey,
    () => {
      selectedRows.value = [];
      selectAll.value = false;
    },
  );

  watch(
    () => props.batchMode,
    (val) => {
      if (!val) {
        selectedRows.value = [];
        selectAll.value = false;
      }
    },
  );

  const getFileExt = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return '';
    return name.slice(lastDot + 1);
  };

  const getFileBaseName = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return name;
    return name.slice(0, lastDot);
  };

  function submitReName(file) {
    const baseName = String(file.fileName || '').trim();
    const nextName = originalExt.value ? `${baseName}.${originalExt.value}` : baseName;
    updateFileName(file, nextName);
  }

  function updateFileName(file, nextName: string) {
    if (blockGuestWrite('rename-file')) return Promise.resolve(false);
    if (nextName === originalName.value) {
      file.isRename = false;
      return Promise.resolve(false);
    }
    return apiBasePost('/api/file/updateFile', {
      id: file.id,
      fileName: nextName,
    }).then((res) => {
      if (res.status === 200) {
        file.isRename = false;
        file.fileName = nextName;
        if (cloud.searchFileName === originalName.value) {
          cloud.searchFileName = nextName;
        }
        recordOperation({ module: '云空间', operation: `重命名文件成功【${nextName}】` });
        message.success(t('cloudSpace.renameSuccess'));
        cloud.queryFieldList();
        return true;
      } else {
        // 后端返回错误（如已存在同名文件），不做任何 UI 改变，用户直接在输入框继续改
        return false;
      }
    });
  }
  function handleDelFile(file) {
    if (blockGuestWrite('delete-file')) return;
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('cloudSpace.confirmDelete'),
      onOk() {
        deleteField(file.id).then((success) => {
          if (success) {
            recordOperation({ module: '云空间', operation: `删除文件成功【${file.fileName}】` });
            cloud.queryFieldList();
          }
        });
      },
    });
  }

  async function handleDownloadFile(file: any) {
    const success = await downloadField(file.id);
    if (success) {
      recordOperation({ module: '云空间', operation: `下载文件成功【${file.fileName}】` });
    }
  }

  async function openTagDialog(file: any) {
    activeTagFile.value = file;
    tagModalVisible.value = true;
  }

  const handleBatchDelete = () => {
    if (blockGuestWrite('delete-file')) return;
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToDelete'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    const names = selectedFiles.map((f) => f.fileName).join('、');

    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: `${t('cloudSpace.confirmBatchDelete')} ${selectedRows.value.length} ${t('cloudSpace.files')}<br/>${t('cloudSpace.fileList')}: ${names}`,
      onOk() {
        apiBasePost('/api/file/deleteFileById', { ids: selectedRows.value }).then((res) => {
          if (res.status === 200) {
            const count = res.data?.count || selectedRows.value.length;
            recordOperation({ module: '云空间', operation: `批量删除文件成功【${count}个】` });
            message.success(`${t('cloudSpace.batchDeleteSuccess')} ${count} ${t('cloudSpace.files')}`);
          } else {
            message.error(res.msg || t('cloudSpace.deleteFailed'));
          }

          cloud.queryFieldList();
          selectedRows.value = [];
          selectAll.value = false;
        });
      },
    });
  };

  const handleBatchMove = () => {
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToMove'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    emit('moveField', selectedFiles);
  };

  const decodeSafeName = (name?: string) => {
    if (!name) return '';
    try {
      return decodeURIComponent(name);
    } catch (error) {
      return name;
    }
  };

  const normalizeFileName = (name?: string, fallback = 'file') => {
    const raw = decodeSafeName(name).trim() || fallback;
    return raw.replace(/[\\/:*?"<>|]/g, '_');
  };

  const buildUniqueName = (name: string, usedNames: Set<string>) => {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const dotIndex = name.lastIndexOf('.');
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : '';
    let counter = 2;
    let candidate = `${base}(${counter})${ext}`;
    while (usedNames.has(candidate)) {
      counter += 1;
      candidate = `${base}(${counter})${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  const getDownloadMeta = async (file: any, index: number) => {
    const fallbackName = `file-${index + 1}`;
    if (file.fileUrl) {
      return {
        downloadUrl: file.fileUrl,
        fileName: normalizeFileName(file.fileName, fallbackName),
      };
    }

    const res = await apiBasePost('/api/file/downloadFileById', { id: file.id });
    if (res.status !== 200 || !res.data?.downloadUrl) {
      throw new Error(t('cloudSpace.downloadFailed'));
    }

    return {
      downloadUrl: res.data.downloadUrl,
      fileName: normalizeFileName(res.data.fileName || file.fileName, fallbackName),
    };
  };

  const isBatchDownloadCancelledError = (error: any) => {
    return (
      batchDownloadCancelled.value || error?.name === 'AbortError' || error?.message === 'BATCH_DOWNLOAD_CANCELLED'
    );
  };

  const cancelBatchDownload = () => {
    if (!batchDownloadLoading.value) return;
    batchDownloadCancelled.value = true;
    batchDownloadAbortController.value?.abort();
  };

  const handleBatchDownload = async () => {
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToDownload'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    if (selectedFiles.length === 1) {
      const success = await downloadField(selectedFiles[0].id);
      if (success) {
        recordOperation({ module: '云空间', operation: `下载文件成功【${selectedFiles[0].fileName}】` });
      }
      return;
    }

    batchDownloadLoading.value = true;
    batchDownloadCancelled.value = false;
    batchDownloadAbortController.value = new AbortController();
    downloadProgress.value = {
      visible: true,
      percent: 0,
      current: 0,
      total: selectedFiles.length,
      phaseText: t('cloudSpace.batchDownloading'),
    };

    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (let i = 0; i < selectedFiles.length; i++) {
        if (batchDownloadCancelled.value) {
          throw new Error('BATCH_DOWNLOAD_CANCELLED');
        }
        const file = selectedFiles[i];
        const { downloadUrl, fileName } = await getDownloadMeta(file, i);
        const response = await fetch(downloadUrl, {
          signal: batchDownloadAbortController.value?.signal,
        });
        if (!response.ok) {
          throw new Error(t('cloudSpace.downloadFailed'));
        }
        const blob = await response.blob();
        const uniqueName = buildUniqueName(fileName, usedNames);
        zip.file(uniqueName, blob);

        downloadProgress.value.current = i + 1;
        downloadProgress.value.percent = Math.round(((i + 1) / selectedFiles.length) * 80);
      }

      downloadProgress.value.phaseText = t('cloudSpace.batchPacking');
      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        },
        (metadata) => {
          if (batchDownloadCancelled.value) {
            throw new Error('BATCH_DOWNLOAD_CANCELLED');
          }
          downloadProgress.value.percent = 80 + Math.round((metadata.percent || 0) * 0.2);
        },
      );

      if (batchDownloadCancelled.value) {
        throw new Error('BATCH_DOWNLOAD_CANCELLED');
      }

      const _now = new Date();
      const timestamp = `${_now.getFullYear()}.${String(_now.getMonth() + 1).padStart(2, '0')}.${String(_now.getDate()).padStart(2, '0')}`;
      const zipName = `file-${timestamp}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      downloadProgress.value.percent = 100;
      recordOperation({ module: '云空间', operation: `批量下载文件成功【${selectedFiles.length}个】` });
    } catch (error) {
      if (isBatchDownloadCancelledError(error)) {
        message.info(t('cloudSpace.batchDownloadCancelled'));
      } else {
        console.error('batch download failed:', error);
        message.error(t('cloudSpace.batchDownloadFailed'));
      }
    } finally {
      batchDownloadLoading.value = false;
      batchDownloadAbortController.value = null;
      setTimeout(() => {
        downloadProgress.value.visible = false;
      }, 600);
    }
  };

  async function handleShareFile(id, fileName, fileType, shareToken) {
    recordOperation({ module: '云空间', operation: `打开文件分享弹窗【${fileName}】` });
    shareTarget.value = { id, fileName, fileType, shareToken };
    shareDescValue.value = '';
    shareDescVisible.value = true;
  }

  const closeShareDialog = () => {
    if (shareSubmitting.value) return;
    shareDescVisible.value = false;
    shareTarget.value = null;
    shareDescValue.value = '';
  };

  const submitShare = async () => {
    if (blockGuestWrite('share-file')) return;
    if (!shareTarget.value) return;
    try {
      shareSubmitting.value = true;
      const desc = shareDescValue.value.trim();
      await shareField(
        shareTarget.value.id,
        shareTarget.value.shareToken,
        shareTarget.value.fileName,
        shareTarget.value.fileType,
        desc,
      );
      recordOperation({ module: '云空间', operation: `分享文件成功【${shareTarget.value.fileName}】` });
      shareDescVisible.value = false;
      shareTarget.value = null;
      shareDescValue.value = '';
    } catch (error) {
      // 错误已在 shareField 中处理
    } finally {
      shareSubmitting.value = false;
    }
  };
  const originalName = ref('');
  const originalExt = ref('');
  const dragPreviewEl = ref<HTMLElement | null>(null);

  function canDragFile(file) {
    return !bookmark.isMobile && !batchMode.value && !file.isRename;
  }

  function onFileDragStart(event, file) {
    if (!canDragFile(file)) {
      event.preventDefault();
      return;
    }

    const dragTarget = event.currentTarget as HTMLElement | null;
    const fileLabel = dragTarget?.querySelector('.file-label') as HTMLElement | null;
    if (fileLabel) {
      const preview = fileLabel.cloneNode(true) as HTMLElement;
      preview.style.position = 'fixed';
      preview.style.top = '-9999px';
      preview.style.left = '-9999px';
      preview.style.pointerEvents = 'none';
      preview.style.margin = '0';
      preview.style.padding = '8px 10px';
      preview.style.borderRadius = '8px';
      preview.style.background = 'var(--bl-input-noBorder-bg-color)';
      preview.style.border = '1px solid var(--folder-list-border-color)';
      preview.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.12)';
      preview.style.maxWidth = '320px';
      document.body.appendChild(preview);
      dragPreviewEl.value = preview;
      event.dataTransfer.setDragImage(preview, 18, 18);
    }

    event.dataTransfer.effectAllowed = 'copyMove';
    const fileUrl = String(file.fileUrl || '');
    const fileName = String(file.fileName || 'file');
    const mimeType = String(file.fileType || '').includes('/') ? String(file.fileType) : 'application/octet-stream';
    cloud.draggingFile = {
      id: String(file.id),
      folderId: String(file.folderId || ''),
    };

    event.dataTransfer.clearData();
    if (fileUrl) {
      // Local folder drag-out uses DownloadURL.
      event.dataTransfer.setData('DownloadURL', `${mimeType}:${fileName}:${fileUrl}`);
      // Enterprise chat accepts link payloads.
      event.dataTransfer.setData('text/plain', fileUrl);
      event.dataTransfer.setData('text/uri-list', fileUrl);
    } else {
      event.dataTransfer.setData('text/plain', fileName);
    }
  }

  function onFileDragEnd(event) {
    event.dataTransfer.dropEffect = 'none';
    cloud.draggingFile = null;
    if (dragPreviewEl.value) {
      dragPreviewEl.value.remove();
      dragPreviewEl.value = null;
    }
  }

  function openRenameModal(file) {
    renameModalFile.value = file;
    originalName.value = file.fileName || '';
    originalExt.value = getFileExt(originalName.value);
    renameModalValue.value = getFileBaseName(originalName.value);
    renameModalVisible.value = true;
    nextTick(() => {
      const input = document.querySelector('.rename-modal-field .b-input') as HTMLInputElement;
      input?.focus();
    });
  }
  async function confirmRename() {
    const f = renameModalFile.value;
    if (!f) return;
    const baseName = renameModalValue.value.trim();
    if (!baseName) return;
    const nextName = originalExt.value ? `${baseName}.${originalExt.value}` : baseName;
    if (nextName === originalName.value) {
      renameModalVisible.value = false;
      renameModalFile.value = null;
      return;
    }
    const success = await updateFileName(f, nextName);
    if (success) {
      renameModalVisible.value = false;
      renameModalFile.value = null;
    }
  }
  function handleReName(file) {
    originalName.value = cloneDeep(file.fileName);
    originalExt.value = getFileExt(originalName.value);
    file.fileName = getFileBaseName(originalName.value);
    file.isRename = true;
    document.querySelector('.edit-file-input .b-input') as HTMLInputElement;
    nextTick(() => {
      (document.querySelector('.edit-file-input .b-input') as HTMLInputElement).focus();
    });
  }
</script>

<style scoped lang="less">
  .field-list {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .field-header {
    display: flex;
    align-items: center;
    padding: 0 20px 14px 20px;
    border-bottom: 1px solid var(--folder-list-border-color);
    font-weight: bold;
    font-size: 15px;
  }
  .field-header-label {
    flex-shrink: 0;
    line-height: 28px;
  }
  .header-search-input {
    flex: 1;
    margin-left: 8px;
    min-width: 0;
    max-width: 260px;
  }
  .header-checkbox {
    margin-right: 8px;
  }
  .batch-actions {
    margin-bottom: 10px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--folder-list-border-color);
    display: flex;
    align-items: center;
    color: var(--text-color);
    .selected-count {
      color: var(--desc-color);
      font-size: 14px;
    }
  }
  .download-progress-floating {
    position: absolute;
    top: 12px;
    right: 12px;
    width: min(380px, calc(100% - 24px));
    z-index: 30;
    background: var(--bl-input-noBorder-bg-color);
    border: 1px solid var(--folder-list-border-color);
    border-radius: 10px;
    padding: 10px 12px;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
    .download-progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--desc-color);
      margin-bottom: 6px;
      .download-progress-title {
        font-weight: 600;
        color: var(--text-color);
      }
      .download-progress-ops {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .download-cancel-btn {
        padding: 0 4px;
        height: 20px;
        color: var(--text-color);
      }
    }
  }
  .file-container {
    height: calc(100% - 40px);
    overflow-y: auto;
  }
  .field-item {
    height: 64px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--folder-list-border-color);
    transition: background-color 0.3s;
    &:hover {
      background-color: var(--bl-input-noBorder-bg-color);
      .handle-btn {
        opacity: 1;
      }
    }
    .handle-btn {
      color: var(--desc-color);
      opacity: 0;
      position: absolute;
      right: 8px;
      gap: 10px;
      transition: opacity 0.2s;
      div {
        cursor: pointer;
      }
    }
  }
  .field-item-draggable {
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
  }
  .edit-file-input {
    width: min(400px, calc(100% - 120px));
  }
  .file-label {
    width: calc(100% - 100px);
    cursor: pointer;
    gap: 5px;
  }
  .row-checkbox {
    margin-right: 10px;
  }
  .default-area {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    font-size: 14px;
    color: var(--desc-color);
    div {
      flex: 1;
      min-width: 0;
      padding-right: 12px;
    }
  }
  .share-desc-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .share-desc-tip {
    color: var(--desc-color);
    font-size: 12px;
  }
  .share-desc-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  @media (max-width: 1400px) {
    .field-item {
      .handle-btn {
        opacity: 1 !important;
      }
    }
  }
  @media (max-width: 1024px) {
    .batch-actions {
      padding: 10px 0;
    }
    .field-header {
      padding: 0 10px 10px 10px;
    }
    .field-item {
      padding: 0 10px;
      .flex-align-center:first-child {
        .file-label {
          min-width: 0;
        }
      }
      .handle-btn {
        opacity: 1 !important;
      }
    }
    .edit-file-input {
      width: calc(100% - 92px);
    }
  }
  .file-tags-cell {
    min-width: 0;
  }

  .file-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 40px;
    overflow: hidden;
  }

  .file-tag-chip {
    max-width: 90px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 18px;
    color: var(--desc-color);
    background: var(--common-tag-bg-color);
    display: inline-block;
    cursor: pointer;
  }

  .file-tags-empty {
    color: var(--desc-color);
    opacity: 0.7;
  }

  // ── 卡片视图 ──
  .card-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 6px 14px;
  }
  .card-search-input {
    max-width: 420px;
    flex: 1;
  }
  .card-toolbar .batch-actions {
    flex-shrink: 0;
    margin-bottom: 0;
    padding: 0;
    border: none;
  }

  .file-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(286px, 1fr));
    column-gap: 20px;
    row-gap: 18px;
    padding: 12px 6px 16px;
    overflow-y: auto;
    height: 100%;
    align-content: start;
  }

  .file-card {
    display: flex;
    flex-direction: column;
    min-height: 278px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--folder-list-border-color) 82%, var(--desc-color) 18%);
    background: color-mix(in srgb, var(--card-bg-color) 94%, var(--bl-input-noBorder-bg-color) 6%);
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
    overflow: hidden;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.02) inset,
      0 8px 18px rgba(0, 0, 0, 0.08);
    content-visibility: auto;
    contain: layout style paint;
    &:hover {
      transform: translateY(-2px);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.03) inset,
        0 12px 28px rgba(0, 0, 0, 0.14);
      border-color: color-mix(in srgb, var(--resource-file-color) 26%, var(--folder-list-border-color));
    }
  }

  .file-card-cover {
    position: relative;
    width: 100%;
    height: 142px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 92%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--folder-list-border-color) 76%, transparent);
  }

  .file-card-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-card-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: color-mix(in srgb, var(--desc-color) 84%, transparent);
  }

  .file-card-placeholder-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: inherit;
    opacity: 0.88;
  }

  .file-card-placeholder-inner span {
    max-width: 160px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--desc-color) 92%, transparent);
    background: color-mix(in srgb, var(--common-tag-bg-color) 78%, transparent);
  }

  .file-card-placeholder--image {
    background: color-mix(in srgb, #f97316 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--video {
    background: color-mix(in srgb, #ef4444 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--audio {
    background: color-mix(in srgb, #8b5cf6 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--pdf {
    background: color-mix(in srgb, #dc2626 8%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--word {
    background: color-mix(in srgb, #2563eb 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--excel {
    background: color-mix(in srgb, #16a34a 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--ppt {
    background: color-mix(in srgb, #ea580c 7%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--text {
    background: color-mix(in srgb, #94a3b8 8%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--compress {
    background: color-mix(in srgb, #ca8a04 8%, var(--bl-input-noBorder-bg-color));
  }
  .file-card-placeholder--other {
    background: color-mix(in srgb, #6b7280 7%, var(--bl-input-noBorder-bg-color));
  }

  .file-card-text-preview {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: color-mix(in srgb, var(--bl-input-noBorder-bg-color) 90%, #111318 10%);
    border-top: 1px solid color-mix(in srgb, var(--folder-list-border-color) 80%, transparent);
  }

  .file-card-text-preview-head {
    font-size: 11px;
    font-weight: 700;
    color: color-mix(in srgb, var(--desc-color) 92%, #7f8794 8%);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .file-card-text-preview-body {
    flex: 1;
    min-height: 0;
    font-size: 12px;
    line-height: 1.5;
    color: color-mix(in srgb, var(--desc-color) 92%, #7f8794 8%);
    white-space: pre-wrap;
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
  }

  .file-card-text-preview-body--loading {
    color: var(--desc-color);
    opacity: 0.65;
  }

  [data-theme='night'] .file-card-text-preview {
    background: color-mix(in srgb, #1a1c22 86%, var(--bl-input-noBorder-bg-color) 14%);
    border-top-color: color-mix(in srgb, #3b3f4a 78%, transparent);
  }

  [data-theme='night'] .file-card-text-preview-head {
    color: #7f8794;
  }

  [data-theme='night'] .file-card-text-preview-body {
    color: #8790a0;
  }

  .file-card:hover .file-card-overlay,
  .file-card:hover .file-card-more {
    opacity: 1 !important;
    pointer-events: auto;
  }

  .file-card-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 32px 8px 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, transparent 40%);
    pointer-events: none;
  }

  .overlay-btn {
    color: #fff;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
    cursor: pointer;
    transition: transform 0.18s ease;
    pointer-events: auto;
    &:hover {
      transform: scale(1.15);
    }
  }

  .file-card-more {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 2;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .file-card-more .more-icon {
    color: rgba(255, 255, 255, 0.7);
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
    cursor: pointer;
    transition: color 0.2s;
  }
  .file-card-more .more-icon:hover {
    color: #fff;
  }

  .rename-modal-input {
    margin-bottom: 16px;
  }
  .rename-modal-field {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 16px;
  }
  .rename-modal-field .rename-modal-input {
    margin-bottom: 0;
    flex: 1;
  }
  .rename-modal-ext {
    font-size: 14px;
    color: #888;
    white-space: nowrap;
  }
  .rename-modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .overlay-menu {
    pointer-events: auto;
  }

  .file-card-body {
    padding: 12px 14px 13px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-height: 136px;
  }

  .file-card-headline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .file-card-type {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--resource-file-color) 86%, var(--desc-color));
    background: color-mix(in srgb, var(--resource-file-color) 9%, transparent);
  }

  .file-card-size {
    font-size: 12px;
    color: var(--desc-color);
    font-weight: 600;
    opacity: 0.86;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-card-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: calc(1.4em * 2);
  }

  .file-card-meta {
    font-size: 12px;
    color: var(--desc-color);
    display: flex;
    align-items: center;
    gap: 8px;
    line-height: 1.4;
    min-width: 0;
    min-height: 18px;
  }

  .meta-label {
    flex: 0 0 auto;
    color: var(--text-color);
    opacity: 0.78;
    font-weight: 600;
  }

  @media (max-width: 1400px) {
    .file-card-overlay {
      opacity: 1 !important;
    }
    .file-card-more {
      opacity: 1 !important;
      pointer-events: auto;
    }
  }

  @media (max-width: 720px) {
    .field-list {
      min-width: 0;
    }
    .file-card-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      column-gap: 12px;
      row-gap: 12px;
      padding: 8px 0 12px;
    }

    .file-card {
      min-height: 260px;
    }

    .file-card-cover {
      height: 128px;
    }
  }

  // ── 卡片批量勾选样式 ──
  .card-checkbox {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 10;
    line-height: 0;
  }

  .file-card--batch {
    cursor: pointer;
    user-select: none;
    &.file-card--selected {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 30%, transparent);
      background: color-mix(in srgb, var(--primary-color) 5%, var(--card-bg-color));
      &:hover {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 40%, transparent);
      }
    }
  }

  .batch-select-all {
    margin-right: 2px;
  }

  // 全选 a-checkbox 覆写：与 b-checkbox 蓝底风格统一
  .batch-select-all,
  .header-checkbox {
    :deep(.ant-checkbox-inner) {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border-color: var(--card-border-color);
      background: transparent;
      transition: all 0.1s ease;
    }
    &:hover :deep(.ant-checkbox-inner) {
      border-color: var(--primary-color) !important;
    }
    :deep(.ant-checkbox-checked .ant-checkbox-inner) {
      background-color: var(--primary-color) !important;
      border-color: var(--primary-color) !important;
    }
    :deep(.ant-checkbox-indeterminate .ant-checkbox-inner) {
      background-color: var(--primary-color) !important;
      border-color: var(--primary-color) !important;
    }
    :deep(.ant-checkbox-indeterminate .ant-checkbox-inner::after) {
      background-color: #fff !important;
    }
  }
  [data-theme='night'] {
    .batch-select-all,
    .header-checkbox {
      :deep(.ant-checkbox-inner) {
        border-color: #6e6e77 !important;
      }
    }
  }
</style>
