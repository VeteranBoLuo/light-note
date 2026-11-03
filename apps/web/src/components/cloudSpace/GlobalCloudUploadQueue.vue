<template>
  <BUpload
    ref="picker"
    triggerless
    multiple
    raw-file
    :disabled="upload.checking"
    :max-count="upload.selectionLimit"
    :max-total-size="null"
    @change="selectedFiles"
  />
  <Teleport to="body">
    <div v-auto-scrollbar class="cloud-transfer-dock" :class="{ 'cloud-transfer-dock--mobile': bookmark.isMobile }">
      <section
        v-if="visible"
        class="upload-progress"
        :class="{ 'upload-progress--collapsed': upload.collapsed }"
        :aria-label="t('cloudSpace.uploadQueueTitle')"
      >
        <template v-if="upload.collapsed">
          <BButton
            type="text"
            class="upload-compact"
            :aria-label="t('cloudSpace.uploadQueueExpand')"
            :aria-expanded="false"
            @click="upload.collapsed = false"
          >
            <span class="upload-status-dot" :class="{ 'upload-status-dot--error': hasError }" aria-hidden="true"></span>
            <span class="upload-compact-copy">
              <strong>{{ title }}</strong>
              <span
                >{{ summary
                }}<span v-if="state?.failed" class="queue-error">
                  · {{ t('cloudSpace.uploadQueueFailedCount', { count: state.failed }) }}</span
                ></span
              >
            </span>
            <span class="upload-compact-end"
              ><span v-if="state">{{ Math.floor(state.overall) }}%</span
              ><small>{{ t('cloudSpace.uploadQueueExpandLabel') }}</small></span
            >
          </BButton>
          <div v-if="state" class="progress-track" aria-hidden="true"
            ><span :style="{ width: `${state.overall}%` }"></span
          ></div>
        </template>
        <template v-else>
          <div class="progress-header">
            <strong class="progress-title">{{ title }}</strong>
            <div class="progress-header-actions">
              <BButton
                type="text"
                size="small"
                :aria-label="t('cloudSpace.uploadQueueCollapse')"
                :aria-expanded="true"
                @click="upload.collapsed = true"
                >{{ t('cloudSpace.uploadQueueCollapseLabel') }}</BButton
              >
              <BButton
                v-if="!state?.running && !upload.checking"
                type="text"
                size="small"
                icon-only
                :aria-label="t('common.close')"
                @click="closeQueue"
                ><SvgIcon :src="icon.common.close" size="15"
              /></BButton>
            </div>
          </div>
          <p v-if="upload.selectionError" class="queue-error selection-error" role="alert">{{
            upload.selectionError
          }}</p>
          <p v-if="upload.checking" class="progress-summary" role="status">{{
            t('cloudSpace.uploadQueueChecked', { checked: upload.checked, total: upload.selectionTotal })
          }}</p>
          <template v-if="state">
            <div class="progress-header progress-summary" role="status"
              ><span>{{ t('cloudSpace.uploadQueueSaved', state) }}</span
              ><span>{{ Math.floor(state.overall) }}%</span></div
            >
            <div
              class="progress-track overall-progress"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="t('cloudSpace.uploadFile')"
              :aria-valuenow="Math.floor(state.overall)"
              ><span :style="{ width: `${state.overall}%` }"></span
            ></div>
            <div class="progress-header progress-metrics"
              ><span>{{
                state.running
                  ? formatSpeed(state.speed)
                  : t('cloudSpace.uploadQueueFailedCount', { count: state.failed })
              }}</span
              ><span :class="{ 'queue-error': state.failed > 0 }">{{
                state.failed
                  ? t('cloudSpace.uploadQueueFailedCount', { count: state.failed })
                  : state.running
                    ? t('cloudSpace.uploadQueueContinues')
                    : ''
              }}</span></div
            >
            <p v-if="state.blocked" class="queue-error" role="alert">{{
              t(state.blocked === 'quota' ? 'cloudSpace.uploadQueueQuota' : 'cloudSpace.uploadQueueAuth')
            }}</p>
            <div class="file-progress-list">
              <div v-for="file in state.preview.slice(0, 3)" :key="file.id" class="file-progress-item">
                <span class="file-name" :title="file.name">{{ file.name }}</span>
                <span class="file-status" :class="{ 'queue-error': file.status === 'error' }">{{
                  t(`cloudSpace.uploadQueueStates.${file.status}`)
                }}</span>
                <div
                  class="progress-track file-progress-track"
                  :class="{ 'file-progress-track--error': file.status === 'error' }"
                  ><span :style="{ width: `${file.progress}%` }"></span
                ></div>
              </div>
            </div>
            <p v-if="upload.remaining && !state.running" class="queue-hint">{{
              t('cloudSpace.uploadQueueRetryHint')
            }}</p>
          </template>
          <p class="queue-hint">{{
            t(upload.selectionLimit ? 'cloudSpace.uploadQueueAppendMobileHint' : 'cloudSpace.uploadQueueAppendHint', {
              count: upload.selectionLimit,
            })
          }}</p>
          <p class="queue-hint">{{ t('cloudSpace.uploadQueueSizeHint') }} {{ t('cloudSpace.uploadQueueExitHint') }}</p>
          <div class="upload-actions">
            <BButton
              :type="upload.remaining && !state?.running ? undefined : 'primary'"
              :loading="upload.checking"
              @click="upload.openPicker()"
              >{{ t('cloudSpace.uploadQueueAppend') }}</BButton
            >
            <BButton
              v-if="upload.remaining && !state?.running"
              type="primary"
              :disabled="upload.checking"
              @click="upload.retry()"
              >{{ t('cloudSpace.uploadQueueRetry', { count: upload.remaining }) }}</BButton
            >
            <BButton
              v-if="state?.running || upload.checking"
              type="text"
              class="cancel-upload"
              @click="confirmCancel"
              >{{ t('cloudSpace.cancelUpload') }}</BButton
            >
          </div>
        </template>
      </section>
      <!-- 批量下载沿用自己的状态和取消逻辑，只把进度卡片放到同一个可滚动区域，避免互相覆盖。 -->
      <div id="cloud-transfer-downloads" class="cloud-transfer-downloads"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import useCloudUpload from '@/store/cloudUpload';
  import { bookmarkStore } from '@/store';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const upload = useCloudUpload();
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const picker = ref<{ open: () => void } | null>(null);
  let pendingFolder: string | null = null;
  let pendingOwner = upload.selectionOwner();
  const state = computed(() => upload.progress);
  const visible = computed(() => Boolean(state.value || upload.checking || upload.selectionError));
  const hasError = computed(() => Boolean(upload.selectionError || state.value?.failed || state.value?.blocked));
  const summary = computed(() =>
    state.value
      ? t('cloudSpace.uploadQueueSaved', state.value)
      : upload.selectionError
        ? t('cloudSpace.uploadQueueSelectionFailed')
        : t('cloudSpace.uploadQueueChecked', { checked: upload.checked, total: upload.selectionTotal }),
  );
  const title = computed(() =>
    t(
      upload.checking
        ? 'cloudSpace.uploadQueueChecking'
        : !state.value
          ? 'cloudSpace.uploadQueueSelectionFailed'
          : state.value.running
            ? 'cloudSpace.uploading'
            : upload.remaining
              ? 'cloudSpace.uploadQueueStopped'
              : 'cloudSpace.uploadQueueDone',
    ),
  );
  const formatSpeed = (speed: number) =>
    speed < 1024 * 1024 ? `${(speed / 1024).toFixed(1)} KB/s` : `${(speed / 1024 / 1024).toFixed(1)} MB/s`;
  const detach = upload.attachLifecycle();
  onMounted(() =>
    upload.setPicker((folderId) => {
      pendingFolder = folderId;
      pendingOwner = upload.selectionOwner();
      picker.value?.open();
    }),
  );
  onBeforeUnmount(() => {
    upload.setPicker(undefined);
    detach();
  });
  function selectedFiles(files: File[]) {
    const folder = pendingFolder;
    pendingFolder = null;
    if (pendingOwner !== upload.selectionOwner()) return;
    void upload.enqueue(files, folder);
  }
  function confirmCancel() {
    const owner = upload.selectionOwner();
    Alert.alert({
      title: t('cloudSpace.cancelUpload'),
      content: t('cloudSpace.uploadQueueCancelConfirm'),
      onOk: () => {
        if (owner === upload.selectionOwner()) upload.cancel();
      },
    });
  }
  function closeQueue() {
    const owner = upload.selectionOwner();
    if (!upload.remaining) {
      upload.clear();
      return;
    }
    Alert.alert({
      title: t('cloudSpace.cancelUpload'),
      content: t('cloudSpace.uploadQueueDiscard'),
      onOk: () => {
        if (owner === upload.selectionOwner()) upload.clear();
      },
    });
  }
</script>

<style scoped lang="less">
  .cloud-transfer-dock {
    position: fixed;
    top: var(--ui-layout-70, 70px);
    right: var(--ui-space-20, 20px);
    z-index: 300;
    width: min(var(--ui-layout-380, 380px), calc(100vw - var(--ui-space-40, 40px)));
    max-height: calc(100vh - var(--ui-layout-80, 80px));
    max-height: calc(100dvh - var(--ui-layout-80, 80px));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ui-space-8, 8px);
    pointer-events: none;
  }
  .upload-progress {
    box-sizing: border-box;
    flex-shrink: 0;
    width: var(--ui-layout-360, 360px);
    max-width: 100%;
    padding: var(--ui-space-16, 16px);
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    box-shadow: var(--surface-card-shadow);
    pointer-events: auto;
  }
  .progress-header,
  .progress-header-actions,
  .upload-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
  }
  .progress-title {
    min-width: 0;
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .progress-summary,
  .queue-hint {
    margin: var(--ui-space-10, 10px) 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.5;
  }
  .progress-summary {
    color: var(--text-color);
  }
  .progress-metrics {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    gap: var(--ui-space-16, 16px);
  }
  .progress-track {
    overflow: hidden;
    height: var(--ui-layout-5, 5px);
    border-radius: 999px;
    background: var(--card-border-color);
  }
  .progress-track > span {
    display: block;
    height: 100%;
    background: var(--primary-color);
  }
  .overall-progress {
    margin-bottom: var(--ui-space-8, 8px);
  }
  .file-progress-list {
    margin: var(--ui-space-6, 6px) 0 var(--ui-space-12, 12px);
  }
  .file-progress-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px) 0;
    border-bottom: 1px solid var(--card-border-color);
  }
  .file-name {
    min-width: 0;
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
    height: var(--ui-layout-3, 3px);
  }
  .queue-error {
    color: var(--danger-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .selection-error {
    overflow-wrap: anywhere;
  }
  .file-progress-track--error > span {
    background: var(--danger-color);
  }
  .upload-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
    margin-top: var(--ui-space-16, 16px);
  }
  .cancel-upload {
    margin-left: auto;
  }
  .upload-progress--collapsed {
    width: var(--ui-layout-280, 280px);
    padding: 0;
    overflow: hidden;
  }
  .upload-compact {
    display: flex;
    align-items: center;
    width: 100%;
    height: auto;
    min-height: var(--ui-control-60, 60px);
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    gap: var(--ui-space-10, 10px);
    text-align: left;
  }
  .upload-status-dot {
    flex-shrink: 0;
    width: var(--ui-layout-7, 7px);
    height: var(--ui-layout-7, 7px);
    border-radius: 50%;
    background: var(--primary-color);
  }
  .upload-status-dot--error {
    background: var(--danger-color);
  }
  .upload-compact-copy {
    display: grid;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
    flex: 1;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .upload-compact-copy strong {
    color: var(--text-color);
    font-weight: 600;
    font-size: var(--ui-font-13, 13px);
  }
  .upload-compact-copy > span {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .upload-compact-end {
    flex-shrink: 0;
    display: grid;
    gap: var(--ui-space-4, 4px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    text-align: right;
  }
  .upload-compact-end small {
    font-size: inherit;
    color: var(--desc-color);
  }
  .upload-progress--collapsed > .progress-track {
    height: var(--ui-layout-3, 3px);
  }
  .cloud-transfer-downloads {
    width: 100%;
    flex-shrink: 0;
    pointer-events: auto;
  }
  .cloud-transfer-downloads:empty {
    display: none;
  }
  .cloud-transfer-dock--mobile {
    top: calc(max(env(safe-area-inset-top), var(--ui-layout-56, 56px)) + var(--ui-space-8, 8px));
    left: var(--ui-space-10, 10px);
    right: var(--ui-space-10, 10px);
    width: auto;
  }
  .cloud-transfer-dock--mobile .upload-progress {
    width: 100%;
  }
  :global(html.light-note-mobile-rendering) .upload-progress {
    box-shadow: none;
    border-color: var(--card-border-color);
  }
</style>
