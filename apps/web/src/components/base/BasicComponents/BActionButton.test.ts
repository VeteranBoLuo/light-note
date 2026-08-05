import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import BActionButton from './BActionButton.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

/** 把按钮放进一个「整行可点击」的容器里，模拟表格行 / 卡片这类真实用法 */
function mountInClickableRow(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const onAction = vi.fn();
  const onRowClick = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h('div', { class: 'row', onClick: onRowClick }, [h(BActionButton, { ...props, onClick: onAction })]);
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onAction, onRowClick };
}

describe('BActionButton', () => {
  /*
   * 这个组件从来只出现在可点击容器里(表格行、卡片)。点「编辑 / 删除」必须只做那件事,
   * 不能顺带触发容器的点击 —— 用户管理里点删除会连带弹出用户详情就是这条漏了。
   * 修复只能落在组件内部: 父组件写 @click.stop 拦不住自定义事件。
   */
  it.each([['edit'], ['delete']])('%s 的点击不冒泡到外层可点击容器', async (action) => {
    const { host, onAction, onRowClick } = mountInClickableRow({ action, tooltip: '操作' });

    host.querySelector<HTMLElement>('.b-action-button')!.click();
    await nextTick();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it.each([
    ['Enter', 'enter'],
    ['空格', ' '],
  ])('%s 键触发操作且同样不冒泡', async (_name, key) => {
    const { host, onAction, onRowClick } = mountInClickableRow({ action: 'edit', tooltip: '编辑' });

    host
      .querySelector<HTMLElement>('.b-action-button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await nextTick();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('保留 role/tabindex/aria-label,可键盘聚焦且读屏可识别', () => {
    const { host } = mountInClickableRow({ action: 'delete', tooltip: '删除该用户' });
    const el = host.querySelector<HTMLElement>('.b-action-button')!;

    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-label')).toBe('删除该用户');
  });
});
