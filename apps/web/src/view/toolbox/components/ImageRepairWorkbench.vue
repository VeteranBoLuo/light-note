<template>
  <div ref="editor" class="image-repair" tabindex="-1" @pointerdown="focusEditor" @keydown="onEditorKey">
    <BUpload
      v-if="canRepair"
      ref="picker"
      triggerless
      raw-file
      :multiple="false"
      :disabled="busy"
      :accept="accept"
      :max-total-size="null"
      @change="chooseImage"
    />

    <section class="image-repair__board">
      <div v-if="showEditorControls" class="image-repair__file">
        <img v-if="original" class="image-repair__file-thumb" :src="original.url" alt="" />
        <span v-else class="image-repair__file-thumb is-placeholder">
          <SvgIcon :src="icon.toolbox.image" size="16" aria-hidden="true" />
        </span>
        <div v-if="original" class="image-repair__file-label">
          <strong :title="original.name">{{ original.name }}</strong>
          <span v-if="original.resized">{{ t('toolbox.imageRepair.resized', original) }}</span>
          <span v-else>{{ original.width }} × {{ original.height }}</span>
        </div>
        <div v-else class="image-repair__file-label">
          <span>{{ label('noImageSelected') }}</span>
        </div>
        <BButton
          class="image-repair__replace"
          type="text"
          :loading="decoding"
          :disabled="editingDisabled || !canRepair"
          @click="picker?.open()"
        >
          <span v-if="!decoding" class="image-repair__file-action-icon" aria-hidden="true">
            <SvgIcon :src="icon.toolbox.swap" size="16" />
          </span>
          {{ label('replace') }}
        </BButton>
        <div v-if="!mobile" ref="desktopControls" class="image-repair__desktop-controls"></div>
      </div>

      <div class="image-repair__workspace">
        <div v-if="showEditorControls" class="image-repair__toolbar" :aria-label="label('selectionTools')" role="group">
          <div class="image-repair__modes">
            <BButton
              v-for="choice of tools"
              :key="choice.id"
              class="image-repair__mode"
              type="text"
              :aria-pressed="Boolean(original && mode === choice.id && !temporaryPan)"
              :title="`${label(choice.id)} (${choice.key})`"
              :disabled="editingDisabled"
              @click="chooseMode(choice.id, $event)"
            >
              <span class="image-repair__mode-icon" aria-hidden="true">
                <SvgIcon :src="choice.icon" size="16" />
              </span>
              {{ label(choice.id) }}
              <kbd aria-hidden="true">{{ choice.key }}</kbd>
            </BButton>
            <BButton
              class="image-repair__mode image-repair__pan"
              type="text"
              :aria-pressed="Boolean(original && (mode === 'pan' || temporaryPan))"
              :title="label('panHint')"
              :disabled="editingDisabled"
              @click="chooseMode('pan', $event)"
            >
              <span class="image-repair__mode-icon" aria-hidden="true">
                <SvgIcon :src="icon.drawingNote.hand" size="16" />
              </span>
              {{ label('pan') }}
              <kbd aria-hidden="true">{{ label('holdSpace') }}</kbd>
            </BButton>
          </div>
          <div class="image-repair__history">
            <BButton
              type="text"
              :title="`${label('undo')} (${undoKey})`"
              :disabled="busy || !canUndo"
              @click="moveHistory(-1)"
            >
              <SvgIcon :src="icon.noteDetail.toolbar.undo" size="16" aria-hidden="true" />
              {{ label('undo') }}
            </BButton>
            <BButton
              type="text"
              :title="`${label('redo')} (${redoKey})`"
              :disabled="busy || !canRedo"
              @click="moveHistory(1)"
            >
              <SvgIcon :src="icon.noteDetail.toolbar.redo" size="16" aria-hidden="true" />
              {{ label('redo') }}
            </BButton>
          </div>
          <BButton class="image-repair__shortcuts" type="text" :disabled="!original" @click="openShortcuts">
            <SvgIcon :src="icon.settings.shortcuts" size="16" aria-hidden="true" />
            {{ label('shortcuts') }}
          </BButton>
        </div>

        <div v-if="mode === 'brush'" class="image-repair__brush-size">
          <span>{{ label('brushSize') }}</span>
          <BButton
            icon-only
            :aria-label="label('brushSmaller')"
            :disabled="busy || brushSize <= MIN_BRUSH_SIZE"
            @click="adjustBrush(-1)"
            >−</BButton
          >
          <output :aria-label="label('brushSize')">{{ brushSize }} px</output>
          <BButton
            icon-only
            :aria-label="label('brushLarger')"
            :disabled="busy || brushSize >= MAX_BRUSH_SIZE"
            @click="adjustBrush(1)"
            >+</BButton
          >
        </div>

        <ImageRepairCanvas
          :key="original?.url"
          ref="canvasEditor"
          :controls-target="desktopControls"
          :hide-controls="!showEditorControls"
          :src="displayUrl"
          :width="original?.width ?? 0"
          :height="original?.height ?? 0"
          :selections="selections"
          :active-index="activeIndex"
          :editable="!editingDisabled && !comparing"
          :show-selections="!comparing"
          :mode="mode"
          :brush-size="brushSize"
          :temporary-pan="temporaryPan"
          @select="addSelection"
          @activate="activeIndex = $event"
        >
          <template #empty>
            <div
              class="image-repair__empty"
              :class="{ 'is-dragging': canRepair && dragging, 'is-unavailable': !canRepair }"
              @dragover.prevent="dragging = canRepair && !busy"
              @dragleave="dragging = false"
              @drop.prevent="dropImage"
            >
              <SvgIcon :src="icon.toolbox.image" size="44" aria-hidden="true" />
              <template v-if="canRepair">
                <BButton type="primary" :loading="decoding" @click="picker?.open()">{{ label('choose') }}</BButton>
                <p>{{
                  label('formats') +
                  ' · ' +
                  t('toolbox.imageRepair.pointsPerRepair', { points: pointsCost }, pointsCost)
                }}</p>
              </template>
              <template v-else>
                <p role="status">{{ availabilityMessage }}</p>
                <BButton v-if="showLogin" type="primary" @click="router.push({ name: 'login' })">{{
                  label('signIn')
                }}</BButton>
              </template>
              <p v-if="error" class="image-repair__error" role="alert">{{ error }}</p>
              <div v-if="canRepair && resizeCandidate" class="image-repair__resize">
                <p>{{ label('resizeHint') }}</p>
                <BButton :loading="decoding" :disabled="busy" @click="resizeSelectedImage">{{
                  label('resize')
                }}</BButton>
              </div>
            </div>
          </template>
          <template #feedback>
            <div
              v-if="original && (error || resizeCandidate || repairStatus || !canRepair)"
              class="image-repair__status"
            >
              <div v-if="repairStatus" class="image-repair__feedback">
                <p role="status">{{ repairStatus }}</p>
                <BButton v-if="enhancePhase" type="text" @click="cancelEnhancedRepair(true)">{{
                  t('common.cancel')
                }}</BButton>
              </div>
              <p v-else-if="!canRepair" role="status">{{ availabilityMessage }}</p>
              <p v-if="error" class="image-repair__error" role="alert">{{ error }}</p>
              <div v-if="canRepair && resizeCandidate" class="image-repair__resize">
                <p>{{ label('resizeHint') }}</p>
                <BButton :loading="decoding" :disabled="busy" @click="resizeSelectedImage">{{
                  label('resize')
                }}</BButton>
              </div>
            </div>
          </template>
          <template #default>
            <div class="image-repair__actions">
              <BButton
                class="image-repair__compare"
                type="text"
                :disabled="!result || busy"
                :aria-pressed="comparing"
                @pointerdown="beginCompare"
                @pointerup="endCompare"
                @pointercancel="endCompare"
                @lostpointercapture="endCompare"
                @keydown.space.prevent="startCompare"
                @keyup.space.prevent="endCompare"
                @blur="endCompare"
                @contextmenu.prevent
                @click="toggleCompare"
              >
                <SvgIcon :src="icon.toolbox.comparison" size="16" aria-hidden="true" />
                {{ label('holdOriginal') }}
              </BButton>
              <BButton
                class="image-repair__download"
                :type="readyToDownload ? 'primary' : 'text'"
                :loading="saving"
                :disabled="busy || !readyToDownload"
                @click="download"
              >
                <SvgIcon v-if="!saving" :src="icon.toolbox.download" size="16" aria-hidden="true" />
                {{ label('download') }}
              </BButton>
              <BButton
                v-if="!readyToDownload"
                class="image-repair__enhance"
                type="primary"
                :title="label('repairHint')"
                :loading="Boolean(enhancePhase) || settling"
                :disabled="!canRepair || (pendingRepair ? settling : busy || comparing || !selections.length)"
                @click="pendingRepair ? settleRepair() : repair()"
              >
                <SvgIcon v-if="!enhancePhase && !settling" :src="icon.common.magicWand" size="16" aria-hidden="true" />
                {{ label(pendingRepair && !settling ? 'retrySettlement' : 'repair') }}
              </BButton>
            </div>
          </template>
        </ImageRepairCanvas>
      </div>
    </section>
    <BModal
      :visible="showShortcuts"
      :title="label('shortcuts')"
      :show-footer="false"
      width="min(var(--ui-layout-460, 460px), 94vw)"
      @close="closeShortcuts"
    >
      <dl class="image-repair__shortcut-list">
        <div v-for="item of shortcuts" :key="item.id">
          <dt>{{ label(item.id) }}</dt>
          <dd>
            <kbd v-if="item.key">{{ item.key }}</kbd>
            <span v-else>{{ label('panHint') }}</span>
          </dd>
        </div>
      </dl>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { getToolboxTool } from '@lightnote/shared/toolbox-protocol';
  import { createToolboxClientRequestId, fetchImageRepairPoints, settleImageRepairPoints } from '@/api/toolbox';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { isEditableShortcutTarget } from '@/config/keyboardShortcuts';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useGrowth } from '@/composables/useGrowth';
  import { useUserStore } from '@/store';
  import useBookmarkStore from '@/store/bookmark';
  import { isLightNoteAndroidApp, saveImageViaAndroid } from '@/utils/androidBridge';
  import { deliverGeneratedFile, encodeFileContentToBase64 } from '@/utils/fileDelivery';
  import { safeDownloadBaseName, TOOLBOX_LOCAL_DELIVERY_EVENT } from '@/utils/toolboxLocal';
  import ImageRepairCanvas from './ImageRepairCanvas.vue';
  import { runEnhancedImageRepair, type EnhancedRepairPhase } from '../enhancedImageRepairEngine';
  import { canUseEnhancedImageRepair } from '../imageRepairCapabilities';
  import {
    discardRepairOutputs,
    emptyRepairHistory,
    recordRepairEdit,
    type RepairHistory,
  } from '../imageRepairHistory';
  import {
    canResizeRepairImage,
    decodeRepairImage,
    encodeRepairImage,
    fitRepairImage,
    inspectRepairImage,
    MAX_REPAIR_IMAGE_EDGE,
    MAX_REPAIR_IMAGE_PIXELS,
    RepairImageError,
    resizeRepairImage,
    type ImageMetadata,
  } from '../imageRepairImage';
  import { applyReducedRepairPatch, prepareRepairPatch } from '../imageRepairPatch';
  import {
    applyRepairSelection,
    enhancedRepairBounds,
    repairPatchBounds,
    type RepairSelection,
  } from '../imageRepairSelection';

  const { t, locale } = useI18n();
  const { pointsCost = 0 } = defineProps<{ pointsCost?: number }>();
  const router = useRouter();
  const user = useUserStore();
  const { load: loadGrowth } = useGrowth();
  const label = (key: string) => t(`toolbox.imageRepair.${key}`);
  const tool = getToolboxTool('image_watermark_remover')!;
  const accept = tool.input.accept!.join(',');
  const tools = [
    { id: 'rectangle', icon: icon.drawingNote.shapeTypes.rectangle, key: 'M' },
    { id: 'brush', icon: icon.drawingNote.pen, key: 'B' },
  ] as const;
  const MIN_BRUSH_SIZE = 8;
  const MAX_BRUSH_SIZE = 96;
  const isAppleKeyboard = /Mac|iPhone|iPad/.test(navigator.platform);
  const undoKey = isAppleKeyboard ? '⌘Z' : 'Ctrl+Z';
  const redoKey = isAppleKeyboard ? '⇧⌘Z' : 'Ctrl+Shift+Z';
  const shortcuts = [
    ...tools,
    { id: 'pan', key: null },
    { id: 'undo', key: undoKey },
    { id: 'redo', key: redoKey },
    { id: 'removeSelection', key: 'Delete / Backspace' },
    { id: 'cancelSelection', key: 'Esc' },
    { id: 'brushSize', key: '[ / ]' },
    { id: 'zoom', key: '+ / −' },
    { id: 'fit', key: '0' },
    { id: 'holdOriginal', key: '\\' },
  ];
  const editor = ref<HTMLElement>();
  const canvasEditor = ref<InstanceType<typeof ImageRepairCanvas>>();
  const mobile = useMobileLayout();
  const bookmark = useBookmarkStore();
  const desktopRepair = computed(() => !mobile.value && bookmark.isDesktop);
  const capability = ref<'checking' | 'ready' | 'unavailable'>('checking');
  const accountId = computed(() =>
    user.role !== 'visitor' && !user.adminContext && !user.visitorWorkspace ? String(user.id || '') : '',
  );
  const showLogin = computed(
    () =>
      desktopRepair.value &&
      capability.value === 'ready' &&
      !accountId.value &&
      !user.adminContext &&
      !user.visitorWorkspace &&
      !!pointsCost,
  );
  const canRepair = computed(
    () => desktopRepair.value && capability.value === 'ready' && Boolean(accountId.value && pointsCost),
  );
  const availabilityMessage = computed(() => {
    if (!desktopRepair.value) return label('desktopOnly');
    if (capability.value === 'checking') return label('capabilityChecking');
    if (capability.value === 'unavailable') return label('unsupportedGraphics');
    if (showLogin.value) return t('toolbox.imageRepair.signInHint', { points: pointsCost }, pointsCost);
    return t('toolbox.unavailable');
  });
  const desktopControls = ref<HTMLElement | null>(null);
  const shortcutTrigger = ref<HTMLElement>();
  const showShortcuts = ref(false);
  const temporaryPan = ref(false);
  const brushSize = ref(24);
  const activeIndex = ref(-1);
  const comparing = ref(false);

  const picker = ref<InstanceType<typeof BUpload>>();
  type ImageCandidate = ImageMetadata & { file: File };

  const original = shallowRef<{ name: string; url: string; width: number; height: number; resized: boolean }>();
  const showEditorControls = computed(() => desktopRepair.value || Boolean(original.value));
  const resizeCandidate = shallowRef<ImageCandidate>();
  const history = shallowRef(emptyRepairHistory());
  const current = computed(() => history.value.edits[history.value.index]);
  const result = computed(() => current.value.output);
  const selections = computed(() => current.value.selections);
  const canUndo = computed(() => history.value.index > 0);
  const canRedo = computed(() => history.value.index + 1 < history.value.edits.length);
  const readyToDownload = computed(() => Boolean(result.value) && !selections.value.length);
  const mode = ref<RepairSelection['kind'] | 'pan'>('rectangle');
  const displayUrl = computed(() =>
    comparing.value ? original.value?.url : (result.value?.url ?? original.value?.url),
  );
  const decoding = ref(false);
  const enhancePhase = ref<EnhancedRepairPhase | 'checkingPoints'>();
  const pendingRepair = shallowRef<{
    accountId: string;
    clientRequestId: string;
    expectedCost: number;
    output: { url: string; blob: Blob };
  }>();
  const settling = ref(false);
  const repairStatus = computed(() => {
    if (settling.value) return label('settling');
    if (enhancePhase.value === 'checkingPoints') return label('checkingPoints');
    if (enhancePhase.value) return label(enhancePhase.value === 'loading' ? 'repairLoading' : 'repairing');
    return '';
  });
  const saving = ref(false);
  const busy = computed(() => decoding.value || Boolean(enhancePhase.value || pendingRepair.value) || saving.value);
  const editingDisabled = computed(() => !original.value || busy.value);
  const dragging = ref(false);
  const error = ref('');
  let enhanceController: AbortController | undefined;
  let capabilityCheck: Promise<boolean> | undefined;
  let active = true;

  function releaseImage(url?: string) {
    if (url) URL.revokeObjectURL(url);
  }

  function updateHistory(next: RepairHistory) {
    discardRepairOutputs(history.value, next);
    history.value = next;
  }

  function resetResults() {
    updateHistory(emptyRepairHistory());
    comparing.value = false;
    activeIndex.value = -1;
  }

  function dropImage(event: DragEvent) {
    dragging.value = false;
    void chooseImage(Array.from(event.dataTransfer?.files || []));
  }

  async function chooseImage(files: File[]) {
    if (!canRepair.value || busy.value || !files.length) return;
    error.value = '';
    resizeCandidate.value = undefined;
    if (files.length !== 1) {
      error.value = label('oneImage');
      return;
    }
    const [file] = files;
    if (file.size > tool.input.maxBytes!) {
      error.value = t('common.maxTotalSize', { n: tool.input.maxBytes! / (1024 * 1024) });
      return;
    }
    decoding.value = true;
    try {
      const metadata = await inspectRepairImage(file);
      if (!active) return;
      const candidate = { file, ...metadata };
      const { width, height } = candidate;
      const size = fitRepairImage(width, height);
      if (size.width !== width || size.height !== height) {
        error.value = t('toolbox.imageRepair.imageDimensionsExceeded', {
          width,
          height,
          edge: MAX_REPAIR_IMAGE_EDGE,
          pixels: MAX_REPAIR_IMAGE_PIXELS.toLocaleString(locale.value),
        });
        if (canResizeRepairImage(width, height)) resizeCandidate.value = candidate;
        else error.value += ` ${label('resizeFailed')}`;
        return;
      }
      await useImage(candidate, false);
    } catch (cause) {
      if (active) error.value = label(cause instanceof RepairImageError ? cause.code : 'decodeFailed');
    } finally {
      decoding.value = false;
    }
  }

  async function resizeSelectedImage() {
    if (!canRepair.value || busy.value || !resizeCandidate.value) return;
    decoding.value = true;
    error.value = '';
    try {
      await useImage(resizeCandidate.value, true);
    } catch {
      if (active) error.value = label('resizeFailed');
    } finally {
      decoding.value = false;
    }
  }

  async function useImage({ file, type }: ImageCandidate, resize: boolean) {
    const sourceUrl = URL.createObjectURL(file.type === type ? file : file.slice(0, file.size, type));
    let finalUrl = sourceUrl;
    try {
      let width: number;
      let height: number;
      if (resize) {
        const resized = await resizeRepairImage(sourceUrl);
        if (!active) return;
        finalUrl = URL.createObjectURL(resized.blob);
        ({ width, height } = resized);
      } else {
        const image = await decodeRepairImage(sourceUrl);
        if (!active) return;
        width = image.naturalWidth;
        height = image.naturalHeight;
      }
      releaseImage(original.value?.url);
      resetResults();
      original.value = { name: file.name, url: finalUrl, width, height, resized: resize };
      resizeCandidate.value = undefined;
      mode.value = 'rectangle';
    } finally {
      if (sourceUrl !== original.value?.url) releaseImage(sourceUrl);
      if (finalUrl !== sourceUrl && finalUrl !== original.value?.url) releaseImage(finalUrl);
    }
  }

  function addSelection(selection: RepairSelection) {
    if (busy.value || comparing.value) return;
    error.value = '';
    const after = applyRepairSelection(selections.value, selection);
    activeIndex.value = after.length - 1;
    updateHistory(recordRepairEdit(history.value, { output: result.value, selections: after }));
  }

  function removeSelection() {
    const index = activeIndex.value;
    if (busy.value || comparing.value || !selections.value[index]) return;
    const after = selections.value.filter((_, position) => position !== index);
    updateHistory(recordRepairEdit(history.value, { output: result.value, selections: after }));
    activeIndex.value = -1;
    error.value = '';
  }

  function moveHistory(direction: -1 | 1) {
    if (busy.value || comparing.value) return;
    const { edits, index } = history.value;
    const next = index + direction;
    if (next < 0 || next >= edits.length) return;
    error.value = '';
    canvasEditor.value?.cancelInteraction();
    history.value = { edits, index: next };
    activeIndex.value = selections.value.length - 1;
  }

  function focusEditor(event: PointerEvent) {
    if (!original.value || event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    if (event.target.closest('button, input, select, textarea, a, [role="application"], [role="combobox"]')) return;
    editor.value?.focus({ preventScroll: true });
  }

  function startCompare() {
    if (result.value && !busy.value) comparing.value = true;
  }

  function endCompare() {
    comparing.value = false;
  }

  function beginCompare(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    startCompare();
  }

  function toggleCompare(event: MouseEvent) {
    if (event.detail !== 0) return;
    if (comparing.value) endCompare();
    else startCompare();
  }

  function chooseMode(next: typeof mode.value, event: MouseEvent) {
    mode.value = next;
    if (event.detail > 0) canvasEditor.value?.focusCanvas();
  }

  function adjustBrush(direction: -1 | 1) {
    brushSize.value = Math.min(MAX_BRUSH_SIZE, Math.max(MIN_BRUSH_SIZE, brushSize.value + direction * 4));
  }

  function openShortcuts(event: MouseEvent) {
    shortcutTrigger.value = event.currentTarget as HTMLElement;
    releaseKeys();
    showShortcuts.value = true;
  }

  function closeShortcuts() {
    showShortcuts.value = false;
    void nextTick(() => shortcutTrigger.value?.focus({ preventScroll: true }));
  }

  function releaseKeys(event?: KeyboardEvent) {
    if (!event || event.code === 'Space') temporaryPan.value = false;
    if (!event || event.key === '\\') endCompare();
  }

  function onEditorKey(event: KeyboardEvent) {
    if (
      !original.value ||
      showShortcuts.value ||
      event.defaultPrevented ||
      event.isComposing ||
      isEditableShortcutTarget(event.target)
    )
      return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key !== 'z' && key !== 'y') return;
      const redo = key === 'y' || event.shiftKey;
      if (busy.value || comparing.value || !(redo ? canRedo.value : canUndo.value)) return;
      event.preventDefault();
      moveHistory(redo ? 1 : -1);
      return;
    }
    if (busy.value || event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target instanceof Element ? event.target : undefined;
    if (key === 'escape') {
      if (comparing.value) endCompare();
      else if (canvasEditor.value?.cancelInteraction()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      } else if (activeIndex.value >= 0) activeIndex.value = -1;
      else return;
      event.stopPropagation();
    } else if (event.code === 'Space' && !target?.closest('button, a, [role="button"]')) {
      temporaryPan.value = true;
    } else if (key === 'm') mode.value = 'rectangle';
    else if (key === 'b') mode.value = 'brush';
    else if (key === '+' || key === '=') canvasEditor.value?.zoomBy(1.5);
    else if (key === '-' || key === '−') canvasEditor.value?.zoomBy(1 / 1.5);
    else if (key === '0') canvasEditor.value?.resetZoom();
    else if (key === '[' && mode.value === 'brush') adjustBrush(-1);
    else if (key === ']' && mode.value === 'brush') adjustBrush(1);
    else if (key === 'delete' || key === 'backspace') removeSelection();
    else if (key === '\\') startCompare();
    else return;
    event.preventDefault();
  }

  function onWindowBlur() {
    releaseKeys();
    canvasEditor.value?.finishInterruptedInteraction();
  }

  function cancelEnhancedRepair(restoreFocus = false) {
    enhanceController?.abort();
    if (restoreFocus) canvasEditor.value?.focusCanvas();
  }

  watch(
    desktopRepair,
    async (desktop) => {
      if (!desktop) {
        cancelEnhancedRepair();
        return;
      }
      capabilityCheck ??= canUseEnhancedImageRepair();
      const supported = await capabilityCheck;
      if (active) capability.value = supported ? 'ready' : 'unavailable';
    },
    { immediate: true },
  );

  async function repair() {
    const input = original.value;
    const expectedCost = pointsCost;
    const owner = accountId.value;
    if (!canRepair.value || !expectedCost || !input || busy.value || comparing.value || !selections.value.length)
      return;
    error.value = '';
    const selection = repairPatchBounds(selections.value, input.width, input.height);
    const controller = new AbortController();
    enhanceController = controller;
    enhancePhase.value = 'checkingPoints';
    const bounds = enhancedRepairBounds(selection, input.width, input.height);
    const canvas = document.createElement('canvas');
    try {
      let points;
      try {
        points = await fetchImageRepairPoints();
      } catch {
        if (active && !controller.signal.aborted) error.value = label('pointsCheckFailed');
        return;
      }
      if (!active || controller.signal.aborted || accountId.value !== owner) return;
      if (points.accountId !== owner || points.cost !== expectedCost) {
        error.value = label('billingChanged');
        return;
      }
      if (points.balance < expectedCost) {
        error.value = label('insufficientPoints');
        return;
      }
      enhancePhase.value = 'loading';
      const patch = prepareRepairPatch(selections.value, bounds);
      if (patch.status !== 'ready') {
        error.value = label('selectionNeedsBackground');
        return;
      }
      const { width, height, mask, originalMask } = patch;
      const image = await decodeRepairImage(result.value?.url ?? input.url);
      if (!active || controller.signal.aborted) return;
      canvas.width = width;
      canvas.height = height;
      const crop = canvas.getContext('2d', { willReadFrequently: !!originalMask });
      if (!crop) throw new Error('Canvas unavailable');
      crop.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, width, height);
      const pixels = crop.getImageData(0, 0, width, height);
      canvas.width = canvas.height = 1;
      const repaired = await runEnhancedImageRepair(pixels, mask, controller.signal, (phase) => {
        enhancePhase.value = phase;
      });
      if (!active || controller.signal.aborted) return;
      canvas.width = input.width;
      canvas.height = input.height;
      const output = canvas.getContext('2d');
      if (!output) throw new Error('Canvas unavailable');
      output.drawImage(image, 0, 0);
      if (originalMask) applyReducedRepairPatch(output, repaired, bounds, originalMask);
      else output.putImageData(repaired, bounds.x, bounds.y);
      const blob = await encodeRepairImage(canvas);
      if (!active || controller.signal.aborted || accountId.value !== owner) return;
      pendingRepair.value = {
        accountId: owner,
        clientRequestId: createToolboxClientRequestId('repair'),
        expectedCost,
        output: { url: URL.createObjectURL(blob), blob },
      };
    } catch (cause) {
      if (!active || controller.signal.aborted) return;
      const reason = cause instanceof Error ? cause.message : '';
      if (reason === 'unsupported') error.value = label('unsupportedGraphics');
      else error.value = label(reason === 'load' ? 'loadFailed' : 'repairFailed');
    } finally {
      canvas.width = canvas.height = 1;
      enhancePhase.value = undefined;
      enhanceController = undefined;
    }
    if (pendingRepair.value) await settleRepair();
  }

  function discardPendingRepair() {
    releaseImage(pendingRepair.value?.output.url);
    pendingRepair.value = undefined;
  }

  async function settleRepair() {
    const pending = pendingRepair.value;
    if (settling.value || !pending || pending.accountId !== accountId.value) return;
    const { output, ...billing } = pending;
    error.value = '';
    settling.value = true;
    try {
      await settleImageRepairPoints(billing);
    } catch (cause) {
      if (!active || pending.accountId !== accountId.value) return;
      const failure = cause as { code?: string; response?: { data?: { data?: { code?: string } } } };
      switch (failure.response?.data?.data?.code || failure.code) {
        case 'TOOLBOX_POINTS_INSUFFICIENT':
          discardPendingRepair();
          error.value = label('insufficientPoints');
          break;
        case 'TOOLBOX_PRICING_CHANGED':
        case 'TOOLBOX_IMAGE_REPAIR_ACCOUNT_CHANGED':
          discardPendingRepair();
          error.value = label('billingChanged');
          break;
        default:
          error.value = label('settlementPending');
      }
      return;
    } finally {
      settling.value = false;
    }
    if (!active || pending.accountId !== accountId.value) return;
    updateHistory(recordRepairEdit(history.value, { output, selections: [] }));
    pendingRepair.value = undefined;
    activeIndex.value = -1;
    void loadGrowth(true);
    await nextTick();
    if (
      active &&
      !showShortcuts.value &&
      (document.activeElement === document.body || editor.value?.contains(document.activeElement))
    ) {
      canvasEditor.value?.focusCanvas();
    }
  }

  async function download() {
    if (!result.value || !original.value || busy.value || !readyToDownload.value) return;
    const content = result.value.blob;
    const mimeType = content.type;
    const fileName = `${safeDownloadBaseName(original.value.name)}-repaired.png`;
    error.value = '';
    saving.value = true;
    try {
      if (isLightNoteAndroidApp()) {
        // The existing image.save bridge accepts data URLs below 12 MiB, including base64 overhead.
        if (4 * Math.ceil(content.size / 3) + 64 > 12 * 1024 * 1024) {
          error.value = label('appDownloadTooLarge');
          return;
        }
        const payload = await encodeFileContentToBase64(content, mimeType);
        if (!active) return;
        const saved = await saveImageViaAndroid(`data:${mimeType};base64,${payload}`, fileName);
        if (!active) return;
        if (!saved.ok) {
          error.value = t(
            saved.reason === 'unsupported' ? 'common.saveImageUnsupportedInApp' : 'common.saveImageFailed',
          );
          return;
        }
        message.success(t('common.imageSavedToGallery'));
      } else {
        const delivered = await deliverGeneratedFile({ content, fileName, mimeType, isCurrent: () => active });
        if (!active || delivered === 'cancelled') return;
        if (delivered === 'unavailable') throw new Error('Download unavailable');
      }
      window.dispatchEvent(new Event(TOOLBOX_LOCAL_DELIVERY_EVENT));
    } catch {
      if (active) error.value = t('common.saveImageFailed');
    } finally {
      saving.value = false;
    }
  }

  onMounted(() => {
    window.addEventListener('keyup', releaseKeys);
    window.addEventListener('blur', onWindowBlur);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keyup', releaseKeys);
    window.removeEventListener('blur', onWindowBlur);
    active = false;
    cancelEnhancedRepair();
    discardPendingRepair();
    releaseImage(original.value?.url);
    resetResults();
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';

  .image-repair {
    min-width: 0;
  }

  .image-repair__empty {
    .workspace-content-surface();
    position: absolute;
    inset: var(--ui-space-12, 12px);
    max-inline-size: calc(2 * var(--ui-layout-320, 320px));
    margin-inline: auto;
    box-sizing: border-box;
    display: grid;
    align-content: center;
    align-content: safe center;
    justify-items: center;
    gap: var(--ui-space-12, 12px);
    overflow: auto;
    padding: var(--ui-space-24, 24px);
    border: 1px dashed var(--workspace-border);
    border-radius: 16px;
    text-align: center;
    color: var(--workspace-muted);
  }

  .image-repair__empty.is-dragging {
    border-color: var(--primary-color);
    border-style: solid;
  }

  .image-repair__empty.is-unavailable {
    border-style: solid;
  }

  .image-repair__board {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }

  .image-repair__file,
  .image-repair__workspace {
    .workspace-content-surface();
    min-width: 0;
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
  }

  .image-repair__file {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-10, 10px) var(--ui-space-14, 14px);
  }

  .image-repair__file-thumb {
    flex: none;
    width: var(--ui-layout-40, 40px);
    height: var(--ui-layout-40, 40px);
    border: 1px solid var(--workspace-border);
    border-radius: 8px;
    object-fit: cover;
  }

  .image-repair__file-thumb.is-placeholder {
    display: grid;
    place-items: center;
    background: var(--workspace-canvas);
    color: var(--workspace-muted);
  }

  .image-repair__file-label {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--ui-space-3, 3px);
  }

  .image-repair__file-label strong {
    font-size: var(--ui-font-14, 14px);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .image-repair__file-label span,
  .image-repair__status,
  .image-repair__empty p {
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.5;
  }

  .image-repair__toolbar,
  .image-repair__brush-size {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    flex-wrap: wrap;
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--workspace-divider);
  }

  .image-repair__toolbar {
    gap: var(--ui-space-10, 10px);
    padding-block: var(--ui-space-5, 5px);
  }

  .image-repair__modes,
  .image-repair__history {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    border: 1px solid var(--workspace-border);
    border-radius: 9px;
  }

  .image-repair__modes {
    gap: var(--ui-space-3, 3px);
    padding: var(--ui-space-2, 2px);
    background: var(--workspace-canvas);
  }

  .image-repair__toolbar :deep(.text_btn) {
    padding-inline: var(--ui-space-8, 8px);
    gap: var(--ui-space-6, 6px);
    color: var(--workspace-text);
  }

  .image-repair__mode {
    border: 1px solid transparent;
  }

  .image-repair__mode[aria-pressed='true'] {
    border-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
    color: var(--workspace-purple-text);
    font-weight: 600;
  }

  .image-repair__mode-icon,
  .image-repair__file-action-icon {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--ui-layout-22, 22px);
    block-size: var(--ui-layout-22, 22px);
    border-radius: 5px;
  }

  .image-repair__mode-icon {
    color: var(--workspace-purple-text);
  }

  .image-repair__mode[aria-pressed='true'] .image-repair__mode-icon {
    background: var(--primary-color);
    color: white;
  }

  .image-repair__history :deep(.text_btn + .text_btn) {
    border-inline-start: 1px solid var(--workspace-divider);
  }

  .image-repair__actions :deep(.b_btn[aria-pressed='true']) {
    border-color: var(--info-color);
    background: var(--workspace-canvas);
    background: color-mix(in srgb, var(--info-color) 15%, var(--workspace-content));
  }

  .image-repair__toolbar kbd,
  .image-repair__shortcut-list kbd {
    font: inherit;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.4;
    color: var(--workspace-text);
    background: var(--workspace-canvas);
    border: 1px solid var(--workspace-border);
    border-radius: 4px;
    padding: 0 var(--ui-space-4, 4px);
    white-space: nowrap;
  }

  .image-repair__toolbar .image-repair__shortcuts {
    margin-inline-start: auto;
    color: var(--workspace-muted);
  }

  @media (hover: hover) and (pointer: fine) {
    .image-repair__toolbar :deep(.text_btn:not(:disabled):hover) {
      text-decoration: none;
    }

    .image-repair__toolbar :deep(.text_btn:not(:disabled):not([aria-pressed='true']):hover) {
      background: var(--workspace-hover);
    }
  }

  .image-repair__brush-size {
    color: var(--workspace-muted);
    font-size: var(--ui-font-13, 13px);
  }

  .image-repair__brush-size output {
    min-width: var(--ui-layout-44, 44px);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .image-repair__status {
    .workspace-content-surface();
    position: absolute;
    z-index: 1;
    inset-block-start: var(--ui-space-12, 12px);
    inset-inline: 0;
    inline-size: max-content;
    max-inline-size: calc(100% - 2 * var(--ui-space-12, 12px));
    margin-inline: auto;
    box-sizing: border-box;
    display: grid;
    gap: var(--ui-space-5, 5px);
    padding: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    border: 1px solid var(--workspace-border);
    border-radius: 8px;
    overflow-wrap: anywhere;
  }

  .image-repair p {
    margin: 0;
  }

  .image-repair__resize {
    display: grid;
    justify-items: start;
    gap: var(--ui-space-6, 6px);
  }

  .image-repair__empty .image-repair__resize {
    justify-items: center;
  }

  .image-repair__feedback {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    flex-wrap: wrap;
  }

  .image-repair p.image-repair__error {
    color: var(--error-color, #cf444e);
  }

  .image-repair__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }

  .image-repair__actions :deep(.b_btn) {
    min-height: var(--ui-control-40, 40px);
  }

  .image-repair__replace,
  .image-repair__compare {
    gap: var(--ui-space-6, 6px);
    padding-inline: var(--ui-space-8, 8px);
    color: var(--workspace-muted);
  }

  .image-repair__file-action-icon {
    background: var(--workspace-canvas);
    color: var(--workspace-text);
  }

  .image-repair__download,
  .image-repair__enhance {
    gap: var(--ui-space-6, 6px);
    min-inline-size: var(--ui-layout-112, 112px);
    border-radius: 8px;
    font-weight: 600;
  }

  .image-repair__download:not(:disabled),
  .image-repair__enhance:not(:disabled) {
    box-shadow: 0 var(--ui-space-3, 3px) var(--ui-space-8, 8px)
      color-mix(in srgb, var(--primary-color) 25%, transparent);
  }

  .image-repair__actions :deep(.primary_btn) {
    background: linear-gradient(110deg, #4d43c9, var(--primary-color));
  }

  @media (hover: hover) and (pointer: fine) {
    .image-repair__actions :deep(.primary_btn:not(:disabled):hover) {
      background: linear-gradient(110deg, #594cdd, var(--primary-color));
    }
  }

  .image-repair__download.text_btn {
    color: var(--workspace-muted);
  }

  .image-repair__actions .image-repair__compare {
    border: 1px solid var(--workspace-border);
    border-color: color-mix(in srgb, var(--info-color) 28%, var(--workspace-border));
    background: var(--workspace-canvas);
    background: color-mix(in srgb, var(--info-color) 7%, var(--workspace-content));
    color: var(--info-color);
    touch-action: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .image-repair__actions .image-repair__compare:disabled {
    border-color: transparent;
    background: transparent;
    color: var(--workspace-muted);
  }

  .image-repair__shortcut-list {
    display: grid;
    margin: 0;
  }

  .image-repair__shortcut-list div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-8, 8px) 0;
    border-bottom: 1px solid var(--workspace-divider);
  }

  .image-repair__shortcut-list div:last-child {
    border-bottom: 0;
  }

  .image-repair__shortcut-list dt {
    flex-shrink: 0;
  }

  .image-repair__shortcut-list dd {
    margin: 0;
    text-align: right;
  }

  @media (min-width: 768px) {
    .image-repair,
    .image-repair__board,
    .image-repair__workspace {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-block-size: 0;
    }

    .image-repair__file,
    .image-repair__toolbar,
    .image-repair__brush-size {
      flex: none;
    }

    .image-repair__file {
      flex-wrap: wrap;
      padding-block: var(--ui-space-6, 6px);
    }

    .image-repair__file-thumb {
      width: var(--ui-layout-32, 32px);
      height: var(--ui-layout-32, 32px);
    }

    .image-repair__file-label {
      flex-basis: var(--ui-layout-140, 140px);
      display: flex;
      align-items: baseline;
      gap: var(--ui-space-8, 8px);
    }

    .image-repair__file-label span {
      flex: none;
    }

    .image-repair__desktop-controls {
      min-width: 0;
      max-width: 100%;
      margin-inline-start: auto;
    }
  }

  @media (max-width: 767px) {
    .image-repair__toolbar {
      gap: var(--ui-space-4, 4px);
      padding: var(--ui-space-8, 8px);
    }

    .image-repair__toolbar kbd,
    .image-repair__toolbar .image-repair__pan,
    .image-repair__toolbar .image-repair__shortcuts {
      display: none;
    }

    .image-repair__file :deep(.b_btn),
    .image-repair__toolbar :deep(.b_btn),
    .image-repair__brush-size :deep(.b_btn) {
      min-height: var(--ui-control-40, 40px);
      padding-inline: var(--ui-space-8, 8px);
    }

    .image-repair__actions {
      .workspace-content-surface();
      position: sticky;
      bottom: 0;
      border-top: 1px solid var(--workspace-divider);
      border-radius: 0 0 14px 14px;
      justify-content: stretch;
      padding: var(--ui-space-8, 8px);
      padding-bottom: max(var(--ui-space-8, 8px), env(safe-area-inset-bottom));
    }

    .image-repair__actions :deep(.b_btn) {
      flex: 1 1 0;
      min-height: var(--ui-control-44, 44px);
      padding-inline: var(--ui-space-6, 6px);
    }
  }
</style>
