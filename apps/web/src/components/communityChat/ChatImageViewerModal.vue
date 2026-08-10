<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.image.previewTitle')"
    :show-footer="false"
    :mask-closable="true"
    :fullscreen-mobile="true"
    width="min(1120px, 94vw)"
    height="min(820px, calc(100vh - 48px))"
    modal-class="chat-image-viewer-modal"
    mask-class="chat-image-viewer-mask"
    content-class="chat-image-viewer-modal__content"
    initial-focus=".chat-image-viewer__stage"
  >
    <template #title>
      <span class="chat-image-viewer__title">
        <span>{{ t('communityChat.image.previewTitle') }}</span>
        <small v-if="currentImage">{{ positionLabel }}</small>
      </span>
    </template>

    <template #mobileHeader="{ close }">
      <div class="chat-image-viewer__mobile-header">
        <BButton :aria-label="t('common.close')" @click="close">
          <SvgIcon :src="icon.common.close" size="19" aria-hidden="true" />
        </BButton>
        <strong>{{ positionLabel }}</strong>
        <span aria-hidden="true"></span>
      </div>
    </template>

    <section class="chat-image-viewer" :aria-label="t('communityChat.image.previewTitle')">
      <div
        ref="stageRef"
        class="chat-image-viewer__stage"
        tabindex="0"
        :aria-label="t('communityChat.image.previewAlt')"
        @wheel.prevent="handleWheel"
        @dblclick="toggleDoubleClickZoom"
        @touchstart="handleTouchStart"
        @touchmove.prevent="handleTouchMove"
        @touchend="handleTouchEnd"
        @touchcancel="handleTouchEnd"
        @pointerdown="handleStagePointerDown"
        @pointermove="handleStagePointerMove"
        @pointerup="finishStagePointerPan"
        @pointercancel="finishStagePointerPan"
      >
        <BTooltip
          class="chat-image-viewer__nav-wrap chat-image-viewer__nav-wrap--previous"
          :title="t('communityChat.image.previous')"
          :delay="80"
        >
          <BButton
            class="chat-image-viewer__nav"
            :disabled="!hasPrevious"
            :aria-label="t('communityChat.image.previous')"
            @click="showPrevious"
          >
            <SvgIcon :src="icon.arrow_left" size="28" aria-hidden="true" />
          </BButton>
        </BTooltip>

        <div
          class="chat-image-viewer__canvas"
          :class="{
            'is-zoomed': scale > 1,
            'is-swiping': swipeOffsetX !== 0,
            'is-pointer-panning': isPointerPanning,
          }"
          :style="{ transform: `translateX(${swipeOffsetX}px)` }"
        >
          <BLoading
            v-if="currentImage && !imageLoaded && !imageFailed"
            class="chat-image-viewer__loading"
            inline
            loading
            :title="t('communityChat.image.loading')"
          />
          <div v-if="imageFailed" class="chat-image-viewer__error" role="status">
            <SvgIcon :src="icon.message.info" size="24" aria-hidden="true" />
            <strong>{{ t('communityChat.image.loadFailed') }}</strong>
            <BButton size="small" @click="retryImage">{{ t('communityChat.image.retry') }}</BButton>
          </div>
          <img
            v-else-if="currentImage"
            :key="`${currentImage.publicId}-${imageRenderKey}`"
            class="chat-image-viewer__image"
            :class="{ 'is-loaded': imageLoaded }"
            :src="currentImage.url"
            :alt="t('communityChat.image.previewAlt')"
            :style="imageStyle"
            draggable="false"
            @load="handleImageLoad"
            @error="handleImageError"
          />
          <div v-else class="chat-image-viewer__empty" role="status">
            {{ t('communityChat.image.noPreview') }}
          </div>
        </div>

        <BTooltip
          class="chat-image-viewer__nav-wrap chat-image-viewer__nav-wrap--next"
          :title="t('communityChat.image.next')"
          :delay="80"
        >
          <BButton
            class="chat-image-viewer__nav"
            :disabled="!hasNext"
            :aria-label="t('communityChat.image.next')"
            @click="showNext"
          >
            <SvgIcon :src="icon.arrow_right" size="28" aria-hidden="true" />
          </BButton>
        </BTooltip>
      </div>

      <div class="chat-image-viewer__toolbar" role="toolbar" :aria-label="t('communityChat.image.tools')">
        <BTooltip :title="t('communityChat.image.zoomOut')" :delay="80">
          <BButton
            :disabled="scale <= MIN_SCALE"
            :aria-label="t('communityChat.image.zoomOut')"
            @click="zoomBy(-SCALE_STEP)"
          >
            <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <span class="chat-image-viewer__scale">{{ Math.round(scale * 100) }}%</span>
        <BTooltip :title="t('communityChat.image.zoomIn')" :delay="80">
          <BButton
            :disabled="scale >= MAX_SCALE"
            :aria-label="t('communityChat.image.zoomIn')"
            @click="zoomBy(SCALE_STEP)"
          >
            <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <span class="chat-image-viewer__divider" aria-hidden="true"></span>
        <BTooltip
          class="chat-image-viewer__tool chat-image-viewer__tool--rotate-left"
          :title="t('communityChat.image.rotateLeft')"
          :delay="80"
        >
          <BButton :aria-label="t('communityChat.image.rotateLeft')" @click="rotateBy(-90)">
            <SvgIcon :src="icon.cloudSpace.preview.rotate" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BTooltip
          class="chat-image-viewer__tool chat-image-viewer__tool--rotate-right"
          :title="t('communityChat.image.rotateRight')"
          :delay="80"
        >
          <BButton :aria-label="t('communityChat.image.rotateRight')" @click="rotateBy(90)">
            <SvgIcon
              class="chat-image-viewer__rotate-right"
              :src="icon.cloudSpace.preview.rotate"
              size="19"
              aria-hidden="true"
            />
          </BButton>
        </BTooltip>
        <BTooltip :title="t('communityChat.image.reset')" :delay="80">
          <BButton
            :disabled="!hasTransform"
            :aria-label="t('communityChat.image.reset')"
            @click="resetTransform"
          >
            <SvgIcon :src="icon.cloudSpace.preview.fitPage" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <span class="chat-image-viewer__divider" aria-hidden="true"></span>
        <BTooltip :title="t('common.saveImage')" :delay="80">
          <BButton
            :loading="saving"
            :disabled="!canDownloadCurrent"
            :aria-label="t('common.saveImage')"
            @click="saveCurrentImage"
          >
            <SvgIcon v-if="!saving" :src="icon.cloudSpace.download" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
      </div>
      <span class="chat-image-viewer__position" aria-live="polite">{{ positionLabel }}</span>
    </section>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatImage } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { isLightNoteAndroidApp, postAndroidMessage, saveImageViaAndroid } from '@/utils/androidBridge';
  import {
    canSaveImage,
    deriveImageFileName,
    isBase64ImageSrc,
    isHttpImageSrc,
  } from '@/components/base/Viewer/viewerSave';
  import { announceNativeDownloadStart } from '@/composables/useAndroidDownloadProgress';

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 4;
  const SCALE_STEP = 0.25;
  const SWIPE_THRESHOLD = 56;

  const props = withDefaults(
    defineProps<{
      images?: CommunityChatImage[];
      initialPublicId?: string;
    }>(),
    {
      images: () => [],
      initialPublicId: '',
    },
  );
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const stageRef = ref<HTMLElement | null>(null);
  const currentIndex = ref(0);
  const selectedPublicId = ref('');
  const scale = ref(1);
  const rotation = ref(0);
  const position = ref({ x: 0, y: 0 });
  const swipeOffsetX = ref(0);
  const imageLoaded = ref(false);
  const imageFailed = ref(false);
  const imageRenderKey = ref(0);
  const saving = ref(false);
  const isPointerPanning = ref(false);
  let touchStart = { x: 0, y: 0 };
  let panStart = { x: 0, y: 0 };
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinching = false;
  let pointerPanState: {
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null = null;

  const images = computed(() => {
    const seen = new Set<string>();
    return props.images.filter((item) => {
      if (!item?.publicId || !item.url || seen.has(item.publicId)) return false;
      seen.add(item.publicId);
      return true;
    });
  });
  const currentImage = computed(() => images.value[currentIndex.value] || null);
  const hasPrevious = computed(() => currentIndex.value > 0);
  const hasNext = computed(() => currentIndex.value < images.value.length - 1);
  const hasTransform = computed(
    () => scale.value !== 1 || rotation.value % 360 !== 0 || position.value.x !== 0 || position.value.y !== 0,
  );
  const positionLabel = computed(() =>
    currentImage.value
      ? t('communityChat.image.position', { current: currentIndex.value + 1, total: images.value.length })
      : t('communityChat.image.position', { current: 0, total: 0 }),
  );
  const imageStyle = computed(() => ({
    transform: `translate(${position.value.x}px, ${position.value.y}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  }));
  const canDownloadCurrent = computed(() =>
    canSaveImage(currentImage.value?.url, isLightNoteAndroidApp()),
  );

  function clampScale(value: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  function resetTransform() {
    pointerPanState = null;
    isPointerPanning.value = false;
    scale.value = 1;
    rotation.value = 0;
    position.value = { x: 0, y: 0 };
    swipeOffsetX.value = 0;
  }

  function resetImageState() {
    resetTransform();
    imageLoaded.value = false;
    imageFailed.value = false;
    imageRenderKey.value += 1;
  }

  function selectIndex(index: number) {
    if (index < 0 || index >= images.value.length || index === currentIndex.value) {
      swipeOffsetX.value = 0;
      return;
    }
    currentIndex.value = index;
    selectedPublicId.value = images.value[index]?.publicId || '';
    resetImageState();
  }

  function showPrevious() {
    if (hasPrevious.value) selectIndex(currentIndex.value - 1);
  }

  function showNext() {
    if (hasNext.value) selectIndex(currentIndex.value + 1);
  }

  function zoomBy(delta: number) {
    scale.value = clampScale(Number((scale.value + delta).toFixed(2)));
    if (scale.value <= 1) position.value = { x: 0, y: 0 };
  }

  function rotateBy(degrees: number) {
    rotation.value = (rotation.value + degrees) % 360;
  }

  function toggleDoubleClickZoom() {
    if (scale.value > 1) resetTransform();
    else scale.value = 2;
  }

  function handleWheel(event: WheelEvent) {
    zoomBy(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
  }

  function touchDistance(touches: TouchList) {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return 0;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  function beginSingleTouch(touch: Touch) {
    touchStart = { x: touch.clientX, y: touch.clientY };
    panStart = { ...position.value };
    swipeOffsetX.value = 0;
  }

  function handleTouchStart(event: TouchEvent) {
    if (event.touches.length >= 2) {
      pinching = true;
      pinchStartDistance = touchDistance(event.touches);
      pinchStartScale = scale.value;
      swipeOffsetX.value = 0;
      return;
    }
    const touch = event.touches[0];
    if (touch) beginSingleTouch(touch);
  }

  function handleTouchMove(event: TouchEvent) {
    if (event.touches.length >= 2) {
      const distance = touchDistance(event.touches);
      if (pinchStartDistance > 0) scale.value = clampScale(pinchStartScale * (distance / pinchStartDistance));
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (scale.value > 1) {
      position.value = { x: panStart.x + deltaX, y: panStart.y + deltaY };
      return;
    }
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    swipeOffsetX.value = Math.max(-140, Math.min(140, deltaX));
  }

  function handleTouchEnd(event: TouchEvent) {
    if (event.touches.length >= 2) return;
    if (pinching) {
      pinching = false;
      if (scale.value <= 1) position.value = { x: 0, y: 0 };
      const remainingTouch = event.touches[0];
      if (remainingTouch) beginSingleTouch(remainingTouch);
      return;
    }
    if (scale.value > 1) return;
    if (swipeOffsetX.value <= -SWIPE_THRESHOLD) showNext();
    else if (swipeOffsetX.value >= SWIPE_THRESHOLD) showPrevious();
    swipeOffsetX.value = 0;
  }

  function handleStagePointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0 || scale.value <= 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button')) return;
    event.preventDefault();
    pointerPanState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.value.x,
      originY: position.value.y,
    };
    isPointerPanning.value = true;
    stageRef.value?.setPointerCapture?.(event.pointerId);
  }

  function handleStagePointerMove(event: PointerEvent) {
    const state = pointerPanState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    position.value = {
      x: state.originX + event.clientX - state.startX,
      y: state.originY + event.clientY - state.startY,
    };
  }

  function finishStagePointerPan(event: PointerEvent) {
    const state = pointerPanState;
    if (!state || state.pointerId !== event.pointerId) return;
    if (stageRef.value?.hasPointerCapture?.(event.pointerId)) {
      stageRef.value.releasePointerCapture(event.pointerId);
    }
    pointerPanState = null;
    isPointerPanning.value = false;
  }

  function handleImageLoad() {
    imageLoaded.value = true;
    imageFailed.value = false;
  }

  function handleImageError() {
    imageLoaded.value = false;
    imageFailed.value = true;
  }

  function retryImage() {
    imageLoaded.value = false;
    imageFailed.value = false;
    imageRenderKey.value += 1;
  }

  async function saveCurrentImage() {
    const src = currentImage.value?.url;
    if (!src || saving.value) return;
    const fileName = deriveImageFileName(src);
    const inApp = isLightNoteAndroidApp();
    if (inApp && isHttpImageSrc(src) && postAndroidMessage({ type: 'download', url: src, fileName })) {
      announceNativeDownloadStart();
      return;
    }
    if (inApp && isBase64ImageSrc(src)) {
      saving.value = true;
      try {
        const result = await saveImageViaAndroid(src, fileName);
        if (result.ok) message.success(t('common.imageSavedToGallery'));
        else if (result.reason === 'unsupported') message.warning(t('common.saveImageUnsupportedInApp'));
        else message.error(t('common.saveImageFailed'));
      } finally {
        saving.value = false;
      }
      return;
    }
    try {
      const anchor = document.createElement('a');
      anchor.href = src;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      message.error(t('common.saveImageFailed'));
    }
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (!visible.value || event.defaultPrevented) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      showPrevious();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      showNext();
    }
  }

  watch(
    visible,
    (isVisible) => {
      if (!isVisible) return;
      const targetIndex = images.value.findIndex((item) => item.publicId === props.initialPublicId);
      currentIndex.value = targetIndex >= 0 ? targetIndex : 0;
      selectedPublicId.value = images.value[currentIndex.value]?.publicId || '';
      resetImageState();
      window.setTimeout(() => stageRef.value?.focus({ preventScroll: true }), 0);
    },
    { immediate: true },
  );

  watch(
    () => [props.initialPublicId, images.value.map((item) => item.publicId).join('|')] as const,
    ([initialPublicId]) => {
      if (!visible.value) return;
      const previousPublicId = selectedPublicId.value;
      const preferredPublicId = previousPublicId || initialPublicId;
      const targetIndex = images.value.findIndex((item) => item.publicId === preferredPublicId);
      const nextIndex = targetIndex >= 0 ? targetIndex : 0;
      const nextPublicId = images.value[nextIndex]?.publicId || '';
      currentIndex.value = nextIndex;
      selectedPublicId.value = nextPublicId;
      if (nextPublicId !== previousPublicId) resetImageState();
    },
  );

  watch(
    visible,
    (isVisible) => {
      if (isVisible) document.addEventListener('keydown', handleDocumentKeydown, true);
      else document.removeEventListener('keydown', handleDocumentKeydown, true);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleDocumentKeydown, true);
  });
</script>

<style lang="less">
  .chat-image-viewer-mask {
    background: rgba(8, 9, 12, 0.86) !important;
  }

  .chat-image-viewer-modal {
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: #121318 !important;
    color: #fff;
  }

  .chat-image-viewer-modal > .modal-header {
    border-bottom-color: rgba(255, 255, 255, 0.12);
    background: #17181e;
  }

  .chat-image-viewer-modal > .modal-header .modal-title,
  .chat-image-viewer-modal > .modal-header .modal-close.b_btn {
    color: #fff;
  }

  .chat-image-viewer-modal > .modal-header .modal-close.b_btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .chat-image-viewer-modal__content {
    padding: 0 !important;
    overflow: hidden !important;
  }

  .chat-image-viewer__title {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
  }

  .chat-image-viewer__title small {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    font-weight: 500;
  }

  .chat-image-viewer__mobile-header {
    width: 100%;
    height: calc(52px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 12px 0;
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    align-items: center;
    background: #121318;
    color: #fff;
  }

  .chat-image-viewer__mobile-header > .b_btn {
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #fff;
  }

  .chat-image-viewer__mobile-header strong {
    text-align: center;
    font-size: 14px;
  }

  .chat-image-viewer {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    position: relative;
    background: #0f1014;
    color: #fff;
  }

  .chat-image-viewer__stage {
    min-width: 0;
    min-height: 0;
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    outline: none;
    touch-action: none;
  }

  .chat-image-viewer__stage:focus-visible {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }

  .chat-image-viewer__canvas {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    transition: transform 140ms ease;
    will-change: transform;
  }

  .chat-image-viewer__canvas.is-swiping {
    transition: none;
  }

  .chat-image-viewer__canvas.is-zoomed {
    cursor: grab;
  }

  .chat-image-viewer__canvas.is-pointer-panning {
    cursor: grabbing;
  }

  .chat-image-viewer__image {
    display: block;
    max-width: calc(100% - 136px);
    max-height: calc(100% - 52px);
    object-fit: contain;
    opacity: 0;
    user-select: none;
    -webkit-user-drag: none;
    transition: opacity 120ms ease, transform 120ms ease;
    transform-origin: center;
    will-change: transform;
  }

  .chat-image-viewer__image.is-loaded {
    opacity: 1;
  }

  .chat-image-viewer__nav-wrap {
    position: absolute !important;
    top: 50% !important;
    z-index: 2;
    transform: translateY(-50%);
  }

  .chat-image-viewer__nav.b_btn {
    width: 44px;
    height: 58px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    background: rgba(30, 31, 38, 0.78);
    color: #fff;
  }

  .chat-image-viewer__nav.b_btn:disabled {
    opacity: 0.22;
  }

  .chat-image-viewer__nav-wrap--previous {
    right: auto !important;
    left: 18px !important;
  }

  .chat-image-viewer__nav-wrap--next {
    right: 18px !important;
    left: auto !important;
  }

  .chat-image-viewer__loading,
  .chat-image-viewer__error,
  .chat-image-viewer__empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.72);
  }

  .chat-image-viewer__error {
    flex-direction: column;
    gap: 10px;
  }

  .chat-image-viewer__error .b_btn {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.08);
  }

  .chat-image-viewer__toolbar {
    min-height: 58px;
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    background: #17181e;
  }

  .chat-image-viewer__toolbar .b_btn {
    width: 36px;
    height: 36px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
  }

  .chat-image-viewer__toolbar .b_btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .chat-image-viewer__toolbar .b_btn:disabled {
    opacity: 0.3;
  }

  .chat-image-viewer__scale {
    min-width: 46px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 12px;
    text-align: center;
  }

  .chat-image-viewer__divider {
    width: 1px;
    height: 24px;
    margin: 0 3px;
    background: rgba(255, 255, 255, 0.16);
  }

  .chat-image-viewer__rotate-right {
    transform: scaleX(-1);
  }

  .chat-image-viewer__position {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  @media (max-width: 767px) {
    .chat-image-viewer-mask {
      background: #0f1014 !important;
    }

    .chat-image-viewer-modal {
      border: 0;
      background: #0f1014 !important;
    }

    .chat-image-viewer__image {
      max-width: 100%;
      max-height: 100%;
    }

    .chat-image-viewer__nav-wrap {
      display: none !important;
    }

    .chat-image-viewer__toolbar {
      min-height: 54px;
      padding-inline: 8px;
      gap: 5px;
    }

    .chat-image-viewer__toolbar .b_btn {
      width: 34px;
      height: 34px;
    }

    .chat-image-viewer__divider {
      margin-inline: 0;
    }

    .chat-image-viewer__tool--rotate-left {
      display: none !important;
    }
  }

  html.light-note-mobile-rendering .chat-image-viewer__image {
    transition: opacity 120ms ease, transform 120ms ease;
  }

  html.light-note-mobile-rendering .chat-image-viewer__toolbar,
  html.light-note-mobile-rendering .chat-image-viewer__mobile-header {
    background: #17181e;
  }
</style>
