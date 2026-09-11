import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import ManagedImagePreview from './ManagedImagePreview.vue';
import { imagePreviewZh } from '@/i18n/locales/imagePreview';
import { useImagePreview, refreshImagePreview } from '@/composables/useImagePreview';
import { resolveImagePreviews, retryImagePreview } from '@/api/imagePreview';
import type { ImagePreviewState } from '@/api/imagePreview';
vi.mock('@/composables/useImagePreview', () => ({ useImagePreview: vi.fn(), refreshImagePreview: vi.fn() }));
vi.mock('@/api/imagePreview', () => ({ resolveImagePreviews: vi.fn(), retryImagePreview: vi.fn() }));
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
  vi.clearAllMocks();
});
function mount(state: ImagePreviewState, fallback = false, original = {}) {
  const source = ref({ sourceType: 'note' as const, sourceId: 'one' });
  const current = ref(state);
  vi.mocked(useImagePreview).mockReturnValue(current);
  const element = document.createElement('div');
  document.body.append(element);
  const app = createApp({
    render: () =>
      h(
        ManagedImagePreview,
        { source: source.value, ...original },
        fallback ? { fallback: () => h('span', { class: 'audio-placeholder' }, 'MP3') } : undefined,
      ),
  });
  app
    .use(createPinia())
    .use(createI18n({ legacy: false, locale: 'zh', messages: { zh: { imagePreview: imagePreviewZh } } }));
  app.mount(element);
  cleanups.push(() => {
    app.unmount();
    element.remove();
  });
  return { element, current, source };
}
const base = { sourceType: 'note' as const, sourceId: 'one' };
describe('managed image feedback', () => {
  it('explains a long wait and automatically replaces it with the completed thumbnail', async () => {
    vi.useFakeTimers();
    const { element, current } = mount({ ...base, status: 'queued' });
    await nextTick();
    await vi.advanceTimersByTimeAsync(3000);
    expect(element.textContent).toContain('仍在处理');
    expect(element.textContent).not.toContain('暂不可用');
    current.value = { ...base, status: 'ready', url: 'https://preview.test/completed.webp' };
    await nextTick();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://preview.test/completed.webp');
    expect(element.textContent).not.toContain('仍在处理');
  });
  it('keeps processing distinct from errors and labels tall-image previews', async () => {
    const { element, current } = mount({ ...base, status: 'processing' });
    expect(element.textContent).toContain('正在生成');
    current.value = { ...base, status: 'ready', presentation: 'long_top', url: 'https://preview.test/small.webp' };
    await nextTick();
    expect(element.textContent).toContain('长图');
  });
  it('shows the full reason on explicit click and does not offer retry for missing sources', async () => {
    const { element } = mount({ ...base, status: 'failed', errorCode: 'IMAGE_SOURCE_MISSING', retryable: false });
    expect(element.textContent).toContain('查看原因');
    element.querySelector('button')!.click();
    await nextTick();
    expect(document.body.textContent).toContain('无法找到原文件');
    expect(document.body.textContent).not.toContain('重试预览');
  });
  it('refreshes a broken image address once without requeueing generation', async () => {
    const { element } = mount({ ...base, status: 'ready', url: 'https://preview.test/old.webp' });
    vi.mocked(resolveImagePreviews).mockResolvedValue([
      { ...base, status: 'ready', url: 'https://preview.test/new.webp' },
    ]);
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(resolveImagePreviews).toHaveBeenCalledWith([base], true));
    await vi.waitFor(() => expect(refreshImagePreview).toHaveBeenCalled());
    await nextTick();
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(resolveImagePreviews).toHaveBeenCalledTimes(1);
    expect(retryImagePreview).not.toHaveBeenCalled();
    expect(element.textContent).toContain('缩略图暂不可用');
  });
});

it('shows the audio fallback until artwork is ready and after a failed image load', async () => {
  const { element, current } = mount({ ...base, status: 'unsupported' }, true);
  expect(element.textContent).toBe('MP3');
  expect(element.querySelector('[role="status"]')).toBeNull();
  current.value = { ...base, status: 'processing' };
  await nextTick();
  expect(element.textContent).toBe('MP3');
  current.value = { ...base, status: 'ready', url: 'https://preview.test/cover.webp' };
  await nextTick();
  expect(element.querySelector('.audio-placeholder')).toBeNull();
  vi.mocked(resolveImagePreviews).mockRejectedValue(new Error('network'));
  element.querySelector('img')!.dispatchEvent(new Event('error'));
  await vi.waitFor(() => expect(element.textContent).toBe('MP3'));
});

describe('cloud original fallback', () => {
  const original = { originalUrl: 'https://preview.test/original.jpg', originalBytes: 580295 };
  it('waits only three seconds, then uses the original and switches back when the thumbnail is ready', async () => {
    vi.useFakeTimers();
    const { element, current } = mount({ ...base, status: 'queued' }, false, original);
    await nextTick();
    await vi.advanceTimersByTimeAsync(2999);
    expect(element.querySelector('img')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(element.querySelector('img')?.getAttribute('src')).toBe(original.originalUrl);
    current.value = { ...base, status: 'ready', url: 'https://preview.test/small.webp' };
    await nextTick();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://preview.test/small.webp');
  });
  it('falls back immediately on failure and stops automatically retrying a broken original', async () => {
    const { element, source } = mount({ ...base, status: 'failed' }, false, original);
    await nextTick();
    expect(element.querySelector('img')?.getAttribute('src')).toBe(original.originalUrl);
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('原图也未能加载');
    expect(resolveImagePreviews).not.toHaveBeenCalled();
    source.value = { sourceType: 'note', sourceId: 'two' };
    await nextTick();
    expect(element.querySelector('img')).not.toBeNull();
  });
  it('uses the original when an existing thumbnail fails to load', async () => {
    vi.mocked(resolveImagePreviews).mockRejectedValue(new Error('unavailable'));
    const { element } = mount({ ...base, status: 'ready', url: 'https://preview.test/broken.webp' }, false, original);
    await nextTick();
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(element.querySelector('img')?.getAttribute('src')).toBe(original.originalUrl);
    await vi.waitFor(() => expect(resolveImagePreviews).toHaveBeenCalledTimes(1));
    expect(retryImagePreview).not.toHaveBeenCalled();
  });
  it('requires a click for large images and does not bypass access denial', async () => {
    const { element, current } = mount({ ...base, status: 'failed' }, false, {
      ...original,
      originalBytes: 10 * 1024 * 1024,
    });
    await nextTick();
    expect(element.querySelector('img')).toBeNull();
    Array.from(element.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('查看原图'))!
      .click();
    await nextTick();
    expect(element.querySelector('img')?.getAttribute('src')).toBe(original.originalUrl);
    current.value = { ...base, status: 'unavailable' };
    await nextTick();
    expect(element.querySelector('img')).toBeNull();
  });
});
