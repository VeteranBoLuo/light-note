<template>
  <section class="import-progress" aria-live="polite">
    <div class="import-progress__heading">
      <span class="import-progress__symbol"><SvgIcon :src="icon.resource.note" size="26" /></span>
      <div
        ><p class="import-progress__eyebrow">{{
          t(
            upload
              ? 'noteTransfer.uploadingFiles'
              : task?.status === 'parsing'
                ? 'noteTransfer.preparing'
                : 'noteTransfer.executionTitle',
          )
        }}</p>
        <h3>{{ heading }}</h3></div
      >
    </div>
    <div :key="stageLabel" class="import-progress__activity">
      <BLoading inline :loading="true" :title="stageLabel" />
      <p v-if="currentTitle" class="import-progress__file">{{ currentTitle }}</p>
      <p v-if="file" class="import-progress__file">{{ file }}</p>
      <p v-if="progress?.imagesTotal != null">{{
        t('noteTransfer.imagesProcessed', { done: progress.imagesDone, total: progress.imagesTotal })
      }}</p>
      <p v-if="task?.status === 'parsing' && progress?.filesTotal != null">{{
        t('noteTransfer.filesProcessed', { done: progress.filesDone, total: progress.filesTotal })
      }}</p>
    </div>
    <template v-if="upload">
      <BProgress
        v-if="upload.percent != null"
        :percent="upload.percent"
        :show-info="true"
        :aria-label="t('noteTransfer.uploadingFiles')"
      />
      <p>{{ t('noteTransfer.stayOpen') }}</p>
    </template>
    <template v-else-if="task && task.status !== 'parsing'">
      <BProgress :percent="percent" :aria-label="t('noteTransfer.executionTitle')" />
      <div class="import-progress__counts"
        ><span>{{ t('noteTransfer.successCount', { count: completed }) }}</span
        ><span>{{ t('noteTransfer.failureCount', { count: failed }) }}</span
        ><span>{{ t('noteTransfer.pendingNotes', { count: pending }) }}</span></div
      >
      <p>{{ t('noteTransfer.backgroundTip') }}</p>
    </template>
    <p v-else>{{ t('noteTransfer.parsingHint') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { NoteImportTask } from '@lightnote/shared/note-transfer';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{
    task?: NoteImportTask | null;
    upload?: { name: string; percent: number | null; received: boolean } | null;
  }>();
  const { t } = useI18n();
  const progress = computed(() =>
    props.task && ['parsing', 'running'].includes(props.task.status) ? props.task.progress : null,
  );
  const items = computed(() => props.task?.items.filter((item) => item.selected) || []);
  const completed = computed(() => items.value.filter((item) => item.status === 'completed').length);
  const failed = computed(() => items.value.filter((item) => item.status === 'failed').length);
  const pending = computed(() => items.value.length - completed.value - failed.value);
  const percent = computed(() =>
    items.value.length ? ((completed.value + failed.value) / items.value.length) * 100 : 0,
  );
  const currentTitle = computed(
    () => props.task?.items.find((item) => item.id === progress.value?.currentItemId)?.title,
  );
  const file = computed(() => props.upload?.name || progress.value?.currentFile);
  const heading = computed(() =>
    t(props.upload ? 'noteTransfer.uploadingFiles' : `noteTransfer.status.${props.task?.status || 'parsing'}`),
  );
  const stageLabel = computed(() =>
    props.upload
      ? t(props.upload.received ? 'noteTransfer.receiving' : 'noteTransfer.uploadingFiles')
      : props.task?.status === 'queued'
        ? t('noteTransfer.waitingWorker')
        : progress.value
          ? t(`noteTransfer.stage.${progress.value.stage}`)
          : heading.value,
  );
</script>
<style scoped lang="less">
  .import-progress {
    --primary-color: var(--workspace-note-text);
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 230px;
  }
  .import-progress__heading {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .import-progress__symbol {
    width: 50px;
    height: 50px;
    display: grid;
    place-items: center;
    border: 1px solid var(--chip-success-border);
    border-radius: 14px;
    color: var(--workspace-note-text);
  }
  .import-progress h3 {
    margin: 0;
    font-size: 21px;
    color: var(--text-color);
  }
  .import-progress p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.7;
  }
  .import-progress .import-progress__eyebrow {
    margin-bottom: 3px;
  }
  .import-progress__activity {
    padding: 18px 0;
    border-top: 1px solid var(--surface-border-color);
    border-bottom: 1px solid var(--surface-border-color);
    min-height: 92px;
    animation: import-stage 0.18s ease-out;
  }
  @keyframes import-stage {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 1;
    }
  }
  .import-progress .import-progress__file {
    color: var(--text-color);
    margin-top: 8px;
    overflow-wrap: anywhere;
  }
  .import-progress__counts {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    font-size: 13px;
  }
  .disable-animations .import-progress :deep(*) {
    transition: none !important;
    animation: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .import-progress :deep(*) {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
