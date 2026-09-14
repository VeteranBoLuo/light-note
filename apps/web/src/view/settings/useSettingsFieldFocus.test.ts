import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { useSettingsFieldFocus } from './useSettingsFieldFocus';
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount(top: number, initial: string | null = '#field') {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  const target = ref(initial);
  const root = ref<HTMLElement | null>(null);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      useSettingsFieldFocus(root, () => target.value);
      return () => h('div', { ref: root }, h('div', { id: 'field' }, 'Setting'));
    },
  });
  app.mount(host);
  const field = host.querySelector<HTMLElement>('#field')!;
  const rect = (y: number, height: number) => ({
    top: y,
    bottom: y + height,
    height,
    left: 0,
    right: 400,
    width: 400,
    x: 0,
    y,
    toJSON() {},
  });
  vi.spyOn(root.value!, 'getBoundingClientRect').mockReturnValue(rect(0, 400));
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rect(top, 80));
  Object.defineProperties(root.value!, { scrollHeight: { value: 1200 }, clientHeight: { value: 400 } });
  const scrollTo = vi.fn();
  root.value!.scrollTo = scrollTo;
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  await vi.advanceTimersByTimeAsync(20);
  return { field, target, scrollTo, app };
}
describe('settings field destination', () => {
  it('centers an offscreen field, highlights it, then clears the highlight', async () => {
    const { field, scrollTo } = await mount(800);
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' });
    expect(field.classList.contains('is-settings-focus')).toBe(true);
    await vi.advanceTimersByTimeAsync(2400);
    expect(field.classList.contains('is-settings-focus')).toBe(false);
  });
  it('highlights an already visible field without scrolling', async () => {
    const { field, scrollTo } = await mount(120);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(field.classList.contains('is-settings-focus')).toBe(true);
  });
  it('ordinary navigation does nothing; changing destination cancels the highlight', async () => {
    const { field, target, scrollTo } = await mount(120, null);
    expect(field.classList.contains('is-settings-focus')).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    target.value = '#field';
    await nextTick();
    await vi.advanceTimersByTimeAsync(20);
    expect(field.classList.contains('is-settings-focus')).toBe(true);
    target.value = null;
    await nextTick();
    expect(field.classList.contains('is-settings-focus')).toBe(false);
  });
});
