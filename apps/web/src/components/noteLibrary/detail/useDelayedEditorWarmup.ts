import { onScopeDispose, ref, watch, type Ref } from 'vue';

export const NOTE_EDITOR_WARMUP_DELAY_MS = 300;

export type NoteEditorWarmupPhase = 'skeleton' | 'preview' | 'hidden';

interface DelayedEditorWarmupOptions {
  runtimeReady: Readonly<Ref<boolean>>;
  hasContent: Readonly<Ref<boolean>>;
  identity: Readonly<Ref<string>>;
  delay?: number;
}

/**
 * 快路径只显示骨架并直接交给真实编辑器；只有运行时超过阈值仍未就绪时，
 * 才显示已经拿到的静态正文，避免正常网络下多渲染一份长笔记。
 */
export function useDelayedEditorWarmup(options: DelayedEditorWarmupOptions) {
  const phase = ref<NoteEditorWarmupPhase>('skeleton');
  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPreviewTimer() {
    if (previewTimer === null) return;
    clearTimeout(previewTimer);
    previewTimer = null;
  }

  watch(
    [options.runtimeReady, options.hasContent, options.identity],
    ([runtimeReady, hasContent]) => {
      clearPreviewTimer();
      if (runtimeReady) {
        phase.value = 'hidden';
        return;
      }

      phase.value = 'skeleton';
      if (!hasContent) return;

      previewTimer = setTimeout(() => {
        previewTimer = null;
        if (options.runtimeReady.value || !options.hasContent.value) return;
        phase.value = 'preview';
      }, options.delay ?? NOTE_EDITOR_WARMUP_DELAY_MS);
    },
    { immediate: true },
  );

  onScopeDispose(clearPreviewTimer);

  return { phase };
}
