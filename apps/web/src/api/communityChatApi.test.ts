import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBaseGet: vi.fn(),
  apiBasePost: vi.fn(),
  apiBasePut: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBaseGet: mocks.apiBaseGet,
  apiBasePost: mocks.apiBasePost,
  apiBasePut: mocks.apiBasePut,
}));

const {
  acceptCommunityChatRules,
  blockCommunityChatMessageAuthor,
  closeCommunityChatPoll,
  createCommunityChatClientRequestId,
  deleteCommunityChatMessage,
  discardCommunityChatImage,
  getCommunityChatAdminRuntimePolicy,
  getCommunityChatAdminReports,
  getCommunityChatAccess,
  getCommunityChatMessages,
  getCommunityChatMessage,
  getCommunityChatNotificationSettings,
  getCommunityChatPinnedMessage,
  getCommunityChatMessageAuthorProfile,
  getCommunityChatMessageAuthorAchievements,
  getCommunityChatOwnProfile,
  getCommunityChatBlocks,
  getCommunityChatRooms,
  markCommunityChatRoomRead,
  recordCommunityChatReadReceipts,
  pinCommunityChatMessage,
  requestCommunityChatAccess,
  recallCommunityChatMessage,
  reportCommunityChatMessage,
  reviewCommunityChatAdminReport,
  sendCommunityChatMessage,
  toggleCommunityChatMessageLike,
  voteCommunityChatPoll,
  unblockCommunityChatUser,
  unpinCommunityChatMessage,
  updateCommunityChatAdminRuntimePolicy,
  updateCommunityChatNotificationSettings,
  updateCommunityChatOwnProfile,
  uploadCommunityChatImage,
} = await import('./communityChatApi');

describe('communityChatApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('读取访问状态和房间目录时使用独立 community-chat REST 域', () => {
    getCommunityChatAccess();
    getCommunityChatRooms();

    expect(mocks.apiBaseGet).toHaveBeenNthCalledWith(1, '/api/community-chat/access', undefined, { silent: true });
    expect(mocks.apiBaseGet).toHaveBeenNthCalledWith(2, '/api/community-chat/rooms', undefined, { silent: true });
  });

  it('申请与规则确认不会扩张私人 AI /chat 接口', () => {
    requestCommunityChatAccess('首批内测');
    acceptCommunityChatRules('rules-v1');

    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      1,
      '/api/community-chat/access-requests',
      { message: '首批内测' },
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      2,
      '/api/community-chat/membership/accept-rules',
      { rulesVersion: 'rules-v1' },
      { silent: true },
    );
  });

  it('文本消息、幂等发送和阅读位置使用社区独立 REST 路径', () => {
    getCommunityChatMessages('general', { focus: 'message-1', limit: 30 });
    getCommunityChatMessages('general', { after: 'message-1', limit: 30 });
    sendCommunityChatMessage('general', {
      clientRequestId: 'request-1',
      content: '你好',
      replyToPublicId: 'message-0',
      mentionMessagePublicIds: ['message-mention-1'],
      imagePublicIds: ['image-1'],
    });
    markCommunityChatRoomRead('general', 'message-1');

    expect(mocks.apiBaseGet).toHaveBeenCalledWith(
      '/api/community-chat/rooms/general/messages',
      { focus: 'message-1', limit: 30 },
      { silent: true },
    );
    expect(mocks.apiBaseGet).toHaveBeenCalledWith(
      '/api/community-chat/rooms/general/messages',
      { after: 'message-1', limit: 30 },
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/community-chat/rooms/general/messages',
      {
        clientRequestId: 'request-1',
        content: '你好',
        replyToPublicId: 'message-0',
        mentionMessagePublicIds: ['message-mention-1'],
        imagePublicIds: ['image-1'],
      },
      { silent: true },
    );
    expect(mocks.apiBasePut).toHaveBeenCalledWith(
      '/api/community-chat/rooms/general/read',
      { lastMessagePublicId: 'message-1' },
      { silent: true },
    );
  });

  it('投票、单条权威刷新和批量已读回执都只使用消息公有 ID', () => {
    getCommunityChatMessage('message/1');
    voteCommunityChatPoll('message/1', 'option/1');
    closeCommunityChatPoll('message/1');
    recordCommunityChatReadReceipts('general', ['message/1', 'message/2']);

    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/community-chat/messages/message%2F1', undefined, {
      silent: true,
    });
    expect(mocks.apiBasePut).toHaveBeenNthCalledWith(
      1,
      '/api/community-chat/messages/message%2F1/poll/vote',
      { optionPublicId: 'option/1' },
      { silent: true },
    );
    expect(mocks.apiBasePut).toHaveBeenNthCalledWith(
      2,
      '/api/community-chat/messages/message%2F1/poll/close',
      {},
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/community-chat/rooms/general/read-receipts',
      { messagePublicIds: ['message/1', 'message/2'] },
      { silent: true },
    );
  });

  it('聊天图片上传和丢弃使用聊天室专用资源，不暴露对象存储路径', () => {
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    uploadCommunityChatImage('general', file);
    discardCommunityChatImage('image/1');

    const uploadCall = mocks.apiBasePost.mock.calls[0];
    expect(uploadCall[0]).toBe('/api/community-chat/rooms/general/images');
    expect(uploadCall[1]).toBeInstanceOf(FormData);
    expect((uploadCall[1] as FormData).get('file')).toBe(file);
    expect(uploadCall[2]).toEqual({ silent: true });
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      2,
      '/api/community-chat/images/image%2F1/discard',
      {},
      { silent: true },
    );
  });

  it('聊天室四档提醒在全局设置与聊天室复用同一 REST 资源', () => {
    getCommunityChatNotificationSettings();
    updateCommunityChatNotificationSettings({ enabled: true, level: 'mentions' });

    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/community-chat/settings/notifications', undefined, {
      silent: true,
    });
    expect(mocks.apiBasePut).toHaveBeenCalledWith(
      '/api/community-chat/settings/notifications',
      { enabled: true, level: 'mentions' },
      { silent: true },
    );
  });

  it('公开用户卡只通过消息公有 ID 读取，不接受内部账号 ID', () => {
    getCommunityChatMessageAuthorProfile('message/1');
    getCommunityChatMessageAuthorAchievements('message/1');

    expect(mocks.apiBaseGet).toHaveBeenCalledWith(
      '/api/community-chat/messages/message%2F1/author-profile',
      undefined,
      { silent: true },
    );
    expect(mocks.apiBaseGet).toHaveBeenCalledWith(
      '/api/community-chat/messages/message%2F1/author-profile/achievements',
      undefined,
      { silent: true },
    );
  });

  it('个人社区名片只读取当前登录身份，并通过 PUT 携带乐观并发版本', () => {
    getCommunityChatOwnProfile();
    updateCommunityChatOwnProfile({
      bio: '喜欢整理知识',
      showCommunityTenure: false,
      featuredAchievementKeys: ['streak_7'],
      baseRevision: 3,
    });

    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/community-chat/profile/me', undefined, { silent: true });
    expect(mocks.apiBasePut).toHaveBeenCalledWith(
      '/api/community-chat/profile/me',
      {
        bio: '喜欢整理知识',
        showCommunityTenure: false,
        featuredAchievementKeys: ['streak_7'],
        baseRevision: 3,
      },
      { silent: true },
    );
  });

  it('客户端发送请求标识始终非空且落在服务端 64 字符上限内', () => {
    const requestId = createCommunityChatClientRequestId();
    expect(requestId.length).toBeGreaterThanOrEqual(8);
    expect(requestId.length).toBeLessThanOrEqual(64);
  });

  it('Root 运行策略通过独立管理路径读取和切换', () => {
    getCommunityChatAdminRuntimePolicy();
    updateCommunityChatAdminRuntimePolicy({ postingEnabled: false, reason: '异常刷屏，暂停发言' });

    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/community-chat/admin/runtime-policy', undefined, {
      silent: true,
    });
    expect(mocks.apiBasePut).toHaveBeenCalledWith(
      '/api/community-chat/admin/runtime-policy',
      { postingEnabled: false, reason: '异常刷屏，暂停发言' },
      { silent: true },
    );
  });

  it('举报、屏蔽与解除屏蔽仅使用消息或屏蔽公有 ID', () => {
    reportCommunityChatMessage('message/1', { reasonCode: 'privacy', detail: '包含私人信息' });
    blockCommunityChatMessageAuthor('message/1');
    getCommunityChatBlocks();
    unblockCommunityChatUser('block/1');

    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      1,
      '/api/community-chat/messages/message%2F1/report',
      { reasonCode: 'privacy', detail: '包含私人信息' },
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      2,
      '/api/community-chat/messages/message%2F1/block-author',
      {},
      { silent: true },
    );
    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/community-chat/blocks', undefined, { silent: true });
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      3,
      '/api/community-chat/blocks/block%2F1/unblock',
      {},
      { silent: true },
    );
  });

  it('点赞、撤回与仅为自己删除都只使用消息公有 ID，并保持独立消息动作路径', () => {
    toggleCommunityChatMessageLike('message/1');
    recallCommunityChatMessage('message/1');
    deleteCommunityChatMessage('message/1');

    expect(mocks.apiBasePut).toHaveBeenCalledWith(
      '/api/community-chat/messages/message%2F1/like',
      {},
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/community-chat/messages/message%2F1/recall',
      {},
      {
        silent: true,
      },
    );
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/community-chat/messages/message%2F1/delete',
      {},
      { silent: true },
    );
  });

  it('置顶读取按房间路径，置顶和取消只使用消息公有 ID', () => {
    getCommunityChatPinnedMessage('general/room');
    pinCommunityChatMessage('message/1');
    unpinCommunityChatMessage('message/1');

    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/community-chat/rooms/general%2Froom/pin', undefined, {
      silent: true,
    });
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      1,
      '/api/community-chat/messages/message%2F1/pin',
      {},
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(
      2,
      '/api/community-chat/messages/message%2F1/unpin',
      {},
      { silent: true },
    );
  });

  it('Root 举报审核使用独立管理路径并编码举报 ID', () => {
    getCommunityChatAdminReports({ status: 'pending', page: 2, pageSize: 20 });
    reviewCommunityChatAdminReport('report/1', {
      action: 'mute_author',
      note: '连续骚扰',
      durationMinutes: 1440,
    });

    expect(mocks.apiBaseGet).toHaveBeenCalledWith(
      '/api/community-chat/admin/reports',
      { status: 'pending', page: 2, pageSize: 20 },
      { silent: true },
    );
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/community-chat/admin/reports/report%2F1/review',
      { action: 'mute_author', note: '连续骚扰', durationMinutes: 1440 },
      { silent: true },
    );
  });
});
