<template>
  <!-- 数据与备份：内嵌状态面板负责一键备份、进度与下载；弹框只用于自定义内容和查看未完成项目。 -->
  <div class="data-backup" :class="{ 'is-stacked': stacked }">
    <p v-if="error" role="alert" class="backup-error">{{ error }}</p>
    <BLoading v-if="!ready" :loading="true" />
    <template v-else>
      <div class="backup-status" :data-state="state">
        <div class="backup-main" role="status">
          <BChip :tone="chip.tone" class="backup-chip">
            <SvgIcon :src="chip.icon" size="13" />
            {{ t(`dataExport.chip.${state}`) }}
          </BChip>
          <p class="backup-headline">{{ headline }}</p>
          <p class="backup-sub">{{ sub }}</p>
          <p v-if="filesTooLarge && ['never', 'expired', 'failed'].includes(state)" class="backup-notice">
            <SvgIcon :src="icon.message.info" size="14" />
            <span>{{ t('dataExport.filesTooLarge', { size: formatSize(summary!.fileBytes) }) }}</span>
            <BButton type="text" size="small" class="backup-link" @click="openCloudSpace">{{
              t('dataExport.openCloudSpace')
            }}</BButton>
          </p>
          <BButton v-if="state === 'partial'" type="text" size="small" class="backup-link" @click="openFailures">
            {{ t('dataExport.failures') }}
          </BButton>
        </div>
        <div class="backup-actions">
          <template v-if="state === 'running'">
            <BButton :block="stacked" :loading="busy" :disabled="!owner" @click="cancel">{{
              t('dataExport.cancelBackup')
            }}</BButton>
          </template>
          <template v-else-if="state === 'done' || state === 'partial'">
            <BButton type="primary" :block="stacked" :loading="busy" :disabled="!owner" @click="download">
              <SvgIcon :src="icon.toolbox.download" size="16" />{{ t('dataExport.downloadBackup') }}
            </BButton>
            <BButton
              type="text"
              size="small"
              class="backup-link"
              :disabled="busy || !owner"
              @click="submit(fitOptions(task!.options))"
            >
              {{ t('dataExport.rebackup') }}
            </BButton>
          </template>
          <template v-else>
            <BButton type="primary" :block="stacked" :loading="busy" :disabled="!owner" @click="submitPrimary">
              <SvgIcon :src="state === 'failed' ? icon.infrastructure.refresh : icon.toolbox.download" size="16" />
              {{ primaryLabel }}
            </BButton>
            <BButton type="text" size="small" class="backup-link" :disabled="busy || !owner" @click="openOptions">
              {{ t('dataExport.customize') }}
            </BButton>
            <p v-if="largeFiles && !filesTooLarge && state !== 'failed'" class="backup-hint">{{
              t('dataExport.largeHint')
            }}</p>
          </template>
        </div>
        <div v-if="state === 'running' && task" class="backup-progress">
          <BProgress :percent="task.total ? (task.completed / task.total) * 100 : 0" :aria-label="stageLabel" />
        </div>
      </div>
      <section class="backup-includes" :aria-label="t('dataExport.includesTitle')">
        <h3>{{ t('dataExport.includesTitle') }}</h3>
        <p v-if="summaryFailed" class="backup-sub">{{ t('dataExport.summaryFailed') }}</p>
        <ul>
          <li v-for="item in includes" :key="item.kind" :class="`is-${item.kind}`">
            <span class="include-icon"><SvgIcon :src="item.icon" size="18" /></span>
            <span class="include-text">
              <b>{{ item.title }}</b>
              <small>{{ item.hint }}</small>
            </span>
          </li>
        </ul>
      </section>
    </template>

    <BModal
      v-model:visible="visible"
      :title="t(mode === 'failures' ? 'dataExport.failuresTitle' : 'dataExport.title')"
      width="var(--ui-layout-540, 540px)"
      :show-footer="false"
    >
      <div class="data-export">
        <p v-if="error" role="alert" class="export-error">{{ error }}</p>
        <template v-if="mode === 'options'">
          <p class="export-intro">{{ t('dataExport.choose') }}</p>
          <section v-for="kind in kinds" :key="kind" class="export-option">
            <BCheckbox
              :model-value="options.types.includes(kind)"
              :disabled="busy || (kind === 'files' && filesTooLarge)"
              @update:model-value="toggle(kind, $event)"
              >{{ t(`dataExport.${kind}`) }}</BCheckbox
            >
            <p v-if="kind === 'files' && filesTooLarge">{{
              t('dataExport.fileTooLargeHint', { size: formatSize(summary!.fileBytes) })
            }}</p>
            <p v-else>{{ t(`dataExport.${KIND_HINTS[kind]}`) }}</p>
            <div v-if="kind === 'notes' && options.types.includes('notes')" class="export-note-options">
              <label id="data-export-format">{{ t('dataExport.format') }}</label>
              <BSelect
                v-model:value="options.noteFormat"
                :options="formats"
                aria-labelledby="data-export-format"
                :disabled="busy"
              />
              <p v-if="options.noteFormat === 'original'">{{ t('dataExport.originalHint') }}</p>
              <p v-if="options.noteFormat === 'markdown'">{{ t('dataExport.markdownHint') }}</p>
              <BCheckbox v-model="options.includeImages" :disabled="busy">{{ t('dataExport.images') }}</BCheckbox>
              <p v-if="options.includeImages">{{ t('dataExport.imageHint') }}</p>
            </div>
          </section>
          <p class="export-hint">{{ t('dataExport.archiveHint') }}</p>
          <p v-if="empty" role="status">{{ t('dataExport.empty') }}</p>
          <div class="export-actions"
            ><BButton @click="visible = false">{{ t('dataExport.close') }}</BButton
            ><BButton
              type="primary"
              :loading="busy"
              :disabled="!options.types.length || !owner"
              @click="submit(options, true)"
              >{{ t('dataExport.start') }}</BButton
            ></div
          >
        </template>
        <template v-else>
          <div class="export-failures">
            <p v-for="(failure, index) in failures" :key="index"
              ><strong>{{ failure.title }}</strong
              ><br />{{ reason(failure.code) }}</p
            >
          </div>
          <div class="export-actions">
            <BButton v-if="hasMoreFailures" :loading="failureLoading" @click="loadFailures">{{
              t('dataExport.more')
            }}</BButton>
            <BButton @click="visible = false">{{ t('dataExport.close') }}</BButton>
          </div>
        </template>
      </div>
    </BModal>
  </div>
</template>
<script setup lang="ts">
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    DATA_EXPORT_ACTIVE,
    DATA_EXPORT_FULL_BACKUP,
    DATA_EXPORT_TYPES,
    isFullDataBackup,
    normalizeDataExportOptions,
    type DataBackupSummary,
    type DataExportOptions,
    type DataExportType,
    type DataExportTask,
    type DataExportFailure,
  } from '@lightnote/shared/data-export';
  import { useRouter } from 'vue-router';
  import { apiBasePost } from '@/http/request';
  import { isLightNoteAndroidApp, postAndroidMessage } from '@/utils/androidBridge';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  type BackupState = 'never' | 'running' | 'done' | 'partial' | 'expired' | 'failed';

  // stacked：手机等窄屏把操作放到说明下方，主按钮撑满宽度。
  const props = defineProps<{ owner: string; stacked?: boolean }>();
  const { t, locale } = useI18n();
  const router = useRouter();
  const KIND_HINTS: Record<DataExportType, string> = {
    notes: 'noteHint',
    bookmarks: 'bookmarkHint',
    files: 'fileHint',
    extractions: 'extractionHint',
  };
  // 超过 1GB 的文件原件打包和下载都更慢，提前说明，不拦截。
  const LARGE_FILE_BYTES = 1024 * 1024 * 1024;
  const fullBackup = (): DataExportOptions => ({
    ...DATA_EXPORT_FULL_BACKUP,
    types: [...DATA_EXPORT_FULL_BACKUP.types],
  });

  const visible = ref(false),
    mode = ref<'options' | 'failures'>('options'),
    busy = ref(false),
    loading = ref(false),
    loaded = ref(false),
    empty = ref(false),
    error = ref('');
  const options = ref<DataExportOptions>(fullBackup());
  const task = ref<DataExportTask | null>(null),
    summary = ref<DataBackupSummary | null>(null),
    summaryFailed = ref(false),
    failures = ref<DataExportFailure[]>([]),
    failureLoading = ref(false),
    hasMoreFailures = ref(false);
  const kinds = DATA_EXPORT_TYPES,
    formats = computed(() => [
      { label: t('dataExport.original'), value: 'original' },
      { label: 'HTML', value: 'html' },
      { label: 'Markdown', value: 'markdown' },
    ]);
  const ready = computed(() => loaded.value || !props.owner);
  const active = computed(() => !!task.value && DATA_EXPORT_ACTIVE.includes(task.value.status));

  /** 任务状态优先；没有可展示的任务时看是否备份过。 */
  const state = computed<BackupState>(() => {
    const current = task.value;
    if (active.value) return 'running';
    if (current?.canDownload) return current.status === 'partial' ? 'partial' : 'done';
    if (current?.status === 'failed') return 'failed';
    return summary.value?.lastBackup ? 'expired' : 'never';
  });
  // 进行中用品牌紫（pin），完成绿、部分完成橙、失败红；标签同时带图标和文字。
  const CHIPS: Record<BackupState, { tone: 'neutral' | 'pin' | 'success' | 'pending' | 'danger'; icon: string }> = {
    never: { tone: 'neutral', icon: icon.message.info },
    running: { tone: 'pin', icon: icon.todoWorkspace.clock },
    done: { tone: 'success', icon: icon.organize.check },
    partial: { tone: 'pending', icon: icon.message.warning },
    expired: { tone: 'neutral', icon: icon.todoWorkspace.clock },
    failed: { tone: 'danger', icon: icon.message.error },
  };
  const chip = computed(() => CHIPS[state.value]);

  function formatSize(bytes: number) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  function formatTime(value: number | string, withTime = true) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, {
      month: 'short',
      day: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    }).format(date);
  }
  const totalRecords = computed(() =>
    summary.value ? summary.value.notes + summary.value.bookmarks + summary.value.files : 0,
  );
  const largeFiles = computed(() => (summary.value?.fileBytes || 0) > LARGE_FILE_BYTES);
  // 文件总量超出服务器一次能打包的大小：一键备份只含笔记和书签，文件引导到云空间批量下载。
  const filesTooLarge = computed(() => summary.value?.filesFit === false);
  function fitOptions(input: DataExportOptions): DataExportOptions {
    if (!filesTooLarge.value || !input.types.includes('files')) return input;
    const types = input.types.filter((type) => type !== 'files');
    return { ...input, types: types.length ? types : ['notes', 'bookmarks'] };
  }
  const oneClickBackup = () => fitOptions(fullBackup());
  const stageLabel = computed(() => {
    const stage = task.value?.stage || '';
    if (['notes', 'bookmarks', 'files'].includes(stage)) return t(`dataExport.stage.${stage}`);
    return t(`dataExport.${['packing', 'preparing', 'queued'].includes(stage) ? stage : 'running'}`);
  });

  const headline = computed(() => {
    const current = task.value;
    switch (state.value) {
      case 'running':
        return t('dataExport.headline.running', { completed: current?.completed || 0, total: current?.total || 0 });
      case 'done':
        // 完成时把保留期重置为 24 小时，用它倒推完成时刻。
        return t('dataExport.headline.done', {
          time: formatTime(Date.parse(current!.expiresAt) - 24 * 3600 * 1000),
          total: current!.total,
        });
      case 'partial':
        return t('dataExport.headline.partial', { done: current!.total - current!.failed, total: current!.total });
      case 'expired': {
        const last = summary.value!.lastBackup!;
        const withoutFiles =
          !last.types.includes('files') && last.types.includes('notes') && last.types.includes('bookmarks');
        const key = isFullDataBackup(last.types)
          ? 'dataExport.headline.expired'
          : withoutFiles
            ? 'dataExport.headline.expiredNoFiles'
            : 'dataExport.headline.expiredCustom';
        return t(key, { date: formatTime(last.at, false), total: last.total });
      }
      case 'failed':
        return t('dataExport.headline.failed');
      default:
        return summary.value?.fileBytes
          ? t('dataExport.headline.neverWithSize', { total: totalRecords.value, size: formatSize(summary.value.fileBytes) })
          : t('dataExport.headline.never', { total: totalRecords.value });
    }
  });
  const sub = computed(() => {
    const current = task.value;
    switch (state.value) {
      case 'running':
        return t('dataExport.sub.running', { stage: stageLabel.value });
      case 'done': {
        const expires = formatTime(current!.expiresAt);
        return current!.archiveBytes
          ? t('dataExport.sub.doneWithSize', { size: formatSize(current!.archiveBytes), expires })
          : t('dataExport.sub.done', { expires });
      }
      case 'partial':
        return t('dataExport.sub.partial', { failed: current!.failed, expires: formatTime(current!.expiresAt) });
      case 'expired':
        return t('dataExport.sub.expired');
      case 'failed':
        return current?.errorCode === 'DATA_EXPORT_DISK_FULL'
          ? t('dataExport.sub.failedReason', { reason: t('dataExport.diskFull') })
          : t('dataExport.sub.failed');
      default:
        return t('dataExport.sub.never');
    }
  });
  const primaryLabel = computed(() => {
    if (state.value === 'failed') return t('dataExport.retry');
    if (filesTooLarge.value) return t('dataExport.backupNotesBookmarks');
    return t(state.value === 'expired' ? 'dataExport.backupAgain' : 'dataExport.backupAll');
  });
  const includes = computed(() => {
    const value = summary.value;
    const count = (n: number | undefined) => (value ? n || 0 : '—');
    return [
      {
        kind: 'note',
        icon: icon.resource.note,
        title: t('dataExport.include.notes', { n: count(value?.notes) }),
        hint: t('dataExport.include.notesHint'),
      },
      {
        kind: 'bookmark',
        icon: icon.resource.bookmark,
        title: t('dataExport.include.bookmarks', { n: count(value?.bookmarks) }),
        hint: t('dataExport.include.bookmarksHint'),
      },
      {
        kind: 'file',
        icon: icon.resource.file,
        title: t('dataExport.include.files', { n: count(value?.files) }),
        hint: filesTooLarge.value
          ? t('dataExport.include.filesTooLarge', { size: formatSize(value!.fileBytes) })
          : value?.fileBytes
            ? t('dataExport.include.filesHintWithSize', { size: formatSize(value.fileBytes) })
            : t('dataExport.include.filesHint'),
      },
    ];
  });

  let generation = 0,
    sequence = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    requestId = '',
    requestKey = '';
  const storageKey = () => `light-note:data-export:${props.owner}`;
  function reason(code: string) {
    return t(
      'dataExport.' +
        ({
          DATA_EXPORT_SOURCE_CHANGED: 'sourceChanged',
          DATA_EXPORT_SOURCE_MISSING: 'sourceMissing',
          DATA_EXPORT_IMAGE_FAILED: 'imageFailed',
          DATA_EXPORT_CONVERSION_FAILED: 'conversionFailed',
          DATA_EXPORT_DISK_FULL: 'diskFull',
        }[code] || 'itemFailed'),
    );
  }
  async function api(action: string, body: Record<string, unknown> = {}) {
    const res = await apiBasePost('/api/user/dataExports/' + action, body, { silent: true });
    if (res?.status !== 200) {
      const code = res?.data?.errorCode;
      throw new Error(code === 'DATA_EXPORT_UNAVAILABLE' ? 'unavailable' : code === 'DATA_EXPORT_DISK_FULL' ? 'diskFull' : 'failure');
    }
    return res.data;
  }
  function report(e: unknown) {
    const message = e instanceof Error ? e.message : '';
    error.value = t(
      message === 'unavailable' ? 'dataExport.unavailable' : message === 'diskFull' ? 'dataExport.diskFull' : 'dataExport.failure',
    );
  }
  function schedule() {
    clearTimeout(timer);
    if (active.value && !document.hidden) timer = setTimeout(() => refresh(), 3000);
  }
  async function loadSummary() {
    const g = generation;
    try {
      const result = await api('summary');
      if (g !== generation) return;
      summary.value = result;
      summaryFailed.value = false;
    } catch {
      if (g === generation) summaryFailed.value = true;
    }
  }
  async function refresh() {
    if (!props.owner || document.hidden || loading.value) return;
    const g = generation,
      s = ++sequence,
      wasActive = active.value;
    loading.value = true;
    try {
      const result = await api('latest');
      if (g !== generation || s !== sequence) return;
      task.value = result;
      error.value = '';
      // 任务刚结束时上次备份已更新，重新读取清单。
      if (wasActive && !active.value) void loadSummary();
      schedule();
    } catch (e) {
      if (g === generation && s === sequence) report(e);
    } finally {
      if (g === generation && s === sequence) {
        loading.value = false;
        loaded.value = true;
      }
    }
  }
  /** 注销前导出等外部入口：进行中时面板已显示进度，否则打开自定义内容。 */
  async function open() {
    if (!active.value) openOptions();
  }
  function openCloudSpace() {
    void router.push('/cloudSpace');
  }
  function openOptions() {
    options.value = fitOptions(options.value);
    mode.value = 'options';
    empty.value = false;
    error.value = '';
    visible.value = true;
  }
  async function openFailures() {
    mode.value = 'failures';
    failures.value = [];
    hasMoreFailures.value = false;
    visible.value = true;
    await loadFailures();
  }
  function toggle(kind: DataExportType, checked: boolean) {
    options.value.types = checked ? [...options.value.types, kind] : options.value.types.filter((k) => k !== kind);
    empty.value = false;
  }
  function submitPrimary() {
    void submit(state.value === 'failed' && task.value ? fitOptions(task.value.options) : oneClickBackup());
  }
  async function submit(input: DataExportOptions, fromDialog = false) {
    if (busy.value || !props.owner) return;
    const g = generation;
    ++sequence;
    clearTimeout(timer);
    busy.value = true;
    error.value = '';
    const selected = normalizeDataExportOptions(input);
    // 同一组选项重复提交（如网络重试）复用同一请求 ID，服务端据此去重。
    const key = JSON.stringify(selected);
    if (key !== requestKey) {
      requestId = crypto.randomUUID();
      requestKey = key;
    }
    try {
      const result = await api('create', { ...selected, requestId });
      if (g !== generation) return;
      try {
        localStorage.setItem(storageKey(), JSON.stringify(selected));
      } catch {
        /* storage may be unavailable */
      }
      requestId = '';
      requestKey = '';
      empty.value = !!result?.empty;
      if (empty.value) {
        if (!fromDialog) openOptions();
        empty.value = true;
      } else {
        task.value = result;
        visible.value = false;
        failures.value = [];
        schedule();
      }
    } catch (e) {
      if (g === generation) report(e);
    } finally {
      if (g === generation) {
        busy.value = false;
        loading.value = false;
      }
    }
  }
  async function cancel() {
    if (!task.value || busy.value) return;
    const g = generation;
    ++sequence;
    busy.value = true;
    clearTimeout(timer);
    try {
      const result = await api('cancel', { id: task.value.id });
      if (g === generation) task.value = result;
    } catch (e) {
      if (g === generation) report(e);
    } finally {
      if (g === generation) {
        busy.value = false;
        schedule();
      }
    }
  }
  async function loadFailures() {
    if (!task.value || failureLoading.value) return;
    const g = generation,
      id = task.value.id;
    failureLoading.value = true;
    try {
      const rows = await api('failures', { id, offset: failures.value.length });
      if (g !== generation || task.value?.id !== id) return;
      failures.value.push(...rows);
      hasMoreFailures.value = rows.length === 50;
    } catch (e) {
      if (g === generation) report(e);
    } finally {
      if (g === generation) failureLoading.value = false;
    }
  }
  async function download() {
    if (!task.value?.canDownload || busy.value) return;
    const g = generation,
      id = task.value.id;
    busy.value = true;
    try {
      const current = await api('detail', { id });
      if (g !== generation || task.value?.id !== id) return;
      task.value = current;
      if (!current.canDownload) return;
    } catch (e) {
      if (g === generation) report(e);
      return;
    } finally {
      if (g === generation) busy.value = false;
    }
    const url = new URL('/api/user/dataExports/download/' + task.value.id, window.location.origin).href;
    if (isLightNoteAndroidApp()) {
      if (!postAndroidMessage({ type: 'download', url, fileName: '轻笺备份.zip' }))
        error.value = t('dataExport.failure');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  useForegroundRefresh({ refresh, trailingWake: true, staleMs: 1000, canRefresh: () => Boolean(props.owner) && !busy.value });
  function visibility() {
    if (document.hidden) clearTimeout(timer);
  }
  watch(
    () => props.owner,
    () => {
      generation++;
      sequence++;
      clearTimeout(timer);
      task.value = null;
      summary.value = null;
      summaryFailed.value = false;
      visible.value = false;
      mode.value = 'options';
      busy.value = false;
      loading.value = false;
      loaded.value = false;
      error.value = '';
      empty.value = false;
      requestId = '';
      requestKey = '';
      failures.value = [];
      failureLoading.value = false;
      try {
        options.value = normalizeDataExportOptions(JSON.parse(localStorage.getItem(storageKey()) || 'null'));
      } catch {
        options.value = fullBackup();
      }
      void refresh();
      if (props.owner) void loadSummary();
    },
    { immediate: true },
  );
  document.addEventListener('visibilitychange', visibility);
  onBeforeUnmount(() => {
    generation++;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', visibility);
  });
  defineExpose({ open });
</script>
<style scoped lang="less">
  .data-backup {
    color: var(--text-color);
    min-width: 0;
  }
  .backup-error {
    margin: 0 0 var(--ui-space-12, 12px);
    color: var(--danger-color);
  }
  .backup-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-16, 16px) var(--ui-space-28, 28px);
  }
  .backup-main {
    flex: 1 1 var(--ui-layout-320, 320px);
    min-width: 0;
  }
  .backup-chip :deep(.b-chip__content) {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
  }
  .backup-headline {
    margin: var(--ui-space-10, 10px) 0 var(--ui-space-4, 4px);
    font-size: var(--ui-font-20, 20px);
    font-weight: 650;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .backup-sub {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.65;
  }
  .backup-link {
    margin-top: var(--ui-space-6, 6px);
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .backup-notice {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--ui-space-4, 4px) var(--ui-space-6, 6px);
    margin: var(--ui-space-10, 10px) 0 0;
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border: 1px solid var(--workspace-divider, var(--border-color));
    border-left: 3px solid var(--warning-color);
    border-radius: 8px;
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .backup-notice > :first-child {
    align-self: center;
    color: var(--warning-color);
  }
  .backup-notice span {
    flex: 1 1 var(--ui-layout-220, 220px);
  }
  .backup-notice .backup-link {
    margin-top: 0;
  }
  .backup-actions {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ui-space-6, 6px);
    margin-left: auto;
  }
  .backup-actions .backup-link {
    margin-top: 0;
  }
  .backup-actions :deep(.b_btn) {
    gap: var(--ui-space-6, 6px);
  }
  .backup-hint {
    max-width: var(--ui-layout-220, 220px);
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    text-align: right;
  }
  .backup-progress {
    flex: 1 1 100%;
  }
  .backup-includes {
    margin-top: var(--ui-space-20, 20px);
    padding-top: var(--ui-space-18, 18px);
    border-top: 1px solid var(--workspace-divider, var(--border-color));
  }
  .backup-includes h3 {
    margin: 0 0 var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }
  .backup-includes ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--ui-layout-220, 220px), 1fr));
    gap: var(--ui-space-12, 12px);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .backup-includes li {
    display: flex;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    border: 1px solid var(--workspace-divider, var(--border-color));
    border-radius: 12px;
  }
  .include-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    border: 1px solid currentColor;
    border-radius: 9px;
  }
  .is-note .include-icon {
    color: var(--resource-note-color);
  }
  .is-bookmark .include-icon {
    color: var(--resource-bookmark-color);
  }
  .is-file .include-icon {
    color: var(--resource-file-color);
  }
  .include-text {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    min-width: 0;
  }
  .include-text b {
    font-size: var(--ui-font-14, 14px);
  }
  .include-text small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.55;
  }
  .is-stacked .backup-actions {
    flex: 1 1 100%;
    align-items: stretch;
    margin-left: 0;
  }
  .is-stacked .backup-actions .backup-link {
    align-self: center;
  }
  .is-stacked .backup-hint {
    max-width: none;
    text-align: center;
  }
  .is-stacked .backup-includes ul {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-8, 8px);
  }

  .data-export {
    color: var(--text-color);
    min-width: 0;
  }
  .export-intro {
    margin: 0 0 var(--ui-space-16, 16px);
    font-weight: 600;
  }
  .export-option {
    padding: var(--ui-space-16, 16px) 0;
    border-bottom: 1px solid var(--border-color);
  }
  .export-option p,
  .export-hint {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    margin: var(--ui-space-8, 8px) 0;
  }
  .export-note-options {
    margin: var(--ui-space-14, 14px) 0 0 var(--ui-space-26, 26px);
    display: grid;
    gap: var(--ui-space-10, 10px);
  }
  .export-note-options label {
    font-size: var(--ui-font-13, 13px);
  }
  .export-note-options p {
    margin: 0;
  }
  .export-actions {
    margin-top: var(--ui-space-24, 24px);
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
  }
  .export-error {
    color: var(--danger-color);
  }
  .export-failures {
    max-height: var(--ui-layout-220, 220px);
    overflow: auto;
    overflow-wrap: anywhere;
  }
</style>
