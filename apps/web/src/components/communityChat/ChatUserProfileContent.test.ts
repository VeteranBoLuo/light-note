import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityChatAuthorProfile, CommunityChatOwnProfile } from '@/api/communityChatApi';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { props: ['src', 'size'], template: '<span class="svg-icon-stub" />' },
}));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: { props: ['frameId', 'src', 'size'], template: '<span class="avatar-frame-stub" />' },
}));
vi.mock('@/components/base/BasicComponents/BActionMenu.vue', () => ({
  default: {
    props: ['items'],
    emits: ['select'],
    template:
      '<div class="action-menu-stub"><slot /><span v-for="item in items" :key="item.key" class="action-item-stub">{{ item.label }}</span></div>',
  },
}));

const { default: ChatUserProfileContent } = await import('./ChatUserProfileContent.vue');

function profile(overrides: Partial<CommunityChatAuthorProfile> = {}): CommunityChatAuthorProfile {
  return {
    name: '薄荷',
    role: 'member',
    avatar: '',
    frameId: 'frame_streak_seed',
    frameRarity: 'rare',
    level: 2,
    levelName: '书生',
    title: null,
    bio: '喜欢整理知识',
    communityTenureLabel: '加入社区约 2 个月',
    achievements: [{ key: 'level_1', group: 'level' }],
    achievementCount: 2,
    hasMoreAchievements: true,
    ...overrides,
  };
}

function ownProfile(): CommunityChatOwnProfile {
  return {
    bio: '喜欢整理知识',
    showCommunityTenure: true,
    featuredAchievementKeys: ['level_1'],
    revision: 3,
    usesDefaultFeaturedAchievements: false,
    availableAchievements: [
      { key: 'level_1', group: 'level' },
      { key: 'streak_7', group: 'checkin' },
    ],
    publicPreview: profile(),
  };
}

function findButton(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountProfile(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatUserProfileContent, props);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('ChatUserProfileContent', () => {
  it('自己的名片按字素校验 60 字简介，并携带 revision 保存', async () => {
    const onSave = vi.fn();
    const host = mountProfile({
      profile: profile(),
      ownProfile: ownProfile(),
      isOwn: true,
      authenticated: true,
      onSave,
    });

    findButton(host, zhCN.communityChat.profile.editAction)?.click();
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).not.toBeNull();

    if (!textarea) return;
    textarea.value = '😀'.repeat(61);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(findButton(host, zhCN.communityChat.profile.saveAction)?.disabled).toBe(true);

    const validBio = '👨‍👩‍👧‍👦'.repeat(60);
    textarea.value = validBio;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const saveButton = findButton(host, zhCN.communityChat.profile.saveAction);
    expect(saveButton?.disabled).toBe(false);
    saveButton?.click();

    expect(onSave).toHaveBeenCalledWith({
      bio: validBio,
      showCommunityTenure: true,
      featuredAchievementKeys: ['level_1'],
      baseRevision: 3,
    });
  });

  it('访客仅显示登录参与动作，公开资料不会暴露账号标识', () => {
    const onLogin = vi.fn();
    const host = mountProfile({ profile: profile(), authenticated: false, onLogin });

    expect(host.textContent).toContain(zhCN.communityChat.profile.visitorHint);
    findButton(host, zhCN.communityChat.guestLoginAction)?.click();
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('user_id');
  });

  it('官方成员仍可被举报，但不提供屏蔽动作', () => {
    const host = mountProfile({
      profile: profile({ role: 'official' }),
      authenticated: true,
      canReply: true,
      canMention: true,
    });

    expect(host.textContent).toContain(zhCN.communityChat.report.action);
    expect(host.textContent).not.toContain(zhCN.communityChat.blocks.action);
  });

  it('只有存在更多成就时才请求全部成就子视图', async () => {
    const onLoadAllAchievements = vi.fn();
    const host = mountProfile({ profile: profile(), onLoadAllAchievements });

    findButton(host, zhCN.communityChat.profile.viewAllAchievements.replace('{count}', '2'))?.click();
    await nextTick();

    expect(onLoadAllAchievements).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(zhCN.communityChat.profile.allAchievements);
  });
});
