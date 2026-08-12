import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityChatAuthorProfile, CommunityChatMessage, CommunityChatOwnProfile } from '@/api/communityChatApi';

const mocks = vi.hoisted(() => ({
  getPublic: vi.fn(),
  getAchievements: vi.fn(),
  getOwn: vi.fn(),
  updateOwn: vi.fn(),
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatMessageAuthorProfile: mocks.getPublic,
  getCommunityChatMessageAuthorAchievements: mocks.getAchievements,
  getCommunityChatOwnProfile: mocks.getOwn,
  updateCommunityChatOwnProfile: mocks.updateOwn,
}));

const { useCommunityChatProfile } = await import('./useCommunityChatProfile');

function publicProfile(name: string): CommunityChatAuthorProfile {
  return {
    name,
    role: 'member',
    avatar: '',
    frameId: null,
    frameRarity: null,
    level: 2,
    levelName: '书生',
    title: null,
    bio: '',
    communityTenureLabel: null,
    achievements: [{ key: 'level_1', group: 'level' }],
    achievementCount: 1,
    hasMoreAchievements: false,
  };
}

function chatMessage(publicId: string, isOwn = false): CommunityChatMessage {
  return {
    publicId,
    content: 'hello',
    status: 'active',
    createdAt: '2026-08-11T00:00:00.000Z',
    editedAt: null,
    recalledAt: null,
    recalledByAdmin: false,
    canViewRecalledContent: false,
    canRecall: false,
    recallExpired: false,
    canDelete: false,
    recallDeadlineAt: null,
    isOwn,
    images: [],
    mentions: [],
    likeCount: 0,
    likedByMe: false,
    likePreview: [],
    author: publicProfile('member'),
    reply: null,
  };
}

function ownProfile(revision = 0): CommunityChatOwnProfile {
  return {
    bio: '公开简介',
    showCommunityTenure: true,
    featuredAchievementKeys: ['level_1'],
    revision,
    usesDefaultFeaturedAchievements: false,
    availableAchievements: [
      { key: 'level_1', group: 'level' },
      { key: 'streak_7', group: 'checkin' },
    ],
    publicPreview: { ...publicProfile('me'), bio: '公开简介' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCommunityChatProfile', () => {
  it('同一消息的公开名片在短缓存期内复用，不重复请求接口', async () => {
    mocks.getPublic.mockResolvedValue({ data: publicProfile('薄荷') });
    const state = useCommunityChatProfile();
    const message = chatMessage('message-1');

    state.openForMessage(message);
    await vi.waitFor(() => expect(state.profile.value?.name).toBe('薄荷'));
    state.closeProfile();
    state.openForMessage(message);

    expect(state.profile.value?.name).toBe('薄荷');
    expect(mocks.getPublic).toHaveBeenCalledTimes(1);
  });

  it('快速切换成员时丢弃先发后到的旧请求', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mocks.getPublic
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ data: publicProfile('新成员') });
    const state = useCommunityChatProfile();

    state.openForMessage(chatMessage('message-old'));
    state.openForMessage(chatMessage('message-new'));
    await vi.waitFor(() => expect(state.profile.value?.name).toBe('新成员'));
    resolveFirst({ data: publicProfile('旧成员') });
    await Promise.resolve();
    await Promise.resolve();

    expect(state.profile.value?.name).toBe('新成员');
    expect(state.profileError.value).toBe(false);
  });

  it('兼容旧后端全量公开成就，摘要只保留三项且查看全部不再请求缺失路由', async () => {
    const achievements = [
      { key: 'streak_1', group: 'checkin' },
      { key: 'streak_7', group: 'checkin' },
      { key: 'note_10', group: 'create' },
      { key: 'todo_20', group: 'action' },
    ];
    mocks.getPublic.mockResolvedValue({
      data: {
        ...publicProfile('旧接口成员'),
        achievements,
        achievementCount: achievements.length,
      },
    });
    const state = useCommunityChatProfile();

    state.openForMessage(chatMessage('legacy-message'));
    await vi.waitFor(() => expect(state.profile.value?.name).toBe('旧接口成员'));

    expect(state.profile.value?.achievements).toHaveLength(3);
    expect(state.profile.value?.hasMoreAchievements).toBe(true);
    expect(state.allAchievements.value).toEqual(achievements);
    await state.loadAllAchievements();
    expect(mocks.getAchievements).not.toHaveBeenCalled();
  });

  it('自己的名片直接复用可编辑成就，并在保存后更新公开预览与版本', async () => {
    mocks.getOwn.mockResolvedValue({ data: ownProfile(1) });
    mocks.updateOwn.mockResolvedValue({ data: ownProfile(2) });
    const state = useCommunityChatProfile();

    state.openOwnProfile();
    await vi.waitFor(() => expect(state.ownProfile.value?.revision).toBe(1));
    await state.loadAllAchievements();
    expect(mocks.getAchievements).not.toHaveBeenCalled();
    expect(state.allAchievements.value).toHaveLength(2);

    await state.saveOwnProfile({
      bio: '公开简介',
      showCommunityTenure: true,
      featuredAchievementKeys: ['level_1'],
      baseRevision: 1,
    });

    expect(state.ownProfile.value?.revision).toBe(2);
    expect(state.profile.value?.name).toBe('me');
  });

  it('身份切换时清空公开与个人缓存，并忽略旧账号稍后返回的保存结果', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    mocks.getPublic.mockResolvedValue({ data: publicProfile('旧账号可见成员') });
    mocks.getOwn.mockResolvedValue({ data: ownProfile(1) });
    mocks.updateOwn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const state = useCommunityChatProfile();

    state.openForMessage(chatMessage('message-before-switch'));
    await vi.waitFor(() => expect(state.profile.value?.name).toBe('旧账号可见成员'));
    state.openOwnProfile();
    await vi.waitFor(() => expect(state.ownProfile.value?.revision).toBe(1));
    const pendingSave = state.saveOwnProfile({
      bio: '旧账号资料',
      showCommunityTenure: true,
      featuredAchievementKeys: ['level_1'],
      baseRevision: 1,
    });

    state.closeProfile({ reset: true, clearIdentityCache: true });
    resolveSave({ data: ownProfile(2) });
    await pendingSave;

    expect(state.profile.value).toBeNull();
    expect(state.ownProfile.value).toBeNull();
    expect(state.ownSaving.value).toBe(false);

    state.openForMessage(chatMessage('message-before-switch'));
    await vi.waitFor(() => expect(state.profile.value?.name).toBe('旧账号可见成员'));
    expect(mocks.getPublic).toHaveBeenCalledTimes(2);
  });
});
