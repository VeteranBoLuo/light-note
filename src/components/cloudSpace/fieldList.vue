<template>
  <div class="field-list">
    <div v-if="batchMode" class="batch-actions">
      <b-space :size="10">
        <b-button size="small" type="danger" @click="handleBatchDelete">{{ $t('cloudSpace.batchDelete') }}</b-button>
        <b-button size="small" type="primary" @click="handleBatchMove">{{ $t('cloudSpace.batchMove') }}</b-button>
        <b-button size="small" type="success" :loading="batchDownloadLoading" @click="handleBatchDownload">
          {{ $t('cloudSpace.batchDownload') }}
        </b-button>
        <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
      </b-space>
    </div>
    <div v-if="downloadProgress.visible" class="download-progress-floating">
      <div class="download-progress-header">
        <div class="download-progress-title">{{ downloadProgress.phaseText }}</div>
        <div class="download-progress-ops">
          <span>{{ downloadProgress.current }}/{{ downloadProgress.total }}</span>
          <a-button size="small" type="text" class="download-cancel-btn" @click="cancelBatchDownload">
            {{ $t('common.cancel') }}
          </a-button>
        </div>
      </div>
      <a-progress :percent="downloadProgress.percent" :show-info="false" size="small" />
    </div>
    <div class="field-header">
      <div class="flex-align-center-gap" :style="{ width: fieldNameWidth }">
        <a-checkbox
          v-if="batchMode"
          :indeterminate="indeterminate"
          :checked="selectAll"
          @change="onToggleSelectAll"
          class="header-checkbox"
        />
        {{ $t('cloudSpace.fileName') }}
      </div>
      <div class="default-area">
        <div v-if="!bookmark.isMobile">{{ $t('cloudSpace.folder') }}</div>
        <div>{{ $t('cloudSpace.fileSize') }}</div>
        <div v-if="!bookmark.isMobile"> {{ $t('cloudSpace.uploadTime') }} </div>
      </div>
    </div>
    <div class="file-container">
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
          <a-checkbox
            v-if="batchMode"
            :checked="selectedRows.includes(item.id)"
            @change="(e: any) => toggleRow(item.id, e.target.checked)"
            class="row-checkbox"
          />
          <div v-if="!item.isRename" class="file-label flex-align-center" @click="emit('previewFile', item)"
            ><svg-icon :src="icon.cloudSpace.fileIcon[item.type]" size="20" style="min-width: 20px" />
            <span style="width: 100%" class="text-hidden">{{ item.fileName }}</span>
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
            <a-tooltip :title="$t('cloudSpace.download')">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.download"
                size="20"
                @click="downloadField(item.id)"
              />
            </a-tooltip>
            <a-tooltip :title="$t('common.reName')" v-if="!bookmark.isMobile">
              <svg-icon class="download-icon" :src="icon.cloudSpace.rename" size="20" @click="handleReName(item)" />
            </a-tooltip>
            <!-- 删除按钮 -->
            <a-tooltip :title="$t('common.delete')">
              <svg-icon class="delete-icon" :src="icon.noteDetail.delete" size="20" @click="handleDelFile(item.id)" />
            </a-tooltip>
            <b-menu
              v-if="!bookmark.isMobile"
              :trigger="'click'"
              :menu-options="[
                {
                  label: $t('cloudSpace.share'),
                  icon: icon.cloudSpace.share,
                  function: () => handleShareFile(item.id, item.fileName, item.fileType),
                },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', [item]),
                },
              ]"
            >
              <svg-icon class="download-icon" :src="icon.common.more" size="20" />
            </b-menu>
          </div>
        </div>
        <div class="default-area">
          <div v-if="!bookmark.isMobile">{{ item.folderName }}</div>
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
    <b-loading :loading="cloud.loading" class="both-center" />

    <b-modal
      v-model:visible="shareDescVisible"
      :title="$t('cloudSpace.share')"
      :footer="null"
      width="450px"
      :show-footer="false"
    >
      <div class="share-desc-body">
        <div class="share-desc-tip">可选描述，将展示在分享页</div>
        <b-input
          type="textarea"
          v-model:value="shareDescValue"
          :max-length="200"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          placeholder="请输入分享描述（可选）"
        />
        <div class="share-desc-actions">
          <b-button :loading="shareSubmitting" type="primary" @click="submitShare">分享</b-button>
          <b-button :disabled="shareSubmitting" @click="closeShareDialog">取消</b-button>
        </div>
      </div>
    </b-modal>
  </div>
</template>
<script setup lang="ts">
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BMenu from '@/components/base/BasicComponents/BMenu.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { bookmarkStore } from '@/store';
  import { cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import icon from '@/config/icon.ts';
  import { deleteField, downloadField, shareField } from '@/http/common.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { nextTick, ref, computed, watch } from 'vue';
  import { cloneDeep } from 'lodash-es';
  import { useI18n } from 'vue-i18n';
  import JSZip from 'jszip';

  const { t } = useI18n();
  const emit = defineEmits(['previewFile', 'moveField']);
  const cloud = cloudSpaceStore();
  const bookmark = bookmarkStore();
  const props = defineProps<{ clearKey?: number; batchMode: boolean }>();

  const batchMode = computed(() => props.batchMode ?? false);
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

  const fieldNameWidth = computed(() => {
    if (bookmark.isMobile) {
      return '70%';
    }
    return '55%';
  });

  const shareDescVisible = ref(false);
  const shareDescValue = ref('');
  const shareSubmitting = ref(false);
  const shareTarget = ref<{ id: string; fileName?: string; fileType?: string } | null>(null);
  const batchDownloadLoading = ref(false);
  const batchDownloadAbortController = ref<AbortController | null>(null);
  const batchDownloadCancelled = ref(false);
  const downloadProgress = ref({
    visible: false,
    percent: 0,
    current: 0,
    total: 0,
    phaseText: '',
  });

  watch(
    () => cloud.fileList,
    (list) => {
      // 当列表刷新时，同步全选状态，移除已不存在的选项
      const ids = list.map((item) => item.id);
      selectedRows.value = selectedRows.value.filter((id) => ids.includes(id));
      selectAll.value = list.length > 0 && selectedRows.value.length === list.length;
    },
    { deep: true },
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
    file.isRename = false;
    if (nextName === originalName.value) {
      return;
    }
    file.fileName = nextName;
    apiBasePost('/api/file/updateFile', {
      id: file.id,
      fileName: nextName,
    }).then((res) => {
      if (res.status === 200) {
        message.success(t('cloudSpace.renameSuccess'));
        cloud.queryFieldList();
      }
    });
  }
  function handleDelFile(id) {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('cloudSpace.confirmDelete'),
      onOk() {
        deleteField(id).then(() => {
          cloud.queryFieldList();
        });
      },
    });
  }

  const handleBatchDelete = () => {
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
      await downloadField(selectedFiles[0].id);
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

      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
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

  async function handleShareFile(id, fileName, fileType) {
    shareTarget.value = { id, fileName, fileType };
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
    if (!shareTarget.value) return;
    try {
      shareSubmitting.value = true;
      const desc = shareDescValue.value.trim();
      await shareField(shareTarget.value.id, shareTarget.value.fileName, shareTarget.value.fileType, desc);
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
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .field-header {
    display: flex;
    align-items: center;
    height: 20px;
    padding: 0 20px 10px 20px;
    border-bottom: 1px solid var(--folder-list-border-color);
    font-weight: bold;
    font-size: 15px;
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
    }
    .edit-file-input {
      width: calc(100% - 92px);
    }
  }
</style>
