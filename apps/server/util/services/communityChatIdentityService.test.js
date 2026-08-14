import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  messagingAccess: vi.fn(),
  readAccess: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('./communityChatAccessService.js', async () => {
  const actual = await vi.importActual('./communityChatAccessService.js');
  return {
    ...actual,
    assertCommunityChatMessagingAccess: mocks.messagingAccess,
    assertCommunityChatReadAccess: mocks.readAccess,
  };
});

const {
  COMMUNITY_CHAT_ID_ALPHABET,
  ensureCommunityChatIdentity,
  generateCommunityId,
  normalizeCommunityChatUserPublicIds,
  searchCommunityChatMembers,
} = await import('./communityChatIdentityService.js');

describe('communityChatIdentityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messagingAccess.mockResolvedValue({
      feature: { accessMode: 'public', rulesVersion: 'rules-v1' },
      memberRole: 'member',
    });
    mocks.readAccess.mockResolvedValue({});
  });

  it('社区 ID 固定使用 ln_ 前缀和六位去歧义字符', () => {
    expect(COMMUNITY_CHAT_ID_ALPHABET).not.toMatch(/[01IO]/);
    for (let index = 0; index < 200; index += 1) {
      expect(generateCommunityId()).toMatch(/^ln_[2-9A-HJ-NP-Z]{6}$/);
    }
  });

  it('公开用户 UUID 统一去重、转小写并拒绝内部账号标识', () => {
    const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    expect(normalizeCommunityChatUserPublicIds([upper, upper.toLowerCase()])).toEqual([upper.toLowerCase()]);
    expect(() => normalizeCommunityChatUserPublicIds(['user-123'])).toThrowError(
      expect.objectContaining({ code: 'INVALID_MENTION_TARGETS' }),
    );
  });

  it('唯一索引碰撞时重新生成，且不会改写已经存在的社区 ID', async () => {
    let lookupCount = 0;
    let insertCount = 0;
    const db = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_user_identities')) {
          lookupCount += 1;
          return [[], []];
        }
        if (text.includes('INSERT INTO community_chat_user_identities')) {
          insertCount += 1;
          if (insertCount === 1) throw Object.assign(new Error('collision'), { code: 'ER_DUP_ENTRY' });
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`unexpected query: ${text}`);
      }),
    };

    const identity = await ensureCommunityChatIdentity({ userId: 'user-1', db });

    expect(identity.userPublicId).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.communityId).toMatch(/^ln_[2-9A-HJ-NP-Z]{6}$/);
    expect(insertCount).toBe(2);
    expect(lookupCount).toBe(2);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('LIMIT 1 FOR UPDATE'))).toBe(true);
  });

  it('成员搜索同时校验双向屏蔽，只返回公开身份和短头像地址', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        expect(text).toContain('community_chat_user_identities identity');
        expect(text).toContain('CONVERT(identity.community_id USING utf8mb4)');
        expect(text).toContain('blocked.user_id = identity.user_id');
        expect(params).toContain('薄荷');
        return [
          [
            {
              userPublicId: '22222222-2222-4222-8222-222222222222',
              communityId: 'ln_MINT22',
              displayName: '薄荷',
              accountRole: 'user',
              memberRole: 'member',
              memberStatus: 'active',
              exp: 900,
              frameId: 'frame_mint',
              hasAvatar: 1,
              hasRecentMessage: 1,
            },
          ],
          [],
        ];
      }),
    };

    const result = await searchCommunityChatMembers({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      query: '@薄荷',
      limit: 8,
      env: { COMMUNITY_CHAT_MESSAGING_ENABLED: '1' },
      db,
    });

    expect(result.items[0]).toMatchObject({
      userPublicId: '22222222-2222-4222-8222-222222222222',
      communityId: 'ln_MINT22',
      displayName: '薄荷',
      avatar: '/api/community-chat/members/22222222-2222-4222-8222-222222222222/avatar',
    });
    expect(result.items[0]).not.toHaveProperty('userId');
  });

  it('公共模式允许搜索已建立社区身份但尚未发言的账号，并只聚合有界最近消息窗口', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        expect(text).toContain('LIMIT 200');
        expect(text).not.toContain('message.create_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)');
        expect(text).not.toContain("OR membership.status = 'active'");
        return [[], []];
      }),
    };

    await searchCommunityChatMembers({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      query: '',
      env: { COMMUNITY_CHAT_MESSAGING_ENABLED: '1' },
      db,
    });
  });
});
