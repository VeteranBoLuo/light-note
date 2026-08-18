import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import type { CommunityChatOnlineMembersSnapshot } from '@/composables/useCommunityChatSocket';

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    template: '<section v-if="visible" class="modal-stub"><slot /></section>',
  },
}));

vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: { template: '<span class="avatar-frame-stub" />' },
}));

const { default: ChatOnlineMembersModal } = await import('./ChatOnlineMembersModal.vue');

describe('ChatOnlineMembersModal', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('按已知在线人数渲染等高骨架，并在名单返回后保持内容区最小高度', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const loading = ref(true);
    const snapshot = ref<CommunityChatOnlineMembersSnapshot | null>(null);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(ChatOnlineMembersModal, {
              visible: true,
              onlineCount: 3,
              loading: loading.value,
              snapshot: snapshot.value,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    expect(host.querySelectorAll('.chat-online-members-modal__skeleton-row')).toHaveLength(3);
    const loadingMinHeight = (host.querySelector('.chat-online-members-modal__list') as HTMLElement).style.minHeight;

    snapshot.value = {
      onlineCount: 3,
      memberCount: 3,
      guestCount: 0,
      members: [
        { alias: '成员一', role: 'user', avatar: '', frameId: '' },
        { alias: '成员二', role: 'user', avatar: '', frameId: '' },
        { alias: '成员三', role: 'root', avatar: '', frameId: '' },
      ],
    };
    loading.value = false;
    await nextTick();

    expect(host.querySelector('.chat-online-members-modal__skeleton')).toBeNull();
    expect(host.querySelectorAll('.chat-online-members-modal__list li')).toHaveLength(3);
    expect((host.querySelector('.chat-online-members-modal__list') as HTMLElement).style.minHeight).toBe(
      loadingMinHeight,
    );
  });

  it('大量在线成员时最多渲染七行骨架，避免无意义创建全部占位节点', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ChatOnlineMembersModal, {
      visible: true,
      onlineCount: 100,
      loading: true,
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    expect(host.querySelectorAll('.chat-online-members-modal__skeleton-row')).toHaveLength(7);
  });
});
