import { createHash } from 'node:crypto';
import { COMMUNITY_CHAT_INLINE_EMOJIS } from '@lightnote/shared/community-chat-inline-emojis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deliverNotifications: vi.fn(),
  ensureIdentity: vi.fn(),
}));

vi.mock('./communityChatNotificationService.js', () => ({
  deliverCommunityChatMessageNotifications: mocks.deliverNotifications,
}));

vi.mock('./communityChatIdentityService.js', async () => {
  const actual = await vi.importActual('./communityChatIdentityService.js');
  return { ...actual, ensureCommunityChatIdentity: mocks.ensureIdentity };
});

import {
  __test__,
  createCommunityChatMessage,
  deleteCommunityChatMessage,
  getCommunityChatPinnedMessage,
  getCommunityChatMessageAuthorAvatar,
  getCommunityChatMessageAuthorProfile,
  listCommunityChatMessages,
  markCommunityChatRoomRead,
  pinCommunityChatMessage,
  recallCommunityChatMessage,
  toggleCommunityChatMessageLike,
  unpinCommunityChatMessage,
} from './communityChatMessageService.js';
import { communityChatRealtimeBroker } from '../communityChat/realtimeBroker.js';

const MESSAGE_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'invite_only',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

const PUBLIC_ENV = {
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_RULES_VERSION: 'rules-v1',
};

const POLL_ENV = {
  ...PUBLIC_ENV,
  COMMUNITY_CHAT_POLLS_ENABLED: '1',
  COMMUNITY_CHAT_READ_RECEIPTS_ENABLED: '1',
};

const MEMBER = { role: 'member', status: 'active', rulesVersion: 'rules-v1' };

function messageRow(overrides = {}) {
  return {
    internalId: 10,
    publicId: 'message-00000000-0000-0000-0000-000001',
    roomId: 2,
    userId: 'user-2',
    content: '你好，欢迎来到社区',
    status: 'active',
    createdAt: '2026-08-09T10:00:00.000Z',
    editedAt: null,
    recalledAt: null,
    recalledBy: null,
    authorName: '薄荷',
    authorRole: 'member',
    authorAccountRole: 'user',
    authorHasAvatar: true,
    authorAvatar: 'data:image/webp;base64,avatar',
    authorExp: 900,
    authorTitleId: null,
    authorFrameId: 'frame_mint',
    replyPublicId: null,
    replyUserId: null,
    replyContent: '',
    replyStatus: '',
    replyAuthorName: '',
    replyImageCount: 0,
    mentionEveryone: 0,
    mentionNamesHex: '',
    availableStickerPublicId: null,
    ...overrides,
  };
}

function createConnection(queryImplementation) {
  return {
    beginTransaction: vi.fn(async () => {}),
    query: vi.fn(queryImplementation),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
}

describe('communityChatMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deliverNotifications.mockResolvedValue({ delivered: 0 });
    mocks.ensureIdentity.mockImplementation(async ({ userId }) => ({
      userPublicId:
        userId === 'user-2' ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
      communityId: userId === 'user-2' ? 'ln_MINT22' : 'ln_OWNER1',
    }));
  });

  it('消息开关缺省关闭时在获取事务连接前失败关闭', async () => {
    const db = { getConnection: vi.fn() };

    await expect(
      createCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        clientRequestId: 'request-0001',
        content: '一条真实消息',
        env: {},
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_MESSAGING_CLOSED', status: 403 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('普通成员伪造提及所有人参数时在获取事务连接前拒绝', async () => {
    const db = { getConnection: vi.fn() };

    await expect(
      createCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        clientRequestId: 'request-everyone-forged',
        content: '请大家查看',
        mentionEveryone: true,
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'MENTION_EVERYONE_ROOT_REQUIRED', status: 403 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('Root 也不能把提及所有人与个人提及混入同一条消息', async () => {
    const db = { getConnection: vi.fn() };

    await expect(
      createCommunityChatMessage({
        user: { id: 'root-1', role: 'root' },
        roomSlug: 'general',
        clientRequestId: 'request-everyone-conflict',
        content: '请大家查看',
        mentionEveryone: true,
        mentionUserPublicIds: ['22222222-2222-4222-8222-222222222222'],
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'MENTION_EVERYONE_CONFLICT', status: 400 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('历史消息使用不透明游标分页、按时间正序返回且不暴露账号 ID', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
        if (text.includes('FROM community_chat_blocks WHERE user_id')) return [[], []];
        if (text.includes('FROM community_chat_rooms')) {
          return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
        }
        if (text.includes('FROM community_chat_messages message')) {
          return [
            [
              messageRow({ internalId: 3, publicId: 'message-3', userId: 'user-3', content: '第三条' }),
              messageRow({
                internalId: 2,
                publicId: 'message-2',
                userId: 'user-1',
                content: '第二条',
                databaseNow: '2026-08-26T10:00:00.125Z',
                mentionNamesHex: Buffer.from('薄荷').toString('hex'),
              }),
              messageRow({ internalId: 1, publicId: 'message-1', userId: 'user-2', content: '第一条' }),
            ],
            [],
          ];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatMessages({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      limit: 2,
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({
      hasMore: true,
      nextBefore: 'message-2',
      pollingAfterMs: 8000,
      serverTime: '2026-08-26T10:00:00.125Z',
    });
    expect(result.items.map((item) => item.publicId)).toEqual(['message-2', 'message-3']);
    expect(result.items[0]).toMatchObject({
      isOwn: true,
      mentions: ['薄荷'],
      author: {
        name: '薄荷',
        role: 'member',
        avatar: '/api/community-chat/messages/message-2/author-avatar',
        frameId: 'frame_mint',
        level: 2,
        levelName: '书生',
        title: null,
      },
    });
    expect(result.items[0]).not.toHaveProperty('userId');
    expect(result.items[0].author).not.toHaveProperty('id');
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('LEFT JOIN user_growth growth'))).toBe(true);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UTC_TIMESTAMP(3)'))).toBe(true);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('community_chat_message_mentions'))).toBe(true);
  });

  it('自定义表情对象已被账号注销清理时返回安全占位，不下发失效内容地址', () => {
    const active = __test__.toPublicMessage(
      messageRow({
        messageKind: 'sticker',
        stickerSource: 'custom',
        stickerKey: 'd9fa2cc6-d314-4709-a37f-05937916842b',
        availableStickerPublicId: 'd9fa2cc6-d314-4709-a37f-05937916842b',
        content: '',
      }),
      'user-1',
    );
    const removed = __test__.toPublicMessage(
      messageRow({
        messageKind: 'sticker',
        stickerSource: 'custom',
        stickerKey: 'd9fa2cc6-d314-4709-a37f-05937916842b',
        availableStickerPublicId: null,
        content: '',
      }),
      'user-1',
    );

    expect(active.sticker?.url).toContain('/api/community-chat/stickers/');
    expect(removed).toMatchObject({ messageKind: 'sticker', sticker: null });
  });

  it('官方纸灵表情由版本化清单还原静态地址，不依赖个人表情记录', () => {
    expect(__test__.normalizeStickerSource('official', 'sticker')).toBe('official');
    expect(__test__.normalizeStickerKey('PAPER-SPIRIT-V1:HELLO', 'sticker', 'official')).toBe('paper-spirit-v1:hello');

    const message = __test__.toPublicMessage(
      messageRow({
        messageKind: 'sticker',
        stickerSource: 'official',
        stickerKey: 'paper-spirit-v1:hello',
        availableStickerPublicId: null,
        content: '',
      }),
      'user-1',
    );

    expect(message).toMatchObject({
      messageKind: 'sticker',
      stickerSource: 'official',
      stickerKey: 'paper-spirit-v1:hello',
      sticker: {
        source: 'official',
        key: 'paper-spirit-v1:hello',
        url: '/community-chat/stickers/paper-spirit-v1/hello.png',
      },
    });
  });

  it('不存在的官方表情键在创建事务前失败关闭', async () => {
    const db = { getConnection: vi.fn() };

    await expect(
      createCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        clientRequestId: 'request-official-missing',
        content: '',
        messageKind: 'sticker',
        stickerSource: 'official',
        stickerKey: 'paper-spirit-v1:missing',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'OFFICIAL_STICKER_NOT_FOUND', status: 400 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('按公有消息 ID 定位来源消息，并明确返回是否还有更新消息', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
        if (text.includes('FROM community_chat_blocks WHERE user_id')) return [[], []];
        if (text.includes('FROM community_chat_rooms')) {
          return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
        }
        if (text.includes('message.public_id = ?') && !text.includes('ORDER BY message.id DESC')) {
          expect(params).toEqual([2, 'message-focus', 'user-1', 'user-1']);
          return [[{ id: 42 }], []];
        }
        if (text.includes('ORDER BY message.id DESC')) {
          expect(params).toEqual([2, 'user-1', 'user-1', 42, 3]);
          return [
            [
              messageRow({ internalId: 42, publicId: 'message-focus', content: '来源消息' }),
              messageRow({ internalId: 41, publicId: 'message-before', content: '较早消息' }),
              messageRow({ internalId: 40, publicId: 'message-extra', content: '更早消息' }),
            ],
            [],
          ];
        }
        if (text.includes('message.id > ?') && text.includes('ORDER BY message.id ASC')) {
          expect(params).toEqual([2, 'user-1', 'user-1', 42, 2]);
          return [
            [
              messageRow({ internalId: 43, publicId: 'message-after', content: '较新消息' }),
              messageRow({ internalId: 44, publicId: 'message-after-extra', content: '更新消息' }),
            ],
            [],
          ];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatMessages({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      focus: 'message-focus',
      limit: 3,
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({
      focusPublicId: 'message-focus',
      hasNewer: true,
      hasMore: true,
      nextBefore: 'message-before',
      nextAfter: 'message-after',
    });
    expect(result.items.map((item) => item.publicId)).toEqual(['message-before', 'message-focus', 'message-after']);
  });

  it('使用后续游标按时间正序加载定位消息之后的内容，并返回下一段游标', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
        if (text.includes('FROM community_chat_blocks WHERE user_id')) return [[], []];
        if (text.includes('FROM community_chat_rooms')) {
          return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
        }
        if (text.includes('SELECT id FROM community_chat_messages')) {
          expect(params).toEqual([2, 'message-after']);
          return [[{ id: 43 }], []];
        }
        if (text.includes('message.id > ?') && text.includes('ORDER BY message.id ASC')) {
          expect(params).toEqual([2, 'user-1', 'user-1', 43, 3]);
          return [
            [
              messageRow({ internalId: 44, publicId: 'message-newer-1', content: '更新一' }),
              messageRow({ internalId: 45, publicId: 'message-newer-2', content: '更新二' }),
              messageRow({ internalId: 46, publicId: 'message-newer-extra', content: '额外一条' }),
            ],
            [],
          ];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatMessages({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      after: 'message-after',
      limit: 2,
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({
      focusPublicId: null,
      hasMore: false,
      hasNewer: true,
      nextBefore: null,
      nextAfter: 'message-newer-2',
    });
    expect(result.items.map((item) => item.publicId)).toEqual(['message-newer-1', 'message-newer-2']);
  });

  it('多种消息游标同时出现时在查询数据库前失败关闭', async () => {
    const db = { query: vi.fn() };

    await expect(
      listCommunityChatMessages({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        before: 'message-before',
        focus: 'message-focus',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'MESSAGE_CURSOR_CONFLICT', status: 400 });
    await expect(
      listCommunityChatMessages({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        focus: 'message-focus',
        after: 'message-after',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'MESSAGE_CURSOR_CONFLICT', status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('点击消息头像只返回公开成长名片，不暴露内部账号 ID、经验或资源统计', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('JOIN community_chat_rooms room')) {
          expect(params).toEqual(['11111111-1111-4111-8111-111111111111', 'general']);
          expect(text).toContain('community_chat_member_profiles');
          return [
            [
              {
                authorUserId: 'user-2',
                authorAccountRole: 'user',
                authorName: '薄荷',
                authorRole: 'member',
                authorHasAvatar: 1,
                authorExp: 15000,
                authorTitleId: null,
                authorFrameId: 'frame_streak_seed',
                authorJoinedAt: '2026-07-01T00:00:00.000Z',
                authorMemberCreatedAt: '2026-07-01T00:00:00.000Z',
                bio: '喜欢整理知识',
                showCommunityTenure: 1,
                featuredAchievements: null,
                profileRevision: 0,
              },
            ],
            [],
          ];
        }
        if (text.includes('FROM user_achievements')) {
          expect(params).toEqual(['user-2']);
          return [[{ ref: 'streak_7', latestId: 2 }], []];
        }
        if (text.includes('FROM points_log')) {
          expect(params).toEqual(['user-2']);
          return [[{ ref: 'unknown-achievement', latestId: 1 }], []];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await getCommunityChatMessageAuthorProfile({
      user: { id: 'visitor-1', role: 'visitor' },
      messagePublicId: '11111111-1111-4111-8111-111111111111',
      env: PUBLIC_ENV,
      db,
    });

    expect(result).toMatchObject({
      name: '薄荷',
      role: 'member',
      level: 10,
      levelName: '翰林',
      avatar: '/api/community-chat/messages/11111111-1111-4111-8111-111111111111/author-avatar',
      frameId: 'frame_streak_seed',
      frameRarity: 'rare',
      bio: '喜欢整理知识',
      achievements: [
        { key: 'streak_7', group: 'checkin' },
        { key: 'level_10', group: 'level' },
        { key: 'level_5', group: 'level' },
      ],
      achievementCount: 3,
      hasMoreAchievements: false,
    });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('authorUserId');
    expect(result).not.toHaveProperty('exp');
    expect(result).not.toHaveProperty('email');
    expect(result.avatar).not.toContain('data:image');
  });

  it('消息列表头像使用独立短地址延迟读取，并复核屏蔽与个人删除可见性', async () => {
    const messagePublicId = '11111111-1111-4111-8111-111111111111';
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
        if (text.includes('SELECT account.head_picture AS source')) {
          expect(params).toEqual([messagePublicId, 'general', 'user-1', 'user-1']);
          expect(text).toContain('community_chat_blocks');
          expect(text).toContain('community_chat_message_deletions');
          return [[{ source: 'data:image/png;base64,YQ==' }], []];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    await expect(
      getCommunityChatMessageAuthorAvatar({
        user: { id: 'user-1', role: 'user' },
        messagePublicId,
        env: PUBLIC_ENV,
        db,
      }),
    ).resolves.toEqual({ source: 'data:image/png;base64,YQ==' });
  });

  it('公共模式允许游客只读消息，并且不创建屏蔽查询或把消息标记为自己的', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_rooms')) {
          return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
        }
        if (text.includes('FROM community_chat_messages message')) {
          expect(params).toEqual([2, 31]);
          return [[messageRow({ userId: 'user-2' })], []];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatMessages({
      user: { id: 'visitor-1', role: 'visitor' },
      roomSlug: 'general',
      env: PUBLIC_ENV,
      db,
    });

    expect(result.items[0]).toMatchObject({ isOwn: false, author: { name: '薄荷', frameId: 'frame_mint' } });
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM community_chat_blocks WHERE'))).toBe(false);
  });

  it('游客可读取当前置顶消息', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_rooms room')) {
          return [
            [
              {
                id: 2,
                slug: 'general',
                type: 'text',
                status: 'active',
                slowModeSeconds: 0,
                pinnedMessageId: 10,
                pinnedMessagePublicId: 'message-pinned',
              },
            ],
            [],
          ];
        }
        if (text.includes('FROM community_chat_messages pinned')) {
          expect(params).toEqual([10, 2]);
          return [[{ publicId: 'message-pinned' }], []];
        }
        if (text.includes('WHERE message.public_id = ? LIMIT 1')) {
          return [[messageRow({ publicId: 'message-pinned', content: '请先阅读这条消息' })], []];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    await expect(
      getCommunityChatPinnedMessage({
        user: { id: 'visitor-1', role: 'visitor' },
        roomSlug: 'general',
        env: PUBLIC_ENV,
        db,
      }),
    ).resolves.toMatchObject({
      roomSlug: 'general',
      message: { publicId: 'message-pinned', content: '请先阅读这条消息' },
    });
  });

  it('个人删除或屏蔽的置顶消息不会继续向该用户展示摘要', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[], []];
        if (text.includes('FROM community_chat_rooms room')) {
          return [
            [
              {
                id: 2,
                slug: 'general',
                type: 'text',
                status: 'active',
                slowModeSeconds: 0,
                pinnedMessageId: 10,
                pinnedMessagePublicId: 'message-pinned',
              },
            ],
            [],
          ];
        }
        if (text.includes('FROM community_chat_messages pinned')) {
          expect(text).toContain('community_chat_blocks');
          expect(text).toContain('community_chat_message_deletions');
          expect(params).toEqual([10, 2, 'user-1', 'user-1']);
          return [[], []];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    await expect(
      getCommunityChatPinnedMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        env: PUBLIC_ENV,
        db,
      }),
    ).resolves.toEqual({ roomSlug: 'general', message: null });
  });

  it('Root 置顶新消息会替换旧指针、写入不可变治理审计并广播实时失效事件', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_rooms room')) {
        return [
          [
            {
              id: 2,
              slug: 'general',
              type: 'text',
              status: 'active',
              slowModeSeconds: 0,
              pinnedMessageId: 9,
              pinnedMessagePublicId: 'message-old-pin',
            },
          ],
          [],
        ];
      }
      if (text.includes('WHERE message.public_id = ? AND message.room_id = ?')) {
        expect(params).toEqual(['message-new-pin', 2]);
        return [[{ id: 10, publicId: 'message-new-pin', authorUserId: 'user-2' }], []];
      }
      if (text.includes('SET pinned_message_id = ?')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_moderation_actions')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ? LIMIT 1')) {
        return [[messageRow({ publicId: 'message-new-pin', content: '新的置顶消息' })], []];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await pinCommunityChatMessage({
      user: { id: 'root-1', role: 'root' },
      messagePublicId: 'message-new-pin',
      env: MESSAGE_ENV,
      db,
    });
    unsubscribeRealtime();

    expect(result).toMatchObject({
      roomSlug: 'general',
      message: { publicId: 'message-new-pin' },
      alreadyPinned: false,
      replacedMessagePublicId: 'message-old-pin',
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes("'pin_message', 'moderator_pin'"))).toBe(
      true,
    );
    expect(realtimeListener).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'message.updated',
        payload: {
          roomSlug: 'general',
          messagePublicId: 'message-new-pin',
          reason: 'pin',
        },
      }),
      internal: {},
    });
  });

  it('普通成员不能通过公有消息 ID 越权置顶', async () => {
    const connection = createConnection(async (sql) => {
      if (String(sql).includes('FROM community_chat_members')) return [[MEMBER], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      pinCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        messagePublicId: 'message-new-pin',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_PIN_FORBIDDEN', status: 403 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('取消置顶会校验当前指针并写入治理审计', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_rooms room')) {
        return [
          [
            {
              id: 2,
              slug: 'general',
              type: 'text',
              status: 'active',
              pinnedMessageId: 10,
              pinnedMessagePublicId: 'message-pinned',
            },
          ],
          [],
        ];
      }
      if (text.includes('SELECT id, user_id AS authorUserId')) return [[{ id: 10, authorUserId: 'user-2' }], []];
      if (text.includes('SET pinned_message_id = NULL')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_moderation_actions')) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      unpinCommunityChatMessage({
        user: { id: 'root-1', role: 'root' },
        messagePublicId: 'message-pinned',
        env: MESSAGE_ENV,
        db,
      }),
    ).resolves.toMatchObject({ publicId: 'message-pinned', alreadyUnpinned: false });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes("'unpin_message', 'moderator_unpin'")),
    ).toBe(true);
  });

  it('发送消息在同一事务复核资格、落库、推进房间游标和自己的阅读位置', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('INSERT INTO community_chat_messages')) return [{ insertId: 31 }, []];
      if (text.includes('client_request_id')) return [[], []];
      if (text.includes('UPDATE community_chat_rooms')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ?')) {
        return [
          [
            messageRow({
              internalId: 31,
              publicId: params[0],
              userId: 'user-1',
              content: '这是我的第一条消息',
            }),
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      clientRequestId: 'request-0002',
      content: '这是我的第一条消息',
      env: MESSAGE_ENV,
      db,
    });
    unsubscribeRealtime();

    expect(result).toMatchObject({ idempotent: false, message: { content: '这是我的第一条消息', isOwn: true } });
    const insertCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_messages'),
    );
    expect(insertCall?.[0]).not.toContain('这是我的第一条消息');
    expect(insertCall?.[1]).toEqual([
      result.message.publicId,
      2,
      'user-1',
      'request-0002',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      null,
      'text',
      null,
      null,
      0,
      0,
      '这是我的第一条消息',
    ]);
    const expectedV2Fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          version: 2,
          roomSlug: 'general',
          messageKind: 'text',
          stickerSource: null,
          stickerKey: null,
          content: '这是我的第一条消息',
          replyToPublicId: null,
          mentionUserPublicIds: [],
          mentionMessagePublicIds: [],
          imagePublicIds: [],
        }),
      )
      .digest('hex');
    expect(insertCall?.[1]?.[4]).toBe(expectedV2Fingerprint);
    const runtimeQuery = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM community_chat_runtime_policy'),
    );
    expect(String(runtimeQuery?.[0])).toContain('FOR UPDATE');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(realtimeListener).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'message.created',
        payload: {
          roomSlug: 'general',
          messagePublicId: result.message.publicId,
        },
      }),
      internal: {},
    });
    expect(mocks.deliverNotifications).toHaveBeenCalledWith({
      messagePublicId: result.message.publicId,
      messagePreview: '这是我的第一条消息',
      env: MESSAGE_ENV,
      db,
    });
  });

  it('Root 多选投票复用消息事务、v4 幂等指纹和房间游标，并在发送时固化已读回执开关', async () => {
    const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM user')) return [[{ id: 'root-1' }], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('WHERE message.user_id = ?') && text.includes('client_request_id')) return [[], []];
      if (text.includes('AS tooSoon')) return [[{ tooSoon: 0, tooLate: 0 }], []];
      if (text.includes('INSERT INTO community_chat_messages')) return [{ insertId: 41 }, []];
      if (text.includes('INSERT INTO community_chat_polls')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_poll_options')) return [{ affectedRows: 2 }, []];
      if (text.includes('UPDATE community_chat_rooms')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ?')) {
        return [
          [
            messageRow({
              internalId: 41,
              publicId: params[0],
              userId: 'root-1',
              content: '下一项优先做什么？',
              messageKind: 'poll',
              authorAccountRole: 'root',
              authorRole: 'official',
              readReceiptEnabled: 1,
            }),
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      if (text.includes('FROM community_chat_polls poll')) {
        return [
          [
            {
              messageId: 41,
              selectionMode: 'multiple',
              maxSelections: 2,
              endsAt,
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-a',
              label: '体验',
              sortOrder: 0,
              voteCount: 0,
              totalVoterCount: 0,
              selectedByViewer: 0,
            },
            {
              messageId: 41,
              selectionMode: 'multiple',
              maxSelections: 2,
              endsAt,
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-b',
              label: '性能',
              sortOrder: 1,
              voteCount: 0,
              totalVoterCount: 0,
              selectedByViewer: 0,
            },
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_read_receipts')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'root-1', role: 'root' },
      roomSlug: 'general',
      clientRequestId: 'request-poll-root',
      content: '下一项优先做什么？',
      messageKind: 'poll',
      poll: { endsAt, options: ['体验', '性能'], selectionMode: 'multiple', maxSelections: 2 },
      env: POLL_ENV,
      db,
    });

    const messageInsert = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_messages'),
    );
    const rootAccountLockIndex = connection.query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('SELECT id FROM user'),
    );
    const messageInsertIndex = connection.query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_messages'),
    );
    expect(String(connection.query.mock.calls[rootAccountLockIndex]?.[0])).toContain('FOR UPDATE');
    expect(rootAccountLockIndex).toBeLessThan(messageInsertIndex);
    const deadlineCheckIndex = connection.query.mock.calls.findIndex(([sql]) => String(sql).includes('AS tooSoon'));
    expect(String(connection.query.mock.calls[deadlineCheckIndex]?.[0])).toContain('UTC_TIMESTAMP(3)');
    expect(deadlineCheckIndex).toBeLessThan(messageInsertIndex);
    expect(messageInsert?.[1]?.at(-2)).toBe(1);
    const expectedV3PollFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          version: 3,
          roomSlug: 'general',
          messageKind: 'poll',
          stickerSource: null,
          stickerKey: null,
          content: '下一项优先做什么？',
          replyToPublicId: null,
          mentionUserPublicIds: [],
          mentionMessagePublicIds: [],
          imagePublicIds: [],
          poll: { endsAt, options: ['体验', '性能'] },
        }),
      )
      .digest('hex');
    const expectedV4PollFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          version: 4,
          roomSlug: 'general',
          messageKind: 'poll',
          stickerSource: null,
          stickerKey: null,
          content: '下一项优先做什么？',
          replyToPublicId: null,
          mentionUserPublicIds: [],
          mentionMessagePublicIds: [],
          imagePublicIds: [],
          poll: {
            endsAt,
            options: ['体验', '性能'],
            selectionMode: 'multiple',
            maxSelections: 2,
          },
        }),
      )
      .digest('hex');
    expect(messageInsert?.[1]?.[4]).not.toBe(expectedV3PollFingerprint);
    expect(messageInsert?.[1]?.[4]).toBe(expectedV4PollFingerprint);
    const pollInsert = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_polls'),
    );
    expect(pollInsert?.[1]?.slice(1, 3)).toEqual(['multiple', 2]);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_polls'))).toBe(
      true,
    );
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_poll_options')),
    ).toBe(true);
    expect(result.message).toMatchObject({
      messageKind: 'poll',
      readReceiptEnabled: true,
      readCount: 0,
      poll: {
        selectionMode: 'multiple',
        maxSelections: 2,
        resultsVisible: true,
        canClose: true,
        options: [{ label: '体验' }, { label: '性能' }],
      },
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('已经成功的投票即使进入最短截止窗口或子开关关闭，原请求重放仍先命中幂等消息', async () => {
    const endsAt = new Date(Date.now() + 60 * 1000).toISOString();
    const payloadFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          version: 3,
          roomSlug: 'general',
          messageKind: 'poll',
          stickerSource: null,
          stickerKey: null,
          content: '网络响应丢失后的投票',
          replyToPublicId: null,
          mentionUserPublicIds: [],
          mentionMessagePublicIds: [],
          imagePublicIds: [],
          poll: { endsAt, options: ['甲', '乙'] },
        }),
      )
      .digest('hex');
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM user')) return [[{ id: 'root-1' }], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('client_request_id')) {
        return [
          [
            {
              internalId: 42,
              publicId: 'poll-message-existing',
              roomId: 2,
              content: '网络响应丢失后的投票',
              payloadFingerprint,
              mentionEveryone: 0,
              replyToId: null,
              replyPublicId: null,
            },
          ],
          [],
        ];
      }
      if (text.includes('WHERE message.public_id = ?')) {
        return [
          [
            messageRow({
              internalId: 42,
              publicId: 'poll-message-existing',
              userId: 'root-1',
              content: '网络响应丢失后的投票',
              messageKind: 'poll',
              authorAccountRole: 'root',
              authorRole: 'official',
              readReceiptEnabled: 1,
            }),
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      if (text.includes('FROM community_chat_polls poll')) {
        return [
          [
            {
              messageId: 42,
              endsAt,
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-a',
              label: '甲',
              sortOrder: 0,
              voteCount: 0,
              selectedByViewer: 0,
            },
            {
              messageId: 42,
              endsAt,
              closedAt: null,
              manuallyClosed: 0,
              deadlinePassed: 0,
              optionPublicId: 'option-b',
              label: '乙',
              sortOrder: 1,
              voteCount: 0,
              selectedByViewer: 0,
            },
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_read_receipts')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'root-1', role: 'root' },
      roomSlug: 'general',
      clientRequestId: 'request-poll-replay',
      content: '网络响应丢失后的投票',
      messageKind: 'poll',
      poll: { endsAt, options: ['甲', '乙'] },
      env: { ...POLL_ENV, COMMUNITY_CHAT_POLLS_ENABLED: '0' },
      db,
    });

    expect(result).toMatchObject({ idempotent: true, message: { publicId: 'poll-message-existing' } });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_messages')),
    ).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('Root 提及所有人时写入独立标记并随消息对象返回', async () => {
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('INSERT INTO community_chat_messages')) return [{ insertId: 33 }, []];
      if (text.includes('client_request_id')) return [[], []];
      if (text.includes('UPDATE community_chat_rooms')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ?')) {
        return [
          [
            messageRow({
              internalId: 33,
              publicId: params[0],
              userId: 'root-1',
              content: '请大家查看',
              mentionEveryone: 1,
            }),
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'root-1', role: 'root' },
      roomSlug: 'general',
      clientRequestId: 'request-everyone-root',
      content: '请大家查看',
      mentionEveryone: true,
      env: MESSAGE_ENV,
      db,
    });

    const insertCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO community_chat_messages'),
    );
    expect(insertCall?.[0]).toContain('mention_everyone');
    expect(insertCall?.[1]?.at(-3)).toBe(1);
    expect(result.message).toMatchObject({ content: '请大家查看', mentionEveryone: true });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('公共模式用稳定用户 UUID 提及尚未发言的已建档账号，不依赖邀请成员行或历史消息', async () => {
    const targetPublicId = '22222222-2222-4222-8222-222222222222';
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('WHERE message.user_id = ?') && text.includes('client_request_id')) return [[], []];
      if (text.includes('community_chat_user_identities identity') && text.includes('identity.public_id IN')) {
        expect(text).not.toContain('FROM community_chat_messages recent');
        expect(params).toEqual([targetPublicId, 'user-1', 'user-1', 'user-1']);
        return [
          [
            {
              userPublicId: targetPublicId,
              communityId: 'ln_MINT22',
              userId: 'user-2',
              displayName: '薄荷',
            },
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_members')) return [[], []];
      if (text.includes('INSERT INTO community_chat_messages')) return [{ insertId: 34 }, []];
      if (text.includes('INSERT IGNORE INTO community_chat_message_mentions')) {
        expect(params).toEqual([34, 'user-2', 0, '薄荷', 'ln_MINT22']);
        return [{ affectedRows: 1 }, []];
      }
      if (text.includes('UPDATE community_chat_rooms')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ?')) {
        return [
          [
            messageRow({
              internalId: 34,
              publicId: params[0],
              userId: 'user-1',
              content: '请看',
              mentionNamesHex: Buffer.from('薄荷').toString('hex'),
            }),
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      clientRequestId: 'request-stable-mention',
      content: '请看',
      mentionUserPublicIds: [targetPublicId],
      env: PUBLIC_ENV,
      db,
    });

    expect(result).toMatchObject({ idempotent: false, message: { mentions: ['薄荷'] } });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('显式提及只接受当前房间可见消息，按用户去重后与新消息同事务保存', async () => {
    const targetPublicId = '22222222-2222-4222-8222-222222222222';
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('WHERE message.user_id = ?') && text.includes('client_request_id')) return [[], []];
      if (text.includes('message.public_id IN')) {
        expect(params).toEqual([2, targetPublicId, 'user-1', 'rules-v1', 'user-1', 'user-1']);
        return [[{ messagePublicId: targetPublicId, userId: 'user-2', displayName: '薄荷' }], []];
      }
      if (text.includes('INSERT INTO community_chat_messages')) return [{ insertId: 32 }, []];
      if (text.includes('INSERT IGNORE INTO community_chat_message_mentions')) {
        expect(params).toEqual([32, 'user-2', 0, '薄荷', 'ln_MINT22']);
        return [{ affectedRows: 1 }, []];
      }
      if (text.includes('UPDATE community_chat_rooms')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ?')) {
        return [
          [
            messageRow({
              internalId: 32,
              publicId: params[0],
              userId: 'user-1',
              content: '请看',
              mentionNamesHex: Buffer.from('薄荷').toString('hex'),
            }),
          ],
          [],
        ];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      clientRequestId: 'request-mention-01',
      content: '请看',
      mentionMessagePublicIds: [targetPublicId],
      env: MESSAGE_ENV,
      db,
    });

    expect(result.idempotent).toBe(false);
    expect(result.message).toMatchObject({ content: '请看', mentions: ['薄荷'] });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(mocks.deliverNotifications).toHaveBeenCalledTimes(1);
  });

  it('纯图片消息在发送事务内锁定本人待发送附件并按顺序原子绑定', async () => {
    const imagePublicId = '33333333-3333-4333-8333-333333333333';
    const connection = createConnection(async (sql, params) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('WHERE message.user_id = ?') && text.includes('client_request_id')) return [[], []];
      if (text.includes('owner_user_id = ?') && text.includes('FOR UPDATE')) {
        expect(params).toEqual(['user-1', imagePublicId]);
        return [
          [
            {
              id: 91,
              publicId: imagePublicId,
              status: 'pending',
              messageId: null,
              expiresAt: '2099-08-10T10:00:00.000Z',
            },
          ],
          [],
        ];
      }
      if (text.includes('INSERT INTO community_chat_messages')) return [{ insertId: 40 }, []];
      if (text.includes("SET message_id = ?, status = 'attached'")) {
        expect(params).toEqual([40, 0, 91, 'user-1']);
        return [{ affectedRows: 1 }, []];
      }
      if (text.includes('UPDATE community_chat_rooms')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('WHERE message.public_id = ?')) {
        return [[messageRow({ internalId: 40, publicId: params[0], userId: 'user-1', content: '' })], []];
      }
      if (text.includes('message_id IN')) {
        return [
          [
            {
              messageId: 40,
              publicId: imagePublicId,
              contentType: 'image/png',
              fileSize: 120,
              width: 640,
              height: 480,
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      clientRequestId: 'request-image-01',
      content: '',
      imagePublicIds: [imagePublicId],
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({
      idempotent: false,
      message: {
        content: '',
        images: [
          {
            publicId: imagePublicId,
            url: `/api/community-chat/images/${imagePublicId}`,
            contentType: 'image/png',
            width: 640,
            height: 480,
          },
        ],
      },
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('相同用户与 clientRequestId 的同负载重放直接返回既有消息，不重复 INSERT', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('client_request_id')) {
        return [
          [
            {
              internalId: 30,
              publicId: 'message-existing',
              roomId: 2,
              content: '同一负载',
              replyToId: null,
              replyPublicId: null,
            },
          ],
          [],
        ];
      }
      if (text.includes('WHERE message.public_id = ?')) {
        return [[messageRow({ publicId: 'message-existing', userId: 'user-1', content: '同一负载' })], []];
      }
      if (text.includes('FROM community_chat_message_images')) return [[], []];
      if (text.includes('FROM community_chat_message_likes')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await createCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      clientRequestId: 'request-0003',
      content: '同一负载',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({ idempotent: true, message: { publicId: 'message-existing' } });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_messages')),
    ).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('并发请求撞唯一键时回滚当前事务并回查赢家，仍按幂等成功返回', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('INSERT INTO community_chat_messages')) throw duplicateError;
      if (text.includes('client_request_id')) return [[], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = {
      getConnection: vi.fn(async () => connection),
      query: vi.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('client_request_id')) {
          return [
            [
              {
                internalId: 31,
                publicId: 'message-winner',
                roomId: 2,
                content: '并发消息',
                replyToId: null,
                replyPublicId: null,
              },
            ],
            [],
          ];
        }
        if (text.includes('WHERE message.public_id = ?')) {
          return [[messageRow({ publicId: 'message-winner', userId: 'user-1', content: '并发消息' })], []];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await createCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      clientRequestId: 'request-0005',
      content: '并发消息',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({ idempotent: true, message: { publicId: 'message-winner' } });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('旧频道归档后在获取事务连接前拒绝直接访问', async () => {
    const db = { getConnection: vi.fn() };
    await expect(
      createCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'announcements',
        clientRequestId: 'request-0004',
        content: '冒充公告',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_ROOM_NOT_FOUND', status: 404 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('标记已读只接受当前频道消息，并用 GREATEST 防止阅读位置倒退', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_rooms')) {
        return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
      }
      if (text.includes('public_id = ? AND status')) return [[{ id: 42, publicId: 'message-42' }], []];
      if (text.includes('INSERT INTO community_chat_reads')) return [{ affectedRows: 1 }, []];
      if (text.includes('SELECT COUNT(*) AS unreadCount')) return [[{ unreadCount: '2' }], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await markCommunityChatRoomRead({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      lastMessagePublicId: 'message-42',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toEqual({ roomSlug: 'general', lastReadMessagePublicId: 'message-42', unreadCount: 2 });
    const upsertSql = String(
      connection.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO community_chat_reads'))?.[0],
    );
    expect(upsertSql).toContain('GREATEST(last_read_message_id');
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('历史查询从 SQL 排除被屏蔽作者，并把被屏蔽的回复引用收敛为不可用', async () => {
    const db = {
      query: vi.fn(async (sql, params) => {
        const text = String(sql);
        if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
        if (text.includes('FROM community_chat_rooms')) {
          return [[{ id: 2, slug: 'general', type: 'text', status: 'active', slowModeSeconds: 0 }], []];
        }
        if (text.includes('FROM community_chat_blocks WHERE user_id')) {
          return [[{ blockedUserId: 'user-9' }], []];
        }
        if (text.includes('FROM community_chat_messages message')) {
          expect(text).toContain('NOT EXISTS');
          expect(text).toContain('blocked.blocked_user_id = message.user_id');
          expect(params).toEqual([2, 'user-1', 'user-1', 31]);
          return [
            [
              messageRow({
                replyPublicId: 'reply-1',
                replyUserId: 'user-9',
                replyContent: '不应泄漏的引用正文',
                replyStatus: 'active',
                replyAuthorName: '被屏蔽成员',
              }),
            ],
            [],
          ];
        }
        if (text.includes('FROM community_chat_message_images')) return [[], []];
        if (text.includes('FROM community_chat_message_likes')) return [[], []];
        throw new Error(`unexpected query: ${sql}`);
      }),
    };

    const result = await listCommunityChatMessages({
      user: { id: 'user-1', role: 'user' },
      roomSlug: 'general',
      env: MESSAGE_ENV,
      db,
    });

    expect(result.items[0].reply).toEqual({
      publicId: 'reply-1',
      content: '',
      status: 'blocked',
      authorName: '',
      hasImages: false,
      hasSticker: false,
      hasPoll: false,
    });
  });

  it('消息发送事务在落库前执行有效禁言检查', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) {
        return [[{ expiresAt: '2026-08-10 10:00:00' }], []];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      createCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        clientRequestId: 'request-muted-01',
        content: '这条消息不应落库',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_MUTED', status: 403 });
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_messages')),
    ).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('紧急只读在发送事务内、禁言与房间查询前拦截，不会产生任何消息写入', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 0 }], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      createCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        roomSlug: 'general',
        clientRequestId: 'request-readonly-01',
        content: '这条消息不应落库',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CHAT_EMERGENCY_READ_ONLY', status: 423 });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('community_chat_member_sanctions'))).toBe(
      false,
    );
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO community_chat_messages')),
    ).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('登录成员可以点赞或取消点赞活跃消息，并广播轻量更新事件', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_runtime_policy')) return [[{ postingEnabled: 1 }], []];
      if (text.includes('FROM community_chat_member_sanctions')) return [[], []];
      if (text.includes('FROM community_chat_messages message')) {
        return [[{ id: 21, publicId: 'message-like-1', roomSlug: 'general' }], []];
      }
      if (text.includes('SELECT 1') && text.includes('community_chat_message_likes')) return [[], []];
      if (text.includes('INSERT INTO community_chat_message_likes')) return [{ affectedRows: 1 }, []];
      if (text.includes('COUNT(*) AS likeCount')) {
        return [
          [
            {
              messageId: 21,
              likeCount: 1,
              likedByMe: 1,
              likerNamesHex: Buffer.from('薄荷').toString('hex'),
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await toggleCommunityChatMessageLike({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: 'message-like-1',
      env: MESSAGE_ENV,
      db,
    });
    unsubscribeRealtime();

    expect(result).toEqual({ publicId: 'message-like-1', likedByMe: true, likeCount: 1, likePreview: ['薄荷'] });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(realtimeListener).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'message.updated',
        payload: { roomSlug: 'general', messagePublicId: 'message-like-1', reason: 'like' },
      }),
      internal: {},
    });
  });

  it('普通用户只能在两分钟内撤回自己的消息，撤回后保留原文数据', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              id: 31,
              publicId: 'message-recall-own',
              authorUserId: 'user-1',
              status: 'active',
              recalledBy: null,
              elapsedSeconds: 119,
              roomSlug: 'general',
            },
          ],
          [],
        ];
      }
      if (text.includes("SET status = 'recalled'")) return [{ affectedRows: 1 }, []];
      if (text.includes('SET pinned_message_id = NULL')) return [{ affectedRows: 0 }, []];
      if (text.includes('SELECT DISTINCT user_id AS userId')) return [[{ userId: 'user-2' }], []];
      if (text.includes('UPDATE notification')) return [{ affectedRows: 1 }, []];
      if (text.includes('SELECT recalled_at AS recalledAt')) {
        return [[{ recalledAt: '2026-08-10T10:00:00.000Z' }], []];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await recallCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: 'message-recall-own',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({ publicId: 'message-recall-own', status: 'recalled', alreadyRecalled: false });
    const update = connection.query.mock.calls.find(([sql]) => String(sql).includes("SET status = 'recalled'"));
    expect(update?.[0]).not.toContain('content =');
    expect(update?.[0]).not.toContain('DELETE');
    const notificationUpdate = connection.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE notification'));
    expect(notificationUpdate?.[1]).toEqual(['message-recall-own']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('普通用户超过两分钟后撤回失败且不会改变消息状态', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              id: 32,
              publicId: 'message-recall-expired',
              authorUserId: 'user-1',
              status: 'active',
              recalledBy: null,
              elapsedSeconds: 121,
              roomSlug: 'general',
            },
          ],
          [],
        ];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    await expect(
      recallCommunityChatMessage({
        user: { id: 'user-1', role: 'user' },
        messagePublicId: 'message-recall-expired',
        env: MESSAGE_ENV,
        db,
      }),
    ).rejects.toMatchObject({ code: 'MESSAGE_RECALL_EXPIRED', status: 409 });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'recalled'"))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('Root 可撤回任意时长的消息，并把操作写入治理审计', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_messages message')) {
        return [
          [
            {
              id: 33,
              publicId: 'message-recall-admin',
              authorUserId: 'user-2',
              status: 'active',
              recalledBy: null,
              elapsedSeconds: 86400,
              roomSlug: 'general',
            },
          ],
          [],
        ];
      }
      if (text.includes("SET status = 'recalled'")) return [{ affectedRows: 1 }, []];
      if (text.includes('SET pinned_message_id = NULL')) return [{ affectedRows: 1 }, []];
      if (text.includes('SELECT DISTINCT user_id AS userId')) return [[{ userId: 'user-2' }], []];
      if (text.includes('UPDATE notification')) return [{ affectedRows: 1 }, []];
      if (text.includes('INSERT INTO community_chat_moderation_actions')) return [{ affectedRows: 1 }, []];
      if (text.includes('SELECT recalled_at AS recalledAt')) return [[{ recalledAt: new Date() }], []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await recallCommunityChatMessage({
      user: { id: 'root-1', role: 'root' },
      messagePublicId: 'message-recall-admin',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toMatchObject({ status: 'recalled', recalledByAdmin: true });
    expect(
      connection.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO community_chat_moderation_actions'),
      ),
    ).toBe(true);
  });

  it('撤回消息对普通用户脱敏，但管理员仍可查看保留的原文和图片', () => {
    const row = messageRow({
      status: 'recalled',
      recalledAt: '2026-08-10T10:00:00.000Z',
      recalledBy: 'user-2',
      content: '需要保留审核的原文',
    });
    const images = [{ publicId: 'image-1', url: '/api/community-chat/images/image-1' }];
    const memberView = __test__.toPublicMessage(row, 'user-1', new Set(), images, {}, { memberRole: 'member' });
    const adminView = __test__.toPublicMessage(row, 'root-1', new Set(), images, {}, { memberRole: 'admin' });

    expect(memberView).toMatchObject({
      status: 'recalled',
      content: '',
      images: [],
      canViewRecalledContent: false,
      canDelete: true,
    });
    expect(adminView).toMatchObject({
      status: 'recalled',
      content: '需要保留审核的原文',
      images,
      canViewRecalledContent: true,
      canDelete: true,
    });
  });

  it('普通用户超过两分钟后仍获得撤回入口状态，由客户端解释时间限制', () => {
    const row = messageRow({
      userId: 'user-1',
      status: 'active',
      createdAt: '2026-08-10T09:00:00.000Z',
    });
    const view = __test__.toPublicMessage(
      row,
      'user-1',
      new Set(),
      [],
      {},
      {
        memberRole: 'member',
        now: new Date('2026-08-10T09:03:00.000Z').getTime(),
      },
    );

    expect(view).toMatchObject({ canRecall: true, recallExpired: true });
    expect(view.recallDeadlineAt).toBe('2026-08-10T09:02:00.000Z');
  });

  it('普通成员可把任意可见消息仅从自己的聊天记录删除，不改变公共消息状态', async () => {
    const realtimeListener = vi.fn();
    const unsubscribeRealtime = communityChatRealtimeBroker.subscribe(realtimeListener);
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_members')) return [[MEMBER], []];
      if (text.includes('FROM community_chat_messages message')) {
        return [[{ id: 41, publicId: 'message-delete-for-me', status: 'active' }], []];
      }
      if (text.includes('INSERT IGNORE INTO community_chat_message_deletions')) {
        return [{ affectedRows: 1 }, []];
      }
      if (text.includes('UPDATE notification')) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await deleteCommunityChatMessage({
      user: { id: 'user-1', role: 'user' },
      messagePublicId: 'message-delete-for-me',
      env: MESSAGE_ENV,
      db,
    });
    unsubscribeRealtime();

    expect(result).toEqual({ publicId: 'message-delete-for-me', status: 'deleted_for_me', alreadyDeleted: false });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE community_chat_messages'))).toBe(
      false,
    );
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('community_chat_moderation_actions'))).toBe(
      false,
    );
    expect(realtimeListener).not.toHaveBeenCalled();
    const notificationUpdate = connection.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE notification'));
    expect(notificationUpdate?.[1]).toEqual(['user-1', 'message-delete-for-me']);
  });

  it('重复为自己删除已撤回消息保持幂等，其他人的消息记录不受影响', async () => {
    const connection = createConnection(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM community_chat_messages message')) {
        return [[{ id: 41, publicId: 'message-delete-again', status: 'recalled' }], []];
      }
      if (text.includes('INSERT IGNORE INTO community_chat_message_deletions')) return [{ affectedRows: 0 }, []];
      if (text.includes('UPDATE notification')) return [{ affectedRows: 0 }, []];
      throw new Error(`unexpected query: ${sql}`);
    });
    const db = { getConnection: vi.fn(async () => connection) };

    const result = await deleteCommunityChatMessage({
      user: { id: 'root-1', role: 'root' },
      messagePublicId: 'message-delete-again',
      env: MESSAGE_ENV,
      db,
    });

    expect(result).toEqual({ publicId: 'message-delete-again', status: 'deleted_for_me', alreadyDeleted: true });
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE community_chat_messages'))).toBe(
      false,
    );
  });

  it('纯文本规范化保留换行、移除控制字符并按 Unicode 字符数限长', () => {
    expect(__test__.normalizeMessageContent('  第一行\r\n第\u0000二行  ')).toBe('第一行\n第二行');
    expect(() => __test__.normalizeMessageContent('')).toThrowError(expect.objectContaining({ code: 'MESSAGE_EMPTY' }));
    expect(() => __test__.normalizeMessageContent('好'.repeat(2001))).toThrowError(
      expect.objectContaining({ code: 'MESSAGE_TOO_LONG' }),
    );
    expect(__test__.normalizeMessageContent('', { allowEmpty: true })).toBe('');
    expect(__test__.normalizeMentionEveryone(true)).toBe(true);
    expect(() => __test__.normalizeMentionEveryone('true')).toThrowError(
      expect.objectContaining({ code: 'INVALID_MENTION_EVERYONE' }),
    );
  });

  it('内联小表情使用共享令牌、按一个字符计数并限制未知项与数量', () => {
    const token = COMMUNITY_CHAT_INLINE_EMOJIS[0].token;
    expect(__test__.normalizeMessageContent(`你好${token}`)).toBe(`你好${token}`);
    expect(__test__.normalizeMessageContent(`${token.repeat(100)}${'好'.repeat(1900)}`)).toHaveLength(
      token.length * 100 + 1900,
    );
    expect(() => __test__.normalizeMessageContent(`${token.repeat(100)}${'好'.repeat(1901)}`)).toThrowError(
      expect.objectContaining({ code: 'MESSAGE_TOO_LONG' }),
    );
    expect(() => __test__.normalizeMessageContent(token.repeat(101))).toThrowError(
      expect.objectContaining({ code: 'TOO_MANY_INLINE_EMOJIS' }),
    );
    expect(() => __test__.normalizeMessageContent('[[ln-emoji:jian-tuan-v1:not-found]]')).toThrowError(
      expect.objectContaining({ code: 'INLINE_EMOJI_NOT_FOUND' }),
    );
    expect(() => __test__.normalizeMessageContent(token, { allowInlineEmoji: false })).toThrowError(
      expect.objectContaining({ code: 'INLINE_EMOJI_NOT_ALLOWED' }),
    );
  });

  it('Root 消息已读数量只在 Root 响应出现，普通成员仅收到透明启用标记', () => {
    const row = messageRow({
      userId: 'root-1',
      authorAccountRole: 'root',
      authorRole: 'official',
      readReceiptEnabled: 1,
    });
    const memberMessage = __test__.toPublicMessage(
      row,
      'user-1',
      new Set(),
      [],
      {},
      {
        memberRole: 'member',
        readCount: 4,
      },
    );
    const rootMessage = __test__.toPublicMessage(
      row,
      'root-1',
      new Set(),
      [],
      {},
      {
        memberRole: 'admin',
        readCount: 4,
      },
    );

    expect(memberMessage).toMatchObject({ readReceiptEnabled: true });
    expect(memberMessage).not.toHaveProperty('readCount');
    expect(rootMessage).toMatchObject({ readReceiptEnabled: true, readCount: 4 });
  });
});
