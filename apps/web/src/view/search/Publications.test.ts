import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { publicResourcesZh } from '@/i18n/locales/publicResources';
const mocks = vi.hoisted(() => ({
  scope: {} as any,
  get: vi.fn(),
  preview: vi.fn(),
  prepare: vi.fn(),
  send: vi.fn(),
  alert: vi.fn(),
  info: vi.fn(),
  push: vi.fn(),
}));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
vi.mock('vue-router', async (load) => ({
  ...(await load<any>()),
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: vi.fn() }));
vi.mock('@/composables/useForegroundRefresh', () => ({ useForegroundRefresh: vi.fn() }));
vi.mock('@/api/publicResources', () => ({
  publicGet: (...args: any[]) => mocks.get(...args),
  previewPublication: (...args: any[]) => mocks.preview(...args),
  preparePublications: (...args: any[]) => mocks.prepare(...args),
  sendPublicResourceBatch: (...args: any[]) => mocks.send(...args),
  publicOperation: () => Object.assign(vi.fn(), { resolve: vi.fn() }),
  resolvePublications: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: (...args: any[]) => mocks.alert(...args), destroy: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { info: (...args: any[]) => mocks.info(...args) },
}));
vi.mock('@/components/base/BasicComponents/BVirtualList.vue', () => ({
  default: {
    props: ['items'],
    setup: (props: any, { slots, expose }: any) => {
      expose({ scrollToTop: vi.fn(), captureScrollAnchor: () => null, restoreScrollAnchor: vi.fn() });
      return () =>
        h(
          'div',
          props.items.map((item: any) => slots.default?.({ item })),
        );
    },
  },
}));
import Publications from './Publications.vue';
let app: ReturnType<typeof createApp>, host: HTMLElement;
const rows = Array.from({ length: 3 }, (_, i) => ({
  kind: 'note',
  sourceId: String(i),
  title: '笔记' + i,
  updatedAt: '2026-10-22T10:00:00Z',
  sourceUnavailable: false,
  publication: null,
}));
const settle = async () => {
  for (let i = 0; i < 25; i++) await nextTick();
};
const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.trim() === text)!;
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(Publications) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'zh-CN': { publicResources: publicResourcesZh, common: { search: '搜索' } } },
    }),
  );
  app.directive('auto-scrollbar', {});
  app.component('svg-icon', { render: () => h('span') });
  app.mount(host);
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = reactive({
    identity: 'a',
    eligible: true,
    loaded: true,
    caps: { enabled: true, submissionsEnabled: true },
    ensure: vi.fn(),
  });
  mocks.get.mockResolvedValue({
    items: rows,
    totals: { all: 3, unpublished: 3 },
    total: 3,
    page: 1,
    pageSize: 1000,
    hasMore: false,
  });
  mocks.preview.mockImplementation(async (_kind, id) => ({
    kind: 'note',
    title: '笔记' + id,
    body: '预览正文' + id,
    fingerprint: 'fp' + id,
    expectedVersion: 0,
  }));
  mocks.prepare.mockImplementation(async (items) => ({
    items: items.map((item: any) => ({ ...item, fingerprint: 'fp' + item.sourceId, expectedVersion: 0, code: '' })),
  }));
  mocks.send.mockImplementation(async (items) => ({
    items: items.map((item: any) => ({
      requestId: item.requestId,
      state: 'success',
      result: { publicId: item.body.sourceId, version: 1 },
    })),
  }));
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('首批取1000项元信息；勾选同步预览，提交前保留原列表且只作一次短确认', async () => {
  await mount();
  expect(mocks.get.mock.calls[0]).toEqual(['workspace', expect.objectContaining({ page: 1, pageSize: 1000 })]);
  expect(mocks.preview).not.toHaveBeenCalled();
  (host.querySelector('.publication-check [role=checkbox]') as HTMLElement).click();
  await settle();
  expect(host.textContent).toContain('预览正文0');
  button('提交审核（1）').click();
  await settle();
  expect(mocks.alert).toHaveBeenCalledTimes(1);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.publication-row-shell')).toHaveLength(3);
  expect(host.textContent).toContain('预览正文0');
  mocks.alert.mock.calls[0][0].onOk();
  await settle();
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll('.publication-row-shell')).toHaveLength(3);
  expect(host.textContent).toContain('已提交1项');
  expect(host.textContent).not.toContain('正在校验');
});
it('未提交项留在原列表，查看后可返回完整资源，不另建结果页面', async () => {
  mocks.prepare.mockImplementationOnce(async (items) => ({
    items: items.map((item: any) => ({
      ...item,
      code: item.sourceId === '1' ? 'PUBLIC_RESOURCE_TEXT_ONLY' : '',
      fingerprint: 'fp' + item.sourceId,
      expectedVersion: 0,
    })),
  }));
  await mount();
  (host.querySelector('.publications-loaded [role=checkbox]') as HTMLElement).click();
  await settle();
  button('提交审核（3）').click();
  await settle();
  expect(mocks.info).not.toHaveBeenCalled();
  mocks.alert.mock.calls[0][0].onOk();
  await settle();
  expect(host.textContent).toContain('2项已完成，1项未完成');
  button('查看未完成项').click();
  await settle();
  expect(host.querySelectorAll('.publication-row-shell')).toHaveLength(1);
  expect(host.textContent).toContain(publicResourcesZh.textOnly);
  button('返回全部资源').click();
  await settle();
  expect(host.querySelectorAll('.publication-row-shell')).toHaveLength(3);
  expect(button('提交审核（1）')).toBeDefined();
});
it('取消确认不投稿；切号使原确认回调失效', async () => {
  await mount();
  (host.querySelector('.publication-check [role=checkbox]') as HTMLElement).click();
  await settle();
  button('提交审核（1）').click();
  await settle();
  const intent = mocks.alert.mock.calls[0][0];
  mocks.scope.eligible = false;
  mocks.scope.identity = 'b';
  await settle();
  intent.onOk();
  await settle();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('预览正文0');
});
it.each([true, false])('区分未重新送审与新提交，不把复用记录算作提交成功：全部复用=%s', async (allReused) => {
  mocks.send.mockImplementation(async (items) => ({
    items: items.map((item: any, index: number) => ({
      requestId: item.requestId,
      state: allReused || index > 0 ? 'reused' : 'success',
      result: { publicId: item.body.sourceId, version: 1, reused: allReused || index > 0 },
    })),
  }));
  await mount();
  (host.querySelector('.publications-loaded [role=checkbox]') as HTMLElement).click();
  await settle();
  button('提交审核（3）').click();
  await settle();
  mocks.alert.mock.calls[0][0].onOk();
  await settle();
  const feedback = host.querySelector('.publications-actions-copy')!;
  if (allReused) {
    expect(feedback.querySelector('strong')?.textContent).toBe('内容未变化，未重新送审');
    expect(feedback.textContent).toContain('仍沿用之前的提交记录，提交时间保持不变。');
    expect(feedback.classList.contains('is-success')).toBe(false);
    expect(mocks.info).toHaveBeenCalledExactlyOnceWith(publicResourcesZh.flow.unchangedNotice, 6);
  } else {
    expect(feedback.querySelector('strong')?.textContent).toBe('新提交1项，2项内容未变化、未重新送审');
    expect(mocks.info).not.toHaveBeenCalled();
  }
  expect(feedback.textContent).not.toContain('已提交3项');
});
