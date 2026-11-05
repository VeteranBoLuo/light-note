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
            <span class="upload-status-dot" :class="statusClass" aria-hidden="true"></span>
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
              ><span v-if="state && !complete">{{ Math.floor(state.overall) }}%</span
              ><small>{{ t('cloudSpace.uploadQueueExpandLabel') }}</small></span
            >
          </BButton>
          <div v-if="state && !complete" class="progress-track" :class="statusClass" aria-hidden="true"
            ><span :style="{ width: `${state.overall}%` }"></span
          ></div>
        </template>
        <template v-else>
          <div class="progress-header">
            <strong class="progress-title">
              <span class="upload-status-dot" :class="statusClass" aria-hidden="true"></span>
              <span>{{ title }}</span>
            </strong>
            <div class="progress-header-actions">
              <BButton
                type="text"
                size="small"
                class="queue-collapse"
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
                class="queue-close"
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
            <p v-if="complete" class="progress-summary completed-summary" role="status">{{
              t('cloudSpace.uploadQueueCompleted', { count: state.success })
            }}</p>
            <div v-else-if="singleFile" class="single-file">
              <div class="file-heading">
                <SvgIcon :src="icon.organize.file" size="18" aria-hidden="true" />
                <strong class="file-name" :title="singleFile.name">{{ singleFile.name }}</strong>
              </div>
              <div class="single-file-meta">
                <span class="file-status" :class="statusClass">{{ fileStatus(singleFile) }}</span>
                <strong class="progress-percent">{{ Math.floor(state.overall) }}%</strong>
              </div>
              <div
                class="progress-track"
                :class="statusClass"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="t('cloudSpace.uploadQueueFileProgress', { name: singleFile.name })"
                :aria-valuenow="Math.floor(state.overall)"
                ><span :style="{ width: `${state.overall}%` }"></span
              ></div>
              <div v-if="state.running" class="progress-header progress-metrics">
                <span>{{ formatSpeed(state.speed) }}</span>
                <span>{{ t('cloudSpace.uploadQueueContinues') }}</span>
              </div>
            </div>
            <div v-else class="overall-progress">
              <div class="progress-header progress-summary" role="status">
                <span>{{ t('cloudSpace.uploadQueueUploaded', state) }}</span>
                <strong class="progress-percent">{{ Math.floor(state.overall) }}%</strong>
              </div>
              <div
                class="progress-track"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="t('cloudSpace.uploadQueueOverallProgress')"
                :aria-valuenow="Math.floor(state.overall)"
                ><span :style="{ width: `${state.overall}%` }"></span
              ></div>
              <div v-if="state.running || state.failed" class="progress-header progress-metrics">
                <span v-if="state.running">{{ formatSpeed(state.speed) }}</span>
                <span v-if="state.failed" class="queue-error">{{
                  t('cloudSpace.uploadQueueFailedCount', { count: state.failed })
                }}</span>
                <span v-else-if="state.running">{{ t('cloudSpace.uploadQueueContinues') }}</span>
              </div>
            </div>
            <p v-if="state.blocked" class="queue-error" role="alert">{{
              t(state.blocked === 'quota' ? 'cloudSpace.uploadQueueQuota' : 'cloudSpace.uploadQueueAuth')
            }}</p>
            <div v-if="!complete && state.total > 1" class="file-progress-list">
              <div v-for="file in state.preview.slice(0, 3)" :key="file.id" class="file-progress-item">
                <span class="file-name" :title="file.name">{{ file.name }}</span>
                <span class="file-status" :class="{ 'queue-error': file.status === 'error' }"
                  >{{ fileStatus(file)
                  }}<span v-if="file.status !== 'queued'"> · {{ filePercent(file.progress) }}%</span></span
                >
                <div
                  v-if="file.status !== 'queued'"
                  class="progress-track file-progress-track"
                  :class="{ 'upload-status--error': file.status === 'error' }"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="t('cloudSpace.uploadQueueFileProgress', { name: file.name })"
                  :aria-valuenow="filePercent(file.progress)"
                  ><span :style="{ width: `${filePercent(file.progress)}%` }"></span
                ></div>
              </div>
            </div>
            <p v-if="upload.remaining" class="queue-hint">{{
              t(
                state.running
                  ? 'cloudSpace.uploadQueueExitHint'
                  : state.total === 1
                    ? 'cloudSpace.uploadQueueSessionHint'
                    : 'cloudSpace.uploadQueueRetryHint',
              )
            }}</p>
          </template>
          <div class="upload-actions">
            <BButton
              v-if="state?.running || upload.checking"
              type="text"
              class="cancel-upload"
              @click="confirmCancel"
              >{{ t('cloudSpace.cancelUpload') }}</BButton
            >
            <BButton
              :type="canRetry ? 'text' : 'primary'"
              :class="{ 'upload-primary': !canRetry }"
              :loading="upload.checking"
              @click="upload.openPicker()"
              >{{ t('cloudSpace.uploadQueueAppend') }}</BButton
            >
            <BButton
              v-if="canRetry"
              type="primary"
              class="upload-primary"
              :disabled="upload.checking"
              @click="upload.retry()"
              >{{ t('cloudSpace.uploadQueueRetry', { count: upload.remaining }) }}</BButton
            >
          </div>
          <div v-if="!complete || upload.checking" class="upload-help">
            <BButton
              type="text"
              size="small"
              class="upload-help-toggle"
              :aria-expanded="helpExpanded"
              aria-controls="cloud-upload-help"
              @click="helpExpanded = !helpExpanded"
            >
              <SvgIcon
                :src="icon.pagination.chevron"
                size="10"
                class="upload-help-chevron"
                :class="{ 'is-expanded': helpExpanded }"
                aria-hidden="true"
              />
              {{ t('cloudSpace.uploadQueueHelp') }}
            </BButton>
            <div v-if="helpExpanded" id="cloud-upload-help" class="upload-help-copy">
              <p>{{ t('cloudSpace.uploadQueueSizeHint') }}</p>
              <p>{{
                t(
                  upload.selectionLimit ? 'cloudSpace.uploadQueueAppendMobileHint' : 'cloudSpace.uploadQueueAppendHint',
                  {
                    count: upload.selectionLimit,
                  },
                )
              }}</p>
            </div>
          </div>
        </template>
      </section>
      <!-- 批量下载沿用自己的状态和取消逻辑，只把进度卡片放到同一个可滚动区域，避免互相覆盖。 -->
      <div id="cloud-transfer-downloads" class="cloud-transfer-downloads"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import useCloudUpload from '@/store/cloudUpload';
  import { bookmarkStore } from '@/store';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { CloudUploadSnapshot } from '@/utils/cloudUploadQueue';

  const upload = useCloudUpload();
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const picker = ref<{ open: () => void } | null>(null);
  const helpExpanded = ref(false);
  let pendingFolder: string | null = null;
  let pendingOwner = upload.selectionOwner();
  const state = computed(() => upload.progress);
  const visible = computed(() => Boolean(state.value || upload.checking || upload.selectionError));
  const hasError = computed(() => Boolean(upload.selectionError || state.value?.failed || state.value?.blocked));
  const complete = computed(() =>
    Boolean(state.value && state.value.total > 0 && state.value.success === state.value.total),
  );
  const singleFile = computed(() => (state.value?.total === 1 ? state.value.preview[0] : undefined));
  const canRetry = computed(() => Boolean(upload.remaining && !state.value?.running));
  const statusClass = computed(() => ({
    'upload-status--error': hasError.value,
    'upload-status--success': !hasError.value && complete.value,
    'upload-status--stopped': !hasError.value && canRetry.value && !upload.checking,
  }));
  watch(visible, (shown) => {
    if (!shown) helpExpanded.value = false;
  });
  const summary = computed(() =>
    state.value
      ? complete.value
        ? t('cloudSpace.uploadQueueCompleted', { count: state.value.success })
        : singleFile.value?.name || t('cloudSpace.uploadQueueUploaded', state.value)
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
  const filePercent = (progress: number) => Math.min(99, Math.floor(progress));
  const fileStatus = (file: CloudUploadSnapshot['preview'][number]) =>
    t(
      !state.value?.running && file.status === 'queued'
        ? 'cloudSpace.uploadQueueWaitingRetry'
        : `cloudSpace.uploadQueueStates.${file.status}`,
    );
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
    padding: var(--ui-space-18, 18px) var(--ui-space-18, 18px) var(--ui-space-12, 12px);
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    border: 1px solid var(--surface-border-color);
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
    gap: var(--ui-space-12, 12px);
  }
  .progress-header-actions {
    flex-shrink: 0;
    gap: var(--ui-space-8, 8px);
  }
  .progress-title {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    font-size: var(--ui-font-15, 15px);
    font-weight: 600;
  }
  .queue-collapse,
  .queue-close {
    height: var(--ui-control-32, 32px);
    padding: 0;
  }
  .queue-close {
    width: var(--ui-control-32, 32px);
    color: var(--desc-color);
  }
  .progress-summary {
    margin: var(--ui-space-14, 14px) 0 var(--ui-space-10, 10px);
    font-size: var(--ui-font-13, 13px);
    color: var(--text-color);
    line-height: 1.5;
  }
  .completed-summary {
    color: var(--desc-color);
    margin-bottom: 0;
  }
  .queue-hint {
    margin: var(--ui-space-16, 16px) 0 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.65;
  }
  .progress-percent {
    flex-shrink: 0;
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .progress-metrics {
    margin-top: var(--ui-space-8, 8px);
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
    gap: var(--ui-space-12, 12px);
  }
  .progress-metrics .queue-error {
    font-size: inherit;
  }
  .progress-track {
    overflow: hidden;
    height: var(--ui-layout-5, 5px);
    border-radius: 999px;
    background: var(--surface-divider-color);
  }
  .progress-track > span {
    display: block;
    height: 100%;
    background: var(--primary-color);
  }
  .overall-progress,
  .single-file {
    margin-top: var(--ui-space-20, 20px);
  }
  .overall-progress .progress-summary {
    margin-top: 0;
  }
  .file-heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    color: var(--desc-color);
  }
  .file-heading .file-name {
    font-size: var(--ui-font-14, 14px);
    color: var(--text-color);
    font-weight: 500;
  }
  .single-file-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    margin: var(--ui-space-10, 10px) 0 var(--ui-space-9, 9px);
  }
  .single-file-meta .file-status {
    font-size: var(--ui-font-12, 12px);
  }
  .file-progress-list {
    margin-top: var(--ui-space-10, 10px);
  }
  .file-progress-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--ui-space-9, 9px) var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) 0;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .file-progress-item:last-child {
    padding-bottom: 0;
    border-bottom: 0;
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
    white-space: nowrap;
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
  .upload-status--error {
    color: var(--danger-color);
  }
  .upload-status--stopped {
    color: var(--warning-color);
  }
  .progress-track.upload-status--error > span,
  .upload-status-dot.upload-status--error {
    background: var(--danger-color);
  }
  .progress-track.upload-status--stopped > span,
  .upload-status-dot.upload-status--stopped {
    background: var(--warning-color);
  }
  .upload-status-dot.upload-status--success {
    background: var(--success-color);
  }
  .upload-actions {
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-16, 16px);
    padding-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--surface-divider-color);
  }
  .cancel-upload {
    color: var(--desc-color);
  }
  .upload-primary {
    margin-left: auto;
  }
  .upload-help {
    margin-top: var(--ui-space-8, 8px);
    color: var(--desc-color);
  }
  .upload-help-toggle {
    min-height: var(--ui-control-32, 32px);
    padding: 0;
    gap: var(--ui-space-5, 5px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .upload-help-chevron {
    transform: rotate(-90deg);
  }
  .upload-help-chevron.is-expanded {
    transform: rotate(0);
  }
  .upload-help-copy {
    padding: var(--ui-space-4, 4px) 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.65;
  }
  .upload-help-copy p {
    margin: 0 0 var(--ui-space-6, 6px);
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
    padding-inline: var(--ui-space-16, 16px);
  }
  .cloud-transfer-dock--mobile .upload-progress--collapsed {
    padding: 0;
  }
  .cloud-transfer-dock--mobile .queue-close {
    width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
  }
  :global(html.light-note-mobile-rendering .cloud-transfer-dock .upload-progress) {
    box-shadow: none;
    border-color: var(--surface-border-color);
  }
</style>
