import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import BRadio from './BRadio.vue';
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
});
function mount(props: { value?: string; disabled?: boolean; vertical?: boolean } = {}) {
  const state = reactive({ value: 'bottom', disabled: false, vertical: false, ...props });
  const change = vi.fn((v: string) => {
    state.value = v;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(BRadio, {
        ...state,
        variant: state.vertical ? 'default' : 'segment',
        ariaLabel: '新建笔记位置',
        options: [
          { value: 'top', label: '目录顶部' },
          { value: 'bottom', label: '目录底部' },
        ],
        'onUpdate:value': change,
      }),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { state, change, host, buttons: Array.from(host.querySelectorAll<HTMLButtonElement>('button')) };
}
describe('BRadio mutually exclusive choices', () => {
  it('用同组单选语义表达当前值，点击只更新一个选项', async () => {
    const { host, buttons, state } = mount();
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('新建笔记位置');
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    buttons[0].click();
    await nextTick();
    expect(state.value).toBe('top');
    expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1]);
  });
  it.each([false, true])('方向键及 Home/End 同时更新焦点和值，vertical=%s', async (vertical) => {
    const { buttons, state } = mount({ vertical });
    buttons[1].focus();
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    expect(state.value).toBe('top');
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await nextTick();
    expect(state.value).toBe('bottom');
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await nextTick();
    expect(state.value).toBe('top');
  });
  it('保存中/禁用状态不响应点击或键盘操作', () => {
    const { buttons, change } = mount({ disabled: true });
    buttons[0].click();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });
  it('无有效当前值仍有可访问的键盘入口', () => {
    const { buttons } = mount({ value: 'unknown' });
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1]);
  });
});
