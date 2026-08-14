<template>
  <BModal
    v-model:visible="visible"
    :title="t('note.newNote')"
    :mask-closable="false"
    :show-footer="false"
    width="min(420px, calc(100% - 24px))"
  >
    <div class="new-note-picker">
      <BTabs v-model:active-tab="activeTab" class="new-note-picker__tabs" variant="segment" :options="tabOptions" />

      <section v-if="activeTab === 'blank'" class="new-note-picker__section">
        <p class="new-note-picker__heading">{{ t('note.pickMode') }}</p>
        <div class="new-note-picker__mode-grid">
          <BButton class="new-note-picker__mode" @click="emit('selectBlank', 'html')">
            <span class="new-note-picker__mode-mark">HTML</span>
            <span class="new-note-picker__choice-copy">
              <strong>{{ t('note.htmlLabel') }}</strong>
              <small>{{ t('note.htmlCompactDesc') }}</small>
            </span>
          </BButton>
          <BButton class="new-note-picker__mode" @click="emit('selectBlank', 'markdown')">
            <span class="new-note-picker__mode-mark">MD</span>
            <span class="new-note-picker__choice-copy">
              <strong>{{ t('note.mdLabel') }}</strong>
              <small>{{ t('note.mdCompactDesc') }}</small>
            </span>
          </BButton>
          <BButton class="new-note-picker__mode" @click="emit('selectBlank', 'drawing')">
            <span class="new-note-picker__mode-mark">DRAW</span>
            <span class="new-note-picker__choice-copy">
              <strong>{{ t('note.drawingLabel') }}</strong>
              <small>{{ t('note.drawingCompactDesc') }}</small>
            </span>
          </BButton>
        </div>
      </section>

      <section v-else-if="activeTab === 'builtin'" class="new-note-picker__section">
        <div class="new-note-picker__template-grid">
          <BButton
            v-for="template in builtinTemplates"
            :key="template.key"
            class="new-note-picker__template"
            @click="emit('selectBuiltin', { key: template.key, type: template.type })"
          >
            <span class="new-note-picker__template-icon">
              <SvgIcon :src="templateIcons[template.key] ?? icon.resource.note" size="18" />
            </span>
            <span class="new-note-picker__choice-copy">
              <strong>{{ t(template.nameKey) }}</strong>
              <small>{{ t(template.descKey) }}</small>
              <BChip class="new-note-picker__template-type" tone="neutral" size="small">
                {{ templateTypeLabel(template.type) }}
              </BChip>
            </span>
          </BButton>
        </div>
      </section>

      <section v-else class="new-note-picker__section">
        <div class="new-note-picker__mine-heading">
          <strong>{{ t('note.tplMineSection') }}</strong>
          <BButton size="small" class="new-note-picker__manage" @click="emit('manage')">
            <SvgIcon :src="icon.noteDetail.template" size="14" aria-hidden="true" />
            {{ t('note.templateManager.title') }}
          </BButton>
        </div>
        <div v-if="myTemplatesState === 'loading'" class="new-note-picker__status">
          <BLoading inline loading :title="t('note.tplLoading')" />
        </div>
        <BButton v-else-if="myTemplatesState === 'error'" class="new-note-picker__retry" @click="emit('retry')">
          <SvgIcon :src="icon.cloudSpace.preview.retry" size="17" />
          <span class="new-note-picker__choice-copy">
            <strong>{{ t('note.tplRetryLabel') }}</strong>
            <small>{{ t('note.tplRetryDesc') }}</small>
          </span>
        </BButton>
        <p v-else-if="!myTemplates.length" class="new-note-picker__status">
          {{ t('note.tplEmptyMine') }}
        </p>
        <div v-else class="new-note-picker__mine-list">
          <BButton
            v-for="template in myTemplates"
            :key="template.id"
            class="new-note-picker__mine-main"
            @click="emit('selectMine', template)"
          >
            <span class="new-note-picker__choice-copy">
              <strong>{{ template.name }}</strong>
              <small>{{ templateTypeLabel(template.type) }}</small>
            </span>
          </BButton>
        </div>
      </section>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { BuiltinNoteTemplate } from '@/config/noteTemplates.ts';

  type NoteEditorType = 'html' | 'markdown' | 'drawing';
  type TemplateLoadState = 'idle' | 'loading' | 'success' | 'error';

  interface MyTemplate {
    id: string;
    name: string;
    description?: string;
    type: string;
  }

  const props = defineProps<{
    builtinTemplates: readonly BuiltinNoteTemplate[];
    myTemplates: MyTemplate[];
    myTemplatesState: TemplateLoadState;
    templateIcons: Record<string, string>;
  }>();

  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{
    (e: 'selectBlank', type: NoteEditorType): void;
    (e: 'selectBuiltin', template: { key: string; type: NoteEditorType }): void;
    (e: 'selectMine', template: MyTemplate): void;
    (e: 'manage'): void;
    (e: 'retry'): void;
  }>();

  const { t } = useI18n();
  const activeTab = ref('blank');
  const tabOptions = computed(() => [
    { key: 'blank', label: t('note.blankNote') },
    { key: 'builtin', label: t('note.tplBuiltinSection') },
    {
      key: 'mine',
      label: t('note.tplMineSection'),
      badge: props.myTemplatesState === 'success' && props.myTemplates.length ? props.myTemplates.length : undefined,
    },
  ]);

  const templateTypeLabel = (type: string) => (type === 'markdown' ? t('note.tplTypeMd') : t('note.tplTypeHtml'));

  watch(
    () => visible.value,
    (isVisible) => {
      if (isVisible) activeTab.value = 'blank';
    },
  );
</script>

<style scoped lang="less">
  .new-note-picker {
    width: 100%;
    min-width: 0;
  }

  :deep(.new-note-picker__tabs.tab-container) {
    width: 100%;
    border-radius: 10px;
  }

  :deep(.new-note-picker__tabs .tab) {
    flex: 1;
    min-width: 0;
    justify-content: center;
    padding-inline: 6px;
  }

  .new-note-picker__section {
    padding-top: 16px;
  }

  .new-note-picker__heading {
    margin: 0 0 10px;
    color: var(--sub-text-color);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
  }

  .new-note-picker__mode-grid,
  .new-note-picker__template-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .new-note-picker__mode,
  .new-note-picker__template,
  .new-note-picker__retry,
  .new-note-picker__mine-main,
  .new-note-picker__manage {
    color: var(--text-color);
    background: var(--card-background);
    border: 1px solid var(--surface-border-color, var(--card-border-color)) !important;
  }

  .new-note-picker__mode,
  .new-note-picker__template,
  .new-note-picker__retry,
  .new-note-picker__mine-main,
  .new-note-picker__manage {
    width: 100%;
    height: auto;
    line-height: 1.25;
    white-space: normal;
    text-align: left;
    justify-content: flex-start;
  }

  .new-note-picker__mode {
    min-height: 72px;
    gap: 9px;
    padding: 10px;
  }

  .new-note-picker__mode-mark {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 11%, var(--card-background));
    font-size: 11px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }

  .new-note-picker__template {
    min-height: 104px;
    align-items: flex-start;
    gap: 9px;
    padding: 10px;
  }

  .new-note-picker__template-icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 10%, var(--card-background));
  }

  .new-note-picker__choice-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .new-note-picker__choice-copy strong,
  .new-note-picker__choice-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .new-note-picker__choice-copy strong {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 650;
  }

  .new-note-picker__choice-copy small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
  }

  .new-note-picker__template .new-note-picker__choice-copy small {
    display: -webkit-box;
    min-height: 30px;
    line-height: 15px;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
  }

  .new-note-picker__template-type {
    align-self: flex-start;
    margin-top: 1px;
  }

  .new-note-picker__mode:hover,
  .new-note-picker__template:hover,
  .new-note-picker__retry:hover,
  .new-note-picker__mine-main:hover,
  .new-note-picker__manage:hover {
    border-color: color-mix(in srgb, var(--resource-note-color) 45%, var(--card-border-color)) !important;
    background: color-mix(in srgb, var(--resource-note-color) 6%, var(--card-background));
  }

  .new-note-picker__status {
    min-height: 56px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    margin: 0;
    padding: 12px;
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .new-note-picker__retry {
    min-height: 58px;
    gap: 10px;
    padding: 10px 12px;
    color: var(--resource-note-color);
  }

  .new-note-picker__mine-list {
    display: grid;
    gap: 8px;
  }

  .new-note-picker__mine-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;

    > strong {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 650;
    }
  }

  .new-note-picker__mine-main {
    width: 100%;
    min-height: 56px;
    padding: 9px 12px;
  }

  .new-note-picker__manage {
    flex: 0 0 auto;
    width: auto;
    gap: 5px;
    border: 1px solid var(--card-border-color) !important;
    background: transparent;
    color: var(--resource-note-color);
    font-weight: 600;
  }

  @media (max-width: 359px) {
    .new-note-picker__mode-grid,
    .new-note-picker__template-grid {
      gap: 8px;
    }

    .new-note-picker__mode,
    .new-note-picker__template {
      padding-inline: 8px;
    }

    .new-note-picker__mode-mark,
    .new-note-picker__template-icon {
      display: none;
    }
  }
</style>
