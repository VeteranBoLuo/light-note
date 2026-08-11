import { effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTE_EDITOR_WARMUP_DELAY_MS, useDelayedEditorWarmup } from './useDelayedEditorWarmup';

function createWarmupState(initial: { ready?: boolean; hasContent?: boolean; identity?: string } = {}) {
  const runtimeReady = ref(initial.ready ?? false);
  const hasContent = ref(initial.hasContent ?? true);
  const identity = ref(initial.identity ?? 'note-1:html');
  const scope = effectScope();
  let phase!: Ref<'skeleton' | 'preview' | 'hidden'>;
  scope.run(() => {
    phase = useDelayedEditorWarmup({ runtimeReady, hasContent, identity }).phase;
  });
  return { runtimeReady, hasContent, identity, phase, scope };
}

describe('useDelayedEditorWarmup', () => {
  let scope: EffectScope | null = null;

  afterEach(() => {
    scope?.stop();
    scope = null;
    vi.useRealTimers();
  });

  it('快路径保持骨架屏，运行时就绪后不挂载静态正文', async () => {
    vi.useFakeTimers();
    const state = createWarmupState();
    scope = state.scope;

    expect(state.phase.value).toBe('skeleton');
    vi.advanceTimersByTime(NOTE_EDITOR_WARMUP_DELAY_MS - 1);
    expect(state.phase.value).toBe('skeleton');

    state.runtimeReady.value = true;
    await nextTick();
    expect(state.phase.value).toBe('hidden');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('慢路径超过阈值后显示预览，并在真实编辑器就绪时隐藏', async () => {
    vi.useFakeTimers();
    const state = createWarmupState();
    scope = state.scope;

    vi.advanceTimersByTime(NOTE_EDITOR_WARMUP_DELAY_MS);
    expect(state.phase.value).toBe('preview');

    state.runtimeReady.value = true;
    await nextTick();
    expect(state.phase.value).toBe('hidden');
  });

  it('切换笔记会重新计时，空正文只保留骨架直到运行时就绪', async () => {
    vi.useFakeTimers();
    const state = createWarmupState();
    scope = state.scope;

    vi.advanceTimersByTime(NOTE_EDITOR_WARMUP_DELAY_MS - 20);
    state.identity.value = 'note-2:html';
    await nextTick();
    vi.advanceTimersByTime(20);
    expect(state.phase.value).toBe('skeleton');

    state.hasContent.value = false;
    await nextTick();
    vi.advanceTimersByTime(NOTE_EDITOR_WARMUP_DELAY_MS);
    expect(state.phase.value).toBe('skeleton');
    expect(vi.getTimerCount()).toBe(0);
  });
});
