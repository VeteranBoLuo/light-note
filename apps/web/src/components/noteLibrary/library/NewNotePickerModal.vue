<template>
  <BModal
    v-model:visible="visible"
    :title="title || t('note.newNote')"
    :mask-closable="false"
    :show-footer="false"
    :esc-closable="!mobilePreview"
    :width="
      blankOnly
        ? 'min(var(--ui-layout-420, 420px), calc(100% - 24px))'
        : 'min(var(--ui-layout-1120, 1120px), calc(100% - 32px))'
    "
    :height="blankOnly ? 'auto' : 'min(86vh, var(--ui-layout-840, 840px))'"
    :fullscreen-mobile="!blankOnly"
    :content-class="blankOnly ? '' : 'note-picker-modal-content'"
  >
    <template v-if="!blankOnly" #mobileHeader>
      <div class="new-note-picker__mobile-header" @keydown.esc="handlePreviewEscape">
        <BButton v-if="mobilePreview" type="text" @click="backToList">
          <SvgIcon :src="icon.arrow_left" size="18" aria-hidden="true" />{{ t('note.picker.backToTemplates') }}
        </BButton>
        <strong v-else>{{ title || t('note.newNote') }}</strong>
        <BButton type="text" class="new-note-picker__close" :aria-label="t('common.close')" @click="closePicker">
          <SvgIcon :src="icon.navigation.close" size="18" aria-hidden="true" />
        </BButton>
      </div>
    </template>
    <div
      class="new-note-picker"
      :class="{ 'is-mobile-preview': mobilePreview, 'is-blank-only': blankOnly }"
      @keydown.esc="handlePreviewEscape"
    >
      <div v-show="!mobilePreview" class="new-note-picker__blank">
        <h2 class="new-note-picker__blank-title">
          {{ t(blankOnly ? 'note.picker.startBlank' : 'note.picker.blankTitle') }}
        </h2>
        <BButton
          v-for="mode in modes"
          :key="mode.type"
          class="new-note-picker__mode"
          @click="emit('selectBlank', mode.type)"
        >
          <div class="new-note-picker__mode-icon" aria-hidden="true">
            <SvgIcon :src="mode.icon" :size="blankOnly ? 24 : isMobile ? 18 : 22" />
          </div>
          <span class="new-note-picker__mode-copy">
            <strong>{{ t(mode.label) }}</strong>
            <small>{{ t(mode.description) }}</small>
          </span>
          <SvgIcon
            v-if="!blankOnly"
            class="new-note-picker__mode-arrow"
            :src="icon.arrow_right"
            size="16"
            aria-hidden="true"
          />
        </BButton>
      </div>
      <template v-if="!blankOnly">
        <div v-show="!mobilePreview" class="new-note-picker__tabs">
          <BTabs v-model:active-tab="activeTab" variant="line" :options="tabOptions" />
          <BButton type="text" class="new-note-picker__manage" @click="emit('manage')">{{
            t('note.templateManager.title')
          }}</BButton>
        </div>
        <div class="new-note-picker__body">
          <aside v-show="!isMobile || !mobilePreview" class="new-note-picker__catalog">
            <template v-if="activeTab === 'builtin'">
              <BButton
                v-for="template in builtinTemplates"
                :key="template.key"
                class="new-note-picker__item"
                :class="{ 'is-selected': selectedBuiltin === template.key }"
                :aria-current="selectedBuiltin === template.key ? 'true' : undefined"
                @click="selectBuiltin(template.key)"
              >
                <span class="new-note-picker__mini" :class="`is-${template.key}`" aria-hidden="true"
                  ><b></b><i></i><i></i><i></i
                ></span>
                <span class="new-note-picker__copy"
                  ><strong>{{ t(template.nameKey) }}</strong
                  ><small>{{ t(template.descKey) }}</small></span
                >
              </BButton>
            </template>
            <template v-else>
              <BLoading v-if="myTemplatesState === 'loading'" inline loading :title="t('note.tplLoading')" />
              <div v-else-if="myTemplatesState === 'error'" class="new-note-picker__status">
                <p>{{ t('note.tplRetryDesc') }}</p
                ><BButton @click="emit('retry')">{{ t('common.retry') }}</BButton>
              </div>
              <p v-else-if="!myTemplates.length" class="new-note-picker__status">{{ t('note.tplEmptyMine') }}</p>
              <div v-else class="new-note-picker__mine-list">
                <BButton
                  v-for="template in myTemplates"
                  :key="template.id"
                  class="new-note-picker__item"
                  :class="{ 'is-selected': selectedMine === template.id }"
                  :aria-current="selectedMine === template.id ? 'true' : undefined"
                  @click="selectMine(template.id)"
                >
                  <SvgIcon
                    :src="template.type === 'markdown' ? icon.resource.noteMarkdown : icon.resource.noteHtml"
                    size="20"
                    aria-hidden="true"
                  />
                  <span class="new-note-picker__copy"
                    ><strong>{{ template.name }}</strong
                    ><small>{{ template.description || typeLabel(template.type) }}</small></span
                  >
                </BButton>
              </div>
            </template>
          </aside>
          <section
            v-show="!isMobile || mobilePreview"
            class="new-note-picker__template-pane"
            :aria-label="t('note.templateManager.preview')"
          >
            <div v-if="canUse" class="new-note-picker__preview-toolbar">
              <span
                ><strong>{{ selectedName }}</strong> · {{ selectedType }}</span
              >
              <BButton
                v-if="activeTab === 'builtin'"
                type="text"
                :aria-pressed="showExample"
                @click="showExample = !showExample"
              >
                {{ t(showExample ? 'note.picker.showBlank' : 'note.picker.showExample') }}
              </BButton>
            </div>
            <div ref="previewScroll" class="new-note-picker__preview">
              <div v-if="activeTab === 'builtin' && activeBuiltin" class="new-note-picker__paper">
                <NoteTemplateBodyPreview :content="builtinContent" :type="activeBuiltin.type" />
              </div>
              <template v-else-if="activeTab === 'mine' && myTemplatesState === 'success' && selectedMine">
                <BLoading v-if="detailLoading" inline loading :title="t('note.templateManager.detailLoading')" />
                <div v-else-if="detailError" class="new-note-picker__status" role="alert">
                  <p>{{ t('note.templateManager.detailFailed') }}</p>
                  <BButton @click="loadMineDetail(selectedMine)">{{ t('common.retry') }}</BButton>
                </div>
                <div v-else-if="mineDetail" class="new-note-picker__paper">
                  <NoteTemplateBodyPreview
                    :content="renderNoteTemplate(mineDetail.content, { locale })"
                    :type="mineDetail.type"
                  />
                </div>
              </template>
              <div
                v-else-if="myTemplatesState === 'loading' || myTemplatesState === 'error'"
                class="new-note-picker__status"
              >
                {{ t(myTemplatesState === 'loading' ? 'note.tplLoading' : 'note.tplRetryDesc') }}
              </div>
              <div v-else class="new-note-picker__status">
                <strong>{{ t('note.picker.emptyTitle') }}</strong>
                <p>{{ t('note.picker.emptyHint') }}</p>
              </div>
            </div>
            <div v-if="canUse && (!isMobile || mobilePreview)" class="new-note-picker__footer">
              <p v-if="activeTab === 'builtin' && showExample" class="new-note-picker__example-hint">
                {{ t('note.picker.exampleHint') }}
              </p>
              <BButton class="new-note-picker__use" @click="useSelected">{{ t('note.templateManager.use') }}</BButton>
            </div>
          </section>
        </div>
      </template>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteTemplateBodyPreview from '@/components/noteLibrary/template/NoteTemplateBodyPreview.vue';
  import icon from '@/config/icon';
  import { pickTemplateLocale, type BuiltinNoteTemplate } from '@/config/noteTemplates';
  import { getNoteTemplateDetail } from '@/api/noteTemplate';
  import type { NoteTemplateDetail } from '@/types/noteTemplate';
  import { renderNoteTemplate } from '@/utils/noteTemplate';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import {
    closeCurrentMobileOverlayThen,
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    requestMobileOverlayHistoryClose,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';

  type NoteEditorType = 'html' | 'markdown' | 'drawing';
  interface MyTemplate {
    id: string;
    name: string;
    description?: string;
    type: string;
  }
  const props = withDefaults(
    defineProps<{
      builtinTemplates?: readonly BuiltinNoteTemplate[];
      myTemplates?: MyTemplate[];
      myTemplatesState?: 'idle' | 'loading' | 'success' | 'error';
      blankOnly?: boolean;
      title?: string;
    }>(),
    { builtinTemplates: () => [], myTemplates: () => [], myTemplatesState: 'idle', blankOnly: false, title: '' },
  );
  const visible = defineModel<boolean>('visible');
  const emit = defineEmits<{
    selectBlank: [type: NoteEditorType];
    selectBuiltin: [template: { key: string; type: NoteEditorType }];
    selectMine: [template: MyTemplate];
    manage: [];
    retry: [];
  }>();
  const { t, locale } = useI18n();
  const isMobile = useMobileLayout();
  const activeTab = ref('builtin');
  const selectedBuiltin = ref('');
  const selectedMine = ref('');
  const showExample = ref(false);
  const selecting = ref(false);
  const mobilePreview = ref(false);
  const previewScroll = ref<HTMLElement>();
  const mineDetail = ref<NoteTemplateDetail | null>(null);
  const detailLoading = ref(false);
  const detailError = ref(false);
  let detailSequence = 0;
  let previewHistory: MobileOverlayHistoryHandle | null = null;
  const previewNow = ref(new Date());
  const modes = [
    {
      type: 'html' as const,
      label: 'note.htmlLabel',
      description: 'note.htmlCompactDesc',
      icon: icon.resource.noteHtml,
    },
    {
      type: 'markdown' as const,
      label: 'note.mdLabel',
      description: 'note.mdCompactDesc',
      icon: icon.resource.noteMarkdown,
    },
    {
      type: 'drawing' as const,
      label: 'note.drawingLabel',
      description: 'note.drawingCompactDesc',
      icon: icon.resource.noteDrawing,
    },
  ];
  const tabOptions = computed(() => [
    { key: 'builtin', label: t('note.tplBuiltinSection'), badge: props.builtinTemplates.length || undefined },
    { key: 'mine', label: t('note.tplMineSection'), badge: props.myTemplates.length || undefined },
  ]);
  const typeLabel = (type: string) => t(type === 'markdown' ? 'note.tplTypeMd' : 'note.tplTypeHtml');
  const activeBuiltin = computed(() => props.builtinTemplates.find((item) => item.key === selectedBuiltin.value));
  const activeMine = computed(() => props.myTemplates.find((item) => item.id === selectedMine.value));
  const builtinContent = computed(() => {
    const template = activeBuiltin.value;
    if (!template) return '';
    const source = (showExample.value ? template.exampleContent : template.content)[pickTemplateLocale(locale.value)];
    return renderNoteTemplate(source, { now: previewNow.value, locale: locale.value });
  });
  const canUse = computed(() =>
    activeTab.value === 'builtin'
      ? Boolean(activeBuiltin.value)
      : Boolean(
          props.myTemplatesState === 'success' &&
          activeMine.value &&
          mineDetail.value?.id === selectedMine.value &&
          !detailLoading.value &&
          !detailError.value,
        ),
  );
  const selectedName = computed(() =>
    activeTab.value === 'builtin'
      ? activeBuiltin.value
        ? t(activeBuiltin.value.nameKey)
        : ''
      : mineDetail.value?.name || '',
  );
  const selectedType = computed(() =>
    typeLabel((activeTab.value === 'builtin' ? activeBuiltin.value?.type : mineDetail.value?.type) || 'html'),
  );

  function releasePreview() {
    releaseMobileOverlayHistory(previewHistory);
    previewHistory = null;
    mobilePreview.value = false;
  }
  function openPreview() {
    if (!isMobile.value || mobilePreview.value) return;
    mobilePreview.value = true;
    previewHistory = registerMobileOverlayHistory(() => {
      previewHistory = null;
      mobilePreview.value = false;
    });
  }
  function backToList() {
    if (!requestMobileOverlayHistoryClose(previewHistory)) releasePreview();
  }
  async function exitPreview() {
    if (previewHistory) await closeCurrentMobileOverlayThen(releasePreview, () => {});
    else mobilePreview.value = false;
  }
  async function closePicker() {
    await exitPreview();
    visible.value = false;
  }
  function handlePreviewEscape(event: KeyboardEvent) {
    if (mobilePreview.value) {
      event.preventDefault();
      event.stopPropagation();
      backToList();
    }
  }
  function selectBuiltin(key: string) {
    selectedBuiltin.value = key;
    showExample.value = false;
    openPreview();
  }
  async function selectMine(id: string) {
    selectedMine.value = id;
    openPreview();
  }
  async function loadMineDetail(id: string) {
    const sequence = ++detailSequence;
    mineDetail.value = null;
    detailError.value = false;
    detailLoading.value = true;
    try {
      const response = await getNoteTemplateDetail(id);
      if (sequence !== detailSequence) return;
      if (response.status !== 200 || response.data?.id !== id) throw new Error('NOTE_TEMPLATE_DETAIL_FAILED');
      mineDetail.value = response.data;
    } catch {
      if (sequence === detailSequence) detailError.value = true;
    } finally {
      if (sequence === detailSequence) detailLoading.value = false;
    }
  }
  async function useSelected() {
    if (!canUse.value || selecting.value) return;
    selecting.value = true;
    const builtin = activeBuiltin.value;
    const mine = activeMine.value ? { ...activeMine.value } : null;
    const tab = activeTab.value;
    await exitPreview();
    if (tab === 'builtin' && builtin) emit('selectBuiltin', { key: builtin.key, type: builtin.type });
    else if (mine) emit('selectMine', mine);
    selecting.value = false;
  }
  watch(
    () => [visible.value, activeTab.value, selectedMine.value, props.myTemplatesState],
    () => {
      detailSequence++;
      mineDetail.value = null;
      detailError.value = false;
      detailLoading.value = false;
      if (visible.value && activeTab.value === 'mine' && props.myTemplatesState === 'success' && selectedMine.value)
        void loadMineDetail(selectedMine.value);
    },
  );
  watch(
    () => props.builtinTemplates,
    () => {
      if (!activeBuiltin.value) selectedBuiltin.value = props.builtinTemplates[0]?.key || '';
    },
    { immediate: true },
  );
  watch(
    () => props.myTemplates,
    () => {
      if (!activeMine.value) selectedMine.value = props.myTemplates[0]?.id || '';
    },
    { immediate: true },
  );
  watch(
    visible,
    (open) => {
      releasePreview();
      if (open) {
        activeTab.value = 'builtin';
        showExample.value = false;
        selectedBuiltin.value = props.builtinTemplates[0]?.key || '';
        previewNow.value = new Date();
      } else detailSequence++;
    },
    { immediate: true },
  );
  watch(isMobile, (mobile) => {
    if (!mobile) releasePreview();
  });
  watch([selectedBuiltin, selectedMine, activeTab, showExample], async () => {
    await nextTick();
    if (previewScroll.value) previewScroll.value.scrollTop = 0;
  });
  onBeforeUnmount(() => {
    detailSequence++;
    releasePreview();
  });
</script>

<style lang="less" scoped>
  :global(.modal-view .modal-content.note-picker-modal-content) {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .new-note-picker {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    color: var(--text-color);
  }
  .new-note-picker__blank {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    flex: 0 0 auto;
    gap: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px) var(--ui-space-24, 24px);
    background: var(--workspace-canvas);
    background: color-mix(in srgb, var(--workspace-purple-selected) 48%, var(--workspace-open-canvas));
    border-bottom: 1px solid var(--workspace-border);
  }
  .new-note-picker__blank-title {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    line-height: 1.5;
  }
  .new-note-picker__mode.b_btn {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: var(--ui-layout-64, 64px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    gap: var(--ui-space-10, 10px);
    justify-content: flex-start;
    text-align: left;
    white-space: normal;
    line-height: 1.5;
    border: 1px solid var(--workspace-border);
    border-color: color-mix(in srgb, var(--workspace-purple-text) 18%, var(--workspace-border));
    border-radius: 10px;
    background: var(--workspace-purple-selected);
  }
  .new-note-picker__mode-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-36, 36px);
    border-radius: 8px;
    background: var(--primary-color);
    color: white;
  }
  .new-note-picker__mode-arrow {
    flex: 0 0 auto;
    margin-inline-start: auto;
    color: var(--workspace-purple-text);
  }
  .new-note-picker__mode-copy {
    display: grid;
    min-width: 0;
    gap: var(--ui-space-3, 3px);
  }
  .new-note-picker__mode-copy strong {
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .new-note-picker__blank small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .new-note-picker__tabs {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding-inline: var(--ui-space-24, 24px);
    flex: 0 0 auto;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .new-note-picker__manage {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .new-note-picker__body {
    display: grid;
    grid-template-columns: var(--ui-layout-248, 248px) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
  }
  .new-note-picker__catalog {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    border-right: 1px solid var(--surface-border-color);
  }
  .new-note-picker__item.b_btn {
    position: relative;
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-54, 54px);
    padding: var(--ui-space-6, 6px) var(--ui-space-9, 9px);
    margin-bottom: var(--ui-space-2, 2px);
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    text-align: left;
    white-space: normal;
    line-height: 1.45;
    border: 1px solid transparent;
    background: transparent;
  }
  .new-note-picker__item.b_btn.is-selected {
    border-color: var(--workspace-border);
    background: var(--workspace-hover);
  }
  .new-note-picker__item.is-selected::before {
    content: '';
    position: absolute;
    inset-block: var(--ui-space-8, 8px);
    inset-inline-start: 0;
    width: var(--ui-space-2, 2px);
    border-radius: 2px;
    background: var(--workspace-purple-text);
    pointer-events: none;
  }
  .new-note-picker__copy {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-2, 2px);
    overflow-wrap: anywhere;
  }
  .new-note-picker__copy strong {
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }
  .new-note-picker__copy small {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
    line-height: 1.5;
  }
  .new-note-picker__mini {
    box-sizing: border-box;
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-38, 38px);
    flex: 0 0 auto;
    padding: var(--ui-space-5, 5px) var(--ui-space-4, 4px);
    border: 1px solid var(--surface-border-color);
    border-radius: 4px;
    background: var(--card-background);
    overflow: hidden;
  }
  .new-note-picker__mini b {
    display: block;
    height: var(--ui-space-3, 3px);
    width: 70%;
    background: var(--workspace-note-text);
    opacity: 0.7;
    margin-bottom: var(--ui-space-4, 4px);
  }
  .new-note-picker__mini i {
    display: block;
    height: var(--ui-space-3, 3px);
    background: var(--surface-border-color);
    margin-bottom: var(--ui-space-2, 2px);
  }
  .new-note-picker__mini.is-daily i:nth-of-type(2) {
    width: 55%;
    height: var(--ui-layout-11, 11px);
    float: left;
  }
  .new-note-picker__mini.is-daily i:nth-of-type(3) {
    width: 37%;
    height: var(--ui-layout-11, 11px);
    float: right;
  }
  .new-note-picker__mini.is-meeting i:nth-of-type(2) {
    height: var(--ui-layout-15, 15px);
    background: repeating-linear-gradient(
      to bottom,
      var(--surface-border-color) 0,
      var(--surface-border-color) 1px,
      transparent 1px,
      transparent var(--ui-space-5, 5px)
    );
    border: 1px solid var(--surface-border-color);
  }
  .new-note-picker__mini.is-reading i:nth-of-type(2) {
    height: var(--ui-layout-10, 10px);
    border-left: 2px solid var(--primary-color);
    background: var(--workspace-purple-selected);
  }
  .new-note-picker__mini:is(.is-weekly, .is-review) i {
    width: 100%;
    border-left: 2px solid var(--workspace-note-text);
  }
  .new-note-picker__mini.is-project i {
    width: 85%;
    border-left: 2px solid var(--primary-color);
    margin-left: var(--ui-space-3, 3px);
  }
  .new-note-picker__mini.is-mindmap i {
    height: var(--ui-layout-6, 6px);
    width: var(--ui-space-7, 7px);
    float: left;
    margin-right: var(--ui-space-2, 2px);
    border: 1px solid var(--workspace-note-text);
    background: transparent;
  }
  .new-note-picker__template-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--workspace-canvas);
  }
  .new-note-picker__preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--ui-space-16, 16px) var(--ui-space-24, 24px) var(--ui-space-20, 20px);
  }
  .new-note-picker__preview-toolbar + .new-note-picker__preview {
    padding-top: 0;
  }
  .new-note-picker__preview-toolbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-6, 6px) var(--ui-space-24, 24px);
  }
  .new-note-picker__preview-toolbar > span {
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    overflow-wrap: anywhere;
  }
  .new-note-picker__preview-toolbar strong {
    color: var(--text-color);
    font-weight: 600;
  }
  .new-note-picker__preview-toolbar .b_btn {
    flex: 0 0 auto;
    font-size: var(--ui-font-12, 12px);
  }
  .new-note-picker__paper {
    padding: var(--ui-space-22, 22px) var(--ui-space-24, 24px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(
      --card-background
    ); /* ui-density-fixed: Preview uses document font size, independent of interface density. */
    font-size: 14px;
  }
  .new-note-picker__example-hint {
    margin: 0 auto 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .new-note-picker__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    flex: 0 0 auto;
    padding: var(--ui-space-9, 9px) var(--ui-space-24, 24px);
    border-top: 1px solid var(--surface-border-color);
    background: var(--background-color);
  }
  .new-note-picker__use.b_btn {
    height: auto;
    min-height: var(--ui-control-36, 36px);
    min-width: var(--ui-layout-96, 96px);
    padding: var(--ui-space-6, 6px) var(--ui-space-14, 14px);
    border: 1px solid var(--workspace-border);
    border-color: color-mix(in srgb, var(--workspace-purple-text) 22%, var(--workspace-border));
    border-radius: 7px;
    background: var(--background-color);
    color: var(--workspace-purple-text);
    font-weight: 600;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.4;
    white-space: normal;
  }
  .new-note-picker__mode.b_btn:focus-visible,
  .new-note-picker__item.b_btn:focus-visible,
  .new-note-picker__use.b_btn:focus-visible {
    outline-color: var(--focus-ring-color);
  }
  @media (hover: hover) and (pointer: fine) {
    .new-note-picker__mode.b_btn:hover,
    .new-note-picker__use.b_btn:hover {
      background: var(--surface-card-hover-bg);
      border-color: var(--workspace-purple-text);
    }
    .new-note-picker__item.b_btn:not(.is-selected):hover {
      background: var(--surface-card-hover-bg);
    }
  }
  .new-note-picker__status {
    padding: var(--ui-space-24, 24px);
    color: var(--desc-color);
    text-align: center;
  }
  .new-note-picker__status strong {
    color: var(--text-color);
  }
  .new-note-picker__status p {
    margin: var(--ui-space-8, 8px) 0;
  }
  .new-note-picker__mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: var(--ui-space-12, 12px);
    box-sizing: border-box;
    padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px) var(--ui-space-6, 6px) var(--ui-space-14, 14px);
  }
  .new-note-picker__mobile-header .b_btn {
    min-height: var(--ui-control-44, 44px);
  }
  .new-note-picker__close.b_btn {
    width: var(--ui-control-44, 44px);
    padding: 0;
    border: 0;
    color: var(--desc-color);
  }
  .is-blank-only .new-note-picker__blank {
    grid-template-columns: 1fr;
    gap: var(--ui-space-12, 12px);
    padding: 0;
    border: 0;
    background: transparent;
  }
  .is-blank-only .new-note-picker__blank-title {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
  }
  .is-blank-only .new-note-picker__mode.b_btn {
    padding-inline: var(--ui-space-14, 14px);
    gap: var(--ui-space-12, 12px);
    border-color: var(--surface-border-color);
    border-radius: 6px;
    background: transparent;
  }
  .is-blank-only .new-note-picker__mode-icon {
    width: auto;
    height: auto;
    color: var(--workspace-purple-text);
    background: transparent;
  }
  .is-blank-only .new-note-picker__mode-copy strong {
    font-size: var(--ui-font-13, 13px);
  }
  @media (hover: hover) and (pointer: fine) {
    .is-blank-only .new-note-picker__mode.b_btn:hover {
      border-color: var(--primary-color);
      background: var(--workspace-canvas);
    }
  }
  @media (max-width: 767px) {
    .new-note-picker:not(.is-blank-only) .new-note-picker__blank {
      column-gap: var(--ui-space-7, 7px);
      padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    }
    .new-note-picker:not(.is-blank-only) .new-note-picker__mode.b_btn {
      flex-direction: column;
      justify-content: center;
      text-align: center;
      gap: var(--ui-space-5, 5px);
      padding: var(--ui-space-7, 7px) var(--ui-space-4, 4px);
      min-height: var(--ui-layout-68, 68px);
    }
    .new-note-picker:not(.is-blank-only) .new-note-picker__mode-icon {
      width: var(--ui-layout-28, 28px);
      height: var(--ui-layout-28, 28px);
      border-radius: 6px;
    }
    .new-note-picker:not(.is-blank-only) .new-note-picker__mode-copy strong {
      font-size: var(--ui-font-12, 12px);
    }
    .new-note-picker:not(.is-blank-only) .new-note-picker__mode-copy small,
    .new-note-picker__mode-arrow {
      display: none;
    }
    .is-blank-only .new-note-picker__blank {
      gap: var(--ui-space-7, 7px);
    }
    .is-blank-only .new-note-picker__mode.b_btn {
      gap: var(--ui-space-5, 5px);
      padding-inline: var(--ui-space-5, 5px);
    }
    .new-note-picker__tabs {
      padding-inline: var(--ui-space-14, 14px);
      gap: var(--ui-space-8, 8px);
    }
    .new-note-picker__manage {
      font-size: var(--ui-font-11, 11px);
    }
    .new-note-picker__body {
      display: flex;
      flex-direction: column;
    }
    .new-note-picker__catalog {
      border: 0;
      flex: 1;
      min-height: 0;
      padding: var(--ui-space-10, 10px);
    }
    .new-note-picker__template-pane {
      flex: 1;
    }
    .new-note-picker__preview-toolbar {
      padding: 0 var(--ui-space-12, 12px);
    }
    .new-note-picker__preview-toolbar .b_btn {
      min-height: var(--ui-control-44, 44px);
    }
    .new-note-picker__preview {
      padding: var(--ui-space-12, 12px);
    }
    .new-note-picker__paper {
      padding: var(--ui-space-16, 16px);
    }
    .new-note-picker__footer {
      gap: var(--ui-space-5, 5px);
      padding: var(--ui-space-9, 9px) var(--ui-space-12, 12px) max(var(--ui-space-9, 9px), env(safe-area-inset-bottom));
    }
    .new-note-picker__example-hint {
      width: 100%;
    }
    .new-note-picker__use.b_btn {
      width: 100%;
      min-height: var(--ui-control-44, 44px);
    }
  }
</style>
