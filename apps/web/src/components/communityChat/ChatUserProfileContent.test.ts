import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommunityChatAuthorProfile, CommunityChatOwnProfile } from '@/api/communityChatApi';
import zhCN from '@/i18n/locales/zh-CN';

const profileContentSource = readFileSync(
  resolve(process.cwd(), 'src/components/communityChat/ChatUserProfileContent.vue'),
  'utf8',
);

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { props: ['src', 'size'], template: '<span class="svg-icon-stub" />' },
}));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({
  default: { props: ['frameId', 'src', 'size'], template: '<span class="avatar-frame-stub" />' },
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
    communityTenureLabel: '加入轻笺约 2 个月',
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
  it('佩戴头像框时按真实外径占位，未佩戴时继续使用普通头像盒', () => {
    const framedHost = mountProfile({ profile: profile({ frameId: 'frame_dragon' }) });
    expect(framedHost.querySelector('.chat-profile-content__avatar')?.classList.contains('is-framed')).toBe(true);
    cleanup?.();
    cleanup = undefined;

    const plainHost = mountProfile({ profile: profile({ frameId: null }) });
    expect(plainHost.querySelector('.chat-profile-content__avatar')?.classList.contains('is-framed')).toBe(false);
    expect(profileContentSource).toMatch(
      /\.chat-profile-content__avatar\.is-framed\s*\{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*0 0 auto;/,
    );
  });

  it('仅为炫彩与传说头像框展示稀有度胶囊', () => {
    const rareHost = mountProfile({ profile: profile({ frameRarity: 'rare' }) });
    expect(rareHost.querySelector('.chat-profile-content__rarity')).toBeNull();
    cleanup?.();
    cleanup = undefined;

    const epicHost = mountProfile({ profile: profile({ frameRarity: 'epic' }) });
    expect(epicHost.querySelector('.chat-profile-content__rarity')?.textContent).toBe(
      zhCN.communityChat.profile.rarity.epic,
    );
    cleanup?.();
    cleanup = undefined;

    const legendaryHost = mountProfile({ profile: profile({ frameRarity: 'legendary' }) });
    expect(legendaryHost.querySelector('.chat-profile-content__rarity')?.textContent).toBe(
      zhCN.communityChat.profile.rarity.legendary,
    );
  });

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

  it('官方成员直接提供举报按钮，但不提供屏蔽动作', () => {
    const onReport = vi.fn();
    const host = mountProfile({
      profile: profile({ role: 'official' }),
      authenticated: true,
      onReport,
    });

    expect(host.textContent).toContain(zhCN.communityChat.report.action);
    expect(host.textContent).not.toContain(zhCN.communityChat.blocks.action);
    expect(host.textContent).not.toContain(zhCN.communityChat.replyAction);
    expect(host.textContent).not.toContain(zhCN.communityChat.mentionAction);
    findButton(host, zhCN.communityChat.report.action)?.click();
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('查看其他成员名片时直接提供屏蔽和举报，不再提供回复、提及或更多菜单', () => {
    const onBlock = vi.fn();
    const onReport = vi.fn();
    const host = mountProfile({
      profile: profile(),
      authenticated: true,
      onBlock,
      onReport,
    });

    expect(host.textContent).toContain(zhCN.communityChat.blocks.action);
    expect(host.textContent).toContain(zhCN.communityChat.report.action);
    expect(host.textContent).not.toContain(zhCN.communityChat.replyAction);
    expect(host.textContent).not.toContain(zhCN.communityChat.mentionAction);
    expect(host.querySelector('.b-action-menu-anchor')).toBeNull();
    findButton(host, zhCN.communityChat.blocks.action)?.click();
    findButton(host, zhCN.communityChat.report.action)?.click();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('只有存在更多成就时才请求全部成就子视图', async () => {
    const onLoadAllAchievements = vi.fn();
    const host = mountProfile({ profile: profile(), onLoadAllAchievements });

    findButton(host, zhCN.communityChat.profile.viewAllAchievements.replace('{count}', '2'))?.click();
    await nextTick();

    expect(onLoadAllAchievements).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(zhCN.communityChat.profile.allAchievements);
  });

  it('兼容旧接口全量成就，精选区域最多展示三项并保留查看全部入口', () => {
    const achievements = [
      { key: 'streak_1', group: 'checkin' },
      { key: 'streak_7', group: 'checkin' },
      { key: 'note_10', group: 'create' },
      { key: 'todo_20', group: 'action' },
    ];
    const host = mountProfile({
      profile: profile({ achievements, achievementCount: 4, hasMoreAchievements: false }),
    });

    expect(host.textContent).toContain(zhCN.growth.achName.streak_1);
    expect(host.textContent).toContain(zhCN.growth.achName.streak_7);
    expect(host.textContent).toContain(zhCN.growth.achName.note_10);
    expect(host.textContent).not.toContain(zhCN.growth.achName.todo_20);
    expect(host.textContent).toContain(zhCN.communityChat.profile.viewAllAchievements.replace('{count}', '4'));
  });

  it('公开预览直接复用当前公开名片，不依赖个人配置接口成功', async () => {
    const onRequestOwn = vi.fn();
    const host = mountProfile({
      profile: profile(),
      isOwn: true,
      authenticated: true,
      ownError: true,
      onRequestOwn,
    });

    findButton(host, zhCN.communityChat.profile.previewAction)?.click();
    await nextTick();

    expect(host.textContent).toContain(zhCN.communityChat.profile.previewDescription);
    expect(host.textContent).toContain('薄荷');
    expect(host.textContent).not.toContain(zhCN.communityChat.profile.ownLoadFailed);
    expect(onRequestOwn).not.toHaveBeenCalled();
  });

  it('编辑名片时成就卡片可打开大图详情，且不误触发保存', async () => {
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

    const availableAchievement = host.querySelector<HTMLElement>('.chat-profile-content__available-item');
    expect(availableAchievement).not.toBeNull();
    availableAchievement?.click();
    await nextTick();

    expect(document.body.textContent).toContain(zhCN.communityChat.profile.achievementDetailTitle);
    expect(document.body.textContent).toContain(zhCN.growth.achName.streak_7);
    expect(document.body.textContent).toContain(zhCN.communityChat.profile.achievementUnlocked);
    expect(onSave).not.toHaveBeenCalled();
  });
});
