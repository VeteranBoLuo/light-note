import { describe, expect, it, vi } from 'vitest';
import {
  __test__,
  getCommunityChatMessageAuthorAchievements,
  getCommunityChatMessageAuthorProfile,
  getCommunityChatOwnProfile,
  getCommunityChatPresenceMemberAvatar,
  updateCommunityChatOwnProfile,
} from './communityChatProfileService.js';
import { issueCommunityChatPresenceAvatarToken } from '../communityChat/presenceAvatarToken.js';

const PUBLIC_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
  SESSION_SECRET: 'community-chat-profile-test-secret-0001',
};

function authorRow(overrides = {}) {
  return {
    authorUserId: 'user-2',
    authorAccountRole: 'user',
    authorName: '薄荷',
    authorRole: 'member',
    authorHasAvatar: 1,
    authorExp: 15000,
    authorTitleId: null,
    authorFrameId: 'frame_streak_seed',
    authorRegisteredAt: '2026-07-01T00:00:00.000Z',
    bio: '喜欢整理知识',
    showCommunityTenure: 1,
    featuredAchievements: null,
    profileRevision: 0,
    ...overrides,
  };
}

describe('communityChatProfileService', () => {
  it('在线成员头像短地址只允许 Root，并在读取时重新解析加密票据', async () => {
    const token = issueCommunityChatPresenceAvatarToken('online-user-1', { env: PUBLIC_ENV });
    const db = {
      query: vi.fn(async (sql, params) => {
        expect(String(sql)).toContain('SELECT head_picture AS source');
        expect(params).toEqual(['online-user-1']);
        return [[{ source: 'data:image/webp;base64,UklGRg==' }], []];
      }),
    };

    await expect(
      getCommunityChatPresenceMemberAvatar({
        user: { id: 'member-1', role: 'user' },
        token,
        env: PUBLIC_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_ROOT_REQUIRED', status: 403 });
    await expect(
      getCommunityChatPresenceMemberAvatar({
        user: { id: 'root-1', role: 'root' },
        token,
        env: PUBLIC_ENV,
        db,
      }),
    ).resolves.toEqual({ source: 'data:image/webp;base64,UklGRg==' });
  });

  it('公开名片复核屏蔽与个人删除，并只通过短地址返回头像', async () => {
    const messagePublicId = '11111111-1111-4111-8111-111111111111';
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members WHERE user_id')) {
          return [[{ role: 'member', status: 'active' }], []];
        }
        if (text.includes('JOIN community_chat_rooms room')) {
          expect(text).toContain('community_chat_blocks');
          expect(text).toContain('community_chat_message_deletions');
          expect(text).toContain('community_chat_member_profiles');
          expect(text).toContain('account.create_time AS authorRegisteredAt');
          expect(params).toEqual([messagePublicId, 'general', 'viewer-1', 'viewer-1']);
          return [[authorRow()], []];
        }
        if (text.includes('FROM user_achievements')) return [[], []];
        if (text.includes('FROM points_log')) {
          return [
            [
              { ref: 'streak_7', latestId: 12 },
              { ref: 'note_10', latestId: 11 },
            ],
            [],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const profile = await getCommunityChatMessageAuthorProfile({
      user: { id: 'viewer-1', role: 'user' },
      messagePublicId,
      locale: 'zh-CN',
      env: PUBLIC_ENV,
      db,
    });

    expect(profile).toMatchObject({
      name: '薄荷',
      avatar: `/api/community-chat/messages/${messagePublicId}/author-avatar`,
      frameId: 'frame_streak_seed',
      frameRarity: 'rare',
      bio: '喜欢整理知识',
      achievements: [
        { key: 'streak_7', group: 'checkin' },
        { key: 'note_10', group: 'create' },
        { key: 'level_10', group: 'level' },
      ],
      achievementCount: 4,
      hasMoreAchievements: true,
    });
    expect(profile.communityTenureLabel).toMatch(/^加入轻笺约 \d+ 个月$/);
    expect(profile).not.toHaveProperty('authorUserId');
    expect(profile).not.toHaveProperty('exp');
  });

  it('全部成就接口仍以同一消息可见性解析作者，但不返回账号标识', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('JOIN community_chat_rooms room')) return [[authorRow({ authorHasAvatar: 0 })], []];
        if (text.includes('FROM user_achievements')) return [[], []];
        if (text.includes('FROM points_log')) return [[{ ref: 'streak_7', latestId: 2 }], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const result = await getCommunityChatMessageAuthorAchievements({
      user: { id: 'visitor-1', role: 'visitor' },
      messagePublicId: 'message-1',
      env: PUBLIC_ENV,
      db,
    });
    expect(result).toEqual({
      achievements: [
        { key: 'streak_7', group: 'checkin' },
        { key: 'level_5', group: 'level' },
        { key: 'level_10', group: 'level' },
      ],
      achievementCount: 3,
    });
    expect(result).not.toHaveProperty('userId');
  });

  it('个人名片读取区分未配置默认精选与显式空精选', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM user account')) {
          return [
            [
              authorRow({
                authorUserId: 'root-1',
                authorAccountRole: 'root',
                authorExp: 50_000,
                featuredAchievements: '[]',
              }),
            ],
            [],
          ];
        }
        if (text.includes('FROM user_achievements')) return [[], []];
        if (text.includes('FROM points_log')) return [[{ ref: 'streak_7', latestId: 2 }], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const result = await getCommunityChatOwnProfile({
      user: { id: 'root-1', role: 'root' },
      env: PUBLIC_ENV,
      db,
    });
    expect(result).toMatchObject({
      featuredAchievementKeys: [],
      usesDefaultFeaturedAchievements: false,
      revision: 0,
      publicPreview: { achievements: [], achievementCount: 4, hasMoreAchievements: true },
    });
  });

  it('保存个人名片在事务中校验永久解锁成就并递增 revision', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT revision')) return [[], []];
        if (text.includes('SELECT account.role AS authorAccountRole')) {
          return [[{ authorAccountRole: 'root', authorExp: 50_000 }], []];
        }
        if (text.includes('FROM user_achievements')) return [[], []];
        if (text.includes('FROM points_log')) return [[{ ref: 'streak_7', latestId: 2 }], []];
        if (text.includes('INSERT INTO community_chat_member_profiles')) return [{ affectedRows: 1 }, []];
        throw new Error(`unexpected transaction query: ${sql}`);
      }),
    };
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM user account')) {
          return [
            [
              authorRow({
                authorUserId: 'root-1',
                authorAccountRole: 'root',
                authorExp: 50_000,
                featuredAchievements: '["streak_7"]',
                bio: '公开简介',
                profileRevision: 1,
              }),
            ],
            [],
          ];
        }
        if (text.includes('FROM user_achievements')) return [[], []];
        if (text.includes('FROM points_log')) return [[{ ref: 'streak_7', latestId: 2 }], []];
        throw new Error(`unexpected pool query: ${sql}`);
      }),
    };

    const result = await updateCommunityChatOwnProfile({
      user: { id: 'root-1', role: 'root' },
      bio: '  公开\n简介  ',
      showCommunityTenure: true,
      featuredAchievementKeys: ['streak_7'],
      baseRevision: 0,
      env: PUBLIC_ENV,
      db,
    });

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    const insertCall = connection.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO'));
    expect(insertCall?.[1]).toEqual(['root-1', '公开 简介', 1, '["streak_7"]', 1]);
    expect(result).toMatchObject({ bio: '公开简介', revision: 1, featuredAchievementKeys: ['streak_7'] });
  });

  it('永久成就和旧积分记录分开查询，避免不同排序规则的列参与 UNION', async () => {
    const queries = [];
    const db = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        queries.push(text);
        if (text.includes('JOIN community_chat_rooms room')) return [[authorRow({ authorExp: 0 })], []];
        if (text.includes('FROM user_achievements')) {
          return [[{ ref: 'streak_7', latestId: 100 }], []];
        }
        if (text.includes('FROM points_log')) {
          return [[{ ref: 'note_10', latestId: 20 }], []];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const profile = await getCommunityChatMessageAuthorProfile({
      user: { id: 'visitor-1', role: 'visitor' },
      messagePublicId: 'message-1',
      env: PUBLIC_ENV,
      db,
    });

    expect(queries.filter((sql) => sql.includes('FROM user_achievements'))).toHaveLength(1);
    expect(queries.filter((sql) => sql.includes('FROM points_log'))).toHaveLength(1);
    expect(queries.some((sql) => /\bUNION\b/i.test(sql))).toBe(false);
    expect(profile.achievements).toEqual([
      { key: 'streak_7', group: 'checkin' },
      { key: 'note_10', group: 'create' },
    ]);
  });

  it('并发版本冲突时回滚且不覆盖新资料', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT revision')) return [[{ revision: 3 }], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      updateCommunityChatOwnProfile({
        user: { id: 'root-1', role: 'root' },
        bio: '',
        showCommunityTenure: false,
        featuredAchievementKeys: [],
        baseRevision: 2,
        env: PUBLIC_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_PROFILE_CONFLICT', status: 409 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('简介按 Unicode 字素限制、归一化控制符和连续空白', () => {
    expect(__test__.normalizeBio('  Ａ\n\tB  ')).toBe('A B');
    expect(() => __test__.normalizeBio('好'.repeat(61))).toThrowError(/60/);
    expect(__test__.parseFeaturedAchievements('[]')).toEqual([]);
    expect(__test__.parseFeaturedAchievements(null)).toBeNull();
  });
});
