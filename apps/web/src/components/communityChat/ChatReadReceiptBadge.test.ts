import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(':')}` : key),
  }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="svg-icon-stub" />' },
}));

const { default: ChatReadReceiptBadge } = await import('./ChatReadReceiptBadge.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountBadge(props: Record<string, unknown>) {
  let openCount = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatReadReceiptBadge, {
    ...props,
    onOpen: () => {
      openCount += 1;
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    host,
    get openCount() {
      return openCount;
    },
  };
}

describe('ChatReadReceiptBadge', () => {
  it('Root 看到聚合数量并可打开已读成员明细', async () => {
    const mounted = mountBadge({ enabled: true, readCount: 12 });
    expect(mounted.host.textContent).toContain('communityChat.readReceipt.count:12');
    expect(mounted.host.querySelector('[role="tooltip"]')).toBeNull();
    mounted.host.querySelector<HTMLButtonElement>('button')?.click();
    await nextTick();
    expect(mounted.openCount).toBe(1);
  });

  it('Root 尚无聚合快照时使用 0 人回退，不展示采集状态文案', () => {
    const mounted = mountBadge({ enabled: true });
    expect(mounted.host.textContent).toContain('communityChat.readReceipt.count:0');
    expect(mounted.host.textContent).not.toContain('communityChat.readReceipt.enabled');
  });

  it('功能暂停时保留明确的历史统计状态', () => {
    const root = mountBadge({ enabled: false, readCount: 7 });
    expect(root.host.textContent).toContain('communityChat.readReceipt.countPaused:7');
    expect(root.host.querySelector('[role="tooltip"]')).toBeNull();
  });
});
