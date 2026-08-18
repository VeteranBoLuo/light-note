import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccess: vi.fn(),
  requestAccess: vi.fn(),
  acceptRules: vi.fn(),
  listRooms: vi.fn(),
  listRequests: vi.fn(),
  reviewRequest: vi.fn(),
  revokeMember: vi.fn(),
  getRuntimePolicy: vi.fn(),
  updateRuntimePolicy: vi.fn(),
  listMessages: vi.fn(),
  getPinnedMessage: vi.fn(),
  getAuthorAvatar: vi.fn(),
  getAuthorProfile: vi.fn(),
  getAuthorAchievements: vi.fn(),
  getOwnProfile: vi.fn(),
  getOwnProfileAvatar: vi.fn(),
  updateOwnProfile: vi.fn(),
  createMessage: vi.fn(),
  deleteMessage: vi.fn(),
  markRead: vi.fn(),
  toggleLike: vi.fn(),
  recallMessage: vi.fn(),
  pinMessage: vi.fn(),
  unpinMessage: vi.fn(),
  uploadImage: vi.fn(),
  getImageDownload: vi.fn(),
  discardImage: vi.fn(),
  reportMessage: vi.fn(),
  blockAuthor: vi.fn(),
  listBlocks: vi.fn(),
  unblockUser: vi.fn(),
  listReports: vi.fn(),
  reviewReport: vi.fn(),
  getNotificationSettings: vi.fn(),
  updateNotificationSettings: vi.fn(),
  recordServerOperation: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  L: vi.fn((_req, zh) => zh),
  reqLang: vi.fn(() => 'zh-CN'),
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'TEST_ERROR' }));
vi.mock('../util/operationLog.js', () => ({ recordServerOperation: mocks.recordServerOperation }));
vi.mock('../util/services/communityChatAccessService.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    CommunityChatError: original.CommunityChatError,
    getCommunityChatAccess: mocks.getAccess,
    requestCommunityChatAccess: mocks.requestAccess,
    acceptCommunityChatRules: mocks.acceptRules,
    listCommunityChatRooms: mocks.listRooms,
    listCommunityChatAccessRequests: mocks.listRequests,
    reviewCommunityChatAccessRequest: mocks.reviewRequest,
    revokeCommunityChatMember: mocks.revokeMember,
    getCommunityChatRuntimePolicyForAdmin: mocks.getRuntimePolicy,
    updateCommunityChatRuntimePolicy: mocks.updateRuntimePolicy,
  };
});
vi.mock('../util/services/communityChatMessageService.js', () => ({
  listCommunityChatMessages: mocks.listMessages,
  getCommunityChatPinnedMessage: mocks.getPinnedMessage,
  getCommunityChatMessageAuthorAvatar: mocks.getAuthorAvatar,
  createCommunityChatMessage: mocks.createMessage,
  deleteCommunityChatMessage: mocks.deleteMessage,
  markCommunityChatRoomRead: mocks.markRead,
  toggleCommunityChatMessageLike: mocks.toggleLike,
  recallCommunityChatMessage: mocks.recallMessage,
  pinCommunityChatMessage: mocks.pinMessage,
  unpinCommunityChatMessage: mocks.unpinMessage,
}));
vi.mock('../util/services/communityChatProfileService.js', () => ({
  getCommunityChatMessageAuthorProfile: mocks.getAuthorProfile,
  getCommunityChatMessageAuthorAchievements: mocks.getAuthorAchievements,
  getCommunityChatOwnProfile: mocks.getOwnProfile,
  getCommunityChatOwnProfileAvatar: mocks.getOwnProfileAvatar,
  updateCommunityChatOwnProfile: mocks.updateOwnProfile,
}));
vi.mock('../util/services/communityChatImageService.js', () => ({
  uploadCommunityChatImage: mocks.uploadImage,
  getCommunityChatImageDownload: mocks.getImageDownload,
  discardCommunityChatImage: mocks.discardImage,
}));
vi.mock('../util/services/communityChatModerationService.js', () => ({
  reportCommunityChatMessage: mocks.reportMessage,
  blockCommunityChatMessageAuthor: mocks.blockAuthor,
  listCommunityChatBlocks: mocks.listBlocks,
  unblockCommunityChatUser: mocks.unblockUser,
  listCommunityChatReports: mocks.listReports,
  reviewCommunityChatReport: mocks.reviewReport,
}));
vi.mock('../util/services/communityChatNotificationService.js', () => ({
  getCommunityChatNotificationSettings: mocks.getNotificationSettings,
  updateCommunityChatNotificationSettings: mocks.updateNotificationSettings,
}));

const { CommunityChatError } = await import('../util/services/communityChatAccessService.js');
const {
  access,
  blockMessageAuthor,
  createMessage,
  deleteMessage,
  listAccessRequests,
  listReports,
  markRoomRead,
  messageAuthorAvatar,
  messageAuthorAchievements,
  messageAuthorProfile,
  messages,
  pinnedMessage,
  notificationSettings,
  ownProfile,
  ownProfileAvatar,
  reportMessage,
  recallMessage,
  pinMessage,
  requestAccess,
  reviewAccessRequest,
  reviewReport,
  revokeMember,
  rooms,
  runtimePolicy,
  toggleMessageLike,
  unpinMessage,
  updateRuntimePolicy,
  updateOwnProfile,
  updateNotificationSettings,
} = await import('./communityChatHandle.js');

function mockRes() {
  const res = { status: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('communityChatHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('公开访问状态只使用认证中间件还原的 req.user', async () => {
    mocks.getAccess.mockResolvedValue({ status: 'closed', canEnter: false });
    const req = { user: { id: 'visitor-1', role: 'visitor' }, query: { userId: 'forged-user' } };
    const res = mockRes();

    await access(req, res);

    expect(mocks.getAccess).toHaveBeenCalledWith({ user: req.user });
    expect(res.send).toHaveBeenCalledWith({ data: { status: 'closed', canEnter: false }, status: 200, msg: '' });
  });

  it('管理员预览上下文不能代用目标用户的社区身份', async () => {
    const res = mockRes();
    await access(
      {
        user: { id: 'subject-1', role: 'user' },
        adminContext: { id: 'context-1', mode: 'readonly' },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'COMMUNITY_CHAT_ADMIN_PREVIEW_FORBIDDEN' }, status: 403 }),
    );
    expect(mocks.getAccess).not.toHaveBeenCalled();
  });

  it('游客写申请在进入 Service 前被拒绝', async () => {
    const res = mockRes();
    await requestAccess({ user: { id: 'visitor-1', role: 'visitor' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: { code: 'LOGIN_REQUIRED' } }));
    expect(mocks.requestAccess).not.toHaveBeenCalled();
  });

  it('领域错误返回稳定业务码，不把底层异常结构暴露给客户端', async () => {
    mocks.listRooms.mockRejectedValue(
      new CommunityChatError('INVITE_REQUIRED', 403, '当前账号还不能查看聊天室频道', 'Invite required'),
    );
    const res = mockRes();

    await rooms({ user: { id: 'user-1', role: 'user' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith({
      data: { code: 'INVITE_REQUIRED' },
      status: 403,
      msg: '当前账号还不能查看聊天室频道',
    });
  });

  it('未知错误统一收敛为社区服务不可用', async () => {
    mocks.getAccess.mockRejectedValue(new Error('sensitive database detail'));
    const res = mockRes();

    await access({ user: { id: 'user-1', role: 'user' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      data: { code: 'COMMUNITY_CHAT_UNAVAILABLE' },
      status: 500,
      msg: '社区客厅暂时不可用，请稍后重试',
    });
  });

  it('消息历史只接受路由频道与服务端认证用户，不接受伪造 userId', async () => {
    mocks.listMessages.mockResolvedValue({ roomSlug: 'newcomers', items: [] });
    const req = {
      user: { id: 'user-1', role: 'user' },
      params: { slug: 'newcomers' },
      query: {
        before: 'message-1',
        focus: 'message-focus',
        after: 'message-after',
        limit: '20',
        userId: 'forged-user',
      },
    };
    const res = mockRes();

    await messages(req, res);

    expect(mocks.listMessages).toHaveBeenCalledWith({
      user: req.user,
      roomSlug: 'newcomers',
      before: 'message-1',
      focus: 'message-focus',
      after: 'message-after',
      limit: '20',
    });
    expect(res.send).toHaveBeenCalledWith({ data: { roomSlug: 'newcomers', items: [] }, status: 200, msg: '' });
  });

  it('游客读取公共频道与消息时进入只读 Service，写接口仍由独立登录门禁保护', async () => {
    const visitor = { id: 'visitor-1', role: 'visitor' };
    mocks.listRooms.mockResolvedValue({ access: { status: 'read_only' }, items: [] });
    mocks.listMessages.mockResolvedValue({ roomSlug: 'newcomers', items: [] });
    const roomsRes = mockRes();
    const messagesRes = mockRes();

    await rooms({ user: visitor }, roomsRes);
    await messages({ user: visitor, params: { slug: 'newcomers' }, query: {} }, messagesRes);

    expect(mocks.listRooms).toHaveBeenCalledWith({ user: visitor, locale: 'zh-CN' });
    expect(mocks.listMessages).toHaveBeenCalledWith({
      user: visitor,
      roomSlug: 'newcomers',
      before: undefined,
      focus: undefined,
      after: undefined,
      limit: undefined,
    });
    expect(roomsRes.status).not.toHaveBeenCalledWith(403);
    expect(messagesRes.status).not.toHaveBeenCalledWith(403);
  });

  it('置顶消息允许游客只读，置顶和取消置顶写接口只接受登录身份', async () => {
    const visitor = { id: 'visitor-1', role: 'visitor' };
    mocks.getPinnedMessage.mockResolvedValue({ roomSlug: 'general', message: null });
    const readRes = mockRes();
    const pinRes = mockRes();
    const unpinRes = mockRes();

    await pinnedMessage({ user: visitor, params: { slug: 'general' } }, readRes);
    await pinMessage({ user: visitor, params: { publicId: 'message-1' } }, pinRes);
    await unpinMessage({ user: visitor, params: { publicId: 'message-1' } }, unpinRes);

    expect(mocks.getPinnedMessage).toHaveBeenCalledWith({ user: visitor, roomSlug: 'general' });
    expect(readRes.send).toHaveBeenCalledWith({
      data: { roomSlug: 'general', message: null },
      status: 200,
      msg: '',
    });
    expect(pinRes.status).toHaveBeenCalledWith(403);
    expect(unpinRes.status).toHaveBeenCalledWith(403);
    expect(mocks.pinMessage).not.toHaveBeenCalled();
    expect(mocks.unpinMessage).not.toHaveBeenCalled();
  });

  it('游客可通过消息公有 ID 查看作者公开名片，Handle 不接受目标账号 ID', async () => {
    const user = { id: 'visitor-1', role: 'visitor' };
    mocks.getAuthorProfile.mockResolvedValue({ name: '薄荷', level: 3, achievements: [] });
    const res = mockRes();

    await messageAuthorProfile(
      {
        user,
        params: { publicId: '11111111-1111-4111-8111-111111111111' },
        query: { userId: 'forged-user' },
      },
      res,
    );

    expect(mocks.getAuthorProfile).toHaveBeenCalledWith({
      user,
      messagePublicId: '11111111-1111-4111-8111-111111111111',
      locale: 'zh-CN',
    });
    expect(res.send).toHaveBeenCalledWith({
      data: { name: '薄荷', level: 3, achievements: [] },
      status: 200,
      msg: '',
    });
  });

  it('作者全部成就继续只接受消息公有 ID，个人资料读写使用当前登录身份和版本号', async () => {
    const user = { id: 'user-1', role: 'user' };
    mocks.getAuthorAchievements.mockResolvedValue({ achievements: [{ key: 'streak_7', group: 'checkin' }] });
    mocks.getOwnProfile.mockResolvedValue({ bio: '喜欢整理知识', revision: 2 });
    mocks.updateOwnProfile.mockResolvedValue({ bio: '新的简介', revision: 3 });
    const achievementRes = mockRes();
    const ownRes = mockRes();
    const updateRes = mockRes();

    await messageAuthorAchievements(
      { user, params: { publicId: 'message-1' }, query: { userId: 'forged-user' } },
      achievementRes,
    );
    await ownProfile({ user }, ownRes);
    await updateOwnProfile(
      {
        user,
        body: {
          bio: '新的简介',
          showCommunityTenure: false,
          featuredAchievementKeys: ['streak_7'],
          baseRevision: 2,
          userId: 'forged-user',
        },
      },
      updateRes,
    );

    expect(mocks.getAuthorAchievements).toHaveBeenCalledWith({ user, messagePublicId: 'message-1' });
    expect(mocks.getOwnProfile).toHaveBeenCalledWith({ user, locale: 'zh-CN' });
    expect(mocks.updateOwnProfile).toHaveBeenCalledWith({
      user,
      bio: '新的简介',
      showCommunityTenure: false,
      featuredAchievementKeys: ['streak_7'],
      baseRevision: 2,
      locale: 'zh-CN',
    });
    expect(achievementRes.send).toHaveBeenCalled();
    expect(ownRes.send).toHaveBeenCalled();
    expect(updateRes.send).toHaveBeenCalled();
  });

  it('个人头像接口拒绝游客并复用安全图片输出', async () => {
    const visitorRes = mockRes();
    await ownProfileAvatar({ user: { id: 'visitor-1', role: 'visitor' } }, visitorRes);
    expect(visitorRes.status).toHaveBeenCalledWith(403);
    expect(mocks.getOwnProfileAvatar).not.toHaveBeenCalled();

    const user = { id: 'user-1', role: 'user' };
    mocks.getOwnProfileAvatar.mockResolvedValue({ source: 'data:image/png;base64,YQ==' });
    const userRes = mockRes();
    userRes.set = vi.fn().mockReturnValue(userRes);
    userRes.type = vi.fn().mockReturnValue(userRes);
    await ownProfileAvatar({ user }, userRes);
    expect(mocks.getOwnProfileAvatar).toHaveBeenCalledWith({ user });
    expect(userRes.type).toHaveBeenCalledWith('image/png');
    expect(userRes.send).toHaveBeenCalledWith(Buffer.from('a'));
  });

  it('作者头像延迟接口以私有缓存返回安全图片字节', async () => {
    const user = { id: 'visitor-1', role: 'visitor' };
    mocks.getAuthorAvatar.mockResolvedValue({ source: 'data:image/png;base64,YQ==' });
    const res = mockRes();
    res.set = vi.fn().mockReturnValue(res);
    res.type = vi.fn().mockReturnValue(res);

    await messageAuthorAvatar({ user, params: { publicId: '11111111-1111-4111-8111-111111111111' } }, res);

    expect(mocks.getAuthorAvatar).toHaveBeenCalledWith({
      user,
      messagePublicId: '11111111-1111-4111-8111-111111111111',
    });
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, max-age=300');
    expect(res.type).toHaveBeenCalledWith('image/png');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('a'));
  });

  it('发送和已读接口只透传经过白名单提取的消息字段', async () => {
    mocks.createMessage.mockResolvedValue({ message: { publicId: 'message-1' }, idempotent: false });
    mocks.markRead.mockResolvedValue({ roomSlug: 'newcomers', lastReadMessagePublicId: 'message-1' });
    const user = { id: 'user-1', role: 'user' };
    const createRes = mockRes();
    const readRes = mockRes();

    await createMessage(
      {
        user,
        params: { slug: 'newcomers' },
        body: {
          clientRequestId: 'request-1',
          content: '你好',
          replyToPublicId: 'message-0',
          mentionMessagePublicIds: ['message-mention-1'],
          imagePublicIds: ['image-1'],
          userId: 'forged-user',
          status: 'official',
        },
      },
      createRes,
    );
    await markRoomRead(
      {
        user,
        params: { slug: 'newcomers' },
        body: { lastMessagePublicId: 'message-1', userId: 'forged-user' },
      },
      readRes,
    );

    expect(mocks.createMessage).toHaveBeenCalledWith({
      user,
      roomSlug: 'newcomers',
      clientRequestId: 'request-1',
      content: '你好',
      replyToPublicId: 'message-0',
      mentionMessagePublicIds: ['message-mention-1'],
      imagePublicIds: ['image-1'],
    });
    expect(mocks.markRead).toHaveBeenCalledWith({
      user,
      roomSlug: 'newcomers',
      lastMessagePublicId: 'message-1',
    });
    expect(createRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotent: false }), msg: '消息已发送' }),
    );
  });

  it('点赞、撤回与个人删除接口只使用认证用户和消息公有 ID', async () => {
    const user = { id: 'user-1', role: 'user' };
    mocks.toggleLike.mockResolvedValue({ publicId: 'message-1', likedByMe: true, likeCount: 1 });
    mocks.recallMessage.mockResolvedValue({ publicId: 'message-1', status: 'recalled' });
    mocks.deleteMessage.mockResolvedValue({ publicId: 'message-1', status: 'deleted_for_me' });
    const likeRes = mockRes();
    const recallRes = mockRes();
    const deleteRes = mockRes();

    await toggleMessageLike(
      { user, params: { publicId: 'message-1' }, body: { likeCount: 999, targetUserId: 'forged-user' } },
      likeRes,
    );
    await recallMessage(
      { user, params: { publicId: 'message-1' }, body: { createdAt: 'forged', targetUserId: 'forged-user' } },
      recallRes,
    );
    await deleteMessage(
      { user, params: { publicId: 'message-1' }, body: { hardDelete: true, targetUserId: 'forged-user' } },
      deleteRes,
    );

    expect(mocks.toggleLike).toHaveBeenCalledWith({ user, messagePublicId: 'message-1' });
    expect(mocks.recallMessage).toHaveBeenCalledWith({ user, messagePublicId: 'message-1' });
    expect(mocks.deleteMessage).toHaveBeenCalledWith({ user, messagePublicId: 'message-1' });
    expect(recallRes.send).toHaveBeenCalledWith(expect.objectContaining({ msg: '消息已撤回' }));
    expect(deleteRes.send).toHaveBeenCalledWith(expect.objectContaining({ msg: '已从你的聊天记录删除' }));
  });

  it('聊天室提醒设置拒绝游客与管理员预览，并只透传总开关和四档范围', async () => {
    const visitorRes = mockRes();
    await notificationSettings({ user: { id: 'visitor-1', role: 'visitor' } }, visitorRes);
    expect(visitorRes.status).toHaveBeenCalledWith(403);
    expect(mocks.getNotificationSettings).not.toHaveBeenCalled();

    const previewRes = mockRes();
    await updateNotificationSettings(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: { id: 'preview-1' },
        body: { enabled: true, level: 'all' },
      },
      previewRes,
    );
    expect(previewRes.status).toHaveBeenCalledWith(403);

    const user = { id: 'user-1', role: 'user' };
    mocks.updateNotificationSettings.mockResolvedValue({ enabled: true, level: 'mentions' });
    const updateRes = mockRes();
    await updateNotificationSettings(
      { user, body: { enabled: true, level: 'mentions', android: true, userId: 'forged-user' } },
      updateRes,
    );

    expect(mocks.updateNotificationSettings).toHaveBeenCalledWith({ user, enabled: true, level: 'mentions' });
    expect(mocks.recordServerOperation).toHaveBeenCalledWith(
      expect.objectContaining({ user }),
      {
        module: '公共聊天室',
        operation: '保存聊天室提醒设置【开启；范围：管理员和提及】',
      },
    );
    expect(updateRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true, level: 'mentions' }, msg: '聊天室提醒设置已保存' }),
    );
  });

  it.each([
    ['official', '仅管理员'],
    ['mentions_only', '仅提及'],
    ['mentions', '管理员和提及'],
    ['all', '全部消息'],
  ])('聊天室提醒四档范围成功保存后写入明确操作日志：%s', async (level, label) => {
    const user = { id: 'user-1', role: 'user' };
    const req = { user, body: { enabled: true, level } };
    const res = mockRes();
    mocks.updateNotificationSettings.mockResolvedValue({ enabled: true, level });

    await updateNotificationSettings(req, res);

    expect(mocks.recordServerOperation).toHaveBeenCalledWith(req, {
      module: '公共聊天室',
      operation: `保存聊天室提醒设置【开启；范围：${label}】`,
    });
  });

  it('关闭聊天室提醒成功后记录关闭状态，日志失败不反向影响业务结果', async () => {
    const user = { id: 'user-1', role: 'user' };
    const req = { user, body: { enabled: false, level: 'mentions_only' } };
    const res = mockRes();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.updateNotificationSettings.mockResolvedValue({ enabled: false, level: 'mentions_only' });
    mocks.recordServerOperation.mockRejectedValueOnce(new Error('operation log unavailable'));

    await updateNotificationSettings(req, res);

    expect(mocks.recordServerOperation).toHaveBeenCalledWith(req, {
      module: '公共聊天室',
      operation: '保存聊天室提醒设置【关闭；范围：仅提及】',
    });
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false, level: 'mentions_only' }, status: 200 }),
    );
    expect(consoleError).toHaveBeenCalledWith('[社区客厅] 提醒设置操作日志写入失败 code=%s', 'TEST_ERROR');
    consoleError.mockRestore();
  });

  it('聊天室提醒设置保存失败时不写入成功操作日志', async () => {
    const req = {
      user: { id: 'user-1', role: 'user' },
      body: { enabled: true, level: 'all' },
    };
    const res = mockRes();
    mocks.updateNotificationSettings.mockRejectedValue(
      new CommunityChatError('INVALID_NOTIFICATION_LEVEL', 400, '聊天室提醒范围无效', 'Invalid level'),
    );

    await updateNotificationSettings(req, res);

    expect(mocks.recordServerOperation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'INVALID_NOTIFICATION_LEVEL' }, status: 400 }),
    );
  });

  it('社区准入管理接口只允许普通 Root 上下文，并只透传审核白名单字段', async () => {
    const deniedRes = mockRes();
    await listAccessRequests({ user: { id: 'user-1', role: 'user' }, query: { status: 'pending' } }, deniedRes);
    expect(deniedRes.status).toHaveBeenCalledWith(403);
    expect(mocks.listRequests).not.toHaveBeenCalled();

    const root = { id: 'root-1', role: 'root' };
    mocks.reviewRequest.mockResolvedValue({ userId: 'user-2', status: 'approved' });
    const reviewRes = mockRes();
    await reviewAccessRequest(
      {
        user: root,
        params: { userId: 'user-2' },
        body: { action: 'approve', note: '首批内测', role: 'admin', status: 'active' },
      },
      reviewRes,
    );

    expect(mocks.reviewRequest).toHaveBeenCalledWith({
      user: root,
      targetUserId: 'user-2',
      action: 'approve',
      note: '首批内测',
    });
    expect(reviewRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'user-2', status: 'approved' }, msg: '内测申请已处理' }),
    );
  });

  it('Root 撤销接口拒绝管理员预览，避免代用目标用户社区身份', async () => {
    const res = mockRes();
    await revokeMember(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: { id: 'context-1', mode: 'maintain' },
        params: { userId: 'user-2' },
        body: { reason: '暂停资格' },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.revokeMember).not.toHaveBeenCalled();
  });

  it('Root 运行策略接口拒绝管理员预览，并只透传开关与审计原因', async () => {
    const previewRes = mockRes();
    await runtimePolicy(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: { id: 'context-1', mode: 'readonly' },
      },
      previewRes,
    );
    expect(previewRes.status).toHaveBeenCalledWith(403);
    expect(mocks.getRuntimePolicy).not.toHaveBeenCalled();

    const root = { id: 'root-1', role: 'root' };
    mocks.updateRuntimePolicy.mockResolvedValue({ postingEnabled: false, changed: true });
    const updateRes = mockRes();
    await updateRuntimePolicy(
      {
        user: root,
        body: {
          postingEnabled: false,
          reason: '异常刷屏，暂停发言',
          actorUserId: 'forged-root',
          emergencyReadOnly: false,
        },
      },
      updateRes,
    );

    expect(mocks.updateRuntimePolicy).toHaveBeenCalledWith({
      user: root,
      postingEnabled: false,
      reason: '异常刷屏，暂停发言',
    });
    expect(updateRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { postingEnabled: false, changed: true }, msg: '聊天室运行状态已更新' }),
    );
  });

  it('举报与屏蔽接口只使用消息公有 ID 和认证用户，不接受目标账号注入', async () => {
    const user = { id: 'user-1', role: 'user' };
    mocks.reportMessage.mockResolvedValue({ id: 'report-1', status: 'pending' });
    mocks.blockAuthor.mockResolvedValue({ id: 'block-1', displayName: '薄荷' });
    const reportRes = mockRes();
    const blockRes = mockRes();

    await reportMessage(
      {
        user,
        params: { publicId: 'message-1' },
        body: { reasonCode: 'spam', detail: '重复广告', targetUserId: 'forged-user' },
      },
      reportRes,
    );
    await blockMessageAuthor(
      {
        user,
        params: { publicId: 'message-1' },
        body: { targetUserId: 'forged-user' },
      },
      blockRes,
    );

    expect(mocks.reportMessage).toHaveBeenCalledWith({
      user,
      messagePublicId: 'message-1',
      reasonCode: 'spam',
      detail: '重复广告',
    });
    expect(mocks.blockAuthor).toHaveBeenCalledWith({ user, messagePublicId: 'message-1' });
    expect(reportRes.send).toHaveBeenCalledWith(expect.objectContaining({ msg: '举报已提交' }));
  });

  it('Root 举报审核接口拒绝管理员预览并只透传处置白名单字段', async () => {
    const deniedRes = mockRes();
    await listReports(
      {
        user: { id: 'root-1', role: 'root' },
        adminContext: { id: 'context-1', mode: 'readonly' },
        query: {},
      },
      deniedRes,
    );
    expect(deniedRes.status).toHaveBeenCalledWith(403);
    expect(mocks.listReports).not.toHaveBeenCalled();

    const root = { id: 'root-1', role: 'root' };
    mocks.reviewReport.mockResolvedValue({ id: 'report-1', status: 'actioned', action: 'mute_author' });
    const reviewRes = mockRes();
    await reviewReport(
      {
        user: root,
        params: { reportId: 'report-1' },
        body: {
          action: 'mute_author',
          note: '连续骚扰',
          durationMinutes: 1440,
          targetUserId: 'forged-user',
          messageId: 999,
        },
      },
      reviewRes,
    );

    expect(mocks.reviewReport).toHaveBeenCalledWith({
      user: root,
      reportId: 'report-1',
      action: 'mute_author',
      note: '连续骚扰',
      durationMinutes: 1440,
    });
    expect(reviewRes.send).toHaveBeenCalledWith(expect.objectContaining({ msg: '举报已处理' }));
  });
});
