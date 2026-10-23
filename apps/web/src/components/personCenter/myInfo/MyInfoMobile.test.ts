import { createApp, h, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';

const state = reactive({ dirty: false, saving: false });
vi.mock('./ProfileEditorForm.vue', () => ({
  default: {
    setup(_: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose(state);
      return () => h('div', '编辑表单');
    },
  },
}));
vi.mock('@/components/base/BasicComponents/CommonContainer.vue', () => ({
  default: { template: '<main><slot/></main>' },
}));
import MyInfoMobile from './MyInfoMobile.vue';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});
async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<p>首页</p>' } },
      { path: '/myInfo', component: MyInfoMobile },
      { path: '/elsewhere', component: { template: '<p>已离开</p>' } },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  await router.push('/myInfo');
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return router;
}
describe('移动资料页保存期间的路由保护', () => {
  it.each([true, false])('保存尚未结束时，即使 dirty=%s 也不能离开', async (dirty) => {
    Object.assign(state, { dirty, saving: true });
    const router = await mount();
    await router.push('/elsewhere');
    expect(router.currentRoute.value.path).toBe('/myInfo');
    Object.assign(state, { dirty: false, saving: false });
    await router.push('/elsewhere');
    expect(router.currentRoute.value.path).toBe('/elsewhere');
  });
});
