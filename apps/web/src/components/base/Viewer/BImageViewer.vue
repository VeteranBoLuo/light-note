<template>
  <BModal
    v-model:visible="visible"
    :title="resolvedTitle"
    :show-footer="false"
    :mask-closable="true"
    :esc-closable="!isFullscreen"
    :fullscreen-mobile="true"
    width="min(1600px, calc(100vw - 48px))"
    height="min(1080px, calc(100vh - 32px))"
    :modal-class="viewerModalClass"
    mask-class="b-image-viewer-mask"
    content-class="b-image-viewer-modal__content"
  >
    <template #title>
      <span class="b-image-viewer__title">
        <span>{{ resolvedTitle }}</span>
        <small v-if="currentImage">{{ positionLabel }}</small>
      </span>
      <BTooltip
        v-if="!isMobileLayout"
        class="b-image-viewer__fullscreen-wrap"
        :title="fullscreenActionLabel"
        :delay="80"
      >
        <BButton
          class="b-image-viewer__fullscreen-action"
          :aria-label="fullscreenActionLabel"
          @click="toggleFullscreen"
        >
          <SvgIcon :src="isFullscreen ? icon.ai.restoreWindow : icon.ai.maximize" size="18" aria-hidden="true" />
        </BButton>
      </BTooltip>
    </template>

    <template #mobileHeader="{ close }">
      <div class="b-image-viewer__mobile-header">
        <BButton :aria-label="t('common.close')" @click="close">
          <SvgIcon :src="icon.common.close" size="19" aria-hidden="true" />
        </BButton>
        <strong>{{ positionLabel }}</strong>
        <span aria-hidden="true"></span>
      </div>
    </template>

    <section class="b-image-viewer" :aria-label="resolvedTitle">
      <div class="b-image-viewer__stage-shell">
        <div
          ref="viewportRef"
          class="b-image-viewer__viewport"
          :class="{
            'is-scrollable': isImageScrollable,
            'is-pointer-panning': isPointerPanning,
          }"
          tabindex="0"
          :aria-label="currentImage?.alt || t('common.imageViewer.previewAlt')"
          @wheel.prevent="handleWheel"
          @dblclick="handleDoubleClick"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="finishPointerPan"
          @pointercancel="finishPointerPan"
          @lostpointercapture="handleLostPointerCapture"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
          @touchcancel="handleTouchEnd"
        >
          <div ref="stageRef" class="b-image-viewer__stage" :style="imageStageStyle">
            <img
              v-if="currentImage"
              :key="`${currentImage.id}-${currentImage.src}-${imageRenderKey}`"
              class="b-image-viewer__image"
              :class="{ 'is-loaded': imageLoaded }"
              :src="currentImage.src"
              :alt="currentImage.alt || t('common.imageViewer.previewAlt')"
              :style="imageStyle"
              draggable="false"
              @load="handleImageLoad"
              @error="handleImageError"
              @dragstart.prevent
            />
          </div>
        </div>

        <div v-if="currentImage && !imageLoaded && !imageFailed" class="b-image-viewer__status">
          <BLoading inline loading :title="t('common.imageViewer.loading')" />
        </div>
        <div v-else-if="imageFailed" class="b-image-viewer__status b-image-viewer__error" role="status">
          <SvgIcon :src="icon.message.info" size="24" aria-hidden="true" />
          <strong>{{ t('common.imageViewer.loadFailed') }}</strong>
          <BButton size="small" @click="retryImage">{{ t('common.imageViewer.retry') }}</BButton>
        </div>
        <div v-else-if="!currentImage" class="b-image-viewer__status" role="status">
          {{ t('common.imageViewer.empty') }}
        </div>

        <BTooltip
          v-if="images.length > 1"
          class="b-image-viewer__nav-wrap b-image-viewer__nav-wrap--previous"
          :title="t('common.imageViewer.previous')"
          :delay="80"
        >
          <BButton
            class="b-image-viewer__nav"
            :disabled="!hasPrevious"
            :aria-label="t('common.imageViewer.previous')"
            @click="showPrevious"
          >
            <SvgIcon :src="icon.arrow_left" size="28" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BTooltip
          v-if="images.length > 1"
          class="b-image-viewer__nav-wrap b-image-viewer__nav-wrap--next"
          :title="t('common.imageViewer.next')"
          :delay="80"
        >
          <BButton
            class="b-image-viewer__nav"
            :disabled="!hasNext"
            :aria-label="t('common.imageViewer.next')"
            @click="showNext"
          >
            <SvgIcon :src="icon.arrow_right" size="28" aria-hidden="true" />
          </BButton>
        </BTooltip>
      </div>

      <div
        v-if="showToolbar"
        class="b-image-viewer__toolbar"
        role="toolbar"
        :aria-label="t('common.imageViewer.tools')"
      >
        <BTooltip :title="t('common.imageViewer.zoomOut')" :delay="80">
          <BButton
            :disabled="!canTransform || scale <= MIN_SCALE"
            :aria-label="t('common.imageViewer.zoomOut')"
            @click="zoomBy(1 / SCALE_FACTOR)"
          >
            <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <span class="b-image-viewer__scale">{{ Math.round(scale * 100) }}%</span>
        <BTooltip :title="t('common.imageViewer.zoomIn')" :delay="80">
          <BButton
            :disabled="!canTransform || scale >= MAX_SCALE"
            :aria-label="t('common.imageViewer.zoomIn')"
            @click="zoomBy(SCALE_FACTOR)"
          >
            <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <span class="b-image-viewer__divider" aria-hidden="true"></span>
        <BTooltip
          class="b-image-viewer__tool b-image-viewer__tool--rotate-left"
          :title="t('common.imageViewer.rotateLeft')"
          :delay="80"
        >
          <BButton :disabled="!canTransform" :aria-label="t('common.imageViewer.rotateLeft')" @click="rotateBy(-90)">
            <SvgIcon :src="icon.cloudSpace.preview.rotate" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <BTooltip :title="t('common.imageViewer.rotateRight')" :delay="80">
          <BButton :disabled="!canTransform" :aria-label="t('common.imageViewer.rotateRight')" @click="rotateBy(90)">
            <SvgIcon
              class="b-image-viewer__rotate-right"
              :src="icon.cloudSpace.preview.rotate"
              size="19"
              aria-hidden="true"
            />
          </BButton>
        </BTooltip>
        <BTooltip :title="t('common.imageViewer.fit')" :delay="80">
          <BButton
            :disabled="!canTransform || !hasTransform"
            :aria-label="t('common.imageViewer.fit')"
            @click="resetTransform"
          >
            <SvgIcon :src="icon.cloudSpace.preview.fitPage" size="19" aria-hidden="true" />
          </BButton>
        </BTooltip>
        <template v-if="allowDownload">
          <span class="b-image-viewer__divider" aria-hidden="true"></span>
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
        </template>
      </div>
      <span class="b-image-viewer__position" aria-live="polite">{{ positionLabel }}</span>
    </section>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { announceNativeDownloadStart } from '@/composables/useAndroidDownloadProgress';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import type { ImageViewerItem } from '@/types/imageViewer';
  import { isLightNoteAndroidApp, postAndroidMessage, saveImageViaAndroid } from '@/utils/androidBridge';
  import { resolveImageViewportLayout, type ImageViewportPadding } from '@/utils/imageViewport';
  import { getRootZoom } from '@/utils/zoom';
  import { canSaveImage, deriveImageFileName, isBase64ImageSrc, isHttpImageSrc } from './viewerSave';

  const MIN_SCALE = 0.25;
  const MAX_SCALE = 8;
  const SCALE_FACTOR = 1.2;
  const SWIPE_THRESHOLD = 56;

  const props = withDefaults(
    defineProps<{
      images?: ImageViewerItem[];
      initialId?: string;
      title?: string;
      showToolbar?: boolean;
      allowDownload?: boolean;
    }>(),
    {
      images: () => [],
      initialId: '',
      title: '',
      showToolbar: true,
      allowDownload: true,
    },
  );

  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const isMobileLayout = useMobileLayout();
  const viewportRef = ref<HTMLElement | null>(null);
  const stageRef = ref<HTMLElement | null>(null);
  const currentIndex = ref(0);
  const selectedId = ref('');
  const selectedSource = ref('');
  const scale = ref(1);
  const rotation = ref(0);
  const imageLoaded = ref(false);
  const imageFailed = ref(false);
  const imageRenderKey = ref(0);
  const imageNaturalSize = ref({ width: 0, height: 0 });
  const viewportSize = ref({ width: 0, height: 0 });
  const viewportPadding = ref<ImageViewportPadding>({ x: 56, top: 24, bottom: 24 });
  const saving = ref(false);
  const isPointerPanning = ref(false);
  const isFullscreen = ref(false);
  const isKeyboardTabbing = ref(false);
  let ownsNativeFullscreen = false;
  let resizeObserver: ResizeObserver | null = null;
  let pointerPanState: {
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null = null;
  let touchStart = { x: 0, y: 0 };
  let swipeOffsetX = 0;
  let pinching = false;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinchAnchor: ImageViewportAnchor | null = null;

  interface ImageViewportAnchor {
    ratioX: number;
    ratioY: number;
    offsetX: number;
    offsetY: number;
  }

  const images = computed(() => {
    const seen = new Set<string>();
    return props.images.filter((item) => {
      const id = String(item?.id || '').trim();
      const src = String(item?.src || '').trim();
      if (!id || !src || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });
  const currentImage = computed(() => images.value[currentIndex.value] || null);
  const hasPrevious = computed(() => currentIndex.value > 0);
  const hasNext = computed(() => currentIndex.value < images.value.length - 1);
  const resolvedTitle = computed(() => props.title.trim() || t('common.imageViewer.title'));
  const positionLabel = computed(() =>
    t('common.imageViewer.position', {
      current: currentImage.value ? currentIndex.value + 1 : 0,
      total: images.value.length,
    }),
  );
  const canTransform = computed(() => Boolean(currentImage.value && imageLoaded.value && !imageFailed.value));
  const hasTransform = computed(() => Math.abs(scale.value - 1) > 0.001 || rotation.value % 360 !== 0);
  const imageLayout = computed(() =>
    resolveImageViewportLayout({
      naturalWidth: imageNaturalSize.value.width,
      naturalHeight: imageNaturalSize.value.height,
      viewportWidth: viewportSize.value.width,
      viewportHeight: viewportSize.value.height,
      padding: viewportPadding.value,
      scale: scale.value,
      rotation: rotation.value,
    }),
  );
  const imageStageStyle = computed<CSSProperties>(() => ({
    width: `${imageLayout.value.stageWidth}px`,
    height: `${imageLayout.value.stageHeight}px`,
  }));
  const imageStyle = computed<CSSProperties>(() => ({
    width: imageLayout.value.imageWidth ? `${imageLayout.value.imageWidth}px` : undefined,
    height: imageLayout.value.imageHeight ? `${imageLayout.value.imageHeight}px` : undefined,
    transform: `rotate(${rotation.value}deg)`,
  }));
  const isImageScrollable = computed(
    () =>
      imageLayout.value.stageWidth > viewportSize.value.width + 1 ||
      imageLayout.value.stageHeight > viewportSize.value.height + 1,
  );
  const canDownloadCurrent = computed(() => canSaveImage(currentImage.value?.src, isLightNoteAndroidApp()));
  const viewerModalClass = computed(() =>
    [
      'b-image-viewer-modal',
      isFullscreen.value ? 'is-fullscreen' : '',
      isKeyboardTabbing.value ? 'is-keyboard-tabbing' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  const fullscreenActionLabel = computed(() =>
    t(isFullscreen.value ? 'common.imageViewer.exitFullscreen' : 'common.imageViewer.enterFullscreen'),
  );

  function readCssPixel(style: CSSStyleDeclaration, property: string, fallback: number) {
    const value = Number.parseFloat(style.getPropertyValue(property));
    return Number.isFinite(value) ? value : fallback;
  }

  function syncViewportMetrics() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    const style = window.getComputedStyle(viewport);
    viewportSize.value = { width: viewport.clientWidth, height: viewport.clientHeight };
    viewportPadding.value = {
      x: readCssPixel(style, '--b-image-viewer-padding-x', 32),
      top: readCssPixel(style, '--b-image-viewer-padding-top', 16),
      bottom: readCssPixel(style, '--b-image-viewer-padding-bottom', 16),
    };
  }

  function observeViewport() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    syncViewportMetrics();
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => {
      const anchor = captureViewportAnchor();
      syncViewportMetrics();
      void restoreViewportAnchor(anchor);
    });
    resizeObserver.observe(viewport);
  }

  function captureViewportAnchor(clientX?: number, clientY?: number): ImageViewportAnchor | null {
    const viewport = viewportRef.value;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    const rootZoom = getRootZoom();
    const offsetX = clientX == null ? viewport.clientWidth / 2 : (clientX - rect.left) / rootZoom;
    const offsetY = clientY == null ? viewport.clientHeight / 2 : (clientY - rect.top) / rootZoom;
    return {
      ratioX: (viewport.scrollLeft + offsetX) / Math.max(1, viewport.scrollWidth),
      ratioY: (viewport.scrollTop + offsetY) / Math.max(1, viewport.scrollHeight),
      offsetX,
      offsetY,
    };
  }

  async function restoreViewportAnchor(anchor: ImageViewportAnchor | null) {
    if (!anchor) return;
    await nextTick();
    const viewport = viewportRef.value;
    if (!viewport) return;
    viewport.scrollLeft = anchor.ratioX * viewport.scrollWidth - anchor.offsetX;
    viewport.scrollTop = anchor.ratioY * viewport.scrollHeight - anchor.offsetY;
  }

  async function centerViewport() {
    await nextTick();
    const viewport = viewportRef.value;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  }

  function clampScale(value: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  function setScale(nextScale: number, clientX?: number, clientY?: number) {
    const clamped = clampScale(nextScale);
    if (Math.abs(clamped - scale.value) < 0.001) return;
    const anchor = captureViewportAnchor(clientX, clientY);
    scale.value = clamped;
    void restoreViewportAnchor(anchor);
  }

  function zoomBy(factor: number, clientX?: number, clientY?: number) {
    setScale(Number((scale.value * factor).toFixed(3)), clientX, clientY);
  }

  function rotateBy(degrees: number) {
    const anchor = captureViewportAnchor();
    rotation.value = (rotation.value + degrees) % 360;
    void restoreViewportAnchor(anchor);
  }

  function resetTransform() {
    const pointerId = pointerPanState?.pointerId;
    const viewport = viewportRef.value;
    if (pointerId != null && viewport?.hasPointerCapture?.(pointerId)) viewport.releasePointerCapture(pointerId);
    pointerPanState = null;
    isPointerPanning.value = false;
    pinching = false;
    pinchStartDistance = 0;
    pinchStartScale = 1;
    pinchAnchor = null;
    touchStart = { x: 0, y: 0 };
    scale.value = 1;
    rotation.value = 0;
    clearSwipeOffset();
    void centerViewport();
  }

  function resetImageState() {
    resetTransform();
    const item = currentImage.value;
    imageNaturalSize.value = {
      width: Number(item?.width) > 0 ? Number(item?.width) : 0,
      height: Number(item?.height) > 0 ? Number(item?.height) : 0,
    };
    imageLoaded.value = false;
    imageFailed.value = false;
    imageRenderKey.value += 1;
  }

  function selectIndex(index: number) {
    if (index < 0 || index >= images.value.length || index === currentIndex.value) {
      clearSwipeOffset();
      return;
    }
    currentIndex.value = index;
    selectedId.value = images.value[index]?.id || '';
    selectedSource.value = images.value[index]?.src || '';
    resetImageState();
  }

  function showPrevious() {
    if (hasPrevious.value) selectIndex(currentIndex.value - 1);
  }

  function showNext() {
    if (hasNext.value) selectIndex(currentIndex.value + 1);
  }

  function handleWheel(event: WheelEvent) {
    if (!canTransform.value) return;
    zoomBy(event.deltaY < 0 ? SCALE_FACTOR : 1 / SCALE_FACTOR, event.clientX, event.clientY);
  }

  function handleDoubleClick(event: MouseEvent) {
    if (!canTransform.value) return;
    if (Math.abs(scale.value - 1) > 0.001 || rotation.value % 360 !== 0) resetTransform();
    else setScale(2, event.clientX, event.clientY);
  }

  function handlePointerDown(event: PointerEvent) {
    const viewport = viewportRef.value;
    if (!viewport || event.pointerType === 'touch' || event.button !== 0 || !isImageScrollable.value) return;
    event.preventDefault();
    pointerPanState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    isPointerPanning.value = true;
    viewport.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    const viewport = viewportRef.value;
    const state = pointerPanState;
    if (!viewport || !state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rootZoom = getRootZoom();
    viewport.scrollLeft = state.scrollLeft - (event.clientX - state.startX) / rootZoom;
    viewport.scrollTop = state.scrollTop - (event.clientY - state.startY) / rootZoom;
  }

  function finishPointerPan(event: PointerEvent) {
    const viewport = viewportRef.value;
    const state = pointerPanState;
    if (!state || state.pointerId !== event.pointerId) return;
    if (viewport?.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    pointerPanState = null;
    isPointerPanning.value = false;
  }

  function handleLostPointerCapture() {
    pointerPanState = null;
    isPointerPanning.value = false;
  }

  function touchDistance(touches: TouchList) {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return 0;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  function touchCenter(touches: TouchList) {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return null;
    return { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 };
  }

  function applySwipeOffset(value: number) {
    swipeOffsetX = Math.max(-140, Math.min(140, value));
    if (stageRef.value) stageRef.value.style.transform = `translate3d(${swipeOffsetX}px, 0, 0)`;
  }

  function clearSwipeOffset() {
    swipeOffsetX = 0;
    if (stageRef.value) stageRef.value.style.transform = '';
  }

  function handleTouchStart(event: TouchEvent) {
    if (event.touches.length >= 2) {
      const center = touchCenter(event.touches);
      pinching = true;
      pinchStartDistance = touchDistance(event.touches);
      pinchStartScale = scale.value;
      pinchAnchor = center ? captureViewportAnchor(center.x, center.y) : captureViewportAnchor();
      clearSwipeOffset();
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    touchStart = { x: touch.clientX, y: touch.clientY };
    clearSwipeOffset();
  }

  function handleTouchMove(event: TouchEvent) {
    if (event.touches.length >= 2) {
      event.preventDefault();
      const distance = touchDistance(event.touches);
      if (pinchStartDistance <= 0) return;
      scale.value = clampScale(pinchStartScale * (distance / pinchStartDistance));
      void restoreViewportAnchor(pinchAnchor);
      return;
    }
    if (pinching || isImageScrollable.value || Math.abs(scale.value - 1) > 0.001) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    event.preventDefault();
    applySwipeOffset(deltaX);
  }

  function handleTouchEnd(event: TouchEvent) {
    if (event.touches.length >= 2) return;
    if (pinching) {
      pinching = false;
      pinchStartDistance = 0;
      pinchAnchor = null;
      const remainingTouch = event.touches[0];
      if (remainingTouch) touchStart = { x: remainingTouch.clientX, y: remainingTouch.clientY };
      return;
    }
    if (swipeOffsetX <= -SWIPE_THRESHOLD) showNext();
    else if (swipeOffsetX >= SWIPE_THRESHOLD) showPrevious();
    clearSwipeOffset();
  }

  function handleImageLoad(event: Event) {
    const image = event.currentTarget instanceof HTMLImageElement ? event.currentTarget : null;
    if (image) {
      imageNaturalSize.value = {
        width: image.naturalWidth || Number(currentImage.value?.width) || 0,
        height: image.naturalHeight || Number(currentImage.value?.height) || 0,
      };
    }
    imageLoaded.value = true;
    imageFailed.value = false;
    void centerViewport();
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
    const src = currentImage.value?.src;
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
    } catch (error) {
      console.error('保存图片失败:', error);
      message.error(t('common.saveImageFailed'));
    }
  }

  async function enterFullscreen() {
    if (isMobileLayout.value || isFullscreen.value) return;
    isFullscreen.value = true;
    const target = document.documentElement;
    if (typeof target.requestFullscreen !== 'function') return;
    try {
      await target.requestFullscreen();
      ownsNativeFullscreen = document.fullscreenElement === target;
    } catch {
      // 浏览器拒绝原生全屏时保留铺满页面的沉浸式降级。
    }
  }

  async function exitFullscreen() {
    const shouldExitNative =
      ownsNativeFullscreen &&
      document.fullscreenElement === document.documentElement &&
      typeof document.exitFullscreen === 'function';
    ownsNativeFullscreen = false;
    isFullscreen.value = false;
    if (!shouldExitNative) return;
    try {
      await document.exitFullscreen();
    } catch {
      // 页面已先退出原生全屏时，组件状态已经恢复，无需打断关闭流程。
    }
  }

  function toggleFullscreen() {
    if (isFullscreen.value) void exitFullscreen();
    else void enterFullscreen();
  }

  function handleFullscreenChange() {
    if (document.fullscreenElement === document.documentElement && isFullscreen.value) {
      ownsNativeFullscreen = true;
      return;
    }
    if (!ownsNativeFullscreen) return;
    ownsNativeFullscreen = false;
    isFullscreen.value = false;
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (!visible.value) return;
    if (event.key === 'Tab') {
      isKeyboardTabbing.value = true;
      return;
    }
    if (
      event.key === 'Escape' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowDown'
    ) {
      isKeyboardTabbing.value = false;
    }
    if (event.key === 'Escape' && isFullscreen.value) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void exitFullscreen();
      return;
    }
    if (event.defaultPrevented) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && hasPrevious.value) {
      event.preventDefault();
      showPrevious();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && hasNext.value) {
      event.preventDefault();
      showNext();
    }
  }

  function handleDocumentPointerDown() {
    if (visible.value) isKeyboardTabbing.value = false;
  }

  watch(
    visible,
    (isVisible) => {
      if (!isVisible) {
        resizeObserver?.disconnect();
        resizeObserver = null;
        isKeyboardTabbing.value = false;
        void exitFullscreen();
        return;
      }
      isKeyboardTabbing.value = false;
      const targetIndex = images.value.findIndex((item) => item.id === props.initialId);
      currentIndex.value = targetIndex >= 0 ? targetIndex : 0;
      selectedId.value = images.value[currentIndex.value]?.id || '';
      selectedSource.value = images.value[currentIndex.value]?.src || '';
      resetImageState();
      void nextTick(() => {
        observeViewport();
      });
    },
    { immediate: true },
  );

  watch(
    () => [props.initialId, images.value.map((item) => `${item.id}:${item.src}`).join('|')] as const,
    ([initialId], [previousInitialId]) => {
      if (!visible.value) return;
      const previousId = selectedId.value;
      const previousSource = selectedSource.value;
      const preferredId = initialId !== previousInitialId ? initialId : previousId || initialId;
      const targetIndex = images.value.findIndex((item) => item.id === preferredId);
      const nextIndex = targetIndex >= 0 ? targetIndex : 0;
      const nextId = images.value[nextIndex]?.id || '';
      const nextSource = images.value[nextIndex]?.src || '';
      currentIndex.value = nextIndex;
      selectedId.value = nextId;
      selectedSource.value = nextSource;
      if (nextId !== previousId || nextSource !== previousSource) resetImageState();
    },
  );

  watch(
    visible,
    (isVisible) => {
      if (isVisible) {
        document.addEventListener('keydown', handleDocumentKeydown, true);
        document.addEventListener('pointerdown', handleDocumentPointerDown, true);
      } else {
        document.removeEventListener('keydown', handleDocumentKeydown, true);
        document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      }
    },
    { immediate: true },
  );

  watch(isMobileLayout, (isMobile) => {
    if (isMobile && isFullscreen.value) void exitFullscreen();
  });

  onMounted(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', syncViewportMetrics, { passive: true });
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', handleDocumentKeydown, true);
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    window.removeEventListener('resize', syncViewportMetrics);
    void exitFullscreen();
  });
</script>

<style lang="less">
  .b-image-viewer-mask {
    background: var(--image-viewer-mask-bg) !important;
  }

  .b-image-viewer-modal {
    overflow: hidden;
    border: 1px solid var(--image-viewer-border-color);
    background: var(--image-viewer-shell-bg) !important;
    color: var(--image-viewer-text-color);
    box-shadow: var(--image-viewer-shadow);
  }

  @media (min-width: 768px) {
    .b-image-viewer-modal {
      max-width: calc(100% - 48px) !important;
      max-height: calc(100% - 32px) !important;
    }

    .b-image-viewer-modal > .modal-header {
      padding: 10px 16px;
    }
  }

  .b-image-viewer-modal.is-fullscreen {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    transform: none !important;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    animation: none;
  }

  .b-image-viewer-modal > .modal-header {
    border-bottom-color: var(--image-viewer-divider-color);
    background: var(--image-viewer-chrome-bg);
  }

  .b-image-viewer-modal > .modal-header .modal-title,
  .b-image-viewer-modal > .modal-header .modal-close.b_btn {
    color: var(--image-viewer-text-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .b-image-viewer-modal > .modal-header .modal-close.b_btn:hover {
      background: var(--image-viewer-control-hover-bg);
      color: var(--image-viewer-text-color);
    }
  }

  .b-image-viewer-modal__content {
    padding: 0 !important;
    overflow: hidden !important;
  }

  .b-image-viewer__title {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
  }

  .b-image-viewer__title small {
    color: var(--image-viewer-muted-color);
    font-size: 12px;
    font-weight: 500;
  }

  .b-image-viewer__fullscreen-wrap {
    position: absolute !important;
    top: 50% !important;
    right: 52px;
    z-index: 1;
    transform: translateY(-50%);
  }

  .b-image-viewer__fullscreen-action.b_btn {
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--image-viewer-text-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .b-image-viewer__fullscreen-action.b_btn:hover {
      background: var(--image-viewer-control-hover-bg);
      color: var(--image-viewer-text-color);
    }
  }

  .b-image-viewer__mobile-header {
    width: 100%;
    min-height: 48px;
    box-sizing: border-box;
    padding: env(safe-area-inset-top, 0px) 12px 0;
    display: grid;
    grid-template-columns: var(--mobile-touch-size) 1fr var(--mobile-touch-size);
    align-items: center;
    border-bottom: 1px solid var(--image-viewer-divider-color);
    background: var(--image-viewer-chrome-bg);
    color: var(--image-viewer-text-color);
  }

  .b-image-viewer__mobile-header .b_btn {
    width: var(--mobile-touch-size);
    height: var(--mobile-touch-size);
    padding: 0;
    background: transparent;
    color: var(--image-viewer-text-color);
  }

  .b-image-viewer__mobile-header strong {
    font-size: 13px;
    text-align: center;
  }

  .b-image-viewer {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    background: var(--image-viewer-stage-bg);
    color: var(--image-viewer-text-color);
  }

  .b-image-viewer__stage-shell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .b-image-viewer__viewport {
    --b-image-viewer-padding-x: 32px;
    --b-image-viewer-padding-top: 16px;
    --b-image-viewer-padding-bottom: 16px;
    position: absolute;
    inset: 0;
    overflow: auto;
    overscroll-behavior: contain;
    touch-action: pan-x pan-y;
    scrollbar-width: thin;
    scrollbar-color: var(--image-viewer-control-border-color) transparent;
    cursor: default;
    outline: none;
  }

  .b-image-viewer-modal :focus-visible {
    outline: none !important;
  }

  .b-image-viewer-modal:focus,
  .b-image-viewer-modal:focus-visible {
    outline: none !important;
  }

  .b-image-viewer__viewport:focus-visible {
    box-shadow: none;
  }

  .b-image-viewer-modal.is-keyboard-tabbing :focus-visible {
    outline: 2px solid var(--image-viewer-focus-ring-color) !important;
    outline-offset: 2px;
  }

  .b-image-viewer-modal.is-keyboard-tabbing .b-image-viewer__viewport:focus-visible {
    outline: none !important;
    box-shadow: inset 0 0 0 2px var(--image-viewer-focus-ring-color);
  }

  .b-image-viewer-modal.out:focus,
  .b-image-viewer-modal.out:focus-visible,
  .b-image-viewer-modal.out :focus-visible {
    outline: none !important;
  }

  .b-image-viewer-modal.out .b-image-viewer__viewport:focus-visible {
    box-shadow: none;
  }

  .b-image-viewer__viewport.is-scrollable {
    cursor: grab;
  }

  .b-image-viewer__viewport.is-pointer-panning {
    cursor: grabbing;
    user-select: none;
  }

  .b-image-viewer__stage {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 100%;
    min-height: 100%;
    transform: none;
    will-change: transform;
  }

  .b-image-viewer__image {
    display: block;
    flex: none;
    max-width: none !important;
    max-height: none !important;
    opacity: 0;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    transform-origin: center;
    transition: opacity 120ms ease;
  }

  .b-image-viewer__image.is-loaded {
    opacity: 1;
  }

  .b-image-viewer__status {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--image-viewer-muted-color);
    pointer-events: none;
  }

  .b-image-viewer__status .b-loading-inline {
    color: inherit;
  }

  .b-image-viewer__error {
    flex-direction: column;
    gap: 10px;
    pointer-events: auto;
  }

  .b-image-viewer__error .b_btn {
    color: var(--image-viewer-text-color);
    border: 1px solid var(--image-viewer-control-border-color) !important;
    background: var(--image-viewer-control-bg);
  }

  .b-image-viewer__nav-wrap {
    position: absolute !important;
    top: 50% !important;
    z-index: 2;
    transform: translateY(-50%);
  }

  .b-image-viewer__nav-wrap--previous {
    right: auto !important;
    left: 14px !important;
  }

  .b-image-viewer__nav-wrap--next {
    right: 14px !important;
    left: auto !important;
  }

  .b-image-viewer__nav.b_btn {
    width: 40px;
    height: 52px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--image-viewer-control-border-color) !important;
    border-radius: 12px;
    background: var(--image-viewer-nav-bg);
    color: var(--image-viewer-text-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .b-image-viewer__nav.b_btn:hover {
      border-color: var(--image-viewer-border-color) !important;
      background: var(--image-viewer-nav-hover-bg);
      color: var(--image-viewer-text-color);
    }
  }

  .b-image-viewer__nav.b_btn:disabled {
    opacity: 0.22;
  }

  .b-image-viewer__toolbar {
    min-height: 50px;
    box-sizing: border-box;
    padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    overflow-x: auto;
    border-top: 1px solid var(--image-viewer-divider-color);
    background: var(--image-viewer-chrome-bg);
    scrollbar-width: none;
  }

  .b-image-viewer__toolbar::-webkit-scrollbar {
    display: none;
  }

  .b-image-viewer__toolbar .b_btn {
    width: 32px;
    height: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    flex: none;
    border: 1px solid var(--image-viewer-control-border-color) !important;
    border-radius: 8px;
    background: var(--image-viewer-control-bg);
    color: var(--image-viewer-text-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .b-image-viewer__toolbar .b_btn:hover {
      background: var(--image-viewer-control-hover-bg);
      color: var(--image-viewer-text-color);
    }
  }

  .b-image-viewer__toolbar .b_btn:disabled {
    opacity: 0.3;
  }

  .b-image-viewer__scale {
    min-width: 44px;
    flex: none;
    color: var(--image-viewer-muted-color);
    font-size: 12px;
    text-align: center;
  }

  .b-image-viewer__divider {
    width: 1px;
    height: 20px;
    margin: 0 2px;
    flex: none;
    background: var(--image-viewer-divider-color);
  }

  .b-image-viewer__rotate-right {
    transform: scaleX(-1);
  }

  .b-image-viewer__position {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  @media (max-width: 767px) {
    .b-image-viewer-modal {
      border: 0;
      border-radius: 0;
      background: var(--image-viewer-shell-bg) !important;
    }

    .b-image-viewer-modal > .modal-header {
      background: var(--image-viewer-chrome-bg);
    }

    .b-image-viewer__viewport {
      --b-image-viewer-padding-x: 12px;
      --b-image-viewer-padding-top: 12px;
      --b-image-viewer-padding-bottom: 12px;
    }

    .b-image-viewer__nav-wrap {
      display: none !important;
    }

    .b-image-viewer__toolbar {
      min-height: 54px;
      padding: 4px max(12px, env(safe-area-inset-right, 0px)) calc(5px + env(safe-area-inset-bottom, 0px))
        max(12px, env(safe-area-inset-left, 0px));
      justify-content: center;
      gap: 3px;
    }

    .b-image-viewer__toolbar .b_btn {
      width: var(--mobile-touch-size);
      height: var(--mobile-touch-size);
    }

    .b-image-viewer__scale {
      min-width: 40px;
    }

    .b-image-viewer__divider {
      margin: 0 1px;
    }

    .b-image-viewer__tool--rotate-left {
      display: none !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .b-image-viewer__image {
      transition: none;
    }
  }

  html.light-note-mobile-rendering .b-image-viewer-modal {
    background: var(--image-viewer-shell-bg) !important;
  }

  html.light-note-mobile-rendering .b-image-viewer {
    background: var(--image-viewer-stage-bg) !important;
  }

  html.light-note-mobile-rendering .b-image-viewer__mobile-header,
  html.light-note-mobile-rendering .b-image-viewer__toolbar {
    background: var(--image-viewer-chrome-bg) !important;
  }
</style>
