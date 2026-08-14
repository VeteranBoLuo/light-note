<template>
  <div ref="rootRef" class="drawing-note-thumbnail" role="img" :aria-label="t('note.drawingLabel')">
    <canvas v-show="hasDrawing" ref="canvasRef" class="drawing-note-thumbnail__canvas" aria-hidden="true" />
    <div v-if="!hasDrawing" class="drawing-note-thumbnail__placeholder" aria-hidden="true">
      <SvgIcon :src="icon.resource.noteDrawing" size="24" />
      <span>{{ t('note.drawingLabel') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { loadDrawingPreview } from '@/api/drawingPreview';
  import icon from '@/config/icon';
  import { renderDrawingThumbnail } from '@/utils/drawingThumbnail';

  const props = withDefaults(defineProps<{ noteId?: string; revision?: number; content?: string }>(), {
    noteId: '',
    revision: 0,
    content: '',
  });
  const { t } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const hasDrawing = ref(false);
  let visible = false;
  let renderVersion = 0;
  let renderFrame = 0;
  let visibilityObserver: IntersectionObserver | null = null;

  function paint(content: string) {
    const canvas = canvasRef.value;
    if (!canvas) return false;
    canvas.width = 480;
    canvas.height = 270;
    const context = canvas.getContext('2d');
    return Boolean(context && content && renderDrawingThumbnail(context, content, 480, 270));
  }

  async function render() {
    renderFrame = 0;
    if (!visible || !canvasRef.value) return;
    const version = ++renderVersion;
    const inlineContent = String(props.content || '');
    if (paint(inlineContent)) {
      hasDrawing.value = true;
      return;
    }
    const content = await loadDrawingPreview(props.noteId, props.revision);
    if (version !== renderVersion || !visible) return;
    hasDrawing.value = paint(content);
  }

  function scheduleRender() {
    if (!visible || renderFrame) return;
    renderFrame = requestAnimationFrame(() => void render());
  }

  watch(
    () => [props.noteId, props.revision, props.content],
    () => {
      renderVersion += 1;
      hasDrawing.value = false;
      scheduleRender();
    },
  );

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined' || !rootRef.value) {
      visible = true;
      scheduleRender();
      return;
    }
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        visible = true;
        visibilityObserver?.disconnect();
        visibilityObserver = null;
        scheduleRender();
      },
      { rootMargin: '160px' },
    );
    visibilityObserver.observe(rootRef.value);
  });

  onBeforeUnmount(() => {
    renderVersion += 1;
    visibilityObserver?.disconnect();
    if (renderFrame) cancelAnimationFrame(renderFrame);
  });
</script>

<style scoped lang="less">
  .drawing-note-thumbnail {
    width: 100%;
    height: 100%;
    min-height: 96px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    box-sizing: border-box;
    background: #fff;
  }

  .drawing-note-thumbnail__canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .drawing-note-thumbnail__placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--resource-note-color, #00a884);
    background: var(--resource-note-soft-bg, #e9f8f4);
    font-size: 13px;
    font-weight: 600;
  }
</style>
