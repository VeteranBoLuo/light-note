<template>
  <BButton type="primary" :disabled="!owner" @click="open">{{ entryLabel }}</BButton>
  <BModal v-model:visible="visible" :title="t('dataExport.title')" width="var(--ui-layout-540, 540px)" :show-footer="false">
    <div class="data-export">
      <p v-if="error" role="alert" class="export-error">{{ error }}</p>
      <BLoading v-if="loading && !task" :loading="true" />
      <template v-else-if="!task || editing">
        <p class="export-intro">{{ t('dataExport.choose') }}</p>
        <section v-for="kind in kinds" :key="kind" class="export-option">
          <BCheckbox
            :model-value="options.types.includes(kind)"
            :disabled="busy"
            @update:model-value="toggle(kind, $event)"
            >{{ t(`dataExport.${kind}`) }}</BCheckbox
          >
          <p>{{
            t(`dataExport.${kind === 'notes' ? 'noteHint' : kind === 'bookmarks' ? 'bookmarkHint' : 'fileHint'}`)
          }}</p>
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
          ><BButton type="primary" :loading="busy" :disabled="!options.types.length || loading" @click="start">{{
            t('dataExport.start')
          }}</BButton></div
        >
      </template>
      <template v-else>
        <p class="export-status" :data-status="task.status" role="status">{{ t(`dataExport.${task.status}`) }}</p>
        <p>{{ t('dataExport.counts', task) }}</p>
        <template v-if="active">
          <BProgress :percent="task.total ? (task.completed / task.total) * 100 : 0" :aria-label="stageLabel" /><p>{{
            stageLabel
          }}</p
          ><p class="export-hint">{{ t('dataExport.working') }}</p>
        </template>
        <p v-if="task.status === 'partial'">{{ t('dataExport.partialHint') }}</p>
        <p v-if="task.errorCode">{{ reason(task.errorCode) }}</p>
        <p v-if="task.canDownload" class="export-hint">{{
          t('dataExport.expiry', { time: new Date(task.expiresAt).toLocaleString() })
        }}</p>
        <BButton v-if="task.failed && !showFailures" @click="loadFailures">{{ t('dataExport.failures') }}</BButton>
        <div v-if="showFailures" class="export-failures">
          <p v-for="(failure, index) in failures" :key="index"
            ><strong>{{ failure.title }}</strong
            ><br />{{ reason(failure.code) }}</p
          >
          <BButton v-if="hasMoreFailures" :loading="failureLoading" @click="loadFailures">{{
            t('dataExport.more')
          }}</BButton>
        </div>
        <div class="export-actions">
          <BButton @click="visible = false">{{ t('dataExport.close') }}</BButton>
          <BButton v-if="active" :loading="busy" @click="cancel">{{ t('dataExport.cancel') }}</BButton>
          <template v-else>
            <BButton @click="edit">{{ t('dataExport.options') }}</BButton>
            <BButton v-if="task.canDownload" type="primary" :loading="busy" @click="download">{{
              t('dataExport.download')
            }}</BButton>
            <BButton v-else type="primary" :loading="busy" @click="start">{{ t('dataExport.again') }}</BButton>
          </template>
        </div>
      </template>
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    DATA_EXPORT_ACTIVE,
    DATA_EXPORT_DEFAULTS,
    DATA_EXPORT_TYPES,
    normalizeDataExportOptions,
    type DataExportType,
    type DataExportTask,
    type DataExportFailure,
  } from '@lightnote/shared/data-export';
  import { apiBasePost } from '@/http/request';
  import { isLightNoteAndroidApp, postAndroidMessage } from '@/utils/androidBridge';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const props = defineProps<{ owner: string }>();
  const { t } = useI18n();
  const visible = ref(false),
    busy = ref(false),
    loading = ref(false),
    editing = ref(false),
    empty = ref(false),
    error = ref('');
  const options = ref({ ...DATA_EXPORT_DEFAULTS, types: [...DATA_EXPORT_DEFAULTS.types] });
  const task = ref<DataExportTask | null>(null),
    failures = ref<DataExportFailure[]>([]),
    showFailures = ref(false),
    failureLoading = ref(false),
    hasMoreFailures = ref(false);
  const kinds = DATA_EXPORT_TYPES,
    formats = computed(() => [
      { label: t('dataExport.original'), value: 'original' },
      { label: 'HTML', value: 'html' },
      { label: 'Markdown', value: 'markdown' },
    ]);
  const active = computed(() => !!task.value && DATA_EXPORT_ACTIVE.includes(task.value.status));
  const entryLabel = computed(() =>
    t(active.value ? 'dataExport.progress' : task.value?.canDownload ? 'dataExport.download' : 'dataExport.title'),
  );
  const stageLabel = computed(() =>
    t(
      `dataExport.${['notes', 'bookmarks', 'files', 'packing', 'preparing', 'queued'].includes(task.value?.stage || '') ? task.value!.stage : 'running'}`,
    ),
  );
  let generation = 0,
    sequence = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    requestId = '';
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
    if (res?.status !== 200)
      throw new Error(res?.data?.errorCode === 'DATA_EXPORT_UNAVAILABLE' ? 'unavailable' : 'failure');
    return res.data;
  }
  function report(e: unknown) {
    error.value = t(
      e instanceof Error && e.message === 'unavailable' ? 'dataExport.unavailable' : 'dataExport.failure',
    );
  }
  function schedule() {
    clearTimeout(timer);
    if (active.value && !document.hidden) timer = setTimeout(() => refresh(), 3000);
  }
  async function refresh() {
    if (!props.owner || document.hidden) return;
    const g = generation,
      s = ++sequence;
    loading.value = true;
    try {
      const result = await api('latest');
      if (g !== generation || s !== sequence) return;
      task.value = result;
      error.value = '';
      schedule();
    } catch (e) {
      if (g === generation && s === sequence) report(e);
    } finally {
      if (g === generation && s === sequence) loading.value = false;
    }
  }
  async function open() {
    visible.value = true;
    await refresh();
  }
  function toggle(kind: DataExportType, checked: boolean) {
    options.value.types = checked ? [...options.value.types, kind] : options.value.types.filter((k) => k !== kind);
    empty.value = false;
  }
  function edit() {
    if (task.value) options.value = normalizeDataExportOptions(task.value.options);
    editing.value = true;
    error.value = '';
    empty.value = false;
    requestId = '';
  }
  async function start() {
    if (busy.value) return;
    const g = generation;
    ++sequence;
    clearTimeout(timer);
    busy.value = true;
    error.value = '';
    const selected = normalizeDataExportOptions(task.value && !editing.value ? task.value.options : options.value);
    requestId ||= crypto.randomUUID();
    try {
      const result = await api('create', { ...selected, requestId });
      if (g !== generation) return;
      try {
        localStorage.setItem(storageKey(), JSON.stringify(selected));
      } catch {
        /* storage may be unavailable */
      }
      requestId = '';
      empty.value = !!result?.empty;
      if (empty.value) {
        task.value = null;
        editing.value = true;
      } else {
        task.value = result;
        editing.value = false;
        failures.value = [];
        showFailures.value = false;
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
      showFailures.value = true;
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
      if (!postAndroidMessage({ type: 'download', url, fileName: '轻笺导出.zip' }))
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
  function visibility() {
    if (document.hidden) clearTimeout(timer);
    else if (!busy.value) void refresh();
  }
  watch(
    () => props.owner,
    () => {
      generation++;
      sequence++;
      clearTimeout(timer);
      task.value = null;
      visible.value = false;
      editing.value = false;
      busy.value = false;
      loading.value = false;
      error.value = '';
      empty.value = false;
      requestId = '';
      failures.value = [];
      showFailures.value = false;
      failureLoading.value = false;
      try {
        options.value = normalizeDataExportOptions(JSON.parse(localStorage.getItem(storageKey()) || 'null'));
      } catch {
        options.value = { ...DATA_EXPORT_DEFAULTS, types: [...DATA_EXPORT_DEFAULTS.types] };
      }
      void refresh();
    },
    { immediate: true },
  );
  watch(
    options,
    () => {
      if (!busy.value) requestId = '';
    },
    { deep: true },
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
  .export-status {
    border-left: 3px solid var(--primary-color);
    padding-left: var(--ui-space-10, 10px);
    font-weight: 600;
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
