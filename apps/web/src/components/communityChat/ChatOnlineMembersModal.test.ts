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

  it('游客汇总只占一行，结果高度不沿用在线总人数的骨架高度', async () => {
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
              onlineCount: 6,
              loading: loading.value,
              snapshot: snapshot.value,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    const loadingList = host.querySelector('.chat-online-members-modal__list') as HTMLElement;
    expect(host.querySelectorAll('.chat-online-members-modal__skeleton-row')).toHaveLength(6);
    expect(loadingList.style.minHeight).toBe('min(407px, 54vh)');

    snapshot.value = {
      onlineCount: 6,
      memberCount: 1,
      guestCount: 5,
      members: [{ alias: '菠萝', role: 'root', avatar: '', frameId: 'frame_celestial' }],
    };
    loading.value = false;
    await nextTick();

    const resultList = host.querySelector('.chat-online-members-modal__list') as HTMLElement;
    expect(host.querySelectorAll('.chat-online-members-modal__list li')).toHaveLength(2);
    expect(host.textContent).toContain('游客 5 人');
    expect(resultList.style.minHeight).toBe('min(131px, 54vh)');
  });

  it('空名单只显示紧凑空态，不额外渲染空列表占位', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ChatOnlineMembersModal, {
      visible: true,
      onlineCount: 0,
      snapshot: { onlineCount: 0, memberCount: 0, guestCount: 0, members: [] },
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    expect(host.querySelector('.chat-online-members-modal__list')).toBeNull();
    expect(host.querySelector('.chat-online-members-modal__empty')).not.toBeNull();
  });

  it('加载失败只显示紧凑错误态，不继承在线人数的列表高度', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ChatOnlineMembersModal, {
      visible: true,
      onlineCount: 7,
      error: true,
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    const errorState = host.querySelector('.chat-online-members-modal__state') as HTMLElement;
    expect(errorState).not.toBeNull();
    expect(errorState.style.minHeight).toBe('');
    expect(host.querySelector('.chat-online-members-modal__list')).toBeNull();
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

  it('打开期间在线心跳变化不改占位高度，重新打开才采用最新人数', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const onlineCount = ref(1);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(ChatOnlineMembersModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              onlineCount: onlineCount.value,
              loading: true,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    expect(host.querySelectorAll('.chat-online-members-modal__skeleton-row')).toHaveLength(1);
    onlineCount.value = 5;
    await nextTick();
    expect(host.querySelectorAll('.chat-online-members-modal__skeleton-row')).toHaveLength(1);

    visible.value = false;
    await nextTick();
    visible.value = true;
    await nextTick();
    expect(host.querySelectorAll('.chat-online-members-modal__skeleton-row')).toHaveLength(5);
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
