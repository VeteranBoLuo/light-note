<template>
  <section class="import-result" :class="{ 'is-mobile': mobile }">
    <div class="import-result__heading">
      <span class="import-result__symbol" :class="{ 'is-celebrating': celebrate && success, 'has-issue': !success }"
        ><SvgIcon
          :src="success ? icon.organize.check : task.status === 'paused' ? icon.organize.clock : icon.organize.priority"
          size="28"
      /></span>
      <div
        ><p>{{ t('noteTransfer.resultTitle') }}</p
        ><h3>{{ t(`noteTransfer.status.${partial ? 'partial' : task.status}`) }}</h3></div
      >
    </div>
    <div v-if="task.items.length" class="import-result__counts"
      ><span>{{ t('noteTransfer.successCount', { count: completed.length }) }}</span
      ><span>{{ t('noteTransfer.failureCount', { count: failed }) }}</span
      ><span>{{ t('noteTransfer.skippedCount', { count: skipped }) }}</span>
      <span v-if="pending">{{ t('noteTransfer.pendingNotes', { count: pending }) }}</span></div
    >
    <p class="import-result__meta">{{ t('noteTransfer.target') }} · {{ destination }}</p>
    <p class="import-result__meta"
      >{{ t('noteTransfer.createdAt') }} · {{ time(task.createTime)
      }}<template v-if="task.finishedAt"> · {{ t('noteTransfer.finishedAt') }} {{ time(task.finishedAt) }}</template></p
    >
    <p v-if="task.errorCode" class="import-result__issue">{{ failureReason }} ({{ task.errorCode }})</p>
    <p v-if="task.status === 'expired'" class="import-result__meta">{{ t('noteTransfer.expiredHint') }}</p>
    <div class="import-result__list">
      <article v-for="item in task.items" :key="item.id" class="import-result__item">
        <SvgIcon :src="icon.resource.note" size="20" />
        <div
          ><strong>{{ item.title }}</strong
          ><p>{{ item.sourceName }} · {{ t('noteTransfer.imageCount', { count: item.imageCount }) }}</p
          ><NoteImportWarnings :item="item" /><p v-if="item.errorCode" class="import-result__issue">{{
            item.errorCode
          }}</p></div
        >
        <div class="import-result__action"
          ><span>{{
            t(
              item.selected || item.status === 'failed' || item.status === 'completed'
                ? `noteTransfer.status.${item.status}`
                : 'noteTransfer.skipped',
            )
          }}</span
          ><BButton
            v-if="item.noteId"
            :type="completed.length === 1 ? 'primary' : undefined"
            @click="$emit('openNote', item.noteId)"
            >{{ t('noteTransfer.openNote') }}</BButton
          ></div
        >
      </article>
    </div>
    <p class="import-result__meta">{{ t('noteTransfer.notesRetained') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { NoteImportTask } from '@lightnote/shared/note-transfer';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import NoteImportWarnings from './NoteImportWarnings.vue';
  const props = defineProps<{ task: NoteImportTask; destination: string; celebrate?: boolean; mobile?: boolean }>();
  defineEmits<{ openNote: [id: string] }>();
  const { t, locale } = useI18n();
  const completed = computed(() => props.task.items.filter((item) => item.status === 'completed'));
  const failed = computed(() => props.task.items.filter((item) => item.status === 'failed').length);
  const skipped = computed(() => props.task.items.filter((item) => !item.selected && item.status !== 'failed').length);
  const pending = computed(() => props.task.items.filter((item) => item.selected && item.status === 'ready').length);
  const partial = computed(() => props.task.status === 'completed' && failed.value > 0);
  const success = computed(() => props.task.status === 'completed' && !failed.value);
  const failureReason = computed(() =>
    t(
      props.task.errorCode === 'NOTE_IMPORT_PARSE_TIMEOUT'
        ? 'noteTransfer.parseTimeout'
        : props.task.errorCode === 'NOTE_IMPORT_SOURCE_UNAVAILABLE'
          ? 'noteTransfer.sourceUnavailable'
          : 'noteTransfer.failedHint',
    ),
  );
  const time = (value: string) => new Date(value).toLocaleString(locale.value);
</script>
<style scoped lang="less">
  .import-result {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .import-result__heading {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .import-result h3 {
    margin: 0;
    font-size: 22px;
  }
  .import-result p {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .import-result__symbol {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1px solid var(--chip-success-border);
    color: var(--workspace-note-text);
  }
  .import-result__counts {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .import-result__list {
    border-top: 1px solid var(--surface-border-color);
  }
  .import-result__item {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    gap: 12px;
    padding: 16px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .import-result__item > :first-child {
    color: var(--workspace-note-text);
    margin-top: 4px;
  }
  .import-result__item strong {
    overflow-wrap: anywhere;
  }
  .import-result__action {
    display: flex;
    align-items: flex-end;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
  }
  .import-result .import-result__issue {
    color: var(--warning-color);
  }
  .import-result__symbol.has-issue {
    color: var(--warning-color);
    border-color: currentColor;
  }
  .is-celebrating {
    animation: import-complete 0.3s ease-out;
  }
  @keyframes import-complete {
    from {
      transform: scale(0.85);
      opacity: 0.4;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .import-result.is-mobile .import-result__item {
    grid-template-columns: 22px minmax(0, 1fr);
  }
  .import-result.is-mobile .import-result__action {
    grid-column: 2;
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .disable-animations .is-celebrating {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .is-celebrating {
      animation: none;
    }
  }
</style>
