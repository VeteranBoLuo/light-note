import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, withDirectives } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { activeRequestCount } from '@/http/requestActivity';
import { scheduleStaticPrewarm } from '@/utils/staticPrewarm';
import { createRoutePrefetchDirective } from './routePrefetch';

vi.mock('@/utils/staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => vi.fn()) }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
  expect(activeRequestCount()).toBe(0);
});

async function mount() {
  vi.useFakeTimers();
  const page = { render: () => h('div', 'page') };
  const notes = vi.fn(async () => ({ default: page }));
  const files = vi.fn(async () => ({ default: page }));
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page },
      { path: '/noteLibrary', name: 'noteLibrary', component: notes },
      { path: '/cloudSpace', name: 'cloudSpace', component: files },
    ],
  });
  await router.push('/');
  const target = ref<string | null>('/noteLibrary');
  const directive = createRoutePrefetchDirective(router);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      withDirectives(h('button', { onClick: () => router.push(target.value || '/') }, 'Open'), [
        [directive, target.value],
      ]),
  });
  app.mount(host);
  const button = host.querySelector('button')!;
  const pointer = (type: string, pointerType = 'mouse', buttonValue = 0) => {
    const event = new MouseEvent(type, { button: buttonValue });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    button.dispatchEvent(event);
  };
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { router, notes, files, button, pointer, target };
}

describe('导航资源预取', () => {
  it('短暂停留才加入字节预热队列，不执行模块或改变路由', async () => {
    const { router, notes, pointer } = await mount();
    pointer('pointerenter');
    await vi.advanceTimersByTimeAsync(99);
    expect(scheduleStaticPrewarm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(scheduleStaticPrewarm).toHaveBeenCalledWith({ groups: ['route.noteLibrary'], priority: -1, optional: true });
    expect(notes).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/');
    expect(activeRequestCount()).toBe(0);
  });

  it('鼠标掠过不下载，移开后释放已有的优先预热范围', async () => {
    const { pointer } = await mount();
    pointer('pointerenter');
    await vi.advanceTimersByTimeAsync(50);
    pointer('pointerleave');
    await vi.advanceTimersByTimeAsync(100);
    expect(scheduleStaticPrewarm).not.toHaveBeenCalled();
    pointer('pointerenter');
    await vi.advanceTimersByTimeAsync(100);
    const stop = vi.mocked(scheduleStaticPrewarm).mock.results.at(-1)!.value;
    pointer('pointerleave');
    expect(stop).toHaveBeenCalledOnce();
  });

  it('触摸按下提前解析同一个目标，重复事件去重，点击仍正常导航', async () => {
    const { router, notes, pointer, button } = await mount();
    pointer('pointerenter', 'touch');
    await vi.advanceTimersByTimeAsync(150);
    expect(scheduleStaticPrewarm).not.toHaveBeenCalled();
    pointer('pointerdown', 'touch');
    button.dispatchEvent(new FocusEvent('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(notes).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe('/');
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(router.currentRoute.value.fullPath).toBe('/noteLibrary');
  });

  it('键盘聚焦可独立预取，失败后正式导航仍能重试', async () => {
    const { router, notes, button } = await mount();
    notes.mockRejectedValueOnce(Error('offline'));
    button.dispatchEvent(new FocusEvent('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(router.currentRoute.value.fullPath).toBe('/');
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(notes).toHaveBeenCalledTimes(2);
    expect(router.currentRoute.value.fullPath).toBe('/noteLibrary');
  });

  it('目标变化取消旧悬停任务，后续按下只准备新目标', async () => {
    const { notes, files, pointer, target } = await mount();
    pointer('pointerenter');
    target.value = '/cloudSpace';
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    expect(scheduleStaticPrewarm).not.toHaveBeenCalled();
    pointer('pointerdown');
    await vi.advanceTimersByTimeAsync(0);
    expect(notes).not.toHaveBeenCalled();
    expect(files).toHaveBeenCalledOnce();
  });

  it('当前路由、禁用入口和非主键按下不会启动预取', async () => {
    const { router, notes, pointer, target, button } = await mount();
    pointer('pointerdown', 'mouse', 2);
    button.disabled = true;
    button.dispatchEvent(new FocusEvent('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(notes).not.toHaveBeenCalled();
    button.disabled = false;
    target.value = '/';
    await nextTick();
    pointer('pointerenter');
    pointer('pointerdown');
    await vi.advanceTimersByTimeAsync(200);
    expect(scheduleStaticPrewarm).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('卸载后清理计时器、预热范围和事件监听', async () => {
    const { notes, pointer, button } = await mount();
    pointer('pointerenter');
    await vi.advanceTimersByTimeAsync(100);
    const stop = vi.mocked(scheduleStaticPrewarm).mock.results.at(-1)!.value;
    cleanup?.();
    cleanup = undefined;
    pointer('pointerdown');
    button.dispatchEvent(new FocusEvent('focus'));
    await vi.advanceTimersByTimeAsync(100);
    expect(stop).toHaveBeenCalledOnce();
    expect(notes).not.toHaveBeenCalled();
  });
});
