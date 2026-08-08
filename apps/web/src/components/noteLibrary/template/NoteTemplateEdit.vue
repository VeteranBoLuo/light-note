<template>
  <form class="note-template-edit" @submit.prevent="submit">
    <div class="note-template-edit__workspace">
      <header class="note-template-edit__header">
        <div class="note-template-edit__heading-row">
          <h2>{{ template ? t('note.templateManager.edit') : t('note.templateManager.create') }}</h2>
          <BChip tone="note" size="small">{{ typeLabel }}</BChip>
          <span>{{ t('note.templateManager.formatLocked') }}</span>
        </div>
        <p>{{ t('note.templateManager.editorHint') }}</p>
      </header>

      <div class="note-template-edit__fields">
        <label>
          <span>{{ t('note.tplNameLabel') }}</span>
          <BInput
            v-model:value="draft.name"
            class="note-template-edit__input"
            height="34px"
            :maxlength="60"
            :placeholder="t('note.tplNamePlaceholder')"
          />
          <small>{{ draft.name.length }}/60</small>
        </label>
        <label>
          <span>{{ t('note.tplTitleLabel') }}</span>
          <BInput
            v-model:value="draft.titleTemplate"
            class="note-template-edit__input"
            height="34px"
            :maxlength="255"
            :placeholder="t('note.tplTitlePlaceholder')"
          />
        </label>
        <label class="note-template-edit__description">
          <span>{{ t('note.tplDescLabel') }}</span>
          <BInput
            v-model:value="draft.description"
            class="note-template-edit__input"
            height="34px"
            :maxlength="255"
            :placeholder="t('note.tplDescPlaceholder')"
          />
        </label>
      </div>

      <section class="note-template-edit__content">
        <NoteTemplateContentEditor
          :key="editorKey"
          v-model:content="draft.content"
          :type="draft.type"
          :revision="template?.revision || 1"
          @ready="handleEditorReady"
        />
      </section>
    </div>

    <div v-if="!mobile" class="note-template-edit__actions">
      <BButton @click="emit('cancel')">{{ t('common.cancel') }}</BButton>
      <BButton native-type="submit" type="primary" :loading="saving" :disabled="!canSubmit">
        {{ t('common.save') }}
      </BButton>
    </div>
    <MobileStickyActionBar v-else :above-navigation="false">
      <BButton @click="emit('cancel')">{{ t('common.cancel') }}</BButton>
      <BButton native-type="submit" type="primary" :loading="saving" :disabled="!canSubmit">
        {{ t('common.save') }}
      </BButton>
    </MobileStickyActionBar>
  </form>
</template>

<script setup lang="ts">
  import { computed, nextTick, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import type { NoteTemplateDetail, NoteTemplateType, NoteTemplateWritePayload } from '@/types/noteTemplate';
  import NoteTemplateContentEditor from './NoteTemplateContentEditor.vue';

  const props = withDefaults(
    defineProps<{
      template?: NoteTemplateDetail | null;
      initialType?: NoteTemplateType;
      saving?: boolean;
      mobile?: boolean;
    }>(),
    { template: null, initialType: 'html', saving: false, mobile: false },
  );
  const emit = defineEmits<{
    save: [payload: NoteTemplateWritePayload];
    cancel: [];
    'dirty-change': [dirty: boolean];
  }>();
  const { t } = useI18n();
  const draft = reactive<NoteTemplateWritePayload>({
    name: '',
    titleTemplate: '',
    description: '',
    type: 'html',
    content: '',
  });
  const baseline = ref('');
  const editorKey = ref(0);
  const serialize = () => JSON.stringify(draft);
  const dirty = computed(() => serialize() !== baseline.value);
  const canSubmit = computed(() => draft.name.trim().length > 0 && !props.saving);
  const typeLabel = computed(() => (draft.type === 'markdown' ? t('note.tplTypeMd') : t('note.tplTypeHtml')));

  function resetDraft() {
    const template = props.template;
    draft.name = template?.name || '';
    draft.titleTemplate = template?.titleTemplate || '';
    draft.description = template?.description || '';
    draft.type = template?.type || props.initialType;
    draft.content = template?.content || '';
    editorKey.value += 1;
    baseline.value = serialize();
  }
  function resetBaseline() {
    baseline.value = serialize();
  }
  function handleEditorReady() {
    nextTick(() => {
      if (!dirty.value) resetBaseline();
    });
  }
  function submit() {
    if (!canSubmit.value) return;
    emit('save', {
      name: draft.name.trim(),
      titleTemplate: draft.titleTemplate.trim(),
      description: draft.description.trim(),
      type: draft.type,
      content: draft.content || '',
    });
  }

  watch(() => [props.template?.id, props.template?.revision, props.initialType] as const, resetDraft, {
    immediate: true,
  });
  watch(dirty, (value) => emit('dirty-change', value), { immediate: true });
  defineExpose({ resetBaseline });
</script>

<style scoped lang="less">
  .note-template-edit {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .note-template-edit__workspace {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 10px clamp(16px, 2.4vw, 30px) 10px;
  }
  .note-template-edit__header {
    min-width: 0;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px 14px;
    margin-bottom: 8px;
  }
  .note-template-edit__heading-row {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
  }
  .note-template-edit__header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
  }
  .note-template-edit__heading-row > span {
    color: var(--desc-color);
    font-size: 10px;
  }
  .note-template-edit__header p {
    min-width: 0;
    margin: 0 0 0 auto;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-template-edit__fields {
    display: grid;
    grid-template-columns: minmax(150px, 0.8fr) minmax(220px, 1.1fr) minmax(220px, 1.3fr);
    gap: 10px;
    margin-bottom: 8px;
  }
  .note-template-edit__fields label {
    position: relative;
    min-width: 0;
    display: grid;
    gap: 3px;
    color: var(--text-color);
    font-size: 12px;
    font-weight: 550;
  }
  .note-template-edit__fields small {
    position: absolute;
    right: 8px;
    top: 0;
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 400;
  }
  .note-template-edit__input :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background) !important;
    color: var(--text-color);
    font-size: 13px;
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease;
  }
  .note-template-edit__input :deep(.b-input::placeholder) {
    color: var(--desc-color);
    opacity: 1;
  }
  .note-template-edit__input :deep(.b-input:hover) {
    border-color: var(--sub-text-color) !important;
    background: var(--card-background) !important;
  }
  .note-template-edit__input :deep(.b-input:focus-visible) {
    border-color: var(--resource-note-color) !important;
    outline: 2px solid var(--resource-note-color);
    outline-offset: 1px;
    background: var(--card-background) !important;
  }
  .note-template-edit__content {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    overflow: hidden;
  }
  .note-template-edit__actions {
    height: 50px;
    min-height: 50px;
    box-sizing: border-box;
    display: flex;
    flex: 0 0 50px;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 5px 14px;
    border-top: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  @media (max-width: 1199px) {
    .note-template-edit__fields {
      grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1.2fr);
    }
    .note-template-edit__description {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 767px) {
    .note-template-edit__workspace {
      padding: 10px 0 calc(80px + env(safe-area-inset-bottom));
    }
    .note-template-edit__header {
      flex-wrap: wrap;
    }
    .note-template-edit__header p {
      width: 100%;
      margin-left: 0;
      white-space: normal;
    }
    .note-template-edit__header,
    .note-template-edit__fields {
      margin-right: var(--mobile-page-gutter, 14px);
      margin-left: var(--mobile-page-gutter, 14px);
    }
    .note-template-edit__fields {
      grid-template-columns: 1fr;
    }
    .note-template-edit__description {
      grid-column: auto;
    }
  }
</style>
