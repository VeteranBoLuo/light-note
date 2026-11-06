import { afterEach, describe, expect, it } from 'vitest';
import { createRouter, createWebHistory, type Router } from 'vue-router';
import { createPageReturn, returnToPreviousPage } from './pageReturn';
import { handleMobilePageBack, registerMobileTopBarBinding } from '@/composables/useMobileTopBar';

const cleanup: (() => void)[] = [];
async function start(path = '/workbenches') {
  // 保留浏览器 history.length，只有 Vue Router 的 back 才能证明存在可退回的站内页。
  window.history.replaceState(null, '', path);
  const history = createWebHistory();
  const router = createRouter({
    history,
    routes: [
      ...[
        '/workbenches',
        '/home',
        '/inbox',
        '/personCenter',
        '/admin',
        '/admin/users',
        '/settings',
        '/help',
        '/serverManagement/:module',
      ].map((path) => ({ path, name: path, component: { render: () => null } })),
      { path: '/:pathMatch(.*)*', name: 'not-found', component: { render: () => null } },
    ],
  });
  cleanup.push(() => history.destroy());
  await router.replace(path);
  return router;
}

async function returned(router: Router, action: () => void, path: string) {
  const settled = new Promise<void>((resolve) => {
    const stop = router.afterEach((to) => {
      if (to.fullPath !== path) return;
      stop();
      resolve();
    });
    cleanup.push(stop);
  });
  action();
  await settled;
  expect(router.currentRoute.value.fullPath).toBe(path);
}

afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((stop) => stop());
});

describe('页面返回使用已有站内历史', () => {
  it.each(['/workbenches', '/home?tag=kept#cards', '/inbox?tab=todo'])(
    '个人中心 → 后台 → 用户管理连续返回到原始来源 %s',
    async (source) => {
      const router = await start(source);
      const sourcePosition = router.options.history.state.position;
      await router.push('/personCenter');
      await router.push('/admin');
      await router.push('/admin/users');
      await returned(router, () => returnToPreviousPage(router, '/admin'), '/admin');
      await returned(router, () => returnToPreviousPage(router, '/personCenter'), '/personCenter');
      await returned(router, () => returnToPreviousPage(router, '/workbenches'), source);
      expect(router.options.history.state.position).toBe(sourcePosition);
    },
  );

  it('页头动作与 Android 页面返回消费同一个动作，且每次只退一层', async () => {
    const router = await start();
    await router.push('/personCenter');
    await router.push('/admin');
    const back = () => returnToPreviousPage(router, '/personCenter');
    cleanup.push(registerMobileTopBarBinding(['/admin'], { onBack: back }));
    const event = new Event('light-note-system-back', { cancelable: true });
    await returned(router, () => expect(handleMobilePageBack('/admin', event)).toBe(true), '/personCenter');
    expect(event.defaultPrevented).toBe(true);
    expect(handleMobilePageBack('/admin', event)).toBe(false);
    await returned(router, () => returnToPreviousPage(router, '/workbenches'), '/workbenches');
  });

  it('直接打开子页不按 history.length 退出站点，连续返回不会重新进入子页', async () => {
    const router = await start('/admin');
    const position = router.options.history.state.position;
    await returned(router, () => returnToPreviousPage(router, '/personCenter'), '/personCenter');
    expect(router.options.history.state.position).toBe(position);
    await returned(router, () => returnToPreviousPage(router, '/workbenches'), '/workbenches');
    expect(router.options.history.state.position).toBe(position);
  });

  it('明确返回目标仅在历史匹配时出栈，否则替换当前页', async () => {
    const router = await start('/admin?queue=kept');
    await router.push('/admin/users');
    await returned(router, () => returnToPreviousPage(router, '/admin', '/admin?queue=kept'), '/admin?queue=kept');
    await router.push('/admin/users');
    const position = router.options.history.state.position;
    await returned(router, () => returnToPreviousPage(router, '/admin', '/admin?queue=other'), '/admin');
    expect(router.options.history.state.position).toBe(position);
  });

  it.each(['https://outside.example/', '//outside.example/', '/\\outside.example/', '/missing', '/home\n'])(
    '不把无效历史 %j 当作来源',
    async (back) => {
      const router = await start('/admin');
      router.options.history.replace('/admin', { back });
      await returned(router, () => returnToPreviousPage(router, '/personCenter'), '/personCenter');
    },
  );
});

describe('退出模块保留入口历史', () => {
  it.each(['/help', '/serverManagement/overview', '/settings'])(
    '%s 内多次切换后一次回到原个人中心记录',
    async (entry) => {
      const router = await start('/workbenches');
      await router.push({ path: '/personCenter', state: { scrollMarker: 360 } });
      const position = router.options.history.state.position;
      await router.push(entry);
      const back = createPageReturn(router, '/personCenter');
      await router.push(`${entry}?tab=one`);
      await router.push(`${entry}?tab=two`);
      await returned(
        router,
        () => {
          back();
          back();
        },
        '/personCenter',
      );
      expect(router.options.history.state.position).toBe(position);
      expect(router.options.history.state.scrollMarker).toBe(360);
      await returned(router, () => returnToPreviousPage(router, '/workbenches'), '/workbenches');
    },
  );

  it('无来源的模块内部历史先退回入口再替换，不让个人中心退入旧页签', async () => {
    const router = await start('/help');
    const position = router.options.history.state.position;
    const back = createPageReturn(router, '/personCenter');
    await router.push('/help?article=one');
    await router.push('/help?article=two');
    await returned(router, back, '/personCenter');
    expect(router.options.history.state.position).toBe(position);
    expect(router.options.history.state.back).toBeNull();
    await returned(router, () => returnToPreviousPage(router, '/workbenches'), '/workbenches');
  });

  it('守卫拒绝退出后仍可重试，不替换或越过来源页', async () => {
    const router = await start('/personCenter');
    await router.push('/settings');
    const back = createPageReturn(router, '/personCenter');
    const stopGuard = router.beforeEach(() => false);
    const failed = new Promise<void>((resolve) => {
      const stop = router.afterEach((_to, _from, failure) => {
        if (failure) {
          stop();
          resolve();
        }
      });
    });
    back();
    await failed;
    expect(router.currentRoute.value.path).toBe('/settings');
    stopGuard();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await returned(router, back, '/personCenter');
  });
});
