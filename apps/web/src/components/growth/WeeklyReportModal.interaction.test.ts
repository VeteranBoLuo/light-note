import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  user: null as any,
  report: vi.fn(),
  render: vi.fn(),
  folder: vi.fn(),
  upload: vi.fn(),
  record: vi.fn(),
}));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/growthApi', () => ({ getWeeklyReport: mocks.report }));
vi.mock('@/api/cloudFileUploadApi', () => ({ ensureCloudFolder: mocks.folder, uploadCloudFile: mocks.upload }));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.record }));
vi.mock('@/utils/canvasExport', () => ({ prepareMaskedIconsForCanvas: vi.fn() }));
vi.mock('html2canvas', () => ({ default: mocks.render }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/composables/useMobileLayout', async () => {
  const { ref } = await import('vue');
  return { useMobileLayout: () => ref(false) };
});
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: defineComponent({
    props: ['visible'],
    setup:
      (props, { slots }) =>
      () =>
        props.visible ? h('section', [slots.title?.(), slots.default?.(), slots.footer?.()]) : null,
  }),
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  }),
}));
vi.mock('./WeeklyReportPoster.vue', () => ({
  default: defineComponent({
    props: ['report'],
    setup(props, { expose }) {
      let root: HTMLElement;
      expose({
        get root() {
          return root;
        },
      });
      return () =>
        h(
          'article',
          {
            'data-period': props.report.kind || 'history',
            ref: (el: any) => {
              root = el;
            },
          },
          props.report.start,
        );
    },
  }),
}));
vi.mock('./WeeklyReportInsights.vue', () => ({
  default: defineComponent({
    props: ['report'],
    setup: (props) => () =>
      h('aside', { 'data-testid': 'items' }, props.report.items?.map((item: any) => item.title).join(',')),
  }),
}));
import WeeklyReportModal from './WeeklyReportModal.vue';

const reply = (start: string, title = start) => ({
  status: 200,
  data: {
    notes: 1,
    period: { kind: 'current', start, end: start, dataEnd: start, elapsedDays: 1, inProgress: true },
    items: [{ type: 'note', id: title, title }],
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let app: ReturnType<typeof createApp> | undefined;
let host: HTMLElement;
let model: { visible: boolean };
async function mount(snapshot: any = null) {
  host = document.createElement('div');
  document.body.append(host);
  model = reactive({ visible: true });
  app = createApp({ render: () => h(WeeklyReportModal, { visible: model.visible, snapshot }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {}, missingWarn: false, fallbackWarn: false }));
  app.mount(host);
  await nextTick();
}
async function settled() {
  await vi.waitFor(() => expect(host.querySelector('[data-testid="items"]')).not.toBeNull());
}
function button(key: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.includes(key));
  if (!found) throw new Error(`Missing button: ${key}`);
  return found;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = reactive({ id: 'a', adminContext: null, alias: 'A' });
  mocks.report.mockResolvedValue(reply('2026-10-19', 'private-a'));
  mocks.folder.mockResolvedValue({ id: 'folder-1' });
  mocks.upload.mockResolvedValue({ fileId: 'file-1' });
  mocks.render.mockResolvedValue({ toBlob: (done: (blob: Blob) => void) => done(new Blob(['png'])) });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WeeklyReportModal 数据归属与异步操作', () => {
  it('快速切换周期时迟到的旧响应不会覆盖新周期', async () => {
    const first = deferred<any>();
    mocks.report.mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply('2026-10-12', 'last-week'));
    await mount();
    host.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    await settled();
    expect(host.textContent).toContain('last-week');
    first.resolve(reply('2026-10-19', 'stale-current'));
    await nextTick();
    await nextTick();
    expect(host.textContent).not.toContain('stale-current');
  });
  it('首次失败可重试；切换失败保留原内容与原选中周期', async () => {
    mocks.report.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain('growth.wrRetry'));
    button('growth.wrRetry').click();
    await settled();
    mocks.report.mockRejectedValueOnce(new Error('offline'));
    host.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    await vi.waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(3));
    await nextTick();
    await nextTick();
    expect(host.textContent).toContain('private-a');
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('wrPeriodCurrent');
  });
  it('切换账号立即移除私密内容，关闭后迟到响应也不能复活内容', async () => {
    await mount();
    await settled();
    const next = deferred<any>();
    mocks.report.mockReturnValueOnce(next.promise);
    mocks.user.id = 'b';
    await nextTick();
    expect(host.textContent).not.toContain('private-a');
    expect(mocks.report).toHaveBeenCalledTimes(2);
    model.visible = false;
    await nextTick();
    next.resolve(reply('2026-10-19', 'private-b'));
    await nextTick();
    await nextTick();
    expect(host.textContent).not.toContain('private-b');
  });
  it('历史通知不会被不同一周的实时数据替换', async () => {
    await mount(reply('2026-09-28', 'historical-snapshot').data);
    await settled();
    await nextTick();
    expect(host.textContent).toContain('historical-snapshot');
    expect(host.textContent).not.toContain('private-a');
    expect(host.querySelector('article')?.dataset.period).toBe('history');
  });
  it('关闭期间切换账号，重开不会复用原账号的通知快照', async () => {
    await mount(reply('2026-09-28', 'private-snapshot-a').data);
    await settled();
    model.visible = false;
    await nextTick();
    mocks.user.id = 'b';
    await nextTick();
    mocks.report.mockResolvedValueOnce(reply('2026-10-19', 'private-b'));
    model.visible = true;
    await nextTick();
    expect(host.textContent).not.toContain('private-snapshot-a');
    await vi.waitFor(() => expect(host.textContent).toContain('private-b'));
  });
  it('导出期间周期保持稳定，下载的文件名属于导出时的周报', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() });
    const rendered = deferred<any>();
    mocks.render.mockReturnValueOnce(rendered.promise);
    await mount();
    await settled();
    button('growth.wrExport').click();
    host.querySelectorAll<HTMLElement>('[role="tab"]')[1].click();
    expect(mocks.report).toHaveBeenCalledTimes(1);
    rendered.resolve({ toBlob: (done: any) => done(new Blob(['image'])) });
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    const file = vi.mocked(URL.createObjectURL).mock.calls[0][0] as File;
    expect(file.name).toContain('2026-10-19');
  });
  it('等待文件夹时切换账号，不把旧账号海报上传到新账号', async () => {
    const folder = deferred<any>();
    mocks.folder.mockReturnValueOnce(folder.promise);
    await mount();
    await settled();
    button('growth.wrSaveToCloud').click();
    await vi.waitFor(() => expect(mocks.folder).toHaveBeenCalledOnce());
    mocks.report.mockResolvedValueOnce(reply('2026-10-19', 'private-b'));
    mocks.user.id = 'b';
    await nextTick();
    await vi.waitFor(() => expect(host.textContent).toContain('private-b'));
    expect(host.textContent).not.toContain('private-a');
    folder.resolve({ id: 'old-folder' });
    await nextTick();
    await nextTick();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('匹配上周的通知以实时数据替换，并可以保存 PNG 到云空间', async () => {
    const live = reply('2026-10-12', 'live-last');
    live.data.period.kind = 'last';
    mocks.report.mockResolvedValue(live);
    await mount(reply('2026-10-12', 'snapshot-last').data);
    await settled();
    await vi.waitFor(() => expect(host.textContent).toContain('live-last'));
    expect(host.querySelector('article')?.dataset.period).toBe('last');
    button('growth.wrSaveToCloud').click();
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    const [file, folderId] = mocks.upload.mock.calls[0];
    expect(file).toMatchObject({ name: 'growth.wrFileName-2026-10-12.png', type: 'image/png' });
    expect(folderId).toBe('folder-1');
  });
  it.each(['unsupported', 'NotAllowedError', 'NotSupportedError'])(
    '文件分享不可用时下载同一张 PNG：%s',
    async (reason) => {
      const share = vi.fn().mockRejectedValue(new DOMException('unavailable', reason));
      vi.stubGlobal('navigator', { share, canShare: () => reason !== 'unsupported' });
      await mount();
      await settled();
      button('growth.wrShare').click();
      await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );
  it('取消系统分享不下载、不记录分享成功，操作按钮恢复', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await mount();
    await settled();
    button('growth.wrShare').click();
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    await nextTick();
    await nextTick();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(button('growth.wrShare').disabled).toBe(false);
  });
});
