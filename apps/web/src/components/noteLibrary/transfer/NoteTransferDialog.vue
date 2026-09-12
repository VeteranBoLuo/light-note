<template>
  <NoteTransferShell
    v-model:visible="visible"
    :title="t(mode === 'export' ? 'noteTransfer.export' : 'noteTransfer.importCenter')"
    :width="dialogWidth"
    :export-mode="mode === 'export'"
    :busy="busy"
    :can-back="backStack.length > 0"
    @back="goBack"
  >
    <template #navigation>
      <nav class="note-transfer__navigation" :aria-label="t('noteTransfer.importCenter')">
        <BButton v-if="backStack.length" :disabled="busy" @click="goBack">{{
          t('noteTransfer.returnTo', {
            view: t(
              backStack[backStack.length - 1].mode === 'records' ? 'noteTransfer.records' : 'noteTransfer.import',
            ),
          })
        }}</BButton>
        <strong v-else>{{ t(mode === 'records' ? 'noteTransfer.records' : 'noteTransfer.newImport') }}</strong>
        <BButton
          v-if="mode !== 'records' && backStack[backStack.length - 1]?.mode !== 'records'"
          :disabled="busy"
          @click="openRecords"
          >{{ t('noteTransfer.records') }}<span v-if="pendingCount"> · {{ pendingCount }}</span></BButton
        >
        <BButton v-else-if="mode === 'records'" :disabled="busy" @click="openImport()">{{
          t('noteTransfer.newImport')
        }}</BButton>
      </nav>
    </template>
    <div
      ref="contentRef"
      tabindex="-1"
      class="note-transfer"
      :class="{ 'is-mobile': device.isMobile }"
      :aria-busy="busy"
    >
      <p
        v-if="mode === 'import' && task?.expiresAt && !['parsing', 'queued', 'running'].includes(task.status)"
        class="note-transfer__muted"
        >{{ t('noteTransfer.expiresAt', { time: formatTime(task.expiresAt) }) }}</p
      >
      <p v-if="stale" class="note-transfer__notice" role="status">{{ t('noteTransfer.stale') }}</p>
      <p v-if="error" class="note-transfer__error" role="alert">{{ error }}</p>
      <template v-if="mode === 'export'">
        <div class="note-transfer__subject">
          <span class="note-transfer__symbol"><SvgIcon :src="icon.resource.note" size="24" /></span>
          <div
            ><strong>{{ exportNode?.title }}</strong
            ><p class="note-transfer__muted">{{
              scope ? t('noteTransfer.count', { count: scope.count }) : t('noteTransfer.checking')
            }}</p></div
          >
        </div>
        <div class="note-transfer__fields">
          <div class="note-transfer__field"
            ><label>{{ t('noteTransfer.scope') }}</label
            ><BSelect v-model:value="includeDescendants" :disabled="busy" :options="scopeOptions" @change="loadScope"
          /></div>
          <div v-if="includeDescendants === 'self'" class="note-transfer__field"
            ><label>{{ t('noteTransfer.format') }}</label
            ><BSelect v-model:value="format" :disabled="busy" :options="formatOptions"
          /></div>
        </div>
        <NoteExportOptions
          v-if="includeDescendants === 'subtree' && scope && scope.count <= scope.limit"
          v-model="exportSettings"
          :notes="scope.nodes || []"
          :busy="busy"
        />
        <p v-if="busy && mode === 'export'" role="status">{{
          t('noteExportSettings.preparing', { completed: exportCompleted, total: scope?.count || 0 })
        }}</p>
        <BButton v-if="!scope && !busy" @click="loadScope">{{ t('noteExportSettings.reloadScope') }}</BButton>
        <p
          v-if="scope?.drawingCount && (includeDescendants === 'self' || exportSettings.packaging === 'archive')"
          class="note-transfer__notice"
          >{{ t('noteTransfer.drawing', { count: scope.drawingCount }) }}</p
        >
        <p v-if="scope && scope.count > scope.limit" class="note-transfer__error">{{
          t('noteTransfer.limit', { count: scope.limit })
        }}</p>
        <p
          v-if="includeDescendants === 'self' || exportSettings.packaging === 'archive'"
          class="note-transfer__muted"
          >{{ t('noteTransfer.exportTip') }}</p
        >
      </template>
      <template v-else-if="mode === 'records'">
        <div class="note-transfer__retention">
          <BButton :aria-expanded="retentionOpen" @click="retentionOpen = !retentionOpen">{{
            t('noteTransfer.retentionTitle')
          }}</BButton>
          <p v-if="retentionOpen" class="note-transfer__muted">{{ t('noteTransfer.retentionHint') }}</p>
        </div>
        <div class="note-transfer__history-head">
          <span class="note-transfer__history-symbol"><SvgIcon :src="icon.noteDetail.history" size="22" /></span>
          <div
            ><strong>{{ t('noteTransfer.historyTitle') }}</strong
            ><p>{{ t('noteTransfer.historyHint') }}</p></div
          >
          <span v-if="pendingCount" class="note-transfer__live">{{
            t('noteTransfer.activeCount', { count: pendingCount })
          }}</span>
        </div>
        <div v-if="!records.length" class="note-transfer__empty"
          ><SvgIcon :src="icon.noteDetail.history" size="32" /><p>{{ t('noteTransfer.empty') }}</p></div
        >
        <div v-else class="note-transfer__records">
          <BButton
            v-for="record in records"
            :key="record.id"
            class="note-transfer__record"
            @click="selectTask(record.id)"
          >
            <span class="note-transfer__record-icon"><SvgIcon :src="icon.resource.note" size="21" /></span>
            <span class="note-transfer__record-title"
              ><strong>{{ record.title || t('noteTransfer.importBatch') }}</strong>
              <small>{{ formatTime(record.createTime) }}</small>
              <span class="note-transfer__record-summary">{{
                record.status === 'review'
                  ? t('noteTransfer.awaitingReview', { count: record.itemCount })
                  : record.itemCount
                    ? t('noteTransfer.done', { done: record.completedCount || 0, total: record.itemCount })
                    : t(`noteTransfer.status.${importDisplayStatus(record)}`)
              }}</span>
            </span>
            <span class="note-transfer__record-aside">
              <span
                class="note-transfer__status"
                :data-status="record.status === 'completed' && record.failedCount > 0 ? 'partial' : record.status"
                >{{
                  t(
                    `noteTransfer.status.${importDisplayStatus(record)}`,
                  )
                }}</span
              >
              <span class="note-transfer__record-open"
                >{{ t(`noteTransfer.${recordAction(record.status)}`) }} <SvgIcon :src="icon.noteTree.chevron" size="12"
              /></span>
            </span>
          </BButton>
        </div>
      </template>
      <template v-else>
        <ol
          v-if="!detailLoading && !detailFailed && !executionView && !resultView"
          class="note-transfer__steps"
          :aria-label="t('noteTransfer.import')"
        >
          <li
            v-for="(step, index) in ['pickStep', 'reviewStep', 'importStep']"
            :key="step"
            :class="{ 'is-current': stepIndex === index, 'is-done': stepIndex > index }"
            :aria-current="stepIndex === index ? 'step' : undefined"
            ><span class="note-transfer__step-number">{{ index + 1 }}</span
            ><span>{{ t(`noteTransfer.${step}`) }}</span></li
          >
        </ol>
        <div v-if="detailLoading" class="note-transfer__skeleton" aria-busy="true"
          ><BLoading inline loading :title="t('noteTransfer.loadingTask')" /><div /><div /><div
        /></div>
        <div v-else-if="detailFailed" class="note-transfer__skeleton"
          ><p>{{ t('noteTransfer.failed') }}</p
          ><BButton @click="goBack">{{ t('noteTransfer.back') }}</BButton></div
        >
        <NoteImportProgress
          v-else-if="uploadState || (task && task.status === 'parsing')"
          :task="task"
          :upload="uploadState"
        />
        <NoteImportResult
          v-else-if="task && resultView"
          :task="task"
          :destination="parentLabel"
          :celebrate="celebrate"
          :mobile="device.isMobile"
          @open-note="openNote"
        />
        <NoteImportProgress v-else-if="task && executionView" :task="task" />
        <template v-else-if="!task || (task.status === 'uploading' && !task.uploadBytes)">
          <p v-if="task" class="note-transfer__notice">{{ t('noteTransfer.uploadPending') }}</p>
          <div
            class="note-transfer__drop"
            :class="{ 'is-dragging': dragging }"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="
              dragging = false;
              dropFiles($event);
            "
          >
            <span class="note-transfer__upload-symbol"><SvgIcon :src="icon.file_upload" size="30" /></span>
            <h3>{{ t('noteTransfer.dropTitle') }}</h3>
            <p class="note-transfer__muted">{{ t('noteTransfer.dropHint') }}</p>
            <BUpload
              class="note-transfer__upload"
              multiple
              raw-file
              :disabled="busy"
              :accept="NOTE_IMPORT_EXTENSIONS.join(',')"
              :max-total-size="NOTE_IMPORT_LIMITS.uploadBytes"
              @change="uploadFiles"
            >
              <BButton type="primary" class="note-transfer__pick" :loading="busy" :disabled="busy">{{
                t('noteTransfer.selectFiles')
              }}</BButton>
            </BUpload>
            <div class="note-transfer__formats"
              ><span v-for="name in ['Markdown', 'HTML', 'Word', 'ZIP']" :key="name">{{ name }}</span></div
            >
          </div>
          <div class="note-transfer__upload-meta"
            ><span>{{ t('noteTransfer.fileLimits') }}</span
            ><span>{{ t('noteTransfer.noOverwrite') }}</span></div
          >
          <p class="note-transfer__footnote">{{ t('noteTransfer.stayOpen') }}</p>
        </template>
        <template v-else>
          <div class="note-transfer__section-head">
            <div
              ><strong>{{
                task.status === 'review'
                  ? t('noteTransfer.reviewHeading')
                  : ['uploading', 'parsing', 'queued'].includes(task.status)
                    ? t(`noteTransfer.status.${taskDisplayStatus}`)
                    : t('noteTransfer.done', {
                        done: task.items.filter((i) => i.status === 'completed').length,
                        total: task.items.filter((i) => i.selected).length,
                      })
              }}</strong
              ><p class="note-transfer__muted">{{
                task.status === 'review'
                  ? t('noteTransfer.reviewHint')
                  : t(
                      task.status === 'uploading'
                        ? 'noteTransfer.uploadReady'
                        : task.status === 'parsing'
                          ? 'noteTransfer.parsingHint'
                          : ['paused', 'completed'].includes(task.status)
                            ? 'noteTransfer.resultHint'
                            : 'noteTransfer.backgroundTip',
                    )
              }}</p></div
            >
            <span
              class="note-transfer__status"
              :data-status="
                task.status === 'completed' && task.items.some((i) => i.status === 'failed') ? 'partial' : task.status
              "
              >{{
                t(
                  `noteTransfer.status.${taskDisplayStatus}`,
                )
              }}</span
            >
          </div>
          <p v-if="task.errorCode" class="note-transfer__error"
            >{{ t(noteImportErrorKey(task.errorCode)) }}</p
          >
          <div class="note-transfer__destination"
            ><SvgIcon :src="icon.common.folderOutline" size="19" /><div class="note-transfer__destination-copy"
              ><span class="note-transfer__eyebrow">{{ t('noteTransfer.target') }}</span
              ><strong>{{ parentLabel }}</strong></div
            ><BButton v-if="task.status === 'review'" :disabled="busy" @click="pickerVisible = true">{{
              t('noteTransfer.change')
            }}</BButton></div
          >
          <div class="note-transfer__items">
            <div v-for="item in task.items" :key="item.id" class="note-transfer__item">
              <div class="note-transfer__item-leading"
                ><BCheckbox
                  v-if="task.status === 'review'"
                  v-model:checked="item.selected"
                  :disabled="item.status !== 'ready' || busy" /><SvgIcon v-else :src="icon.resource.note" size="20"
              /></div>
              <div class="note-transfer__item-main">
                <BInput
                  v-if="task.status === 'review'"
                  v-model:value="item.title"
                  :disabled="busy"
                  :maxlength="255"
                  :aria-label="t('noteTransfer.title')"
                /><strong v-else>{{ item.title }}</strong>
                <div class="note-transfer__file-meta"
                  ><span class="note-transfer__file-type">{{ item.type === 'markdown' ? 'MD' : 'HTML' }}</span
                  ><span class="note-transfer__file-name" :title="item.sourceName">{{ item.sourceName }}</span
                  ><span v-if="item.imageCount">{{
                    t('noteTransfer.imageCount', { count: item.imageCount })
                  }}</span></div
                >
                <NoteImportWarnings :item="item" />
                <p v-if="item.errorCode" class="note-transfer__error"
                  >{{ t(noteImportErrorKey(item.errorCode)) }}</p
                >
              </div>
              <div class="note-transfer__item-actions"
                ><span class="note-transfer__status" :data-status="item.status">{{
                  t(`noteTransfer.status.${item.status}`)
                }}</span
                ><BButton
                  v-if="item.status === 'ready' && task.status === 'review'"
                  :disabled="busy"
                  @click="preview(item)"
                  >{{ t('noteTransfer.preview') }}</BButton
                ><BButton v-if="item.noteId" @click="openNote(item.noteId)">{{
                  t('noteTransfer.openNote')
                }}</BButton></div
              >
            </div>
          </div>
        </template>
      </template>
    </div>
    <template #footer>
      <div class="note-transfer__footer" :class="{ 'is-mobile': device.isMobile }">
        <span class="note-transfer__footer-spacer" />
        <BButton
          v-if="mode === 'records' && records.length && user.adminContext?.mode !== 'readonly'"
          :disabled="busy"
          @click="clearHistory"
          >{{ t('noteTransfer.clearHistory') }}</BButton
        >
        <BButton :disabled="busy" @click="visible = false">{{ t('noteTransfer.close') }}</BButton>
        <BButton
          v-if="mode === 'export'"
          type="primary"
          :disabled="
            busy ||
            !scope ||
            scope.count > scope.limit ||
            (includeDescendants === 'subtree' && exportSettings.packaging === 'merged' && !!scope.drawingCount)
          "
          :loading="busy"
          @click="exportNotes"
          >{{ t('noteTransfer.exportStart') }}</BButton
        >
        <template v-if="mode === 'import' && task">
          <BButton v-if="canDismiss" class="note-transfer__dismiss" :disabled="busy" @click="dismissTask">
            {{
              t(
                ['uploading', 'review', 'paused'].includes(task.status)
                  ? 'noteTransfer.abandon'
                  : 'noteTransfer.deleteRecord',
              )
            }}
          </BButton>
          <BButton
            v-if="['expired', 'failed'].includes(task.status)"
            type="primary"
            :disabled="busy"
            @click="openImport(parentId)"
            >{{ t('noteTransfer.restart') }}</BButton
          >
          <BButton
            v-if="task.status === 'uploading' && task.uploadBytes"
            type="primary"
            :disabled="busy"
            @click="resumeParsing"
            >{{ t('noteTransfer.reviewContinue') }}</BButton
          >
          <BButton
            v-if="task.status === 'review'"
            type="primary"
            :disabled="busy || !task.items.some((i) => i.selected && i.status === 'ready')"
            :loading="busy"
            @click="start(false)"
            >{{ t('noteTransfer.start') }}</BButton
          >
          <BButton
            v-if="
              ['paused', 'completed'].includes(task.status) &&
              task.items.some((i) => i.selected && i.status !== 'completed')
            "
            type="primary"
            :disabled="busy"
            @click="start(false)"
            >{{ t(task.status === 'completed' ? 'noteTransfer.retry' : 'noteTransfer.continue') }}</BButton
          >
          <BButton v-if="['queued', 'running'].includes(task.status)" :disabled="busy" @click="stop">{{
            t('noteTransfer.stop')
          }}</BButton>
        </template>
      </div>
    </template>
  </NoteTransferShell>
  <NoteDirectoryPicker v-model:visible="pickerVisible" :initial-parent-id="parentId" @selected="chooseParent" />
  <BModal
    v-model:visible="previewVisible"
    :title="t('noteTransfer.preview')"
    width="min(760px, 94vw)"
    :show-footer="false"
    fullscreen-mobile
  >
    <pre v-if="previewType === 'markdown'" class="note-transfer__source">{{ previewContent }}</pre>
    <iframe
      v-else
      class="note-transfer__preview"
      sandbox="allow-same-origin"
      :srcdoc="previewDocument"
      :title="t('noteTransfer.preview')"
    />
  </BModal>
</template>
<script setup lang="ts">
  import { noteImportErrorKey } from '@/utils/noteImportError';
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore, bookmarkStore } from '@/store';
  import { apiBasePost } from '@/http/request';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import NoteTransferShell from './NoteTransferShell.vue';
  import NoteExportOptions from '../NoteExportOptions.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import NoteImportProgress from './NoteImportProgress.vue';
  import NoteImportResult from './NoteImportResult.vue';
  import NoteImportWarnings from './NoteImportWarnings.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import NoteDirectoryPicker from '../tree/NoteDirectoryPicker.vue';
  import { NOTE_IMPORT_EXTENSIONS, NOTE_IMPORT_LIMITS } from '@lightnote/shared/note-transfer';
  import type { NoteImportItem, NoteImportTask } from '@lightnote/shared/note-transfer';
  import {
    buildBatchNoteExportArchive,
    buildBatchNoteExportEntries,
    buildMergedNoteExport,
    createNoteExportSettings,
    noteExportFormat,
    orderNotesForMergedExport,
  } from '@/utils/noteBatchExport';
  import type { NoteBatchExportMode } from '@/utils/noteBatchExport';
  import { buildNoteExportPaths } from '@/utils/noteExportPaths';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { deliverExportViaAndroidBridge } from '@/utils/androidFileExport';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  const user = useUserStore();
  const device = bookmarkStore();
  watch(
    () => `${user.id}:${user.adminContext?.subjectUserId || ''}:${user.adminContext?.mode || ''}`,
    () => {
      visible.value = false;
      reset();
      records.value = [];
    },
  );
  const { t, locale } = useI18n();
  const router = useRouter();
  const emit = defineEmits<{ changed: [] }>();
  const visible = ref(false),
    busy = ref(false),
    error = ref(''),
    mode = ref<'import' | 'records' | 'export'>('import');
  const contentRef = ref<HTMLElement>();
  const retentionOpen = ref(false);
  type ViewSnapshot = {
    mode: 'import' | 'records' | 'export';
    task: NoteImportTask | null;
    parentId: string | null;
    parentLabel: string;
    scrollTop: number;
    error: string;
  };
  const backStack = ref<ViewSnapshot[]>([]);
  function rememberView() {
    backStack.value.push({
      mode: mode.value,
      task: task.value ? JSON.parse(JSON.stringify(task.value)) : null,
      parentId: parentId.value,
      parentLabel: parentLabel.value,
      scrollTop: contentRef.value?.scrollTop || 0,
      error: error.value,
    });
  }
  function goBack() {
    if (busy.value) return;
    const previous = backStack.value.pop();
    if (!previous) return;
    reset();
    mode.value = previous.mode;
    task.value = previous.task;
    parentId.value = previous.parentId;
    parentLabel.value = previous.parentLabel;
    error.value = previous.error;
    void nextTick(() => {
      if (contentRef.value) contentRef.value.scrollTop = previous.scrollTop;
    });
    if (mode.value === 'records') void loadRecords(false);
    else if (task.value && ['parsing', 'queued', 'running'].includes(task.value.status)) {
      void refreshTask();
      schedule();
    }
  }
  const detailFailed = ref(false);
  const detailLoading = ref(false),
    stale = ref(false),
    celebrate = ref(false);
  const uploadState = ref<{ name: string; percent: number | null; received: boolean } | null>(null);
  const executionView = computed(() => !!task.value && ['queued', 'running'].includes(task.value.status));
  const resultView = computed(
    () => !!task.value && ['completed', 'paused', 'failed', 'expired'].includes(task.value.status),
  );
  const recordAction = (status: string) =>
    status === 'review' || status === 'uploading'
      ? 'reviewContinue'
      : status === 'paused'
        ? 'continue'
        : ['queued', 'running', 'parsing'].includes(status)
          ? 'viewProgress'
          : 'viewResult';
  const task = ref<NoteImportTask | null>(null),
    records = ref<any[]>([]),
    parentId = ref<string | null>(null),
    parentLabel = ref('');
  const pickerVisible = ref(false),
    previewVisible = ref(false),
    previewContent = ref(''),
    previewType = ref('');
  const previewDocument = computed(
    () =>
      `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"><style>body{font:16px/1.7 sans-serif;overflow-wrap:anywhere}img{max-width:100%}table{max-width:100%}</style>${previewContent.value}`,
  );
  const exportNode = ref<{ id: string; title?: string } | null>(null),
    includeDescendants = ref('self'),
    format = ref<NoteBatchExportMode>('original'),
    scope = ref<any>(null);
  const exportSettings = ref(createNoteExportSettings());
  const exportCompleted = ref(0);
  const dragging = ref(false);
  const dialogWidth = computed(() =>
    mode.value === 'import' && task.value && !['uploading', 'expired', 'failed'].includes(task.value.status)
      ? 'min(800px, 94vw)'
      : 'min(600px, 94vw)',
  );
  function importDisplayStatus(current: {
    status: string;
    uploadBytes?: number;
    failedCount?: number;
    items?: NoteImportItem[];
  }) {
    if (current.status === 'uploading' && current.uploadBytes) return 'uploaded';
    if (current.status === 'completed' && (current.failedCount || current.items?.some((item) => item.status === 'failed')))
      return 'partial';
    return current.status;
  }
  const taskDisplayStatus = computed(() => task.value ? importDisplayStatus(task.value) : 'uploading');
  const stepIndex = computed(() =>
    !task.value || ['uploading', 'parsing'].includes(task.value.status) ? 0 : task.value.status === 'review' ? 1 : 2,
  );
  let taskRevision = 0;
  let taskFlight: symbol | null = null,
    recordsFlight: symbol | null = null;
  let pendingUploadTaskId: string | null = null;
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const scopeOptions = computed(() => [
    { label: t('noteTransfer.self'), value: 'self' },
    ...(scope.value?.descendantCount ? [{ label: t('noteTransfer.subtree'), value: 'subtree' }] : []),
  ]);
  const formatOptions = computed(() => [
    { label: t('noteTransfer.original'), value: 'original' },
    { label: 'Markdown', value: 'markdown' },
    { label: 'HTML', value: 'html' },
    { label: 'PDF', value: 'pdf' },
  ]);
  const formatTime = (value: string) => new Date(value).toLocaleString(locale.value);
  async function call(action: string, data: any = {}) {
    if (['start', 'stop', 'parse'].includes(action)) {
      taskRevision++;
      taskFlight = null;
      clearTimeout(timer);
    }
    const r = await apiBasePost(`/api/note/imports/${action}`, data, { silent: true });
    if (r.status !== 200) throw Object.assign(new Error(r.msg), { code: r.data?.errorCode });
    return r.data;
  }
  async function guard(fn: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    const g = generation;
    error.value = '';
    try {
      await fn();
    } catch (cause: any) {
      if (g === generation) {
        error.value =
          t(cause?.uploadFailure ? 'noteTransfer.uploadFailed' : 'noteTransfer.failed') +
          (/^NOTE_IMPORT_[A-Z_]+$/.test(cause?.code || '') ? ` (${cause.code})` : '');
      }
    } finally {
      if (g === generation) {
        busy.value = false;
        uploadState.value = null;
        schedule();
      }
    }
  }
  function reset() {
    generation++;
    pendingUploadTaskId = null;
    taskFlight = null;
    recordsFlight = null;
    busy.value = false;
    detailLoading.value = false;
    detailFailed.value = false;
    uploadState.value = null;
    stale.value = false;
    celebrate.value = false;
    clearTimeout(timer);
    task.value = null;
    previewVisible.value = false;
    previewContent.value = '';
    pickerVisible.value = false;
    parentId.value = null;
    parentLabel.value = '';
    scope.value = null;
    error.value = '';
  }
  function openImport(id: string | null = null) {
    if (user.adminContext?.mode === 'readonly') return;
    backStack.value = [];
    reset();
    parentId.value = id;
    parentLabel.value = id ? t('noteTransfer.target') : t('noteTransfer.root');
    mode.value = 'import';
    visible.value = true;
    void loadParentLabel();
    void loadRecords();
  }
  function openRecords() {
    if (busy.value) return;
    if (visible.value && mode.value === 'records') return;
    if (visible.value && mode.value === 'import') rememberView();
    else backStack.value = [];
    reset();
    mode.value = 'records';
    visible.value = true;
    void loadRecords();
  }
  async function loadRecords(initial = true) {
    if (!initial && document.hidden) {
      scheduleRecords();
      return;
    }
    if (recordsFlight) return;
    const flight = Symbol();
    recordsFlight = flight;
    const requestGeneration = generation;
    const fetchRecords = async () => {
      const g = generation;
      const result = await call('list');
      if (g === generation) {
        records.value = result;
        stale.value = false;
      }
    };
    try {
      if (initial) await guard(fetchRecords);
      else await fetchRecords();
    } catch {
      if (requestGeneration === generation) stale.value = true;
    }
    if (recordsFlight === flight) recordsFlight = null;
    if (requestGeneration === generation && visible.value && mode.value === 'records') {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!document.hidden) void loadRecords(false);
        else scheduleRecords();
      }, 5000);
    }
  }
  function scheduleRecords() {
    if (visible.value && mode.value === 'records') timer = setTimeout(() => void loadRecords(false), 5000);
  }
  async function selectTask(id: string) {
    if (busy.value) return;
    rememberView();
    reset();
    mode.value = 'import';
    detailLoading.value = true;
    const selectionGeneration = generation;
    await guard(async () => {
      const g = generation;
      const result = await call('detail', { id });
      if (g !== generation) return;
      task.value = result;
      if (result.items.some((item: NoteImportItem) => item.status === 'completed')) emit('changed');
      parentId.value = result.parentId;
      await loadParentLabel();
      schedule();
    });
    if (selectionGeneration === generation) {
      detailLoading.value = false;
      detailFailed.value = !task.value;
    }
  }
  async function loadParentLabel() {
    if (!parentId.value) {
      parentLabel.value = t('noteTransfer.root');
      return;
    }
    const id = parentId.value;
    const g = generation;
    const r = await apiBasePost('/api/note/queryNoteBreadcrumb', { noteId: id }, { silent: true });
    if (g === generation && parentId.value === id)
      parentLabel.value = r.data?.items?.map((i: any) => i.title).join(' / ') || t('noteTransfer.target');
  }
  function chooseParent(id: string | null) {
    parentId.value = id;
    void loadParentLabel();
  }
  function schedule() {
    clearTimeout(timer);
    if (visible.value && task.value && ['parsing', 'queued', 'running'].includes(task.value.status))
      timer = setTimeout(() => {
        if (!document.hidden) void refreshTask();
        else schedule();
      }, 2500);
  }
  async function refreshTask() {
    const id = task.value?.id;
    if (!id || taskFlight) return;
    const flight = Symbol();
    taskFlight = flight;
    const g = generation,
      revision = taskRevision;
    try {
      const next = await call('detail', { id });
      if (g !== generation || revision !== taskRevision) return;
      const previous = task.value?.items.filter((i) => i.status === 'completed').length || 0;
      celebrate.value =
        task.value?.status === 'running' || task.value?.status === 'queued' ? next.status === 'completed' : false;
      task.value = next;
      for (const snapshot of backStack.value) {
        if (snapshot.task?.id === next.id && snapshot.task.status !== next.status)
          snapshot.task = JSON.parse(JSON.stringify(next));
      }
      stale.value = false;
      if (next.items.filter((i: NoteImportItem) => i.status === 'completed').length !== previous) emit('changed');
    } catch {
      if (g === generation && revision === taskRevision) stale.value = true;
    } finally {
      if (taskFlight === flight) taskFlight = null;
      if (g === generation && revision === taskRevision) schedule();
    }
  }
  async function uploadFiles(files: File[]) {
    if (busy.value || !files.length) return;
    await guard(async () => {
      if (
        files.length > NOTE_IMPORT_LIMITS.documents ||
        files.reduce((n, f) => n + f.size, 0) > NOTE_IMPORT_LIMITS.uploadBytes
      )
        throw new Error();
      const g = generation;
      if (pendingUploadTaskId) {
        const recovered = await call('detail', { id: pendingUploadTaskId });
        if (g !== generation) return;
        task.value = recovered;
        if (recovered.status !== 'uploading' || recovered.uploadBytes) {
          pendingUploadTaskId = null;
          schedule();
          return;
        }
      }
      const created = task.value?.status === 'uploading' && !task.value.uploadBytes ? task.value : await call('create');
      if (g !== generation) return;
      pendingUploadTaskId = created.id;
      uploadState.value = { name: files.map((file) => file.name).join('、'), percent: null, received: false };
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      try {
        const r = await apiBasePost(`/api/note/imports/upload?id=${encodeURIComponent(created.id)}`, form, {
          silent: true,
          timeout: 180000,
          onUploadProgress: (event) => {
            if (g !== generation || !uploadState.value) return;
            uploadState.value.percent = event.total
              ? Math.min(100, Math.round((event.loaded / event.total) * 100))
              : null;
            uploadState.value.received = !!event.total && event.loaded >= event.total;
          },
        });
        if (r.status !== 200) throw Object.assign(new Error(), { code: r.data?.errorCode });
      } catch (cause: any) {
        if (g === generation) {
          uploadState.value = null;
          try {
            const recovered = await call('detail', { id: created.id });
            if (g === generation) {
              task.value = recovered;
              if (recovered.status !== 'uploading' || recovered.uploadBytes) {
                pendingUploadTaskId = null;
                return;
              }
            }
          } catch {
            // Retain the task id while offline; the next explicit retry checks it first.
          }
        }
        throw Object.assign(new Error(), { uploadFailure: true, code: cause?.code });
      }
      if (g !== generation) return;
      await call('parse', { id: created.id });
      if (g !== generation) return;
      const detail = await call('detail', { id: created.id });
      if (g !== generation) return;
      task.value = detail;
      pendingUploadTaskId = null;
      uploadState.value = null;
      schedule();
    });
  }
  function dropFiles(event: DragEvent) {
    if (!task.value || (task.value.status === 'uploading' && !task.value.uploadBytes))
      void uploadFiles(Array.from(event.dataTransfer?.files || []));
  }
  async function start(ack: boolean) {
    const snapshot = task.value;
    const g = generation;
    const target = parentId.value;
    if (!snapshot) return;
    await guard(async () => {
      try {
        await call('start', {
          id: snapshot.id,
          parentId: parentId.value,
          shareExposureAcknowledged: ack,
          items: snapshot.items.filter((i) => i.selected).map((i) => ({ id: i.id, title: i.title })),
        });
        await refreshTask();
      } catch (e: any) {
        if (g !== generation) return;
        if (e.code === 'NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED') {
          Alert.alert({
            title: t('noteTransfer.confirm'),
            content: t('noteTransfer.share'),
            footer: [
              { label: t('common.cancel'), function: () => undefined },
              {
                label: t('noteTransfer.confirm'),
                type: 'primary',
                function: () => {
                  if (g === generation && task.value?.id === snapshot.id && parentId.value === target) void start(true);
                },
              },
            ],
          });
        } else throw e;
      }
    });
  }
  const pendingCount = computed(
    () => records.value.filter((r) => !['completed', 'failed', 'expired'].includes(r.status)).length,
  );
  const canDismiss = computed(() => task.value && !['parsing', 'queued', 'running'].includes(task.value.status));
  function clearHistory() {
    if (busy.value || user.adminContext?.mode === 'readonly') return;
    const g = generation;
    Alert.alert({
      title: t('noteTransfer.clearHistory'),
      content: t('noteTransfer.clearHistoryHint'),
      okText: t('noteTransfer.clearHistory'),
      okType: 'danger',
      onOk: () => {
        if (g !== generation || mode.value !== 'records') return;
        // Invalidate pending list polls while retaining the visible snapshot on failure.
        generation++;
        recordsFlight = null;
        clearTimeout(timer);
        const clearingGeneration = generation;
        void guard(async () => {
          const result = await call('clear-history');
          if (generation !== clearingGeneration) return;
          backStack.value = backStack.value.filter(
            ({ task: saved }) =>
              !saved ||
              (!['completed', 'failed', 'expired'].includes(saved.status) &&
                (!saved.expiresAt ||
                  new Date(saved.expiresAt).getTime() > Date.now() ||
                  ['parsing', 'queued', 'running'].includes(saved.status))),
          );
          message.success(t('noteTransfer.historyCleared', { count: result.clearedCount }));
          await loadRecords(false);
        }).finally(() => {
          if (generation === clearingGeneration) {
            clearTimeout(timer);
            scheduleRecords();
          }
        });
      },
    });
  }
  function dismissTask() {
    const id = task.value?.id;
    const g = generation;
    if (!id) return;
    Alert.alert({
      title: t('noteTransfer.deleteRecord'),
      content: t('noteTransfer.dismissHint'),
      footer: [
        { label: t('common.cancel'), function: () => undefined },
        {
          label: t('noteTransfer.confirm'),
          type: 'primary',
          function: () => {
            if (g !== generation || task.value?.id !== id) return;
            void guard(async () => {
              await call('dismiss', { id });
              if (g !== generation) return;
              backStack.value = backStack.value.filter((snapshot) => snapshot.task?.id !== id);
              if (backStack.value.at(-1)?.mode === 'records') backStack.value.pop();
              reset();
              mode.value = 'records';
              records.value = records.value.filter((record) => record.id !== id);
            });
          },
        },
      ],
    });
  }
  async function resumeParsing() {
    await guard(async () => {
      await call('parse', { id: task.value?.id });
      await refreshTask();
    });
  }
  async function stop() {
    await guard(async () => {
      await call('stop', { id: task.value?.id });
      await refreshTask();
    });
  }
  async function preview(item: NoteImportItem) {
    await guard(async () => {
      const g = generation;
      const result = await call('preview', { id: task.value?.id, itemId: item.id });
      if (g !== generation) return;
      previewContent.value = result.content;
      previewType.value = result.type;
      previewVisible.value = true;
    });
  }
  async function openNote(id: string) {
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => router.push({ name: 'noteDetail', params: { id } }),
    );
  }
  async function openExport(node: { id: string; title?: string }) {
    reset();
    mode.value = 'export';
    exportNode.value = { ...node };
    includeDescendants.value = 'self';
    format.value = 'original';
    visible.value = true;
    await loadScope();
    if (scope.value?.descendantCount) {
      includeDescendants.value = 'subtree';
      await loadScope();
    }
  }
  async function loadScope() {
    const g = generation;
    scope.value = null;
    await guard(async () => {
      const r = await apiBasePost(
        '/api/note/previewExportScope',
        { rootNoteId: exportNode.value?.id, includeDescendants: includeDescendants.value === 'subtree' },
        { silent: true },
      );
      if (r.status !== 200) throw new Error();
      if (g === generation) {
        scope.value = r.data;
        exportSettings.value = createNoteExportSettings(r.data.nodes || [], exportNode.value?.title || t('note.untitled'));
        exportCompleted.value = 0;
      }
    });
  }
  async function exportNotes() {
    const node = exportNode.value;
    const g = generation;
    if (!node || !scope.value || scope.value.count > scope.value.limit) return;
    const settings = { ...exportSettings.value, orderedIds: [...exportSettings.value.orderedIds] };
    const subtree = includeDescendants.value === 'subtree';
    const merged = subtree && settings.packaging === 'merged';
    if (merged && scope.value.drawingCount) return;
    const snapshots = (scope.value.nodes || []).map((n: any) => ({ ...n }));
    const selectedFormat = subtree ? noteExportFormat(settings) : format.value;
    const current = () => g === generation && visible.value;
    exportCompleted.value = 0;
    await guard(async () => {
      const r = await apiBasePost(
        '/api/note/getNotesForExport',
        {
          rootNoteId: node.id,
          includeDescendants: includeDescendants.value === 'subtree',
          scopeToken: scope.value.scopeToken,
        },
        { silent: true },
      );
      if (g !== generation) return;
      if (r.status === 409) {
        scope.value = null;
        error.value = t('noteTransfer.exportChanged');
        return;
      }
      if (r.status !== 200) throw new Error();
      const notes = r.data.notes;
      const options = {
        fallbackTitle: t('note.untitled'),
        lang: locale.value,
        onProgress: (completed: number) => {
          if (current()) exportCompleted.value = completed;
        },
      };
      let orderedNotes = notes;
      if (merged) {
        try {
          orderedNotes = orderNotesForMergedExport(notes, snapshots, settings.orderedIds);
        } catch {
          error.value = t('noteExportSettings.changed');
          return;
        }
      }
      let fileName: string, content: string | Blob, extension: string, failed: string[];
      if (merged) {
        const result = await buildMergedNoteExport(orderedNotes, settings.mergedFormat, {
          ...options,
          title: settings.exportName.trim() || settings.defaultName,
          showDocumentTitle: settings.showDocumentTitle,
          keepNoteTitles: settings.keepNoteTitles,
          isCurrent: current,
        });
        if (!current()) return;
        if (!result.file) {
          error.value = t('noteExportSettings.failed');
          return;
        }
        ({ content, fileName } = result.file);
        extension = result.file.format;
        failed = [];
      } else if (subtree) {
        const archive = await buildBatchNoteExportArchive(notes, selectedFormat, {
          ...options,
          paths: buildNoteExportPaths(notes, node.id, selectedFormat),
        });
        failed = archive.failedNoteIds;
        if (!archive.blob) throw new Error();
        content = archive.blob;
        extension = 'zip';
        fileName = buildExportFileName(node.title || '', t('note.untitled'), 'zip');
      } else {
        const result = await buildBatchNoteExportEntries(notes, format.value, options);
        failed = result.failedNoteIds;
        const entry = result.entries[0];
        if (!entry) throw new Error();
        content = entry.content;
        extension = entry.format;
        fileName = entry.fileName;
      }
      if (g !== generation) return;
      if (failed.length)
        error.value = t('noteTransfer.omitted', {
          titles: notes
            .filter((n: any) => failed.includes(n.id))
            .map((n: any) => n.title)
            .join(', '),
        });
      const mimeType = (
        {
          zip: 'application/zip',
          html: 'text/html',
          md: 'text/markdown',
          json: 'application/json',
          pdf: 'application/pdf',
        } as Record<string, string>
      )[extension];
      if (isLightNoteAndroidApp()) {
        const result = await deliverExportViaAndroidBridge({
          noteId: node.id,
          content,
          fileName,
          format: extension as any,
          mimeType,
          isCurrent: current,
        });
        if (!current()) return;
        if (!result.ok) {
          error.value = result.message || t('noteExportSettings.failed');
          return;
        }
      } else {
        const result = await deliverGeneratedFile({
          content,
          fileName,
          mimeType,
          isCurrent: current,
          preferShare: device.isMobile || device.isTablet,
        });
        if (!current()) return;
        if (result === 'cancelled') return;
        if (result === 'unavailable') throw new Error();
      }
      if (current()) {
        const exportedCount = notes.length - failed.length;
        message.success(t('noteExportSettings.started', { count: exportedCount }));
        recordOperation({
          ...OPERATION_LOG_MAP.noteLibrary.exportDirectory,
          operation: `导出笔记目录成功【${exportedCount}篇/${subtree ? settings.packaging : 'self'}/${selectedFormat}】`,
        });
      }
    });
    if (current() && !scope.value) {
      const notice = error.value;
      await loadScope();
      if (notice) error.value = notice;
    }
  }
  watch(visible, (open) => {
    if (!open) {
      generation++;
      backStack.value = [];
      clearTimeout(timer);
    }
  });
  function handleVisibility() {
    if (document.hidden || !visible.value || busy.value) return;
    clearTimeout(timer);
    if (mode.value === 'records') void loadRecords(false);
    else if (task.value && ['parsing', 'queued', 'running'].includes(task.value.status)) void refreshTask();
  }
  document.addEventListener('visibilitychange', handleVisibility);
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibility);
    generation++;
    clearTimeout(timer);
  });
  watch(
    () => `${mode.value}:${detailLoading.value}:${task.value?.status || 'pick'}`,
    async () => {
      await nextTick();
      if (visible.value && !detailLoading.value) contentRef.value?.focus({ preventScroll: true });
    },
  );
  defineExpose({ openImport, openRecords, openExport });
</script>
<style scoped lang="less">
  .note-transfer__navigation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    font-size: 13px;
  }
  .note-transfer__navigation .b_btn {
    font-size: 12px;
  }
  .note-transfer__retention {
    order: 1;
    padding-top: 12px;
    border-top: 1px solid var(--surface-border-color);
  }
  .note-transfer__retention > .b_btn {
    padding: 0;
    background: transparent;
    color: var(--desc-color);
    font-size: 12px;
  }
  .note-transfer__retention p {
    margin-top: 8px;
  }

  .note-transfer__skeleton {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .note-transfer__skeleton > div {
    height: 42px;
    border-radius: 8px;
    background: var(--surface-divider-color);
  }

  .note-transfer__task-entry {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0;
  }
  .note-transfer__dismiss {
    color: var(--danger-color);
  }

  .note-transfer,
  .note-transfer *,
  .note-transfer__footer {
    box-sizing: border-box;
  }
  .note-transfer.is-mobile {
    padding: 16px;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
  }
  .note-transfer {
    outline: none;
    display: flex;
    flex-direction: column;
    gap: 20px;
    color: var(--text-color);
    min-width: 0;
    font-size: 14px;
    line-height: 1.6;
  }
  .note-transfer p,
  .note-transfer h3 {
    margin: 0;
  }
  .note-transfer__muted {
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }
  .note-transfer__steps {
    list-style: none;
    display: flex;
    margin: 0 0 2px;
    padding: 0;
    gap: 12px;
  }
  .note-transfer__steps li {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    color: var(--desc-color);
    font-size: 12px;
    white-space: nowrap;
  }
  .note-transfer__steps li:not(:last-child)::after {
    content: '';
    height: 1px;
    flex: 1;
    background: var(--surface-border-color);
    margin-left: 4px;
  }
  .note-transfer__step-number {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    font-size: 12px;
    flex-shrink: 0;
  }
  .note-transfer__steps .is-current {
    color: var(--workspace-note-text);
    font-weight: 600;
  }
  .note-transfer__steps .is-current .note-transfer__step-number {
    border-color: var(--workspace-note-text);
    background: var(--chip-success-bg);
  }
  .note-transfer__steps .is-done .note-transfer__step-number {
    color: var(--workspace-note-text);
    border-color: var(--chip-success-border);
  }
  .note-transfer__drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 30px 20px 26px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 14px;
    text-align: center;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }
  .note-transfer__drop.is-dragging {
    border-color: var(--workspace-note-text);
    background: var(--chip-success-bg);
  }
  .note-transfer__upload-symbol {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border-radius: 16px;
    background: var(--chip-success-bg);
    color: var(--workspace-note-text);
    margin-bottom: 4px;
  }
  .note-transfer__drop h3 {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.5;
  }
  .note-transfer__upload {
    display: inline-flex;
    justify-content: center;
    width: auto;
    margin: 8px 0 4px;
  }
  .note-transfer__pick {
    min-width: 168px;
    min-height: 38px;
    justify-content: center;
  }
  .note-transfer__formats {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 7px;
    margin-top: 6px;
  }
  .note-transfer__formats span {
    font-size: 11px;
    line-height: 22px;
    padding: 0 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    color: var(--desc-color);
  }
  .note-transfer__upload-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--desc-color);
    font-size: 12px;
    margin-top: -6px;
  }
  .note-transfer__footnote {
    font-size: 12px;
    color: var(--desc-color);
    text-align: center;
  }
  .note-transfer__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid var(--surface-border-color);
    flex-shrink: 0;
  }
  .note-transfer__footer-back,
  .note-transfer__footer-spacer {
    margin-right: auto;
  }
  .note-transfer__section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .note-transfer__section-head strong {
    display: block;
    font-size: 16px;
    margin-bottom: 4px;
  }
  .note-transfer__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 500;
    line-height: 22px;
    padding: 0 8px;
    border-radius: 6px;
    background: var(--chip-neutral-bg);
    color: var(--chip-neutral-fg);
    border: 1px solid var(--chip-neutral-border);
  }
  .note-transfer__status[data-status='completed'] {
    color: var(--chip-success-fg);
    background: var(--chip-success-bg);
    border-color: var(--chip-success-border);
  }
  .note-transfer__status[data-status='partial'] {
    color: var(--warning-color);
    background: var(--chip-neutral-bg);
    border-color: currentColor;
  }
  .note-transfer__status[data-status='failed'] {
    color: var(--chip-danger-fg);
    background: var(--chip-danger-bg);
    border-color: var(--chip-danger-border);
  }
  .note-transfer__status[data-status='running'],
  .note-transfer__status[data-status='parsing'] {
    color: var(--workspace-note-text);
    border-color: currentColor;
  }
  .note-transfer__destination {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .note-transfer__destination > :first-child {
    color: var(--desc-color);
    flex-shrink: 0;
  }
  .note-transfer__destination-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }
  .note-transfer__destination strong {
    font-size: 13px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .note-transfer__eyebrow {
    font-size: 11px;
    color: var(--desc-color);
  }
  .note-transfer__items {
    border-top: 1px solid var(--surface-border-color);
  }
  .note-transfer__item {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 10px;
    padding: 16px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .note-transfer__item-leading {
    padding-top: 7px;
    color: var(--workspace-note-text);
  }
  .note-transfer__item-main {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .note-transfer__item-actions {
    display: flex;
    align-items: flex-end;
    flex-direction: column;
    gap: 8px;
    padding-top: 3px;
  }
  .note-transfer__file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 11px;
    margin-top: 7px;
    min-width: 0;
  }
  .note-transfer__file-type {
    font-size: 10px;
    line-height: 18px;
    padding: 0 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .note-transfer__file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-transfer__file-meta > :last-child {
    white-space: nowrap;
  }
  .note-transfer__subject {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .note-transfer__subject strong {
    font-size: 16px;
    overflow-wrap: anywhere;
  }
  .note-transfer__symbol {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    background: var(--chip-success-bg);
    color: var(--workspace-note-text);
    flex-shrink: 0;
  }
  .note-transfer__fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }
  .note-transfer__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .note-transfer__field label {
    font-size: 12px;
    font-weight: 500;
  }
  .note-transfer__notice {
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--chip-neutral-bg);
    color: var(--desc-color);
    font-size: 12px;
  }
  .note-transfer__error {
    color: var(--danger-color);
    border-left: 3px solid currentColor;
    padding: 4px 0 4px 10px;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .note-transfer__records {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid var(--surface-border-color);
  }
  .note-transfer__record {
    height: auto;
    min-height: 82px;
    white-space: normal;
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 8px;
    border: 0;
    border-bottom: 1px solid var(--surface-border-color);
    border-radius: 0;
    background: transparent;
  }
  .note-transfer__record-title {
    flex: 1;
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .note-transfer__record-title strong {
    font-size: 14px;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .note-transfer__record-title small,
  .note-transfer__record-summary {
    color: var(--desc-color);
    font-size: 11px;
  }
  .note-transfer__record-icon,
  .note-transfer__history-symbol {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--workspace-note-text);
    background: var(--workspace-open-canvas);
  }
  .note-transfer__record-aside {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    flex-shrink: 0;
  }
  .note-transfer__record-open {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--desc-color);
  }
  .note-transfer__record-open > :last-child {
    transform: rotate(-90deg);
  }
  .note-transfer__history-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }
  .note-transfer__history-head strong {
    font-size: 15px;
  }
  .note-transfer__history-head p {
    margin: 5px 0 0;
    font-size: 12px;
    color: var(--desc-color);
  }
  .note-transfer__live {
    margin-left: auto;
    color: var(--workspace-note-text);
    font-size: 11px;
    white-space: nowrap;
  }
  .note-transfer.is-mobile .note-transfer__live {
    display: none;
  }

  .note-transfer__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 40px 0;
    color: var(--desc-color);
  }
  .note-transfer__source {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 13px;
    line-height: 1.8;
  }
  .note-transfer__preview {
    width: 100%;
    height: 65vh;
    border: 0;
    background: white;
  }
  .note-transfer.is-mobile .note-transfer__steps {
    gap: 8px;
  }
  .note-transfer.is-mobile .note-transfer__steps li {
    gap: 5px;
    font-size: 11px;
  }
  .note-transfer.is-mobile .note-transfer__drop {
    padding: 30px 14px;
  }
  .note-transfer.is-mobile .note-transfer__upload-meta {
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .note-transfer.is-mobile .note-transfer__fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .note-transfer__footer.is-mobile {
    flex-wrap: wrap;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }
  .note-transfer__footer.is-mobile .note-transfer__footer-back {
    font-size: 12px;
  }
  .note-transfer.is-mobile .note-transfer__item {
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 8px;
  }
  .note-transfer.is-mobile .note-transfer__item-actions {
    grid-column: 2;
    flex-direction: row;
    align-items: center;
    padding-top: 0;
  }
</style>
