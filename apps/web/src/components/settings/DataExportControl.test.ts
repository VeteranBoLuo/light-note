import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { dataExportZh } from '@/i18n/locales/dataExport';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/http/request', () => ({ apiBasePost: api }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: () => false, postAndroidMessage: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<section v-if="visible"><slot/></section>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    template:
      '<select :value="value" @change="$emit(\'update:value\',$event.target.value)"><option v-for="o in options" :value="o.value">{{o.label}}</option></select>',
  },
}));
const { default: Control } = await import('./DataExportControl.vue');
let cleanup = () => {};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
afterEach(() => {
  cleanup();
  api.mockReset();
  localStorage.clear();
});
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const owner = ref('u');
  const app = createApp({ setup: () => () => h(Control, { owner: owner.value }) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh',
      messages: { zh: { dataExport: dataExportZh, common: { loading: '加载中' } } },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const click = async (text: string) => {
    const b = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    expect(b).toBeTruthy();
    b!.click();
    await flush();
  };
  return { host, owner, click };
}
const result = (data: unknown) => ({ status: 200, data });
const task = (status = 'running') => ({
  id: 't',
  status,
  stage: 'notes',
  total: 3,
  completed: 1,
  failed: 0,
  options: { types: ['notes', 'bookmarks'], noteFormat: 'html', includeImages: true },
  expiresAt: new Date(Date.now() + (status === 'expired' ? -1 : 1) * 86400000).toISOString(),
  canDownload: status === 'completed',
});
const summary = (lastBackup: unknown = null, extra: Record<string, unknown> = {}) => ({
  notes: 2,
  bookmarks: 1,
  files: 0,
  fileBytes: 0,
  filesFit: true,
  lastBackup,
  ...extra,
});
/** 按接口路径返回：latest 走传入的任务，summary 走清单，其余交给 handlers。 */
function routes(latest: unknown, handlers: Record<string, unknown> = {}, sum: unknown = summary()) {
  api.mockImplementation(async (url: string) => {
    const action = url.split('/').pop()!;
    if (action in handlers) return result(handlers[action]);
    if (action === 'summary') return result(sum);
    if (action === 'latest') return result(latest);
    return result(null);
  });
}
const calls = (action: string) => api.mock.calls.filter(([u]) => u.endsWith('/' + action));
describe('data backup panel', () => {
  it('backs up everything in one click and remembers the preset', async () => {
    routes(null, { create: task() });
    const { host, click } = mount();
    await flush();
    expect(host.textContent).toContain('还没有备份过');
    expect(host.textContent).toContain('共 3 项资料');
    await click('备份全部资料');
    expect(calls('create')[0][1]).toMatchObject({
      types: ['notes', 'bookmarks', 'files'],
      noteFormat: 'original',
      includeImages: true,
    });
    expect(host.textContent).toContain('备份中');
    expect(JSON.parse(localStorage.getItem('light-note:data-export:u')!).types).toEqual([
      'notes',
      'bookmarks',
      'files',
    ]);
  });
  it('customizes content from the existing dialog, including extraction-only exports', async () => {
    routes(null);
    const { host, click } = mount();
    await flush();
    await click('自定义内容');
    const checkbox = (label: string) =>
      [...host.querySelectorAll<HTMLElement>('[role=checkbox]')].find(
        (element) => element.textContent?.trim() === label,
      )!;
    expect(checkbox('笔记').getAttribute('aria-checked')).toBe('true');
    expect(checkbox('文件').getAttribute('aria-checked')).toBe('true');
    expect(checkbox('资料提取表').getAttribute('aria-checked')).toBe('false');
    const select = host.querySelector('select')!;
    select.value = 'markdown';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    for (const label of ['笔记', '书签', '文件']) {
      checkbox(label).click();
      await flush();
    }
    expect([...host.querySelectorAll('button')].find((b) => b.textContent?.includes('开始备份'))?.disabled).toBe(true);
    checkbox('资料提取表').click();
    await flush();
    await click('开始备份');
    expect(calls('create')[0][1]).toMatchObject({ types: ['extractions'] });
  });
  it('opens the options with an empty result instead of a download', async () => {
    routes(null, { create: { empty: true } });
    const { host, click } = mount();
    await flush();
    await click('备份全部资料');
    expect(host.textContent).toContain('所选内容为空');
    expect(host.textContent).not.toContain('下载备份');
  });
  it('restores a running backup and cancels it', async () => {
    routes(task(), { cancel: task('cancelled') });
    const { host, click } = mount();
    await flush();
    expect(host.textContent).toContain('已打包 1 / 3 项');
    await click('取消备份');
    expect(host.textContent).toContain('还没有备份过');
  });
  it('offers the download while the file is kept and the last backup after it expires', async () => {
    routes(task('completed'));
    const first = mount();
    await flush();
    expect(first.host.textContent).toContain('已完成');
    expect(first.host.textContent).toContain('下载备份');
    cleanup();

    routes(
      task('expired'),
      {},
      summary({ at: '2026-10-28T08:00:00.000Z', total: 3, types: ['notes'], status: 'completed', count: 1 }),
    );
    const second = mount();
    await flush();
    expect(second.host.textContent).toContain('上次备份');
    expect(second.host.textContent).toContain('（自定义内容）');
    expect(second.host.textContent).toContain('再备份一次');
  });
  it('reloads the summary once a running backup finishes', async () => {
    let latest: unknown = task();
    api.mockImplementation(async (url: string) => {
      if (url.endsWith('/summary')) return result(summary());
      return result(latest);
    });
    vi.useFakeTimers();
    try {
      const { host } = mount();
      await flush();
      expect(calls('summary')).toHaveLength(1);
      latest = task('completed');
      await vi.advanceTimersByTimeAsync(3100);
      await flush();
      expect(host.textContent).toContain('已完成');
      expect(calls('summary')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('leaves files out of one-click backup when they cannot be packed at once', async () => {
    routes(null, { create: task() }, summary(null, { files: 1616, fileBytes: 12 * 1024 ** 3, filesFit: false }));
    const { host, click } = mount();
    await flush();
    expect(host.textContent).toContain('超出服务器一次能打包的大小');
    expect(host.textContent).toContain('去云空间');
    await click('自定义内容');
    const files = [...host.querySelectorAll<HTMLElement>('[role=checkbox]')].find(
      (el) => el.textContent?.trim() === '文件',
    )!;
    expect(files.getAttribute('aria-checked')).toBe('false');
    expect(files.getAttribute('aria-disabled')).toBe('true');
    await click('关闭');
    await click('备份笔记和书签');
    expect(calls('create')[0][1]).toMatchObject({ types: ['notes', 'bookmarks'], noteFormat: 'original' });
  });
  it('ignores a late response after switching accounts', async () => {
    let resolve!: (v: any) => void;
    api
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValue(result(null));
    const { owner, host } = mount();
    owner.value = 'other';
    await flush();
    resolve(result(task('completed')));
    await flush();
    expect(host.textContent).not.toContain('下载备份');
  });
});
