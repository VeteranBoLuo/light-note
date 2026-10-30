import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createRouter, createWebHistory, RouterView, type Router } from 'vue-router';
import { useHistoryScrollMemory } from './useHistoryScrollMemory';

const ListPage = defineComponent({
  setup() {
    const element = ref<HTMLElement | null>(null);
    useHistoryScrollMemory('list', element);
    return () => h('div', { ref: element, class: 'list-scroll' });
  },
});
const DetailPage = defineComponent({ render: () => h('section', 'detail') });

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

async function setup() {
  // jsdom 没有布局，给滚动容器一个足够高的内容区。
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(3000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  window.history.replaceState(null, '', '/');
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: DetailPage },
      { path: '/list', component: ListPage },
      { path: '/detail', component: DetailPage },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  await router.push('/');
  await router.isReady();
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { router, host };
}

async function back(router: Router) {
  const done = new Promise<void>((resolve) => {
    const remove = router.afterEach(() => {
      remove();
      resolve();
    });
  });
  router.back();
  await done;
  await nextTick();
}

const list = (host: HTMLElement) => host.querySelector<HTMLElement>('.list-scroll')!;

describe('useHistoryScrollMemory', () => {
  it('进入子页面后返回回到原来的位置，从别处重新进入仍从顶部开始', async () => {
    const { router, host } = await setup();
    await router.push('/list');
    await nextTick();
    list(host).scrollTop = 900;

    await router.push('/detail');
    await back(router);
    expect(list(host).scrollTop).toBe(900);

    await router.push('/detail');
    await router.push('/list');
    await nextTick();
    expect(list(host).scrollTop).toBe(0);
  });

  it('异步内容补齐期间继续对齐，用户一触摸就不再改动位置', async () => {
    const { router, host } = await setup();
    await router.push('/list');
    await nextTick();
    list(host).scrollTop = 700;
    await router.push('/detail');
    await back(router);
    expect(list(host).scrollTop).toBe(700);

    list(host).scrollTop = 40;
    await new Promise((resolve) => setTimeout(resolve, 120));
    // 80ms 的补对齐把被异步内容挤开的位置拉回目标。
    expect(list(host).scrollTop).toBe(700);

    list(host).dispatchEvent(new Event('touchstart'));
    list(host).scrollTop = 120;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(list(host).scrollTop).toBe(120);
  });

  it('不同浏览记录条目互不串用位置', async () => {
    const { router, host } = await setup();
    await router.push('/list');
    await nextTick();
    list(host).scrollTop = 500;
    await router.push('/detail');
    await router.push('/list');
    await nextTick();
    expect(list(host).scrollTop).toBe(0);
    list(host).scrollTop = 1200;
    await router.push('/detail');
    await back(router);
    expect(list(host).scrollTop).toBe(1200);
    await back(router);
    await back(router);
    expect(list(host).scrollTop).toBe(500);
  });
});
