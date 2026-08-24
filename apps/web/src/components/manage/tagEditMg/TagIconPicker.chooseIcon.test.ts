import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import { getTagIconColor } from './tagIconColor.ts';

/**
 * 选图不是终点。用户挑完图往往还要调颜色、或者换一个再比较，而图标真正生效要点「保存标签」，
 * 所以点候选图之后：不关弹框、不弹「成功」提示，只更新待保存的值。
 * 这里连着把「先选图、再调色」这条路径一起验，防止以后有人把颜色 marker 写没了。
 */
const success = vi.fn();
const error = vi.fn();
const searchTagIcons = vi.fn();
const resolveTagIcon = vi.fn();

vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success, error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success, error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/tagIconApi.ts', () => ({ searchTagIcons, resolveTagIcon }));
vi.mock('@iconify/vue', () => ({ Icon: { name: 'IconStub', template: '<i />' } }));
// 弹框外壳换成透传容器：visible 仍由组件的 v-model 控制，便于断言它有没有被关掉
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible'],
    template: '<div class="modal-stub" :data-visible="String(visible)"><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BPopover.vue', () => ({
  default: { name: 'BPopoverStub', template: '<div><slot /><slot name="content" /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

const { default: TagIconPicker } = await import('./TagIconPicker.vue');

/** 带 currentColor 的最小 SVG：Iconify 返回的就是这种能被换色的图 */
const ICON_SVG = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>';

let cleanup: (() => void) | undefined;
const model = ref<string | undefined>('');

async function mountPicker() {
  searchTagIcons.mockResolvedValue({
    status: 200,
    data: { icons: ['mdi:home', 'mdi:book'], translatedQuery: 'home', page: 0, hasMore: false },
  });
  resolveTagIcon.mockResolvedValue({ status: 200, data: { iconUrl: ICON_SVG } });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(TagIconPicker, { tagName: '阅读', value: model.value, 'onUpdate:value': (v: string) => (model.value = v) }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

/** 打开选图弹框并等首屏搜索结果落地 */
async function openPicker(host: HTMLElement) {
  const smart = host.querySelector<HTMLElement>('.picker-smart');
  smart?.click();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

/** 点第 index 个候选图并等图标解析完成 */
async function clickIcon(host: HTMLElement, index = 0) {
  const options = host.querySelectorAll<HTMLElement>('.icon-option');
  options[index]?.click();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  model.value = '';
  success.mockReset();
  error.mockReset();
  searchTagIcons.mockReset();
  resolveTagIcon.mockReset();
});

describe('TagIconPicker 选图后的停留行为', () => {
  it('点候选图后弹框保持打开，不弹「已选择」提示', async () => {
    const host = await mountPicker();
    await openPicker(host);
    expect(host.querySelectorAll('.icon-option').length).toBe(2);

    await clickIcon(host);

    expect(host.querySelector('.modal-stub')?.getAttribute('data-visible')).toBe('true');
    expect(success).not.toHaveBeenCalled();
  });

  it('选中的图有 selected 描边，靠它而不是 toast 反馈', async () => {
    const host = await mountPicker();
    await openPicker(host);
    await clickIcon(host, 1);

    const options = [...host.querySelectorAll('.icon-option')];
    expect(options[1].classList.contains('selected')).toBe(true);
    expect(options[0].classList.contains('selected')).toBe(false);
  });

  it('选图只更新待保存的值，颜色 marker 写入以便后续调色', async () => {
    const host = await mountPicker();
    await openPicker(host);
    await clickIcon(host);

    expect(model.value).toContain('data-light-note-color');
    // 默认色也要留下 marker，否则接着点颜色时 selectIconColor 会因为读不到颜色而不生效
    expect(getTagIconColor(model.value || '')).toBe('currentColor');
  });

  it('选完图还能继续调颜色，弹框依旧不关', async () => {
    const host = await mountPicker();
    await openPicker(host);
    await clickIcon(host);

    // 点一个具体颜色（跳过「跟随默认」那一个）
    const colorButtons = [...host.querySelectorAll<HTMLElement>('.color-option')];
    colorButtons[1]?.click();
    await nextTick();

    expect(getTagIconColor(model.value || '')).toMatch(/^#[0-9A-F]{6}$/);
    expect(host.querySelector('.modal-stub')?.getAttribute('data-visible')).toBe('true');
    expect(success).not.toHaveBeenCalled();
  });

  it('图标解析失败仍然报错，且不留下选中态', async () => {
    const host = await mountPicker();
    await openPicker(host);
    resolveTagIcon.mockResolvedValue({ status: 500, msg: 'boom', data: {} });

    await clickIcon(host);

    expect(error).toHaveBeenCalled();
    expect([...host.querySelectorAll('.icon-option')].some((el) => el.classList.contains('selected'))).toBe(false);
  });

  it('AI 扩展失败时明确提示，并保留已经可用的免费搜索结果', async () => {
    const host = await mountPicker();
    await openPicker(host);
    expect(host.querySelectorAll('.icon-option').length).toBe(2);
    searchTagIcons.mockRejectedValueOnce({ status: 503, data: { code: 'AI_PROVIDER_ERROR' } });

    host.querySelector<HTMLElement>('.ai-search-row button')?.click();
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();

    expect(error).toHaveBeenCalledWith(zhCN.tagManage.iconAiSearchFailed);
    expect(host.querySelectorAll('.icon-option').length).toBe(2);
  });
});
