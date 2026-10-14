import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import ExcelPreview from './ExcelPreview.vue';

const renderer = vi.hoisted(() => ({ selectCell: vi.fn(), resize: vi.fn() }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@vue-office/excel/lib/v3/vue-office-excel.mjs', () => ({
  default: {
    props: ['options', 'src'],
    emits: ['rendered', 'error'],
    setup(props: any, { expose, emit }: any) {
      expose(renderer);
      props.options.transformData([
        { name: '汇总', rows: { 0: { cells: { 0: { text: '预算' }, 1: { text: '其他' } } } } },
        { name: '明细', rows: { 99: { cells: { 25: { text: '预算明细' } } } } },
      ]);
      emit('rendered');
      return () => h('div', { class: 'renderer' });
    },
  },
}));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement('div');
  document.body.append(host);
  const preview = ref<InstanceType<typeof ExcelPreview>>();
  const src = ref('one.xlsx');
  const app = createApp({ render: () => h(ExcelPreview, { ref: preview, src: src.value }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', missingWarn: false, fallbackWarn: false, messages: {} }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await nextTick();
  await preview.value!.openFind();
  await vi.advanceTimersByTimeAsync(1);
  const input = host.querySelector('input')!;
  const type = async (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    await vi.advanceTimersByTimeAsync(120);
    await nextTick();
  };
  const key = (key: string, options: KeyboardEventInit = {}) =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
  return { host, preview, src, input, type, key };
}

describe('ExcelPreview find bar', () => {
  it('定位匹配、跨表循环、Enter/Shift+Enter 导航；无匹配和清空查询不跳转', async () => {
    vi.useFakeTimers();
    const { host, type, key } = await mount();
    await type('预算');
    expect(renderer.selectCell).toHaveBeenLastCalledWith(0, 0, 0);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('1 / 2');
    key('Enter');
    await nextTick();
    expect(renderer.selectCell).toHaveBeenLastCalledWith(1, 99, 25);
    expect(host.textContent).toContain('明细 · Z100');
    key('Enter');
    await nextTick();
    expect(renderer.selectCell).toHaveBeenLastCalledWith(0, 0, 0);
    key('Enter', { shiftKey: true });
    await nextTick();
    expect(renderer.selectCell).toHaveBeenLastCalledWith(1, 99, 25);
    renderer.selectCell.mockClear();
    await type('不存在');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('findNoMatch');
    await type('');
    expect(renderer.selectCell).not.toHaveBeenCalled();
  });
  it('Escape 只关闭查找、忽略输入法与长按；关闭取消待执行查找，换文件重置状态', async () => {
    vi.useFakeTimers();
    const { host, preview, src, input, key } = await mount();
    key('Escape', { isComposing: true });
    key('Escape', { repeat: true });
    expect(host.querySelector('[role="search"]')).not.toBeNull();
    input.value = '预算';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const background = vi.fn();
    document.addEventListener('keydown', background);
    key('Escape');
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
    document.removeEventListener('keydown', background);
    expect(background).not.toHaveBeenCalled();
    expect(renderer.selectCell).not.toHaveBeenCalled();
    expect(host.querySelector('[role="search"]')).toBeNull();
    await preview.value!.openFind();
    await nextTick();
    expect(renderer.selectCell).toHaveBeenLastCalledWith(0, 0, 0);
    src.value = 'two.xlsx';
    await nextTick();
    expect(host.querySelector('[role="search"]')).toBeNull();
    await preview.value!.openFind();
    expect(host.querySelector('input')?.value).toBe('');
  });
});
