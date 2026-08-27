<template>
  <section class="ln-extension-view ln-extension-form-view">
    <div class="ln-extension-view-heading">
      <span class="is-file"><SvgIcon :src="icon.resource.file" size="22" aria-hidden="true" /></span>
      <div>
        <h1>{{ t('browserExtension.file.heading') }}</h1>
        <p>{{ t('browserExtension.file.description') }}</p>
      </div>
    </div>

    <div
      class="ln-extension-drop-zone"
      :class="{ 'is-dragging': dragActive, 'is-disabled': uploading }"
      @dragenter.prevent="activateDrag"
      @dragover.prevent="activateDrag"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <span class="ln-extension-drop-zone__icon"><SvgIcon :src="icon.resource.file" size="34" aria-hidden="true" /></span>
      <strong>{{ t('browserExtension.file.dropTitle') }}</strong>
      <p>{{ t('browserExtension.file.dropDescription') }}</p>
      <BUpload
        :multiple="true"
        raw-file
        block
        :disabled="uploading"
        :max-total-size="MAX_TOTAL_BYTES"
        :aria-label="t('browserExtension.file.choose')"
        @change="addFiles"
      >
        <BButton block :disabled="uploading">{{ t('browserExtension.file.choose') }}</BButton>
      </BUpload>
    </div>

    <div v-if="tasks.length" class="ln-extension-file-list" :aria-label="t('browserExtension.file.queue')">
      <article v-for="task in tasks" :key="task.id" class="ln-extension-file-item" :class="`is-${task.status}`">
        <div class="ln-extension-file-item__header">
          <div>
            <strong :title="task.file.name">{{ task.file.name }}</strong>
            <small>{{ formatSize(task.file.size) }} · {{ statusLabel(task) }}</small>
          </div>
          <div class="ln-extension-file-item__actions">
            <BButton v-if="task.status === 'uploading'" size="small" @click="cancelTask(task)">
              {{ t('browserExtension.file.cancel') }}
            </BButton>
            <BButton
              v-else-if="task.status === 'error' || task.status === 'cancelled'"
              size="small"
              :disabled="uploading"
              @click="retryTask(task)"
            >
              {{ t('common.retry') }}
            </BButton>
            <BButton
              v-else-if="task.status !== 'success'"
              size="small"
              :disabled="uploading"
              @click="removeTask(task.id)"
            >
              {{ t('browserExtension.file.remove') }}
            </BButton>
          </div>
        </div>
        <BProgress
          v-if="task.status === 'uploading' || task.status === 'success'"
          :percent="task.progress"
          size="small"
          :aria-label="t('browserExtension.file.progress', { name: task.file.name })"
        />
        <p v-if="task.error" class="ln-extension-file-item__error" role="alert">{{ task.error }}</p>
      </article>
    </div>

    <div class="ln-extension-switch-row">
      <div>
        <strong>{{ t('browserExtension.file.addToInbox') }}</strong>
        <small>{{ t('browserExtension.file.addToInboxHint') }}</small>
      </div>
      <BSwitch v-model:checked="addToInbox" :disabled="uploading" :aria-label="t('browserExtension.file.addToInbox')" />
    </div>

    <p v-if="errorMessage" class="ln-extension-inline-error" role="alert">{{ errorMessage }}</p>
    <BButton type="primary" block :loading="uploading" :disabled="!canUpload" @click="uploadAll">
      {{ uploadButtonLabel }}
    </BButton>
    <p class="ln-extension-form-hint">{{ t('browserExtension.file.limitHint') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { isExtensionAuthError } from '../api';
  import { EXTENSION_UPLOAD_MAX_TOTAL_BYTES, uploadExtensionFile } from '../upload';
  import { runConcurrentExtensionQueue, summarizeExtensionUploads } from '../uploadQueue';
  import type { ExtensionSuccess } from '../types';

  type TaskStatus = 'queued' | 'uploading' | 'success' | 'error' | 'cancelled';
  interface UploadTask {
    id: string;
    file: File;
    status: TaskStatus;
    progress: number;
    error: string;
    controller: AbortController | null;
    fileId?: string;
  }

  const MAX_TOTAL_BYTES = EXTENSION_UPLOAD_MAX_TOTAL_BYTES;
  const CONCURRENCY = 3;
  const props = defineProps<{ authenticated: boolean }>();
  const emit = defineEmits<{ 'auth-required': []; success: [result: ExtensionSuccess] }>();
  const { t } = useI18n();
  const tasks = ref<UploadTask[]>([]);
  const addToInbox = ref(true);
  const dragActive = ref(false);
  const uploading = ref(false);
  const errorMessage = ref('');

  const pendingTasks = computed(() => tasks.value.filter((task) => task.status !== 'success'));
  const canUpload = computed(() => !uploading.value && pendingTasks.value.length > 0);
  const uploadButtonLabel = computed(() => {
    const failed = tasks.value.filter((task) => task.status === 'error' || task.status === 'cancelled').length;
    return failed
      ? t('browserExtension.file.retryFailed', { count: failed })
      : t('browserExtension.file.upload', { count: pendingTasks.value.length });
  });

  function taskKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function addFiles(files: File[]) {
    if (uploading.value) return;
    errorMessage.value = '';
    const existing = new Set(tasks.value.map((task) => taskKey(task.file)));
    const next = files.filter((file) => !existing.has(taskKey(file)));
    const nextTotal = [...tasks.value.map((task) => task.file), ...next].reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_BYTES) {
      errorMessage.value = t('browserExtension.file.tooLarge');
      return;
    }
    tasks.value.push(
      ...next.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'queued' as TaskStatus,
        progress: 0,
        error: '',
        controller: null,
      })),
    );
  }

  function handleDrop(event: DragEvent) {
    dragActive.value = false;
    if (uploading.value) return;
    addFiles(Array.from(event.dataTransfer?.files || []));
  }

  function activateDrag() {
    if (!uploading.value) dragActive.value = true;
  }

  function handleDragLeave(event: DragEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node | null)) dragActive.value = false;
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter((task) => task.id !== id);
  }

  function cancelTask(task: UploadTask) {
    task.controller?.abort();
  }

  async function runTask(task: UploadTask) {
    task.controller = new AbortController();
    task.status = 'uploading';
    task.progress = 0;
    task.error = '';
    try {
      const result = await uploadExtensionFile(task.file, {
        addToInbox: addToInbox.value,
        signal: task.controller.signal,
        onProgress: (percent) => { task.progress = percent; },
      });
      task.fileId = result.fileId;
      task.progress = 100;
      task.status = 'success';
    } catch (error: any) {
      if (isExtensionAuthError(error)) {
        task.status = 'queued';
        emit('auth-required');
      } else if (error?.name === 'AbortError') {
        task.status = 'cancelled';
        task.error = t('browserExtension.file.cancelled');
      } else {
        task.status = 'error';
        task.error = error?.message || t('browserExtension.file.uploadFailed');
      }
    } finally {
      task.controller = null;
    }
  }

  async function runQueue(queue: UploadTask[]) {
    await runConcurrentExtensionQueue(queue, CONCURRENCY, runTask);
  }

  async function uploadAll() {
    if (!props.authenticated) return emit('auth-required');
    const queue = tasks.value.filter((task) => ['queued', 'error', 'cancelled'].includes(task.status));
    if (!queue.length) return;
    uploading.value = true;
    errorMessage.value = '';
    await runQueue(queue);
    uploading.value = false;
    const summary = summarizeExtensionUploads(tasks.value);
    if (summary.failed) {
      errorMessage.value = t('browserExtension.file.partialFailure', {
        success: summary.success,
        failed: summary.failed,
      });
      return;
    }
    if (summary.complete) {
      emit('success', {
        type: 'file',
        count: tasks.value.length,
        resourceId: tasks.value[0]?.fileId,
        title: tasks.value.length === 1 ? tasks.value[0].file.name : t('browserExtension.file.successTitle', { count: tasks.value.length }),
      });
    }
  }

  async function retryTask(task: UploadTask) {
    if (!props.authenticated) return emit('auth-required');
    uploading.value = true;
    await runTask(task);
    uploading.value = tasks.value.some((item) => item.status === 'uploading');
    if (summarizeExtensionUploads(tasks.value).complete) {
      emit('success', {
        type: 'file',
        count: tasks.value.length,
        resourceId: tasks.value[0]?.fileId,
        title: tasks.value.length === 1 ? tasks.value[0].file.name : t('browserExtension.file.successTitle', { count: tasks.value.length }),
      });
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function statusLabel(task: UploadTask) {
    return t(`browserExtension.file.status.${task.status}`);
  }
</script>
