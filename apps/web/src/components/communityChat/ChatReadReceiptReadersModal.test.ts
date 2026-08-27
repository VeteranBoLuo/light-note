import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'zh-CN' },
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(':')}` : key),
  }),
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible', 'title'],
    emits: ['update:visible'],
    template: '<section v-if="visible" class="modal-stub" :data-title="title"><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading', 'type'],
    template: '<button type="button" :disabled="disabled" :data-loading="loading"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: { props: ['title'], template: '<span class="loading-stub">{{ title }}</span>' },
}));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: {
    props: ['src', 'frameId'],
    template: '<span class="avatar-stub" :data-src="src" :data-frame="frameId" />',
  },
}));

const { default: ChatReadReceiptReadersModal } = await import('./ChatReadReceiptReadersModal.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountModal(props: Record<string, unknown>) {
  const events = { retry: 0, refresh: 0, loadMore: 0 };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatReadReceiptReadersModal, {
    visible: true,
    ...props,
    onRetry: () => (events.retry += 1),
    onRefresh: () => (events.refresh += 1),
    onLoadMore: () => (events.loadMore += 1),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, events };
}

describe('ChatReadReceiptReadersModal', () => {
  it('展示 Root 可见的成员公开身份、首次已读时间和加载更多入口', async () => {
    const mounted = mountModal({
      total: 2,
      hasMore: true,
      items: [
        {
          userPublicId: '11111111-1111-4111-8111-111111111111',
          communityId: 'ln_8K2M7A',
          displayName: '薄荷',
          avatar: '/avatar/member-1',
          frameId: 'frame_mint',
          firstSeenAt: '2026-08-27T10:01:02.000Z',
        },
      ],
    });

    expect(mounted.host.textContent).toContain('communityChat.readReceipt.readersSummary:2');
    expect(mounted.host.textContent).toContain('薄荷');
    expect(mounted.host.textContent).toContain('@ln_8K2M7A');
    expect(mounted.host.querySelector('.avatar-stub')?.getAttribute('data-src')).toBe('/avatar/member-1');
    expect(mounted.host.querySelector('.avatar-stub')?.getAttribute('data-frame')).toBe('frame_mint');
    expect(mounted.host.querySelector('.chat-read-receipt-readers-modal__seen')).toBeNull();

    const buttons = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button'));
    buttons.find((button) => button.textContent?.includes('readersLoadMore'))?.click();
    buttons.find((button) => button.textContent?.includes('common.refresh'))?.click();
    await nextTick();
    expect(mounted.events.loadMore).toBe(1);
    expect(mounted.events.refresh).toBe(1);
  });

  it('加载、错误、空名单与暂停状态都有明确文字和重试入口', async () => {
    const loading = mountModal({ loading: true, total: 0 });
    expect(loading.host.textContent).toContain('communityChat.readReceipt.readersLoading');
    cleanup?.();

    const failed = mountModal({ error: true, enabled: false, total: 3 });
    expect(failed.host.textContent).toContain('communityChat.readReceipt.readersPaused');
    expect(failed.host.textContent).toContain('communityChat.readReceipt.readersLoadFailed');
    failed.host.querySelector<HTMLButtonElement>('.is-error button')?.click();
    await nextTick();
    expect(failed.events.retry).toBe(1);
    cleanup?.();

    const empty = mountModal({ items: [], total: 0 });
    expect(empty.host.textContent).toContain('communityChat.readReceipt.readersEmpty');
    expect(empty.host.querySelector('.is-empty')).toBeTruthy();
  });
});
