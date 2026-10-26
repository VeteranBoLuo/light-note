import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { activeRequestCount } from '@/http/requestActivity';
import { trackNavigationActivity } from './routePrefetch';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  expect(activeRequestCount()).toBe(0);
});
function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/a', '/b', '/c'].map((path) => ({ path, component: {} })),
  });
}
describe('导航期间暂停预热', () => {
  it('等待异步守卫和路由完成后才释放', async () => {
    const app = router();
    dispose = trackNavigationActivity(app);
    let resolve!: () => void;
    app.beforeEach(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const navigation = app.push('/a');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    expect(activeRequestCount()).toBe(1);
    resolve();
    await navigation;
    expect(activeRequestCount()).toBe(0);
  });
  it.each(['success', 'cancel', 'error'])('重定向到较早守卫 %s 时不遗留计数', async (outcome) => {
    const app = router();
    app.beforeEach((to) => {
      if (to.path !== '/b') return;
      if (outcome === 'cancel') return false;
      if (outcome === 'error') throw Error('guard');
    });
    app.onError(() => {});
    dispose = trackNavigationActivity(app);
    app.beforeEach((to) => (to.path === '/a' ? '/b' : undefined));
    await app.push('/a').catch(() => {});
    expect(activeRequestCount()).toBe(0);
  });
  it('被取代的旧导航结束时不释放新导航的计数', async () => {
    const app = router();
    dispose = trackNavigationActivity(app);
    const releases = new Map<string, () => void>();
    app.beforeEach((to) => new Promise<void>((resolve) => releases.set(to.path, resolve)));
    const first = app.push('/a');
    await vi.waitFor(() => expect(releases.has('/a')).toBe(true));
    const second = app.push('/b');
    await vi.waitFor(() => expect(releases.has('/b')).toBe(true));
    expect(activeRequestCount()).toBe(1);
    releases.get('/a')!();
    await first;
    expect(activeRequestCount()).toBe(1);
    releases.get('/b')!();
    await second;
    expect(activeRequestCount()).toBe(0);
  });
});
