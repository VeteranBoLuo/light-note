<template>
  <div class="note-export-options" :class="{ 'is-mobile': mobile }" :aria-busy="busy">
    <div class="export-settings">
      <div class="export-field export-method-field">
        <span class="export-label">{{ t('noteExportSettings.packaging') }}</span>
        <BTabs
          v-model:active-tab="packaging"
          :options="methods"
          variant="segment"
          class="export-methods"
          :inert="busy || undefined"
          :aria-disabled="busy || undefined"
          :aria-label="t('noteExportSettings.packaging')"
        />
      </div>
      <div class="export-field export-format-field">
        <label class="export-label" :for="formatId">{{ t('noteExportSettings.format') }}</label>
        <BSelect
          :id="formatId"
          v-model:value="format"
          :disabled="busy"
          :options="formats"
          :aria-label="t('noteExportSettings.format')"
        />
      </div>
    </div>
    <p class="export-muted export-summary" role="status">{{
      settings.packaging === 'merged'
        ? t('noteExportSettings.mergedHint', {
            count: notes.length,
            format: format === 'markdown' ? 'Markdown' : format.toUpperCase(),
          })
        : t('noteExportSettings.archiveHint', { count: notes.length })
    }}</p>
    <template v-if="settings.packaging === 'merged'">
      <div class="export-field export-name-field">
        <label class="export-label" :for="nameId">{{ t('noteExportSettings.exportName') }}</label>
        <BInput
          :id="nameId"
          :value="settings.exportName"
          :placeholder="settings.defaultName"
          :disabled="busy"
          @update:value="updateTitleSettings({ exportName: String($event ?? '') })"
        />
        <span class="export-muted">{{ t('noteExportSettings.nameHint') }}</span>
      </div>
      <div class="export-title-options">
        <BCheckbox
          :model-value="settings.showDocumentTitle"
          controlled
          :disabled="busy"
          @update:model-value="updateTitleSettings({ showDocumentTitle: $event })"
          >{{ t('noteExportSettings.showDocumentTitle') }}</BCheckbox
        >
        <BCheckbox
          :model-value="settings.keepNoteTitles"
          controlled
          :disabled="busy"
          @update:model-value="updateTitleSettings({ keepNoteTitles: $event })"
          >{{ t('noteExportSettings.keepNoteTitles') }}</BCheckbox
        >
      </div>
      <p v-if="drawings.length" class="export-error" role="alert">{{
        t('noteExportSettings.drawingBlocked', {
          titles: drawings.map((n) => n.title || t('noteExportSettings.unnamed')).join('、'),
        })
      }}</p>
      <div class="export-order-heading">
        <div class="export-order-title"
          ><strong>{{ t('noteExportSettings.order') }}</strong
          ><span>{{ notes.length }}</span></div
        >
        <div class="export-order-actions">
          <BTooltip :title="t('noteExportSettings.reverse')">
            <BButton
              class="export-icon-action"
              :disabled="busy || notes.length < 2"
              :aria-label="t('noteExportSettings.reverse')"
              @click="setOrder([...settings.orderedIds].reverse())"
            >
              <SvgIcon :src="icon.toolbox.swap" class="export-reverse-icon" size="17" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <BTooltip :title="t('noteExportSettings.restore')">
            <BButton
              class="export-icon-action"
              :disabled="busy || notes.length < 2"
              :aria-label="t('noteExportSettings.restore')"
              @click="setOrder(notes.map((n) => n.id))"
            >
              <SvgIcon :src="icon.infrastructure.refresh" size="17" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>
      </div>
      <p class="export-muted export-order-hint">{{ t('noteExportSettings.orderHint') }}</p>
      <VueDraggable
        v-model="orderedNotes"
        :disabled="busy"
        handle=".export-drag"
        :animation="160"
        ghost-class="export-row-ghost"
        chosen-class="export-row-chosen"
        :fallback-tolerance="5"
        class="export-order"
        role="list"
      >
        <div v-for="(note, index) in orderedNotes" :key="note.id" class="export-row" role="listitem">
          <span
            class="export-drag"
            :class="{ 'is-disabled': busy }"
            :title="t('noteExportSettings.drag')"
            aria-hidden="true"
          >
            <SvgIcon :src="icon.todo.drag" size="18" />
          </span>
          <span class="export-number">{{ index + 1 }}</span>
          <div class="export-note">
            <strong>{{ note.title || t('noteExportSettings.unnamed') }}</strong>
            <small>{{
              t(
                `noteExportSettings.${note.type === 'drawing' ? 'drawing' : ['md', 'markdown'].includes(note.type || '') ? 'markdown' : 'html'}`,
              )
            }}</small>
          </div>
          <div class="export-row-actions">
            <BTooltip :title="t('noteExportSettings.up')">
              <BButton
                class="export-icon-action"
                :disabled="busy || index === 0"
                :aria-label="t('noteExportSettings.moveUp', { title: note.title || t('noteExportSettings.unnamed') })"
                @click="move(index, -1)"
              >
                <SvgIcon :src="icon.noteTree.chevron" class="export-up-icon" size="17" aria-hidden="true" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('noteExportSettings.down')">
              <BButton
                class="export-icon-action"
                :disabled="busy || index === orderedNotes.length - 1"
                :aria-label="t('noteExportSettings.moveDown', { title: note.title || t('noteExportSettings.unnamed') })"
                @click="move(index, 1)"
              >
                <SvgIcon :src="icon.noteTree.chevron" size="17" aria-hidden="true" />
              </BButton>
            </BTooltip>
          </div>
        </div>
      </VueDraggable>
    </template>
    <p class="export-muted export-format-hint">{{
      t(
        `noteExportSettings.${format === 'original' ? 'originalHint' : format === 'markdown' ? 'markdownHint' : format === 'pdf' ? 'pdfHint' : 'linksHint'}`,
      )
    }}</p>
  </div>
</template>
<script setup lang="ts">
  import { computed, useId } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { VueDraggable } from 'vue-draggable-plus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import {
    noteExportFormat,
    type BatchExportNote,
    type NoteBatchExportMode,
    type NoteExportSettings,
  } from '@/utils/noteBatchExport';
  const props = defineProps<{ notes: BatchExportNote[]; busy?: boolean }>();
  const settings = defineModel<NoteExportSettings>({ required: true });
  const { t } = useI18n();
  const formatId = useId();
  const nameId = useId();
  function updateTitleSettings(
    value: Partial<Pick<NoteExportSettings, 'exportName' | 'showDocumentTitle' | 'keepNoteTitles'>>,
  ) {
    if (!props.busy) settings.value = { ...settings.value, ...value };
  }
  const mobile = useMobileLayout();
  const methods = computed(() => ['archive', 'merged'].map((key) => ({ key, label: t(`noteExportSettings.${key}`) })));
  const packaging = computed({
    get: () => settings.value.packaging,
    set: (value: string) => {
      if (!props.busy && (value === 'archive' || value === 'merged'))
        settings.value = { ...settings.value, packaging: value };
    },
  });
  const format = computed({
    get: () => noteExportFormat(settings.value),
    set: (value: NoteBatchExportMode) => {
      if (props.busy || (settings.value.packaging === 'merged' && value === 'original')) return;
      settings.value = {
        ...settings.value,
        [settings.value.packaging === 'merged' ? 'mergedFormat' : 'archiveFormat']: value,
      };
    },
  });
  const formats = computed(() => [
    ...(settings.value.packaging === 'archive' ? [{ label: t('noteExportSettings.original'), value: 'original' }] : []),
    { label: 'HTML', value: 'html' },
    { label: 'Markdown', value: 'markdown' },
    { label: 'PDF', value: 'pdf' },
  ]);
  const drawings = computed(() => props.notes.filter((n) => n.type === 'drawing'));
  const orderedNotes = computed({
    get: () => {
      const byId = new Map(props.notes.map((n) => [n.id, n]));
      return settings.value.orderedIds.map((id) => byId.get(id)).filter((n): n is BatchExportNote => !!n);
    },
    set: (notes: BatchExportNote[]) => setOrder(notes.map((n) => n.id)),
  });
  function setOrder(ids: string[]) {
    if (!props.busy) settings.value = { ...settings.value, orderedIds: ids };
  }
  function move(index: number, delta: number) {
    const ids = [...settings.value.orderedIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrder(ids);
  }
</script>
<style scoped lang="less">
  .note-export-options {
    --export-control-height: 38px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    color: var(--text-color);
  }
  .export-settings {
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }
  .export-field {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
  }
  .export-method-field {
    flex: 1;
  }
  .export-format-field {
    flex: 0 0 160px;
  }
  .export-label {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .export-methods.tab-container.is-segment {
    height: var(--export-control-height);
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    padding: 3px;
    gap: 3px;
    background: var(--primary-btn-bg-color);
  }
  .export-methods.tab-container.is-segment :deep(.tab) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 5px;
    font-size: 13px;
    line-height: 1.3;
    text-align: center;
    background: transparent;
    box-shadow: none;
  }
  .export-methods.tab-container.is-segment :deep(.tab.is-active) {
    color: var(--primary-color);
    border-color: var(--surface-border-color);
    background: var(--background-color);
    box-shadow: none;
  }
  .export-methods[aria-disabled='true'] {
    pointer-events: none;
    opacity: 0.55;
  }
  .export-format-field :deep(.select-trigger) {
    box-sizing: border-box;
    height: var(--export-control-height);
    min-height: var(--export-control-height);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--background-color);
    padding: 0 12px;
    font-size: 13px;
  }
  .export-name-field :deep(.b-input) {
    height: var(--export-control-height);
    box-sizing: border-box;
    border-radius: 8px;
    border: 1px solid var(--surface-border-color);
    font-size: 13px;
  }
  .export-title-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 24px;
    font-size: 13px;
  }
  .is-mobile .export-title-options {
    flex-direction: column;
    gap: 0;
  }
  .is-mobile .export-title-options :deep(.b-checkbox) {
    min-height: 44px;
  }
  .export-muted {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.65;
  }
  .export-summary {
    margin-top: -4px;
  }
  .export-order-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
  }
  .export-order-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .export-order-title span {
    color: var(--desc-color);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .export-order-actions,
  .export-row-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .export-order-hint {
    margin-top: -16px;
    padding-right: 78px;
  }
  .export-order {
    border-top: 1px solid var(--surface-border-color);
  }
  .export-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-divider-color, var(--surface-border-color));
    border-radius: 4px;
  }
  .export-drag {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 24px;
    height: 32px;
    color: var(--desc-color);
    cursor: grab;
    touch-action: none;
  }
  .export-drag:active {
    cursor: grabbing;
  }
  .export-drag.is-disabled {
    cursor: default;
    opacity: 0.4;
  }
  .export-number {
    flex: 0 0 20px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .export-note {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .export-note strong {
    font-size: 14px;
    line-height: 1.5;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .export-note small {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
  }
  .export-icon-action {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    color: var(--desc-color);
    border-radius: 6px;
  }
  .export-icon-action:not(:disabled):hover,
  .export-icon-action:focus-visible {
    background: var(--primary-btn-h-bg-color);
    color: var(--text-color);
  }
  .export-icon-action:disabled {
    opacity: 0.25;
  }
  .export-up-icon {
    transform: rotate(180deg);
  }
  .export-reverse-icon {
    transform: rotate(90deg);
  }
  .export-row-ghost {
    opacity: 0.3;
    background: var(--primary-btn-bg-color);
    outline: 1px dashed var(--primary-color);
  }
  .export-row-chosen {
    background: var(--primary-btn-bg-color);
  }
  .export-format-hint {
    padding-top: 2px;
  }
  .export-error {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--error-color);
    overflow-wrap: anywhere;
  }
  .is-mobile {
    --export-control-height: 44px;
  }
  .is-mobile .export-settings {
    flex-direction: column;
    gap: 14px;
  }
  .is-mobile .export-field {
    width: 100%;
    flex: auto;
  }
  .is-mobile .export-row {
    gap: 4px;
    padding: 8px 0;
  }
  .is-mobile .export-drag {
    flex-basis: 28px;
    height: 44px;
  }
  .is-mobile .export-number {
    flex-basis: 18px;
  }
  .is-mobile .export-icon-action {
    width: 44px;
    height: 44px;
  }
  .is-mobile .export-order-hint {
    padding-right: 94px;
  }
</style>
