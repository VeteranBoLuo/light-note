import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';

vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { template: '<span><slot /></span>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

const { default: BookmarkCapabilityBadge } = await import('./BookmarkCapabilityBadge.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('BookmarkCapabilityBadge 交互契约', () => {
  it('鼠标与键盘激活都向 click 监听器传递真实事件', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onClick = vi.fn();
    const app = createApp({
      render: () =>
        h(BookmarkCapabilityBadge, {
          type: 'snapshot',
          label: '网页存档',
          tooltip: '查看网页存档',
          onClick,
        }),
    });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const trigger = host.querySelector<HTMLElement>('[role="button"]');
    trigger?.click();
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onClick.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent);
    expect(onClick.mock.calls[1]?.[0]).toBeInstanceOf(KeyboardEvent);
  });
});
