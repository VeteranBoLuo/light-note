import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { publicResourcesZh } from '@/i18n/locales/publicResources';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  execute: vi.fn(),
  send: vi.fn(),
  lookup: vi.fn(),
  user: {} as any,
  scope: {} as any,
}));
vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
  bookmarkStore: () => ({ isMobile: false, isDesktop: true }),
}));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('@/api/publicResources', () => ({
  publicGet: (...args: any[]) => mocks.get(...args),
  sendPublicResourceBatch: (...args: any[]) => mocks.send(...args),
  publicOperation: () => Object.assign(vi.fn(), { resolve: mocks.lookup }),
}));
vi.mock('vue-router', async (load) => ({ ...(await load<any>()), onBeforeRouteLeave: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BVirtualList.vue', () => ({
  default: {
    props: ['items'],
    setup: (props: any, { slots, expose }: any) => {
      expose({ scrollToTop: vi.fn() });
      return () =>
        h(
          'div',
          props.items.map((item: any) => slots.default?.({ item })),
        );
    },
  },
}));
vi.mock('@/composables/usePublicResourceWrite', () => ({
  usePublicResourceWrite: () => ({ busy: ref(false), execute: mocks.execute }),
}));
vi.mock('@/composables/useForegroundRefresh', () => ({ useForegroundRefresh: vi.fn() }));
vi.mock('@/components/community/CommunityLayout.vue', () => ({
  default: {
    setup:
      (_: any, { slots }: any) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('@/components/community/CommunityNavigation.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible', 'title'],
    setup:
      (p: any, { slots }: any) =>
      () =>
        p.visible ? h('section', { class: 'test-modal' }, [h('h2', p.title), slots.default?.()]) : null,
  },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: vi.fn() } }));
import Moderation from './PublicResourceModeration.vue';
let app: ReturnType<typeof createApp>, host: HTMLElement;
const row = { publicId: 'public-id', title: '提交标题', kind: 'note', version: 1, revision: 1, authorName: '作者' };
const detail = {
  ...row,
  latestRevision: 1,
  publishedRevision: null,
  hasPending: true,
  removed: false,
  withdrawn: false,
  revisions: [{ revision: 1, title: '提交标题', body: '提交正文' }],
  actions: [],
};
const settle = async () => {
  for (let i = 0; i < 20; i++) await nextTick();
};
const button = (label: string, root: ParentNode = host) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!;
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(Moderation, { sectionOptions: [] }) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'zh-CN': { publicResources: publicResourcesZh, community: { feed: { moderation: '审核' } } } },
    }),
  );
  app.directive('auto-scrollbar', {});
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'root', role: 'root', adminContext: null, adminPreview: false });
  mocks.scope = reactive({ identity: 'root', eligible: true, caps: { aiEnabled: false }, ensure: vi.fn() });
  mocks.send.mockImplementation(async (entries: any[]) => ({
    items: entries.map((entry) => ({
      requestId: entry.requestId,
      state: 'success',
      result: { publicId: entry.key, version: 2 },
    })),
  }));
  mocks.lookup.mockResolvedValue({ found: false });
  mocks.get.mockImplementation(async (path: string) => (path === 'moderation' ? { items: [row], total: 1 } : detail));
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('切换到空队列后，旧详情的迟到响应不能恢复审核按钮', async () => {
  let resolve!: (v: any) => void;
  mocks.get.mockImplementation((path: string, query: any) =>
    path === 'moderation'
      ? Promise.resolve({ items: query.status === 'pending' ? [row] : [], total: query.status === 'pending' ? 1 : 0 })
      : new Promise((r) => {
          resolve = r;
        }),
  );
  await mount();
  [...host.querySelectorAll<HTMLElement>('[role=tab]')]
    .find((t) => t.textContent?.trim() === publicResourcesZh.removedQueue)!
    .click();
  await settle();
  resolve(detail);
  await settle();
  expect(host.textContent).not.toContain('提交正文');
  expect(button(publicResourcesZh.approve)).toBeUndefined();
});
it('批准直接执行，不打开确认框；冲突后按刷新得到的新版本再次操作', async () => {
  mocks.send.mockImplementationOnce(async (entries: any[]) => ({
    items: [{ requestId: entries[0].requestId, state: 'failed', code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' }],
  }));
  await mount();
  button(publicResourcesZh.approve).click();
  await settle();
  expect(host.querySelector('.test-modal')).toBeNull();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0][0]).toMatchObject({
    path: 'moderation/public-id/decide',
    body: { expectedVersion: 1, action: 'approve' },
  });
  expect(host.textContent).toContain(publicResourcesZh.flow.reviewChanged);
  mocks.get.mockImplementation(async (path: string) =>
    path === 'moderation'
      ? { items: [{ ...row, version: 2, revision: 2 }], total: 1 }
      : { ...detail, version: 2, latestRevision: 2, revisions: [{ revision: 2, title: '更新', body: '新正文' }] },
  );
  button(publicResourcesZh.approve).click();
  await settle();
  // First stale attempt is rejected, then its refreshed queue can be explicitly approved again.
  button(publicResourcesZh.approve).click();
  await settle();
  expect(mocks.send.mock.lastCall?.[0][0].body.expectedVersion).toBe(2);
});
it('勾选全部后批量批准；不通过仍须填写原因', async () => {
  const second = { ...row, publicId: 'second', title: '第二项' };
  mocks.get.mockImplementation(async (path: string) =>
    path === 'moderation' ? { items: [row, second], total: 2 } : detail,
  );
  await mount();
  (host.querySelector('.moderation-select-line [role=checkbox]') as HTMLElement).click();
  await settle();
  button('批准所选（2）').click();
  await settle();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0]).toHaveLength(2);
  expect(host.querySelector('.test-modal')).toBeNull();
  button(publicResourcesZh.reject).click();
  await settle();
  const modal = host.querySelector('.test-modal')!;
  expect(button(publicResourcesZh.reject, modal).disabled).toBe(true);
  const input = modal.querySelector('textarea') as HTMLTextAreaElement;
  input.value = '请移除私人信息';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  button(publicResourcesZh.reject, modal).click();
  await settle();
  expect(mocks.send.mock.lastCall?.[0][0].body).toMatchObject({ action: 'reject', reason: '请移除私人信息' });
});
it('进入代管立即清空 Root 审核数据，旧请求不能回填', async () => {
  await mount();
  mocks.user.adminPreview = true;
  mocks.scope.identity = 'root|preview';
  await settle();
  expect(host.textContent).not.toContain('提交正文');
  expect(host.querySelector('.test-modal')).toBeNull();
});

it('刷新不偷偷更新批量审批的所选版本，重看新版后才使用新版本', async () => {
  let changed = false;
  mocks.get.mockImplementation(async (path: string) =>
    path === 'moderation'
      ? { items: [{ ...row, version: changed ? 2 : 1, revision: changed ? 2 : 1 }], total: 1 }
      : {
          ...detail,
          version: changed ? 2 : 1,
          latestRevision: changed ? 2 : 1,
          revisions: [{ revision: changed ? 2 : 1, title: '提交标题', body: changed ? '新正文' : '提交正文' }],
        },
  );
  mocks.send.mockImplementation(async (entries: any[]) => {
    changed = true;
    return {
      items: entries.map((entry) =>
        entry.body.expectedVersion === 1
          ? { requestId: entry.requestId, state: 'failed', code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' }
          : { requestId: entry.requestId, state: 'success', result: { publicId: entry.key, version: 3 } },
      ),
    };
  });
  await mount();
  (host.querySelector('.moderation-select-line [role=checkbox]') as HTMLElement).click();
  await settle();
  button('批准所选（1）').click();
  await settle();
  expect(host.textContent).toContain(publicResourcesZh.flow.reviewChanged);
  button('批准所选（1）').click();
  await settle();
  expect(mocks.send.mock.lastCall?.[0][0].body.expectedVersion).toBe(1);
  (host.querySelector('.moderation-row') as HTMLButtonElement).click();
  await settle();
  button('批准所选（1）').click();
  await settle();
  expect(mocks.send.mock.lastCall?.[0][0].body.expectedVersion).toBe(2);
});
