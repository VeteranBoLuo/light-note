import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 原生下载进度条的三个阶段。
 *
 * 真机上出过一次「进度冲到某个位置又退回来重新计算」：排队阶段（pending，还拿不到
 * content-length，percent = -1）当时和「总量未知」共用那个 35% 滑块动画，滑块会先冲到轨道
 * 右侧，几百毫秒后拿到 content-length 切成真实百分比（往往只有几个点）从左边重画。
 *
 * 所以这里锁的是「排队阶段不得画出任何已完成的量」，以及滑块仍然保留给真正总量未知的情况。
 */

/* 必须是真正的 ref：组件模板里写的是 `downloads.length`，靠 Vue 对 setup 返回值的自动
   unwrap 才拿得到数组；换成普通对象 `{value:[]}` 会让 v-if 恒假，整个组件不渲染。 */
const downloads = ref<unknown[]>([]);

vi.mock('@/composables/useAndroidDownloadProgress', () => ({
  useAndroidDownloadProgress: () => ({ downloads }),
}));

const { default: AndroidDownloadProgress } = await import('./AndroidDownloadProgress.vue');

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(AndroidDownloadProgress) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

const progress = (overrides: Record<string, unknown>) => ({
  id: '42',
  fileName: 'light-note-1.0.1.apk',
  status: 'running',
  bytesDownloaded: 0,
  totalBytes: -1,
  percent: -1,
  ...overrides,
});

beforeEach(() => {
  downloads.value = [];
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('原生下载进度条 · 阶段视觉', () => {
  it('排队阶段只让轨道呼吸，不画滑块也不画宽度', async () => {
    downloads.value = [progress({ status: 'pending' })];
    const host = mount();
    await nextTick();

    const track = host.querySelector('.native-download-track')!;
    expect(track.classList.contains('is-pending')).toBe(true);
    // 关键：排队阶段不能带滑块动画，否则它会被读成进度、随后显得在回退
    expect(track.classList.contains('is-indeterminate')).toBe(false);
    expect(track.querySelector('span')!.getAttribute('style')).toBeNull();
    expect(host.textContent).toContain(zhCN.common.downloadConnecting);
  });

  it('已在下载但总量未知时才用滑块', async () => {
    downloads.value = [progress({ status: 'running', percent: -1 })];
    const host = mount();
    await nextTick();

    const track = host.querySelector('.native-download-track')!;
    expect(track.classList.contains('is-indeterminate')).toBe(true);
    expect(track.classList.contains('is-pending')).toBe(false);
    expect(host.textContent).toContain(zhCN.common.downloadingFile);
  });

  it('拿到百分比后按真实宽度填充，且不再有任何动画态', async () => {
    downloads.value = [progress({ status: 'running', percent: 3, totalBytes: 1766657, bytesDownloaded: 53000 })];
    const host = mount();
    await nextTick();

    const track = host.querySelector('.native-download-track')!;
    expect(track.classList.contains('is-pending')).toBe(false);
    expect(track.classList.contains('is-indeterminate')).toBe(false);
    // 从 3% 自然涨上去，而不是承接一个已经滑到右侧的滑块
    expect(track.querySelector('span')!.getAttribute('style')).toContain('width: 3%');
    expect(host.textContent).toContain('3%');
  });

  it('失败态仍是整条红色，不被排队/不确定态的分支吃掉', async () => {
    downloads.value = [progress({ status: 'failed', percent: -1 })];
    const host = mount();
    await nextTick();

    const track = host.querySelector('.native-download-track')!;
    expect(track.classList.contains('is-failed')).toBe(true);
    expect(track.classList.contains('is-pending')).toBe(false);
    expect(track.classList.contains('is-indeterminate')).toBe(false);
    // 宽度交给样式表的 .is-failed{width:100%}，内联 style 会把红条压成 0 宽
    expect(track.querySelector('span')!.getAttribute('style')).toBeNull();
  });

  it('完成态收口到 100%', async () => {
    downloads.value = [progress({ status: 'success', percent: 100, totalBytes: 1766657 })];
    const host = mount();
    await nextTick();

    const track = host.querySelector('.native-download-track')!;
    expect(track.querySelector('span')!.getAttribute('style')).toContain('width: 100%');
    expect(host.textContent).toContain(zhCN.common.downloadFinished);
  });
});
