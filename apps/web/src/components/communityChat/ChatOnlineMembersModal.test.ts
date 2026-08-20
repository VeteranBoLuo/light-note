import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import type { CommunityChatOnlineMembersSnapshot } from '@/composables/useCommunityChatSocket';
import { AVATAR_FRAME_ARTWORK } from '@/config/avatarFrameArtwork';

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
const source = readFileSync(resolve(process.cwd(), 'src/components/communityChat/ChatOnlineMembersModal.vue'), 'utf8');

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
        { alias: '成员一', role: 'user', avatar: '', frameId: 'frame_celestial' },
        { alias: '成员二', role: 'user', avatar: '', frameId: '' },
        { alias: '成员三', role: 'root', avatar: '', frameId: '' },
      ],
    };
    loading.value = false;
    await nextTick();

    expect(host.querySelector('.chat-online-members-modal__skeleton')).toBeNull();
    expect(host.querySelectorAll('.chat-online-members-modal__list li')).toHaveLength(3);
    const firstMember = host.querySelector('.chat-online-members-modal__list li');
    const avatarSlot = firstMember?.querySelector('.chat-online-members-modal__avatar-slot');
    expect(avatarSlot?.querySelector('.avatar-frame-stub')).not.toBeNull();
    expect(avatarSlot?.nextElementSibling?.classList.contains('chat-online-members-modal__copy')).toBe(true);
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

  it('头像框只由固定横向槽位承载，业务样式不穿透改写内部图片', () => {
    expect(source).toContain('class="chat-online-members-modal__avatar-slot"');
    expect(source).not.toMatch(/chat-online-members-modal__avatar\s+:deep\(/);

    const columnWidth = Number(source.match(/--chat-online-members-avatar-column:\s*(\d+)px/)?.[1]);
    const maxArtSize = Math.max(...Object.values(AVATAR_FRAME_ARTWORK).map((artwork) => artwork.artSize));
    const requiredWidth = Math.ceil((maxArtSize * 38) / 64) + 6;
    expect(columnWidth).toBeGreaterThanOrEqual(requiredWidth);
  });
});
