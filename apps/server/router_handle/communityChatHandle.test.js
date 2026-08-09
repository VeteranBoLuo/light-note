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
  getAuthorProfile: vi.fn(),
  createMessage: vi.fn(),
  markRead: vi.fn(),
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
}));

vi.mock('../util/common.js', () => ({
  L: vi.fn((_req, zh) => zh),
  reqLang: vi.fn(() => 'zh-CN'),
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'TEST_ERROR' }));
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
  getCommunityChatMessageAuthorProfile: mocks.getAuthorProfile,
  createCommunityChatMessage: mocks.createMessage,
  markCommunityChatRoomRead: mocks.markRead,
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
  listAccessRequests,
  listReports,
  markRoomRead,
  messageAuthorProfile,
  messages,
  notificationSettings,
  reportMessage,
  requestAccess,
  reviewAccessRequest,
  reviewReport,
  revokeMember,
  rooms,
  runtimePolicy,
  updateRuntimePolicy,
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
      query: { before: 'message-1', focus: 'message-focus', limit: '20', userId: 'forged-user' },
    };
    const res = mockRes();

    await messages(req, res);

    expect(mocks.listMessages).toHaveBeenCalledWith({
      user: req.user,
      roomSlug: 'newcomers',
      before: 'message-1',
      focus: 'message-focus',
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
      limit: undefined,
    });
    expect(roomsRes.status).not.toHaveBeenCalledWith(403);
    expect(messagesRes.status).not.toHaveBeenCalledWith(403);
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
    });
    expect(res.send).toHaveBeenCalledWith({
      data: { name: '薄荷', level: 3, achievements: [] },
      status: 200,
      msg: '',
    });
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

  it('聊天室提醒设置拒绝游客与管理员预览，并只透传总开关和三级范围', async () => {
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
    expect(updateRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true, level: 'mentions' }, msg: '聊天室提醒设置已保存' }),
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
