import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import { afterEach, it, expect, vi } from 'vitest';
import { useUserStore } from '@/store';
import zh from '@/i18n/locales/zh-CN';
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: vi.fn() } }));
const state = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./api', () => ({
  formsApi: state.api,
  statusLabel: {
    draft: 'collectionForms.draft',
    collecting: 'collectionForms.collecting',
    paused: 'collectionForms.paused',
  },
  typeLabels: { short: 'collectionForms.short' },
}));
import FormsWorkspace from './FormsWorkspace.vue';
const cleanup: (() => void)[] = [];
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};
function form(id: string, title: string) {
  return {
    id,
    title,
    version: 1,
    status: 'draft',
    published: 0,
    tagIds: [],
    definition: { title, description: '', successMessage: '谢谢', questions: [] },
  };
}
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/toolbox/forms/:formId?', name: 'collectionForms', component: FormsWorkspace }],
  });
  const pinia = createPinia(),
    app = createApp({ render: () => h(RouterView) });
  app.use(pinia);
  app.use(router);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zh },
    }),
  );
  useUserStore(pinia).id = 'owner';
  await router.push('/toolbox/forms/old');
  await router.isReady();
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, router, pinia };
}
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  vi.clearAllMocks();
});
it('切换表单后旧详情不能覆盖新表单，账号变化清空再读取', async () => {
  let resolveOld: (value: unknown) => void;
  state.api.mockImplementation((path: string) =>
    path === '/old'
      ? new Promise((r) => (resolveOld = r))
      : path === '/new'
        ? Promise.resolve(form('new', '新表单'))
        : path?.endsWith('/responses')
          ? Promise.resolve({ items: [], total: 0 })
          : Promise.resolve([]),
  );
  const { host, router, pinia } = await mount();
  await router.push('/toolbox/forms/new');
  await flush();
  resolveOld!(form('old', '旧表单'));
  await flush();
  expect(host.querySelector('h1')?.textContent).toBe('新表单');
  state.api.mockImplementation((path: string) =>
    path === '/new'
      ? Promise.resolve(form('new', '第二账号的表单'))
      : path?.endsWith('/responses')
        ? Promise.resolve({ items: [], total: 0 })
        : Promise.resolve([]),
  );
  useUserStore(pinia).id = 'another';
  await flush();
  expect(host.querySelector('h1')?.textContent).toBe('第二账号的表单');
});
it('保存中继续编辑不会把后续输入当成已保存', async () => {
  let finishSave: (value: unknown) => void;
  state.api.mockImplementation((path: string, method: string) =>
    method === 'PATCH'
      ? new Promise((r) => (finishSave = r))
      : path === '/old'
        ? Promise.resolve(form('old', '原名称'))
        : path?.endsWith('/responses')
          ? Promise.resolve({ items: [], total: 0 })
          : Promise.resolve([]),
  );
  const { host } = await mount();
  await flush();
  Array.from(host.querySelectorAll('button'))
    .find((b) => b.textContent?.trim() === '表单设置')!
    .click();
  await flush();
  let input = document.querySelector('.collection-metadata textarea') as HTMLTextAreaElement;
  input.value = '第一次修改';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent?.trim() === '完成')!
    .click();
  await flush();
  const save = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('保存修改'))!;
  save.click();
  await nextTick();
  Array.from(host.querySelectorAll('button'))
    .find((b) => b.textContent?.trim() === '表单设置')!
    .click();
  await flush();
  input = document.querySelector('.collection-metadata textarea') as HTMLTextAreaElement;
  input.value = '保存中的新修改';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  finishSave!({ version: 2 });
  await flush();
  expect(input.value).toBe('保存中的新修改');
  expect(host.textContent).toContain('有未保存的修改');
});
it.each(['button', 'mask', 'escape'])('新建弹窗可通过 %s 关闭并重新打开', async (method) => {
  state.api.mockImplementation((path: string) =>
    path === '/old' ? Promise.resolve(form('old', '原名称')) : Promise.resolve([]),
  );
  const { host } = await mount();
  await flush();
  const open = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '新建')!;
  open.click();
  await flush();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  if (method === 'escape')
    document
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  else (document.querySelector(method === 'mask' ? '.mask-container' : '.modal-close') as HTMLElement).click();
  await nextTick();
  await new Promise((r) => setTimeout(r, 240));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  open.click();
  await flush();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it('选择投票模板后创建草稿并进入编辑，不自动发布', async () => {
  state.api.mockImplementation((path: string, method: string) =>
    method === 'POST'
      ? Promise.resolve({ id: 'created' })
      : path === '/old'
        ? Promise.resolve(form('old', '原名称'))
        : path === '/created'
          ? Promise.resolve(form('created', '读书会'))
          : Promise.resolve([]),
  );
  const { host, router } = await mount();
  await flush();
  Array.from(host.querySelectorAll('button'))
    .find((b) => b.textContent?.trim() === '新建')!
    .click();
  await flush();
  (document.querySelectorAll('.collection-template')[3] as HTMLButtonElement).click();
  const input = document.querySelector('.collection-create-body input') as HTMLInputElement;
  input.value = '读书会';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  Array.from(document.querySelectorAll('.collection-create-modal button'))
    .find((b) => b.textContent?.trim() === '创建并编辑')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flush();
  await flush();
  expect(state.api).toHaveBeenCalledWith(
    '',
    'POST',
    expect.objectContaining({
      definition: expect.objectContaining({
        title: '读书会',
        questions: [expect.objectContaining({ type: 'single' })],
      }),
    }),
  );
  expect(router.currentRoute.value.params.formId).toBe('created');
  expect(host.querySelector('h1')?.textContent).toBe('读书会');
  expect(state.api.mock.calls.some((c) => c[0]?.endsWith('/actions'))).toBe(false);
});
it('切换仅请求详情，保留目录节点和原详情直至新数据就绪', async () => {
  let resolveNew: (value: unknown) => void;
  state.api.mockImplementation((path: string) =>
    path === ''
      ? Promise.resolve([form('old', '旧表单'), form('new', '新表单')])
      : path === '/old'
        ? Promise.resolve(form('old', '旧表单'))
        : path === '/new'
          ? new Promise((resolve) => {
              resolveNew = resolve;
            })
          : path.endsWith('/responses')
            ? Promise.resolve({ items: [], total: 0 })
            : Promise.resolve([]),
  );
  const { host, router } = await mount();
  await flush();
  const entry = host.querySelector('.collection-entry');
  const heading = host.querySelector('h1');
  const listRequests = state.api.mock.calls.filter(([path]) => path === '').length;
  await router.push('/toolbox/forms/new');
  await flush();
  expect(host.querySelector('.collection-entry')).toBe(entry);
  expect(host.querySelector('h1')).toBe(heading);
  expect(host.querySelector('.collection-detail-content')?.hasAttribute('inert')).toBe(true);
  expect(state.api.mock.calls.filter(([path]) => path === '')).toHaveLength(listRequests);
  resolveNew!(form('new', '新表单'));
  await flush();
  expect(host.querySelector('h1')?.textContent).toBe('新表单');
  expect(host.querySelector('.collection-detail-content')?.hasAttribute('inert')).toBe(false);
});

it('空提交显示分享入口且隐藏分页，失败不伪装成空结果', async () => {
  state.api.mockImplementation((path: string) =>
    path === '/old'
      ? Promise.resolve({ ...form('old', '收集表单'), status: 'collecting', published: 1, total: 0 })
      : path.endsWith('/responses')
        ? Promise.resolve({ items: [], total: 0 })
        : Promise.resolve([]),
  );
  const { host } = await mount();
  await flush();
  expect(host.querySelector('.collection-records-empty')?.textContent).toContain('还没有收到提交');
  expect(host.querySelector('.collection-records-pagination')).toBeNull();
  expect(host.querySelector('.collection-records-empty button')?.textContent).toContain('复制填写链接');
  state.api.mockImplementation((path: string) =>
    path.endsWith('/responses') ? Promise.reject(new Error('读取失败')) : Promise.resolve([]),
  );
  (host.querySelector('button[aria-label="刷新"]') as HTMLButtonElement).click();
  await flush();
  expect(host.querySelector('.collection-records [role="alert"]')?.textContent).toContain('读取失败');
  expect(host.querySelector('.collection-records')?.textContent).not.toContain('还没有收到提交');
});

it('刷新保留记录节点，加载期间禁止对旧记录操作', async () => {
  const row = { id: 'r1', created_at: '2026-09-24T01:00:00Z', is_read: 0, processed: 0, spam: 0 };
  state.api.mockImplementation((path: string) =>
    path === '/old'
      ? Promise.resolve({ ...form('old', '收集表单'), status: 'collecting', published: 1, total: 1 })
      : path.endsWith('/responses')
        ? Promise.resolve({ items: [row], total: 1 })
        : Promise.resolve([]),
  );
  const { host } = await mount();
  await flush();
  const record = host.querySelector('.table-row');
  expect(record).not.toBeNull();
  let finish!: (value: unknown) => void;
  state.api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  (host.querySelector('button[aria-label="刷新"]') as HTMLButtonElement).click();
  await flush();
  expect(host.querySelector('.table-row')).toBe(record);
  expect(host.querySelector('.collection-records')?.getAttribute('aria-busy')).toBe('true');
  expect((record!.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  finish({ items: [row], total: 1 });
  await flush();
  expect(host.querySelector('.table-row')).toBe(record);
  expect((record!.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
});

it('暂停和恢复原位更新，操作菜单始终显示删除条件', async () => {
  const current = { ...form('old', '投票'), status: 'collecting', published: 1 };
  state.api.mockImplementation(async (path: string, method: string, input: any) => {
    if (path === '/old/actions') {
      current.status = input.action === 'pause' ? 'paused' : 'collecting';
      current.version++;
      return { status: current.status };
    }
    if (path === '/old') return structuredClone(current);
    if (path.endsWith('/responses')) return { items: [], total: 0 };
    return path === '' ? [current] : [];
  });
  const { host } = await mount();
  await flush();
  const content = host.querySelector('.collection-detail-content');
  const clickText = (text: string) =>
    (
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement
    ).click();
  clickText('暂停收集');
  await flush();
  expect(host.querySelector('.collection-detail-content')).toBe(content);
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('提交记录');
  expect(host.textContent).toContain('恢复收集');
  expect(state.api.mock.calls.filter((c) => c[0] === '/old')).toHaveLength(1);
  (host.querySelector('button[aria-label="表单操作"]') as HTMLButtonElement).click();
  await flush();
  const menu = Array.from(document.querySelectorAll('[role="menuitem"]'));
  expect(menu.find((b) => b.textContent?.includes('删除表单'))?.hasAttribute('disabled')).toBe(false);
  (menu.find((b) => b.textContent?.includes('恢复收集')) as HTMLButtonElement).click();
  await flush();
  (host.querySelector('button[aria-label="表单操作"]') as HTMLButtonElement).click();
  await flush();
  expect(
    Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes('请先暂停'))
      ?.hasAttribute('disabled'),
  ).toBe(true);
});
