import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, defineComponent, ref, nextTick, type Component } from 'vue';
import { useImagePreview } from './useImagePreview';
import { resolveImagePreviews } from '@/api/imagePreview';
vi.mock('@/api/imagePreview', () => ({ resolveImagePreviews: vi.fn() }));
function mount(component: Component) {
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(component);
  app.mount(el);
  return {
    text: () => el.textContent,
    unmount: () => {
      app.unmount();
      el.remove();
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('shared visible-image scheduler', () => {
  it('batches visible cards and never requests an original source URL', async () => {
    vi.useFakeTimers();
    vi.mocked(resolveImagePreviews).mockImplementation(async (items) =>
      items.map((i) => ({
        ...i,
        status: 'ready',
        url: 'https://preview.invalid/small.webp',
        expiresAt: Date.now() + 600000,
      })),
    );
    const make = (id: string) =>
      defineComponent({
        setup() {
          const state = useImagePreview(ref({ sourceType: 'note' as const, sourceId: id }), ref(true));
          return { state };
        },
        template: '<span>{{state?.status}}</span>',
      });
    const a = mount(make('a')),
      b = mount(make('b'));
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
    expect(resolveImagePreviews).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveImagePreviews).mock.calls[0][0]).toEqual([
      { sourceType: 'note', sourceId: 'a' },
      { sourceType: 'note', sourceId: 'b' },
    ]);
    expect(a.text()).toBe('ready');
    a.unmount();
    b.unmount();
    await vi.advanceTimersByTimeAsync(600000);
    expect(resolveImagePreviews).toHaveBeenCalledTimes(1);
  });
  it('keeps checking slow uploads and displays their thumbnail without a page refresh', async () => {
    vi.useFakeTimers();
    vi.mocked(resolveImagePreviews).mockImplementation(async (items) =>
      items.map((i) => ({ ...i, status: 'processing' })),
    );
    const c = mount(
      defineComponent({
        setup() {
          return { state: useImagePreview(ref({ sourceType: 'cloud_file' as const, sourceId: '1' }), ref(true)) };
        },
        template: '<div>{{state?.status}}</div>',
      }),
    );
    await vi.advanceTimersByTimeAsync(70000);
    const count = vi.mocked(resolveImagePreviews).mock.calls.length;
    expect(c.text()).toBe('processing');
    await vi.advanceTimersByTimeAsync(30000);
    expect(resolveImagePreviews).toHaveBeenCalledTimes(count + 1);
    vi.mocked(resolveImagePreviews).mockImplementation(async (items) =>
      items.map((i) => ({ ...i, status: 'ready', url: 'https://preview.invalid/new.webp' })),
    );
    await vi.advanceTimersByTimeAsync(30000);
    expect(c.text()).toBe('ready');
    c.unmount();
    const finalCount = vi.mocked(resolveImagePreviews).mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(resolveImagePreviews).toHaveBeenCalledTimes(finalCount);
  });
  it('pauses offscreen polling and resumes when the upload card becomes visible', async () => {
    vi.useFakeTimers();
    const visible = ref(true);
    vi.mocked(resolveImagePreviews).mockImplementation(async (items) => items.map((i) => ({ ...i, status: 'queued' })));
    const c = mount(
      defineComponent({
        setup() {
          return { state: useImagePreview(ref({ sourceType: 'cloud_file' as const, sourceId: 'new' }), visible) };
        },
        template: '<div>{{state?.status}}</div>',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    visible.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(120000);
    expect(resolveImagePreviews).toHaveBeenCalledTimes(1);
    visible.value = true;
    await nextTick();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveImagePreviews).toHaveBeenCalledTimes(2);
    c.unmount();
  });
});
