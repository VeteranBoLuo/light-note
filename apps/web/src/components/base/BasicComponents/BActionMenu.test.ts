import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import BActionMenu from './BActionMenu.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.querySelectorAll('.b-action-menu-panel').forEach((panel) => panel.remove());
  vi.clearAllTimers();
  vi.useRealTimers();
});

function mountMenu(overrides: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const props = reactive({
    items: [
      { key: 'rename', label: '重命名' },
      { key: 'divider', divider: true },
      { key: 'delete', label: '删除', danger: true },
    ],
    triggers: ['hover', 'contextmenu'],
    openDelay: 100,
    closeDelay: 80,
    disabled: false,
    ...overrides,
  });
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h(
          BActionMenu,
          { ...props, onSelect, onOpenChange },
          { default: () => h('div', { class: 'test-row' }, '标签') },
        );
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    props,
    onSelect,
    onOpenChange,
    anchor: host.querySelector<HTMLElement>('.b-action-menu-anchor')!,
  };
}

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await nextTick();
  await nextTick();
}

describe('BActionMenu', () => {
  it('整行悬浮达到延迟后打开，移入菜单时保持打开并返回触发来源', async () => {
    vi.useFakeTimers();
    const { anchor, onSelect, onOpenChange } = mountMenu();

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    await advance(99);
    expect(document.querySelector('.b-action-menu-panel')).toBeNull();

    await advance(1);
    const panel = document.querySelector<HTMLElement>('.b-action-menu-panel:not(.b-action-menu-leave-active)');
    expect(panel?.dataset.source).toBe('hover');
    expect(onOpenChange).toHaveBeenCalledWith(true, 'hover');

    anchor.dispatchEvent(new MouseEvent('mouseleave'));
    panel?.dispatchEvent(new MouseEvent('mouseenter'));
    await advance(100);
    expect(document.querySelector('.b-action-menu-panel:not(.b-action-menu-leave-active)')).not.toBeNull();

    panel?.querySelector<HTMLButtonElement>('button')?.click();
    await nextTick();
    expect(onSelect).toHaveBeenCalledWith('rename', 'hover');
  });

  it('禁用时立即收起，并阻止拖拽期间再次打开', async () => {
    vi.useFakeTimers();
    const { anchor, props, onOpenChange } = mountMenu();

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    await advance(100);
    expect(document.querySelector('.b-action-menu-panel:not(.b-action-menu-leave-active)')).not.toBeNull();

    props.disabled = true;
    await nextTick();
    expect(document.querySelector('.b-action-menu-panel:not(.b-action-menu-leave-active)')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'hover');

    anchor.dispatchEvent(new MouseEvent('mouseenter'));
    await advance(120);
    expect(document.querySelector('.b-action-menu-panel:not(.b-action-menu-leave-active)')).toBeNull();
  });

  it('保留右键触发，阻止浏览器默认菜单并返回右键来源', async () => {
    const { anchor, onSelect } = mountMenu();
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 80,
    });

    anchor.dispatchEvent(event);
    await nextTick();
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    const panel = document.querySelector<HTMLElement>('.b-action-menu-panel:not(.b-action-menu-leave-active)');
    expect(panel?.dataset.source).toBe('contextmenu');
    panel?.querySelectorAll<HTMLButtonElement>('.b-action-menu__item')[1]?.click();
    await nextTick();
    expect(onSelect).toHaveBeenCalledWith('delete', 'contextmenu');
  });

  it('点击菜单浮层高于抽屉，并标记为抽屉内部的外置交互层', async () => {
    const { anchor, onSelect } = mountMenu({ triggers: ['click'], zIndex: 800 });

    anchor.click();
    await nextTick();
    await nextTick();

    const panel = document.querySelector<HTMLElement>('.b-action-menu-panel:not(.b-action-menu-leave-active)');
    expect(panel?.style.zIndex).toBe('800');
    expect(panel?.hasAttribute('data-drawer-keep-open')).toBe(true);
    panel?.querySelector<HTMLButtonElement>('.b-action-menu__item')?.click();
    expect(onSelect).toHaveBeenCalledWith('rename', 'click');
  });

  it('支持 Shift+F10 打开、方向键切换和 Escape 关闭', async () => {
    const { anchor } = mountMenu();

    anchor.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();

    const buttons = document
      .querySelector<HTMLElement>('.b-action-menu-panel:not(.b-action-menu-leave-active)')!
      .querySelectorAll<HTMLButtonElement>('.b-action-menu__item');
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await nextTick();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });
});
