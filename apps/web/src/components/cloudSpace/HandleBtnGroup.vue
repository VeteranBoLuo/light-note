<template>
  <BSpace :size="15">
    <CloudStorageBar v-if="showControls && !bookmark.isMobile" ref="cloudStorageBar" />
    <div v-if="showControls" class="upload-container">
      <BUpload ref="uploadPicker" multiple raw-file :disabled="busy" :max-total-size="null" @change="handleChange">
        <BButton
          type="primary"
          class="upload-action"
          :class="{ 'upload-action--mobile': bookmark.isMobile }"
          :loading="busy"
          :aria-label="t('cloudSpace.uploadFile')"
          @click.stop="openFileDialog(cloud.folder.id === 'all' ? null : cloud.folder.id)"
        >
          <SvgIcon :src="icon.file_upload" size="17" />
          {{ bookmark.isDesktop ? t('cloudSpace.uploadFile') : '' }}
        </BButton>
      </BUpload>
    </div>
    <Teleport to="body">
      <section
        v-if="uploadProgress"
        class="upload-progress"
        :class="{ 'upload-progress--mobile': bookmark.isMobile }"
        :aria-label="t('cloudSpace.uploadFile')"
      >
        <div class="progress-header">
          <span class="progress-title">{{
            t(
              uploadProgress.running
                ? 'cloudSpace.uploading'
                : remaining
                  ? 'cloudSpace.uploadQueueStopped'
                  : 'cloudSpace.uploadQueueDone',
            )
          }}</span>
          <BButton v-if="uploadProgress.running" size="small" @click="confirmCancelUpload">{{
            t('cloudSpace.cancelUpload')
          }}</BButton>
          <BButton v-else size="small" :aria-label="t('common.close')" @click="closeQueue">
            <SvgIcon :src="icon.common.close" size="15" />
          </BButton>
        </div>
        <p class="progress-summary" role="status">{{ t('cloudSpace.uploadQueueSummary', uploadProgress) }}</p>
        <div class="progress-header progress-metrics">
          <span>{{ Math.floor(uploadProgress.overall) }}%</span>
          <span v-if="uploadProgress.running">{{ formatSpeed(uploadProgress.speed) }}</span>
        </div>
        <div
          class="progress-track overall-progress"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('cloudSpace.uploadFile')"
          :aria-valuenow="Math.floor(uploadProgress.overall)"
        >
          <span :style="{ width: `${uploadProgress.overall}%` }"></span>
        </div>
        <p v-if="uploadProgress.blocked" class="queue-error" role="alert">
          {{ t(uploadProgress.blocked === 'quota' ? 'cloudSpace.uploadQueueQuota' : 'cloudSpace.uploadQueueAuth') }}
        </p>
        <div class="file-progress-list">
          <div v-for="file in uploadProgress.preview" :key="file.id" class="file-progress-item">
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <span class="file-status" :class="{ 'queue-error': file.status === 'error' }">{{
              t(`cloudSpace.uploadQueueStates.${file.status}`)
            }}</span>
            <div
              class="progress-track file-progress-track"
              :class="{ 'file-progress-track--error': file.status === 'error' }"
            >
              <span :style="{ width: `${file.progress}%` }"></span>
            </div>
          </div>
        </div>
        <p v-if="remaining" class="queue-hint">{{
          t(uploadProgress.running ? 'cloudSpace.uploadQueueKeepOpen' : 'cloudSpace.uploadQueueRetryHint')
        }}</p>
        <BButton v-if="remaining && !uploadProgress.running" type="primary" class="retry-upload" @click="retryUploads">
          {{ t('cloudSpace.uploadQueueRetry', { count: remaining }) }}
        </BButton>
      </section>
    </Teleport>
  </BSpace>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
  import { onBeforeRouteLeave } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import CloudStorageBar from './CloudStorageBar.vue';
  import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
  import { apiBasePost } from '@/http/request';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { recordOperation } from '@/api/commonApi';
  import { autoRename, formatStorageSize } from '@/utils/common';
  import { createCloudUploadQueue, type CloudUploadSnapshot } from '@/utils/cloudUploadQueue';
  import { getUploadStorageShortfall } from './cloudStorageCapacity';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUserStore();
  const { t } = useI18n();
  const { showControls = true } = defineProps<{ showControls?: boolean }>();
  const emit = defineEmits<{ storageQuota: [shortfallMb: number] }>();
  const uploadPicker = ref<{ open: () => void } | null>(null);
  const cloudStorageBar = ref<{ openDetails: (shortfallMb?: number) => void } | null>(null);
  const pendingUploadFolderId = ref<string | null>(null);
  const uploadProgress = shallowRef<CloudUploadSnapshot | null>(null);
  const checking = ref(false);
  const busy = computed(() => checking.value || uploadProgress.value?.running === true);
  const remaining = computed(() =>
    uploadProgress.value ? uploadProgress.value.total - uploadProgress.value.success : 0,
  );
  let queue: ReturnType<typeof createCloudUploadQueue> | undefined;
  let generation = 0;
  let checkController: AbortController | undefined;
  const scope = () => buildNoteDetailRequestScope(user);
  const formatSpeed = (speed: number) =>
    speed < 1024 * 1024 ? `${(speed / 1024).toFixed(1)} KB/s` : `${(speed / 1024 / 1024).toFixed(1)} MB/s`;

  function clearQueue() {
    generation++;
    checkController?.abort();
    checkController = undefined;
    queue?.dispose();
    queue = undefined;
    uploadProgress.value = null;
    checking.value = false;
  }
  function confirmDiscard(): Promise<boolean> {
    if (!remaining.value) return Promise.resolve(true);
    return new Promise((resolve) =>
      Alert.alert({
        title: t('cloudSpace.cancelUpload'),
        content: t('cloudSpace.uploadQueueDiscard'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      }),
    );
  }
  async function closeQueue() {
    const current = queue;
    if ((await confirmDiscard()) && queue === current) clearQueue();
  }
  async function showStorageQuotaDetails(current: NonNullable<typeof queue>) {
    await cloud.getUsedSpace();
    if (queue !== current) return;
    const shortfallMb = Math.max(
      0.1,
      current.shortfallMB() || getUploadStorageShortfall(0, Number(cloud.usedSpace || 0), Number(cloud.maxSpace || 0)),
    );
    message.warning(t('cloudSpace.storageUploadBlocked', { capacity: formatStorageSize(shortfallMb) }));
    if (cloudStorageBar.value) cloudStorageBar.value.openDetails(shortfallMb);
    else emit('storageQuota', shortfallMb);
  }
  async function runQueue(current: NonNullable<typeof queue>) {
    const before = new Set(current.results().map((item) => item.fileId));
    await current.run();
    if (queue !== current) return;
    const added = current.results().filter((item) => !before.has(item.fileId));
    // 确认成功才汇总记录；列表刷新失败不把已保存文件改成上传失败。
    if (added.length) {
      void recordOperation({ module: '云空间', operation: `上传文件成功【${added.length}个】` }).catch(() => {});
      const overwritten = added.filter((item) => item.status === '已覆盖');
      overwritten.forEach((item) => cloud.cacheImgArr.push(item.fileId));
      try {
        if (!(await cloud.refreshAfterFileMutation({ preserveLoaded: true })) && queue === current)
          message.warning(t('cloudSpace.refreshPartialFailed'));
      } catch {
        if (queue === current) message.warning(t('cloudSpace.refreshPartialFailed'));
      }
    }
    if (queue === current && current.snapshot().blocked === 'quota') {
      try {
        await showStorageQuotaDetails(current);
      } catch {
        /* 浮层已保留容量不足状态与重试入口。 */
      }
    }
  }
  async function retryUploads() {
    if (blockGuestWrite('upload-file') || busy.value || !queue) return;
    await runQueue(queue);
  }
  // 兼容粘贴图片等旧入口；选择器直接保留原始 File，绝不把几千张图片转成 Base64。
  function normalizeFile(file: any): File {
    if (file instanceof File) return file;
    if (!file?.isImg || typeof file.file !== 'string') throw new Error('UPLOAD_SOURCE_INVALID');
    const [header, encoded] = file.file.split(';base64,');
    const mime = header.split(':')[1] || 'application/octet-stream';
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    return new File([bytes], file.fileName || `converted-image.${mime.split('/')[1]}`, { type: mime });
  }
  async function uploadFiles(files: any[], folderId: string | null = null) {
    if (blockGuestWrite('upload-file')) return;
    if (busy.value) {
      message.info(t('cloudSpace.uploading'));
      return;
    }
    const requestedScope = scope();
    const requestedGeneration = generation;
    if (!(await confirmDiscard()) || scope() !== requestedScope || generation !== requestedGeneration) return;
    clearQueue();
    let normalized: File[];
    try {
      normalized = files.map(normalizeFile);
    } catch {
      message.error(t('cloudSpace.uploadQueueInvalid'));
      return;
    }
    if (!normalized.length) return;
    const owner = scope();
    const currentGeneration = generation;
    queue = createCloudUploadQueue(normalized, folderId, (state) => {
      if (generation === currentGeneration && scope() === owner) uploadProgress.value = state;
    });
    await runQueue(queue);
  }
  async function handleChange(input: any) {
    if (blockGuestWrite('upload-file') || busy.value) return;
    const files: any[] = Array.isArray(input) ? input : [];
    if (!files.length) return;
    const folderId = pendingUploadFolderId.value;
    pendingUploadFolderId.value = null;
    const owner = scope();
    const currentGeneration = generation;
    checking.value = true;
    checkController = new AbortController();
    try {
      const fileNames = files.map((file) =>
        String(file instanceof File ? file.name : file.fileName || '')
          .normalize('NFC')
          .trim(),
      );
      // 只传元信息；失败关闭，不能在查重失败时静默覆盖旧照片。
      const res = await apiBasePost(
        '/api/file/checkFileNames',
        { fileNames },
        { silent: true, signal: checkController.signal },
      );
      if (res.status !== 200) throw new Error('CHECK_FILE_NAMES_FAILED');
      if (generation !== currentGeneration || scope() !== owner) return;
      const checks = Array.isArray(res.data) ? res.data : res.data?.check;
      if (!Array.isArray(checks)) throw new Error('CHECK_FILE_NAMES_FAILED');
      const localDuplicates = new Set(fileNames).size !== fileNames.length;
      const duplicates = checks.filter((item: any) => item.exists).map((item: any) => item.fileName);
      let selected = files;
      if (localDuplicates || duplicates.length) {
        const choice = await new Promise<'overwrite' | 'rename' | 'cancel'>((resolve) =>
          Alert.alert({
            title: t('cloudSpace.uploadQueueDuplicateTitle'),
            content: localDuplicates
              ? t('cloudSpace.uploadQueueLocalDuplicates')
              : t('cloudSpace.uploadQueueDuplicates', {
                  names: duplicates.slice(0, 3).join('、'),
                  count: duplicates.length,
                }),
            onCancel: () => resolve('cancel'),
            footer: [
              ...(!localDuplicates
                ? [
                    {
                      label: t('cloudSpace.uploadQueueOverwrite'),
                      function: () => {
                        Alert.destroy();
                        resolve('overwrite');
                      },
                    },
                  ]
                : []),
              {
                label: t('cloudSpace.uploadQueueRename'),
                type: 'primary' as const,
                function: () => {
                  Alert.destroy();
                  resolve('rename');
                },
              },
              {
                label: t('common.cancel'),
                function: () => {
                  Alert.destroy();
                  resolve('cancel');
                },
              },
            ],
          }),
        );
        if (choice === 'cancel' || generation !== currentGeneration || scope() !== owner) return;
        if (choice === 'rename') {
          const existing = new Set<string>([...(res.data?.allNames || []), ...duplicates]);
          // 预留本批原名，避免 a.jpg 的序号名抢占后面的 a (1).jpg。
          fileNames.forEach((name) => existing.add(name));
          selected = files.map((file, index) => {
            const name = autoRename(fileNames[index], existing);
            existing.add(name);
            return file instanceof File
              ? new File([file], name, { type: file.type, lastModified: file.lastModified })
              : { ...file, fileName: name };
          });
        }
      }
      checking.value = false;
      await uploadFiles(selected, folderId);
    } catch {
      if (generation === currentGeneration && scope() === owner) message.error(t('cloudSpace.uploadQueueCheckFailed'));
    } finally {
      if (generation === currentGeneration) checking.value = false;
    }
  }
  async function uploadSelectedFiles(files: File[], folderId: string | null = null) {
    if (busy.value) {
      message.info(t('cloudSpace.uploading'));
      return;
    }
    pendingUploadFolderId.value = folderId;
    await handleChange(files);
  }
  function openFileDialog(folderId: string | null = null) {
    if (blockGuestWrite('upload-file') || busy.value) return;
    pendingUploadFolderId.value = folderId;
    uploadPicker.value?.open();
  }
  function confirmCancelUpload() {
    const current = queue;
    Alert.alert({
      title: t('cloudSpace.cancelUpload'),
      content: t('cloudSpace.uploadQueueCancelConfirm'),
      onOk: () => {
        if (queue === current) current?.cancel();
      },
    });
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (remaining.value || checking.value) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  window.addEventListener('beforeunload', beforeUnload);
  onBeforeRouteLeave(async () => {
    const currentGeneration = generation;
    if (!(await confirmDiscard()) || generation !== currentGeneration) return false;
    clearQueue();
  });
  watch(scope, clearQueue, { flush: 'sync' });
  onBeforeUnmount(() => {
    clearQueue();
    window.removeEventListener('beforeunload', beforeUnload);
  });
  defineExpose({ uploadFiles: uploadSelectedFiles, uploadSelectedFiles, openFileDialog });
</script>

<style lang="less" scoped>
  .upload-action {
    height: var(--ui-layout-36, 36px);
    padding: 0 var(--ui-space-14, 14px);
    gap: var(--ui-space-7, 7px);
    border-radius: 10px;
    background: var(--resource-file-color);
  }
  .upload-action--mobile {
    width: var(--ui-layout-34, 34px);
    min-width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    padding: 0;
  }
  .upload-progress {
    position: fixed;
    top: var(--ui-layout-70, 70px);
    right: var(--ui-space-20, 20px);
    z-index: 300;
    box-sizing: border-box;
    width: var(--ui-layout-360, 360px);
    max-height: calc(100vh - var(--ui-layout-80, 80px));
    overflow-y: auto;
    padding: var(--ui-space-16, 16px);
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    box-shadow: var(--surface-card-shadow);
  }
  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
  }
  .progress-title {
    min-width: 0;
    font-size: var(--ui-font-15, 15px);
    font-weight: 600;
  }
  .progress-summary,
  .queue-hint {
    margin: var(--ui-space-10, 10px) 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .progress-metrics {
    font-size: var(--ui-font-12, 12px);
    margin-bottom: var(--ui-space-6, 6px);
  }
  .progress-track {
    overflow: hidden;
    height: var(--ui-layout-6, 6px);
    border-radius: 999px;
    background: var(--card-border-color);
    > span {
      display: block;
      height: 100%;
      background: var(--resource-file-color);
    }
  }
  .overall-progress {
    margin-bottom: var(--ui-space-12, 12px);
  }
  .file-progress-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ui-space-6, 6px) var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) 0;
    border-bottom: 1px solid var(--card-border-color);
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-12, 12px);
  }
  .file-status {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .file-progress-track {
    grid-column: 1 / -1;
  }
  .queue-error {
    color: var(--danger-color);
    font-size: var(--ui-font-12, 12px);
  }
  .file-progress-track--error > span {
    background: var(--danger-color);
  }
  .retry-upload {
    width: 100%;
  }
  .upload-progress--mobile {
    top: var(--ui-space-10, 10px);
    left: var(--ui-space-10, 10px);
    right: var(--ui-space-10, 10px);
    width: auto;
    max-height: calc(100vh - var(--ui-space-20, 20px));
  }
</style>
