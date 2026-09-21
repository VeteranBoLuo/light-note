import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { dataExportZh } from '@/i18n/locales/dataExport';
const api = vi.hoisted(() => vi.fn());
vi.mock('@/http/request', () => ({ apiBasePost: api }));
vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: () => false, postAndroidMessage: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<section v-if="visible"><slot/></section>' },
}));
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
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  canDownload: status === 'completed',
});
describe('unified export control', () => {
  it('submits and remembers the original-format option', async () => {
    api.mockResolvedValue(result(null));
    const { host, click } = mount();
    await flush();
    await click('导出数据');
    const select = host.querySelector('select')!;
    expect(select.textContent).toContain('保留原始格式');
    select.value = 'original';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(host.textContent).toContain('富文本导出为 HTML');
    await click('开始导出');
    expect(api).toHaveBeenCalledWith('/api/user/dataExports/create', expect.objectContaining({ noteFormat: 'original' }), { silent: true });
    expect(Object.values(localStorage)).toEqual(expect.arrayContaining([expect.stringContaining('original')]));
  });
  it('defaults to notes and bookmarks and disables empty selection', async () => {
    api.mockResolvedValue(result(null));
    const { host, click } = mount();
    await flush();
    await click('导出数据');
    let checks = host.querySelectorAll<HTMLElement>('[role=checkbox]');
    expect([...checks].map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'false']);
    checks[0].click();
    await flush();
    checks = host.querySelectorAll('[role=checkbox]');
    checks[1].click();
    await flush();
    expect([...host.querySelectorAll('button')].find((b) => b.textContent?.includes('开始导出'))?.disabled).toBe(true);
  });
  it('submits one job, remembers settings and closes without cancelling', async () => {
    api.mockImplementation(async (url) => result(url.endsWith('/create') ? task() : null));
    const { host, click } = mount();
    await flush();
    await click('导出数据');
    await click('开始导出');
    expect(host.textContent).toContain('正在导出');
    expect(JSON.parse(localStorage.getItem('light-note:data-export:u')!).types).toEqual(['notes', 'bookmarks']);
    await click('关闭');
    expect(api.mock.calls.filter(([u]) => u.endsWith('/cancel'))).toHaveLength(0);
    expect(api.mock.calls.filter(([u]) => u.endsWith('/create'))).toHaveLength(1);
  });
  it('shows empty result without a download', async () => {
    api.mockImplementation(async (url) => result(url.endsWith('/create') ? { empty: true } : null));
    const { host, click } = mount();
    await flush();
    await click('导出数据');
    await click('开始导出');
    expect(host.textContent).toContain('所选内容为空');
    expect(host.textContent).not.toContain('下载导出文件');
  });
  it('restores, cancels, and shows partial failures', async () => {
    api.mockImplementation(async (url) => result(url.endsWith('/cancel') ? task('cancelled') : task()));
    const { host, click } = mount();
    await flush();
    await click('查看导出进度');
    await click('取消导出');
    expect(host.textContent).toContain('已取消');
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
    expect(host.textContent).not.toContain('下载导出文件');
  });
});
