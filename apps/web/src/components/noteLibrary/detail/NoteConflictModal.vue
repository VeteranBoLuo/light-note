<template>
  <BModal
    v-model:visible="visible"
    :title="t('noteDetail.conflict.title')"
    :mask-closable="false"
    :esc-closable="false"
    :history-closable="false"
    modal-class="note-conflict-modal"
    :show-footer="false"
    width="min(920px, calc(100vw - 24px))"
  >
    <div class="note-conflict">
      <p class="note-conflict__notice">{{ t('noteDetail.conflict.notice') }}</p>
      <div class="note-conflict__versions">
        <section class="note-conflict__version is-cloud">
          <div class="note-conflict__version-head">
            <strong>{{ t('noteDetail.conflict.cloudVersion') }}</strong>
            <span>{{ versionMeta(cloudVersion) }}</span>
          </div>
          <div class="note-conflict__title">{{ cloudVersion.title || t('noteDetail.unnamedDoc') }}</div>
          <pre>{{ previewText(cloudVersion) }}</pre>
        </section>
        <section class="note-conflict__version is-local">
          <div class="note-conflict__version-head">
            <strong>{{ t('noteDetail.conflict.localDraft') }}</strong>
            <span>{{ versionMeta(localVersion) }}</span>
          </div>
          <div class="note-conflict__title">{{ localVersion.title || t('noteDetail.unnamedDoc') }}</div>
          <pre>{{ previewText(localVersion) }}</pre>
        </section>
      </div>
      <p class="note-conflict__hint">{{ t('noteDetail.conflict.hint') }}</p>
      <div class="note-conflict__actions">
        <BButton :disabled="busy" @click="emit('keep-cloud')">
          {{ t('noteDetail.conflict.keepCloud') }}
        </BButton>
        <BButton :loading="busyAction === 'copy'" :disabled="busy" @click="emit('save-copy')">
          {{ t('noteDetail.conflict.saveCopy') }}
        </BButton>
        <BButton
          type="primary"
          :loading="busyAction === 'overwrite'"
          :disabled="busy"
          @click="emit('overwrite')"
        >
          {{ t('noteDetail.conflict.overwrite') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  interface NoteConflictVersion {
    id?: string;
    title: string;
    content: string;
    type: 'html' | 'markdown' | 'drawing';
    revision: number;
    updatedAt?: number | string | null;
    parentId?: string | null;
  }

  const props = withDefaults(
    defineProps<{
      cloudVersion: NoteConflictVersion;
      localVersion: NoteConflictVersion;
      busyAction?: '' | 'copy' | 'overwrite';
    }>(),
    { busyAction: '' },
  );
  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{
    'keep-cloud': [];
    'save-copy': [];
    overwrite: [];
  }>();
  const { t, locale } = useI18n();
  const busy = computed(() => Boolean(props.busyAction));

  function htmlText(value: string) {
    if (typeof document === 'undefined') return value.replace(/<[^>]+>/g, ' ');
    const container = document.createElement('div');
    container.innerHTML = value;
    return container.textContent || '';
  }

  function previewText(version: NoteConflictVersion) {
    if (version.type === 'drawing') {
      try {
        const scene = JSON.parse(version.content);
        const elements = Array.isArray(scene?.elements) ? scene.elements : [];
        return t('note.drawingConflictSummary', {
          strokes: elements.filter((element) => element?.kind === 'stroke').length,
          texts: elements.filter((element) => element?.kind === 'text').length,
        });
      } catch {
        return t('note.drawingInvalid');
      }
    }
    const source = version.type === 'markdown' ? version.content : htmlText(version.content);
    const normalized = source.replace(/\u00a0/g, ' ').trim() || t('noteDetail.conflict.emptyContent');
    return normalized.length > 1600 ? `${normalized.slice(0, 1600)}\n…` : normalized;
  }

  function versionMeta(version: NoteConflictVersion) {
    const revision = t('noteDetail.conflict.revision', { revision: version.revision });
    if (!version.updatedAt) return revision;
    const date = new Date(version.updatedAt);
    if (Number.isNaN(date.getTime())) return revision;
    return `${revision} · ${new Intl.DateTimeFormat(String(locale.value), {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date)}`;
  }
</script>

<style scoped lang="less">
  .note-conflict {
    display: grid;
    gap: 16px;
    color: var(--text-color);
  }

  .note-conflict__notice,
  .note-conflict__hint {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.6;
  }

  .note-conflict__notice {
    padding: 11px 13px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--background-color);
    font-weight: 600;
  }

  .note-conflict__versions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .note-conflict__version {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--background-color));

    &.is-cloud {
      border-top: 3px solid var(--primary-color);
    }

    &.is-local {
      border-top: 3px solid var(--warning-color, #d97706);
    }
  }

  .note-conflict__version-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;

    span {
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .note-conflict__title {
    margin-top: 9px;
    overflow: hidden;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  pre {
    height: min(32vh, 260px);
    margin: 10px 0 0;
    padding: 11px;
    box-sizing: border-box;
    overflow: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--text-color);
    background: var(--pre-bg-color, var(--surface-panel-bg));
    font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .note-conflict__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;

    :deep(.b_btn) {
      min-height: 40px;
    }
  }

  @media (max-width: 767px) {
    .note-conflict__versions {
      grid-template-columns: 1fr;
    }

    .note-conflict__version pre {
      height: 150px;
    }

    .note-conflict__actions {
      display: grid;
      grid-template-columns: 1fr;

      :deep(.b_btn) {
        width: 100%;
        min-height: 46px;
      }
    }
  }
</style>

<style lang="less">
  /* 冲突必须明确选择一种无损去向；若允许用 X / Esc / 手机返回键直接关掉，
     背后的编辑器会处于“保存已阻断但用户看不见原因”的危险状态。 */
  .note-conflict-modal .modal-close {
    display: none;
  }
</style>
