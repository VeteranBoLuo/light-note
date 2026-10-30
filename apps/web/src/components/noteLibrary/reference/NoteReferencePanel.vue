<template>
  <section class="note-reference-panel">
    <header v-if="target" class="note-reference-panel__head">
      <BPopover v-model:open="pickerOpen" trigger="click" placement="bottom-left" overlay-class-name="note-reference-picker-popover">
        <BButton class="note-reference-panel__title" :aria-label="t('note.reference.change')" :title="displayTitle">
          <span class="note-reference-panel__chip" :class="`is-${target.type}`">{{ typeLabel }}</span>
          <span class="note-reference-panel__name">{{ displayTitle }}</span>
          <SvgIcon :src="icon.noteTree.chevron" size="14" class="note-reference-panel__caret" aria-hidden="true" />
        </BButton>
        <template #content>
          <NoteReferencePicker
            :owner-key="ownerKey"
            :current-note-id="currentNoteId"
            :current-target="target"
            :recent="recent"
            @select="choose"
            @close="pickerOpen = false"
          />
        </template>
      </BPopover>
      <span class="note-reference-panel__readonly">{{ t('note.reference.readonly') }}</span>
      <div class="note-reference-panel__actions">
        <BTooltip :title="t('note.reference.openInNewWindow')">
          <BButton class="note-reference-panel__action" :aria-label="t('note.reference.openInNewWindow')" @click="openInNewWindow">
            <SvgIcon :src="icon.noteTree.openPage" size="16" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BTooltip v-if="target.type === 'note' && !unavailable" :title="t('note.reference.swapToEditor')">
          <BButton class="note-reference-panel__action" :aria-label="t('note.reference.swapToEditor')" @click="emit('swap', target.id)">
            <SvgIcon :src="icon.toolbox.swap" size="16" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BTooltip :title="t('note.reference.remove')">
          <BButton class="note-reference-panel__action" :aria-label="t('note.reference.remove')" @click="emit('change', null)">
            <SvgIcon :src="icon.common.close" size="16" aria-hidden="true" />
          </BButton>
        </BTooltip>
      </div>
    </header>

    <div v-if="!target" class="note-reference-panel__state">
      <span class="note-reference-panel__state-icon" aria-hidden="true">
        <SvgIcon :src="icon.noteTree.reference" size="22" />
      </span>
      <strong>{{ t('note.reference.emptyTitle') }}</strong>
      <p>{{ t('note.reference.emptyDescription') }}</p>
      <BPopover v-model:open="pickerOpen" trigger="click" placement="bottom-left" overlay-class-name="note-reference-picker-popover">
        <BButton type="primary" class="note-reference-panel__choose">
          <SvgIcon :src="icon.navigation.search" size="15" aria-hidden="true" />
          {{ t('note.reference.choose') }}
        </BButton>
        <template #content>
          <NoteReferencePicker
            :owner-key="ownerKey"
            :current-note-id="currentNoteId"
            :current-target="target"
            :recent="recent"
            @select="choose"
            @close="pickerOpen = false"
          />
        </template>
      </BPopover>
    </div>

    <div v-else-if="unavailable" class="note-reference-panel__state">
      <strong>{{ t(target.type === 'note' ? 'note.reference.noteUnavailable' : 'note.reference.fileUnavailable') }}</strong>
      <p>{{ t('note.reference.unavailableHint') }}</p>
      <BButton class="note-reference-panel__choose" @click="pickerOpen = true">
        {{ t('note.reference.chooseAnother') }}
      </BButton>
    </div>

    <NoteReadonlyPreview
      v-else-if="target.type === 'note'"
      :key="`note:${target.id}`"
      class="note-reference-panel__body"
      variant="reference"
      :note-id="target.id"
      @detail-resolved="handleNoteResolved"
      @unavailable="markUnavailable"
      @open-reference="choose({ ...$event, title: '' })"
    />

    <div v-else class="note-reference-panel__body note-reference-panel__file">
      <div v-if="fileLoading" class="note-reference-panel__loading">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <FilePreview
        v-else-if="fileInfo"
        :key="`file:${fileInfo.id}`"
        embedded
        :visible="true"
        :file-info="fileInfo"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteReadonlyPreview from '@/components/noteLibrary/library/NoteReadonlyPreview.vue';
  import NoteReferencePicker from './NoteReferencePicker.vue';
  import icon from '@/config/icon';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY, getCloudFileCategory } from '@/constants/cloudFileCategory';
  import { apiBasePost } from '@/http/request';
  import { normalizeReferencedFilePreviewInfo, type ReferencedFilePreviewInfo } from '@/utils/noteResourceNavigation';
  import {
    readRecentNoteReferences,
    rememberNoteReference,
    type NoteReferenceRecent,
    type NoteReferenceTarget,
  } from '@/utils/noteReference';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));

  const props = defineProps<{
    target: NoteReferenceTarget | null;
    currentNoteId: string;
    ownerKey: string;
  }>();

  const emit = defineEmits<{
    change: [target: NoteReferenceRecent | null];
    swap: [noteId: string];
  }>();

  const { t } = useI18n();
  const router = useRouter();
  const pickerOpen = ref(false);
  const recent = ref<NoteReferenceRecent[]>(readRecentNoteReferences(props.ownerKey));
  const resolvedTitle = ref('');
  const unavailable = ref(false);
  const fileInfo = ref<ReferencedFilePreviewInfo | null>(null);
  const fileLoading = ref(false);
  let fileRequestId = 0;

  const displayTitle = computed(() => {
    if (!props.target) return '';
    if (unavailable.value && !resolvedTitle.value && !fileInfo.value) return t('note.reference.unavailableName');
    if (props.target.type === 'file') return fileInfo.value?.fileName || resolvedTitle.value || t('common.loading');
    return resolvedTitle.value || t('note.untitled');
  });

  const typeLabel = computed(() => {
    if (props.target?.type !== 'file') return t('note.reference.noteType');
    const name = fileInfo.value?.fileName || '';
    const extension = name.includes('.') ? name.split('.').pop() || '' : '';
    if (extension && extension.length <= 5) return extension.toUpperCase();
    const category = getCloudFileCategory({ category: fileInfo.value?.category || '', fileName: name });
    return t(CLOUD_FILE_CATEGORY_LABEL_KEY[category]);
  });

  function choose(item: NoteReferenceRecent) {
    pickerOpen.value = false;
    if (item.type === 'note' && item.id === props.currentNoteId) return;
    recent.value = rememberNoteReference(props.ownerKey, item);
    emit('change', item);
  }

  function markUnavailable() {
    unavailable.value = true;
  }

  function handleNoteResolved(payload: { noteId: string; detail: Record<string, any> }) {
    if (payload.noteId !== props.target?.id) return;
    resolvedTitle.value = String(payload.detail?.title || '');
    if (resolvedTitle.value) recent.value = rememberNoteReference(props.ownerKey, { ...props.target, title: resolvedTitle.value });
  }

  async function loadFile(id: string) {
    const requestId = ++fileRequestId;
    fileLoading.value = true;
    fileInfo.value = null;
    try {
      const res = await apiBasePost('/api/file/getFileInfo', { id }, { silent: true });
      if (requestId !== fileRequestId) return;
      const info = res?.status === 200 ? normalizeReferencedFilePreviewInfo(res.data, { id }) : null;
      if (!info) {
        unavailable.value = true;
        return;
      }
      fileInfo.value = info;
      if (info.fileName && props.target) {
        recent.value = rememberNoteReference(props.ownerKey, { ...props.target, title: info.fileName });
      }
    } catch {
      if (requestId === fileRequestId) unavailable.value = true;
    } finally {
      if (requestId === fileRequestId) fileLoading.value = false;
    }
  }

  function openInNewWindow() {
    if (!props.target) return;
    const location =
      props.target.type === 'note'
        ? { path: `/noteLibrary/${encodeURIComponent(props.target.id)}` }
        : { path: '/cloudSpace', query: { fileId: props.target.id } };
    window.open(router.resolve(location).href, '_blank', 'noopener');
  }

  watch(
    () => (props.target ? `${props.target.type}:${props.target.id}` : ''),
    () => {
      fileRequestId += 1;
      unavailable.value = false;
      resolvedTitle.value = '';
      fileInfo.value = null;
      fileLoading.value = false;
      const target = props.target;
      if (!target) return;
      resolvedTitle.value = recent.value.find((item) => item.type === target.type && item.id === target.id)?.title || '';
      if (target.type === 'file') void loadFile(target.id);
    },
    { immediate: true },
  );

  watch(
    () => props.ownerKey,
    (ownerKey) => {
      recent.value = readRecentNoteReferences(ownerKey);
    },
  );

  onBeforeUnmount(() => {
    fileRequestId += 1;
  });
</script>

<style scoped lang="less">
  .note-reference-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    background: var(--card-background);
  }

  .note-reference-panel__head {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
    min-height: var(--ui-control-44, 44px);
    padding: var(--ui-space-6, 6px) var(--ui-space-8, 8px) var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-border-color);
    box-sizing: border-box;

    > .b-popover-trigger {
      display: flex;
      flex: 0 1 auto;
      min-width: 0;
    }
  }

  .note-reference-panel__title.b_btn {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
    max-width: 100%;
    height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-6, 6px);
    border: 1px solid transparent;
    border-radius: var(--ui-space-8, 8px);
    color: var(--text-color);
    background: transparent;
    font-weight: 600;

    &:hover,
    &:focus-visible {
      border-color: var(--surface-border-color);
      background: var(--workspace-hover, var(--surface-card-hover-bg));
    }
  }

  .note-reference-panel__chip {
    flex: 0 0 auto;
    padding: 0 var(--ui-space-6, 6px);
    border-radius: 999px;
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
    line-height: var(--ui-layout-20, 20px);

    &.is-note {
      color: var(--workspace-note-text);
      background: var(--workspace-note-selected);
    }

    &.is-file {
      color: var(--workspace-file-text);
      background: var(--workspace-file-selected);
    }
  }

  .note-reference-panel__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-reference-panel__caret {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .note-reference-panel__readonly {
    flex: 0 0 auto;
    padding: 0 var(--ui-space-6, 6px);
    border: 1px solid var(--surface-border-color);
    border-radius: var(--ui-space-6, 6px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: var(--ui-layout-20, 20px);
  }

  .note-reference-panel__actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--ui-space-2, 2px);
    margin-left: auto;
  }

  .note-reference-panel__action.b_btn {
    width: var(--ui-control-30, 30px);
    min-width: var(--ui-control-30, 30px);
    height: var(--ui-control-30, 30px);
    padding: 0;
    border: 0;
    border-radius: var(--ui-space-8, 8px);
    color: var(--desc-color);
    background: transparent;

    &:hover,
    &:focus-visible {
      color: var(--text-color);
      background: var(--workspace-hover, var(--surface-card-hover-bg));
    }
  }

  .note-reference-panel__body {
    flex: 1 1 auto;
    min-height: 0;
  }

  .note-reference-panel__file {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .note-reference-panel__loading {
    display: grid;
    flex: 1;
    place-items: center;
  }

  .note-reference-panel__state {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-8, 8px);
    min-height: 0;
    padding: var(--ui-space-24, 24px);
    color: var(--desc-color);
    text-align: center;

    strong {
      color: var(--text-color);
      font-size: var(--ui-font-15, 15px);
    }

    p {
      max-width: var(--ui-layout-260, 260px);
      margin: 0;
      font-size: var(--ui-font-13, 13px);
      line-height: 1.7;
    }
  }

  .note-reference-panel__state-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    border-radius: var(--ui-space-12, 12px);
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .note-reference-panel__choose.b_btn {
    gap: var(--ui-space-6, 6px);
    margin-top: var(--ui-space-4, 4px);
  }
</style>
