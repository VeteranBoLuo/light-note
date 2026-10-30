import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ROUTE_PENDING_SHOW_DELAY, ROUTE_PENDING_SLOW_DELAY, installRoutePending, useRoutePending } from './routePending';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const page = (name: string) => ({ name, render: () => null });
// 路由守卫在 push 后经过若干微任务才执行；不推进定时器，只冲刷微任务。
const flush = async () => {
  for (let index = 0; index < 20; index++) await Promise.resolve();
};

async function setup() {
  const slow = deferred<unknown>();
  const failing = deferred<unknown>();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'start', component: page('Start') },
      { path: '/loaded', name: 'loaded', component: page('Loaded') },
      { path: '/todo', name: 'inbox', component: () => slow.promise },
      { path: '/broken', name: 'broken', component: () => failing.promise },
      { path: '/other', name: 'other', component: () => Promise.resolve(page('Other')) },
      { path: '/redirect', name: 'redirect', component: () => slow.promise, beforeEnter: () => ({ name: 'loaded' }) },
    ],
  });
  installRoutePending(router);
  await router.push('/');
  return { router, slow, failing, pending: useRoutePending() };
}

describe('导航等待状态', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('首次进入与已加载的页面不进入等待态', async () => {
    const { router, pending } = await setup();
    expect(pending.target.value).toBeNull();
    await router.push('/loaded');
    expect(pending.target.value).toBeNull();
  });

  it('目标代码未到时立即记录目标，150ms 后显示等待页，3 秒后标记为慢，完成后清除', async () => {
    const { router, slow, pending } = await setup();
    const navigation = router.push('/todo');
    await flush();
    expect(pending.target.value?.name).toBe('inbox');
    expect(pending.visible.value).toBe(false);
    vi.advanceTimersByTime(ROUTE_PENDING_SHOW_DELAY - 1);
    expect(pending.visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(pending.visible.value).toBe(true);
    expect(pending.slow.value).toBe(false);
    vi.advanceTimersByTime(ROUTE_PENDING_SLOW_DELAY - ROUTE_PENDING_SHOW_DELAY);
    expect(pending.slow.value).toBe(true);
    slow.resolve(page('Todo'));
    await navigation;
    expect(router.currentRoute.value.name).toBe('inbox');
    expect(pending.target.value).toBeNull();
    expect(pending.visible.value).toBe(false);
  });

  it('等待中改去别的页面时以最新目标为准，被取消的导航不会清掉新状态', async () => {
    const { router, slow, pending } = await setup();
    const first = router.push('/todo');
    await flush();
    const second = router.push('/broken');
    await flush();
    expect(pending.target.value?.name).toBe('broken');
    slow.resolve(page('Todo'));
    await first;
    expect(pending.target.value?.name).toBe('broken');
    vi.advanceTimersByTime(ROUTE_PENDING_SHOW_DELAY);
    expect(pending.visible.value).toBe(true);
    void second;
  });

  it('分包加载失败时清除等待态，交给路由的统一错误处理', async () => {
    const { router, failing, pending } = await setup();
    const navigation = router.push('/broken').catch((error) => error);
    await flush();
    expect(pending.target.value?.name).toBe('broken');
    failing.reject(new Error('Failed to fetch dynamically imported module'));
    await navigation;
    expect(pending.target.value).toBeNull();
    vi.advanceTimersByTime(ROUTE_PENDING_SLOW_DELAY);
    expect(pending.visible.value).toBe(false);
  });

  it('守卫重定向到已加载页面时不残留等待态', async () => {
    const { router, pending } = await setup();
    await router.push('/redirect');
    expect(router.currentRoute.value.name).toBe('loaded');
    expect(pending.target.value).toBeNull();
    vi.advanceTimersByTime(ROUTE_PENDING_SHOW_DELAY);
    expect(pending.visible.value).toBe(false);
  });
});
