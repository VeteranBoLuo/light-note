import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getAuthorProfile: vi.fn(),
  uploadImage: vi.fn(),
  discardImage: vi.fn(),
  markRead: vi.fn(),
  sendMessage: vi.fn(),
  getRooms: vi.fn(),
  reportMessage: vi.fn(),
  blockAuthor: vi.fn(),
  getBlocks: vi.fn(),
  unblockUser: vi.fn(),
  recordOperation: vi.fn(),
  alert: vi.fn(),
  alertDestroy: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  messageError: vi.fn(),
  routerReplace: vi.fn(),
  scrollIntoContainer: vi.fn(),
  route: { query: {} as Record<string, unknown> },
  bookmark: {
    authModalTab: '登录',
    authModalSource: '',
    isShowLogin: false,
  },
  user: {
    id: 'user-1',
    role: 'user',
  },
}));

vi.mock('@/api/communityChatApi', () => ({
  createCommunityChatClientRequestId: () => 'request-fixed-0001',
  getCommunityChatMessages: mocks.getMessages,
  getCommunityChatMessageAuthorProfile: mocks.getAuthorProfile,
  uploadCommunityChatImage: mocks.uploadImage,
  discardCommunityChatImage: mocks.discardImage,
  markCommunityChatRoomRead: mocks.markRead,
  sendCommunityChatMessage: mocks.sendMessage,
  getCommunityChatRooms: mocks.getRooms,
  reportCommunityChatMessage: mocks.reportMessage,
  blockCommunityChatMessageAuthor: mocks.blockAuthor,
  getCommunityChatBlocks: mocks.getBlocks,
  unblockCommunityChatUser: mocks.unblockUser,
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.recordOperation }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: mocks.alert, destroy: mocks.alertDestroy },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.messageSuccess, warning: mocks.messageWarning, error: mocks.messageError },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: {
    name: 'SvgIconStub',
    props: ['src'],
    template: '<span class="svg-icon-stub" :data-src="src" />',
  },
}));
vi.mock('@/store', () => ({ bookmarkStore: () => mocks.bookmark, useUserStore: () => mocks.user }));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.routerReplace }),
}));
vi.mock('@/utils/zoom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scrollIntoContainer: mocks.scrollIntoContainer,
}));

const { default: CommunityChatWorkspace } = await import('./CommunityChatWorkspace.vue');

const access = {
  accessMode: 'public',
  waitlistEnabled: false,
  messagingEnabled: true,
  realtimeEnabled: false,
  postingEnabled: true,
  emergencyReadOnly: false,
  environmentReadOnly: false,
  notificationsDefaultEnabled: true,
  rulesVersion: 'rules-v1',
  authenticated: true,
  canManage: false,
  canRead: true,
  canPost: true,
  canEnter: true,
  canRequest: false,
  canAcceptRules: false,
  status: 'active',
  requestStatus: 'approved',
  memberRole: 'member',
  notificationsEnabled: false,
} as const;

const rooms = [
  {
    slug: 'general',
    name: '轻笺聊天室',
    description: '聊使用问题、实用技巧、功能想法和日常见闻。',
    type: 'text',
    status: 'active',
    notificationLevel: 'mentions',
    slowModeSeconds: 0,
    sortOrder: 10,
    unreadCount: 1,
    mentionCount: 0,
  },
] as const;

function chatMessage(overrides = {}) {
  return {
    publicId: 'message-1',
    content: '欢迎来到社区',
    status: 'active',
    createdAt: '2026-08-09T10:00:00.000Z',
    editedAt: null,
    isOwn: false,
    images: [],
    author: {
      name: '薄荷',
      role: 'member',
      avatar: 'data:image/webp;base64,member-avatar',
      frameId: 'frame_mint',
      level: 3,
      levelName: '秀才',
      title: null,
    },
    reply: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

class WorkspaceRealtimeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: WorkspaceRealtimeSocket[] = [];

  readyState = WorkspaceRealtimeSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string) {
    WorkspaceRealtimeSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  open() {
    this.readyState = WorkspaceRealtimeSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(type: string, payload: Record<string, unknown>, eventId = `${type}-0001`) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          protocolVersion: 1,
          type,
          eventId,
          serverTime: '2026-08-09T10:00:00.000Z',
          payload,
        }),
      }),
    );
  }

  close(code = 1000, reason = '') {
    this.readyState = WorkspaceRealtimeSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

let cleanup: (() => void) | undefined;

async function flushAsync() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

async function mountWorkspace(options: { rooms?: any[]; access?: any } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(CommunityChatWorkspace, {
    access: options.access || access,
    rooms: options.rooms || rooms,
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.directive('auto-scrollbar', {});
  app.mount(host);
  await flushAsync();
  await flushAsync();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bookmark.authModalTab = '登录';
  mocks.bookmark.authModalSource = '';
  mocks.bookmark.isShowLogin = false;
  mocks.route.query = {};
  mocks.routerReplace.mockResolvedValue(undefined);
  mocks.markRead.mockResolvedValue({ data: { unreadCount: 0 } });
  mocks.getRooms.mockResolvedValue({ data: { messagingEnabled: true, items: rooms } });
  mocks.reportMessage.mockResolvedValue({ status: 200, data: { id: 'report-1', status: 'pending' } });
  mocks.blockAuthor.mockResolvedValue({ status: 200, data: { id: 'block-1', displayName: '薄荷' } });
  mocks.getBlocks.mockResolvedValue({ status: 200, data: { items: [] } });
  mocks.unblockUser.mockResolvedValue({ status: 200, data: { id: 'block-1', unblocked: true } });
  mocks.getMessages.mockResolvedValue({
    data: {
      roomSlug: 'general',
      items: [chatMessage()],
      hasMore: false,
      nextBefore: null,
      focusPublicId: null,
      hasNewer: false,
      realtimeEnabled: false,
      pollingAfterMs: 8000,
      serverTime: '2026-08-09T10:00:00.000Z',
    },
  });
  mocks.getAuthorProfile.mockResolvedValue({
    data: {
      name: '薄荷',
      role: 'member',
      avatar: 'data:image/webp;base64,member-avatar',
      frameId: 'frame_mint',
      level: 3,
      levelName: '秀才',
      title: null,
      achievements: [{ key: 'streak_7', group: 'checkin' }],
      achievementCount: 1,
    },
  });
  mocks.uploadImage.mockResolvedValue({
    status: 200,
    data: {
      publicId: 'image-1',
      url: '/api/community-chat/images/image-1',
      contentType: 'image/png',
      fileSize: 12,
      width: 640,
      height: 480,
    },
  });
  mocks.discardImage.mockResolvedValue({ status: 200, data: { publicId: 'image-1', discarded: true } });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CommunityChatWorkspace', () => {
  it('实时事件只作为变化信号，并通过 REST 权威窗口补齐消息', async () => {
    WorkspaceRealtimeSocket.instances = [];
    vi.stubGlobal('WebSocket', WorkspaceRealtimeSocket);
    const host = await mountWorkspace({ access: { ...access, realtimeEnabled: true } });
    const socket = WorkspaceRealtimeSocket.instances[0];
    expect(socket.url).toContain('/realtime/chat');
    socket.open();
    socket.message('room.subscribed', { roomSlug: 'general' });
    await flushAsync();

    mocks.getMessages.mockClear();
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage(), chatMessage({ publicId: 'message-2', content: '实时补齐的新消息' })],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    socket.message('message.created', { roomSlug: 'general', messagePublicId: 'message-2' }, 'event-0002');
    await flushAsync();

    expect(mocks.getMessages).toHaveBeenCalledWith('general', { limit: 50 });
    expect(host.textContent).toContain('实时补齐的新消息');
    expect(host.textContent).toContain(zhCN.communityChat.realtimeConnected);
  });

  it('首屏历史仍在加载时完成实时订阅，会在首屏落定后再补一次权威窗口', async () => {
    WorkspaceRealtimeSocket.instances = [];
    vi.stubGlobal('WebSocket', WorkspaceRealtimeSocket);
    const firstPage = deferred<any>();
    mocks.getMessages.mockReturnValueOnce(firstPage.promise).mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage(), chatMessage({ publicId: 'message-2', content: '订阅缝隙内的新消息' })],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });

    const mounting = mountWorkspace({ access: { ...access, realtimeEnabled: true } });
    await flushAsync();
    const socket = WorkspaceRealtimeSocket.instances[0];
    socket.open();
    socket.message('room.subscribed', { roomSlug: 'general' });
    firstPage.resolve({
      data: {
        roomSlug: 'general',
        items: [chatMessage()],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    const host = await mounting;
    await flushAsync();

    expect(mocks.getMessages).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('订阅缝隙内的新消息');
  });

  it('进入真实频道后读取消息并推进已读，用户文本始终按纯文本渲染', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage({ content: '<img src=x onerror=alert(1)>纯文本' })],
        hasMore: false,
        nextBefore: null,
      },
    });

    const host = await mountWorkspace();

    expect(mocks.getMessages).toHaveBeenCalledWith('general', { limit: 50 });
    expect(mocks.markRead).toHaveBeenCalledWith('general', 'message-1');
    expect(host.querySelector('.community-workspace__rooms')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>纯文本');
    expect(host.querySelector('.community-message__content img')).toBeNull();
    expect(host.querySelector('.avatar-frame--mint')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('.avatar-frame--mint .svg-icon-stub')?.dataset.src).toBe(
      'data:image/webp;base64,member-avatar',
    );
    expect(host.textContent).toContain('Lv.3 秀才');
  });

  it('点击头像读取公开名片，展示等级与成就但不传内部账号 ID', async () => {
    const host = await mountWorkspace();

    host.querySelector<HTMLButtonElement>('.community-message__avatar')?.click();
    await flushAsync();

    expect(mocks.getAuthorProfile).toHaveBeenCalledWith('message-1');
    expect(document.body.textContent).toContain('社区名片');
    expect(document.body.textContent).toContain('Lv.3 秀才');
    expect(document.body.textContent).toContain('七日不辍');
    expect(document.body.textContent).not.toContain('user-2');
  });

  it('快速切换两个头像时以最后点击的用户名片为准', async () => {
    const firstProfile = deferred<any>();
    const secondProfile = deferred<any>();
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage(),
          chatMessage({
            publicId: 'message-2',
            content: '第二条消息',
            author: {
              name: '菠萝',
              role: 'member',
              avatar: 'data:image/webp;base64,pineapple-avatar',
              frameId: null,
              level: 8,
              levelName: '贡士',
              title: null,
            },
          }),
        ],
        hasMore: false,
        nextBefore: null,
      },
    });
    mocks.getAuthorProfile.mockImplementation((messagePublicId: string) =>
      messagePublicId === 'message-1' ? firstProfile.promise : secondProfile.promise,
    );

    const host = await mountWorkspace();
    const avatarButtons = host.querySelectorAll<HTMLButtonElement>('.community-message__avatar');
    avatarButtons[0].click();
    await flushAsync();
    avatarButtons[1].click();
    await flushAsync();

    expect(mocks.getAuthorProfile).toHaveBeenNthCalledWith(1, 'message-1');
    expect(mocks.getAuthorProfile).toHaveBeenNthCalledWith(2, 'message-2');

    secondProfile.resolve({
      data: {
        name: '菠萝',
        role: 'member',
        avatar: 'data:image/webp;base64,pineapple-avatar',
        frameId: null,
        level: 8,
        levelName: '贡士',
        title: null,
        achievements: [],
        achievementCount: 0,
      },
    });
    await flushAsync();
    expect(document.body.textContent).toContain('菠萝');
    expect(document.body.textContent).toContain('Lv.8 贡士');

    firstProfile.resolve({
      data: {
        name: '薄荷',
        role: 'member',
        avatar: 'data:image/webp;base64,member-avatar',
        frameId: 'frame_mint',
        level: 3,
        levelName: '秀才',
        title: null,
        achievements: [],
        achievementCount: 0,
      },
    });
    await flushAsync();
    expect(document.body.textContent).toContain('菠萝');
    expect(document.body.textContent).toContain('Lv.8 贡士');
  });

  it('从通知深链进入时定位并高亮原消息，可一键回到最新消息', async () => {
    mocks.route.query = { message: 'message-1', from: 'note' };
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage({ publicId: 'message-before', content: '较早消息' }), chatMessage()],
        hasMore: true,
        nextBefore: 'message-before',
        focusPublicId: 'message-1',
        hasNewer: true,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: '2026-08-09T10:00:00.000Z',
      },
    });

    const host = await mountWorkspace();
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    await flushAsync();

    expect(mocks.getMessages).toHaveBeenNthCalledWith(1, 'general', { focus: 'message-1', limit: 50 });
    expect(host.querySelector('[data-message-public-id="message-1"]')?.classList.contains('is-focused')).toBe(true);
    expect(mocks.scrollIntoContainer).toHaveBeenCalledTimes(1);
    const latestButton = host.querySelector<HTMLButtonElement>('.community-message-list__new');
    expect(latestButton?.textContent).toContain('回到最新消息');

    latestButton?.click();
    await flushAsync();
    await flushAsync();

    expect(mocks.routerReplace).toHaveBeenCalledWith({ query: { from: 'note' } });
    expect(mocks.getMessages).toHaveBeenNthCalledWith(2, 'general', { limit: 50 });
    expect(host.querySelector('.community-message-list__new')).toBeNull();
  });

  it('来源消息已删除或被屏蔽时自动回退最新消息，不把整页变成错误态', async () => {
    mocks.route.query = { message: 'message-missing' };
    mocks.getMessages.mockRejectedValueOnce(new Error('not visible'));

    const host = await mountWorkspace();

    expect(mocks.getMessages).toHaveBeenNthCalledWith(1, 'general', { focus: 'message-missing', limit: 50 });
    expect(mocks.getMessages).toHaveBeenNthCalledWith(2, 'general', { limit: 50 });
    expect(mocks.routerReplace).toHaveBeenCalledWith({ query: {} });
    expect(mocks.messageWarning).toHaveBeenCalledWith(zhCN.communityChat.sourceMessageUnavailable);
    expect(host.textContent).toContain('欢迎来到社区');
    expect(host.textContent).not.toContain(zhCN.communityChat.messagesLoadFailed);
  });

  it('浏览历史时新消息不抢滚动，点击提示后到底部并推进已读', async () => {
    vi.useFakeTimers();
    const host = await mountWorkspace();
    const messageList = host.querySelector<HTMLElement>('.community-message-list');
    expect(messageList).not.toBeNull();
    if (!messageList) return;
    Object.defineProperties(messageList, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 120 },
    });
    mocks.markRead.mockClear();
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage(), chatMessage({ publicId: 'message-2', content: '新消息' })],
        hasMore: false,
        nextBefore: null,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: '2026-08-09T10:01:00.000Z',
      },
    });

    await vi.advanceTimersByTimeAsync(8000);
    await flushAsync();

    expect(messageList.scrollTop).toBe(120);
    const newMessagesButton = host.querySelector<HTMLButtonElement>('.community-message-list__new');
    expect(newMessagesButton?.textContent).toContain('1 条新消息');
    expect(mocks.markRead).not.toHaveBeenCalled();

    newMessagesButton?.click();
    await flushAsync();

    expect(messageList.scrollTop).toBe(1000);
    expect(host.querySelector('.community-message-list__new')).toBeNull();
    expect(mocks.markRead).toHaveBeenCalledWith('general', 'message-2');
  });

  it('回复发送复用稳定 clientRequestId，并把引用消息公有 ID 交给后端', async () => {
    mocks.sendMessage.mockResolvedValue({
      data: { message: chatMessage({ publicId: 'message-2', content: '收到', isOwn: true }), idempotent: false },
    });
    const host = await mountWorkspace();
    const replyButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '回复',
    );
    replyButton?.click();
    await nextTick();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).not.toBeNull();
    if (textarea) {
      textarea.value = '收到';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await nextTick();
    const sendButton = host.querySelector<HTMLButtonElement>('.community-composer__send');
    sendButton?.click();
    await flushAsync();

    expect(mocks.sendMessage).toHaveBeenCalledWith('general', {
      clientRequestId: 'request-fixed-0001',
      content: '收到',
      replyToPublicId: 'message-1',
    });
    expect(host.textContent).toContain('收到');
  });

  it('普通成员进入公告频道时只有阅读能力，不渲染消息输入控件', async () => {
    const host = await mountWorkspace({
      rooms: [{ ...rooms[0], slug: 'announcements', name: '公告', type: 'announcement' }],
    });

    expect(host.textContent).toContain('公告频道仅允许轻笺团队和社区管理员发布');
    expect(host.querySelector('textarea')).toBeNull();
  });

  it('紧急只读保留历史和治理操作，仅移除回复与新消息输入', async () => {
    const host = await mountWorkspace({
      access: {
        ...access,
        postingEnabled: false,
        emergencyReadOnly: true,
        canPost: false,
      },
    });

    expect(host.textContent).toContain(zhCN.communityChat.emergencyReadOnlyTitle);
    expect(host.textContent).toContain(zhCN.communityChat.emergencyReadOnlyDescription);
    expect(host.textContent).toContain(zhCN.communityChat.emergencyReadOnlyComposer);
    expect(host.textContent).toContain('欢迎来到社区');
    expect(host.querySelector('textarea')).toBeNull();
    expect(
      Array.from(host.querySelectorAll<HTMLButtonElement>('button')).some(
        (button) => button.textContent?.trim() === zhCN.communityChat.replyAction,
      ),
    ).toBe(false);
    expect(host.querySelector('.community-message__more')).not.toBeNull();
  });

  it('游客可读公开消息但没有写操作，输入区引导登录或注册', async () => {
    const host = await mountWorkspace({
      access: {
        ...access,
        authenticated: false,
        canPost: false,
        status: 'read_only',
        memberRole: null,
      },
    });

    expect(host.textContent).toContain('正在以游客身份浏览');
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector('.community-message__actions')).toBeNull();
    expect(mocks.markRead).not.toHaveBeenCalled();
    const loginButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('登录 / 注册后参与'),
    );
    loginButton?.click();
    expect(mocks.bookmark.isShowLogin).toBe(true);
    expect(mocks.bookmark.authModalSource).toBe('community_chat');
  });

  it('他人消息可提交举报，客户端只发送消息公有 ID、原因和说明', async () => {
    const host = await mountWorkspace();
    host.querySelector<HTMLButtonElement>('.community-message__more')!.click();
    await flushAsync();

    const reportButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.b-action-menu-panel button'),
    ).find((button) => button.textContent?.includes('举报消息'));
    reportButton?.click();
    await flushAsync();
    const submitButton = document.body.querySelector<HTMLButtonElement>('.chat-report-modal__actions .danger_btn');
    expect(submitButton).not.toBeNull();
    submitButton?.click();
    await flushAsync();

    expect(mocks.reportMessage).toHaveBeenCalledWith('message-1', { reasonCode: 'spam', detail: '' });
    expect(mocks.messageSuccess).toHaveBeenCalledWith(zhCN.communityChat.report.success);
  });

  it('消息显性操作只保留回复，@、举报与屏蔽收进更多菜单且没有保存笔记', async () => {
    const host = await mountWorkspace();
    const actionArea = host.querySelector('.community-message__actions');
    expect(actionArea?.textContent).toContain('回复');
    expect(actionArea?.textContent).not.toContain('@');
    expect(document.body.textContent).not.toContain('保存为笔记');

    host.querySelector<HTMLButtonElement>('.community-message__more')!.click();
    await flushAsync();
    const menuText = document.body.querySelector('.b-action-menu-panel')?.textContent || '';
    expect(menuText).toContain('提及该成员');
    expect(menuText).toContain('举报消息');
    expect(menuText).toContain('屏蔽该成员');
    expect(menuText).not.toContain('保存为笔记');
  });

  it('支持上传安全图片并发送纯图片消息，客户端只提交图片公有 ID', async () => {
    mocks.sendMessage.mockResolvedValue({
      data: {
        message: chatMessage({
          publicId: 'message-image-1',
          content: '',
          isOwn: true,
          images: [
            {
              publicId: 'image-1',
              url: '/api/community-chat/images/image-1',
              contentType: 'image/png',
              fileSize: 12,
              width: 640,
              height: 480,
            },
          ],
        }),
      },
    });
    const host = await mountWorkspace();
    expect(host.querySelector('.community-composer__surface .community-composer__input')).not.toBeNull();
    expect(host.querySelector('.community-composer__surface .community-composer__toolbar')).not.toBeNull();
    const imageButton = host.querySelector<HTMLButtonElement>('.community-composer__attach');
    expect(imageButton?.textContent?.trim()).toBe('');
    expect(imageButton?.getAttribute('aria-label')).toBe(zhCN.communityChat.image.add);
    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
    const fileInput = document.body.querySelector<HTMLInputElement>('.b-upload-native-input');
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    expect(mocks.uploadImage).toHaveBeenCalledWith('general', file);
    expect(host.querySelector('.community-composer__image img')).not.toBeNull();
    const sendButton = host.querySelector<HTMLButtonElement>('.community-composer__send');
    expect(sendButton?.textContent?.trim()).toBe('');
    expect(sendButton?.getAttribute('aria-label')).toBe(zhCN.communityChat.sendAction);
    expect(sendButton?.disabled).toBe(false);
    sendButton?.click();
    await flushAsync();

    expect(mocks.sendMessage).toHaveBeenCalledWith('general', {
      clientRequestId: 'request-fixed-0001',
      content: '',
      imagePublicIds: ['image-1'],
    });
    expect(
      host.querySelector('[data-message-public-id="message-image-1"] .community-message__image img'),
    ).not.toBeNull();
  });

  it('可在输入框直接粘贴图片并保留普通文本粘贴的浏览器默认行为', async () => {
    const host = await mountWorkspace();
    const textarea = host.querySelector<HTMLTextAreaElement>('.community-composer__input textarea');
    const file = new File(['clipboard-image'], 'clipboard.png', { type: 'image/png' });
    const imagePaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imagePaste, 'clipboardData', {
      configurable: true,
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
      },
    });
    textarea?.dispatchEvent(imagePaste);
    await flushAsync();

    expect(imagePaste.defaultPrevented).toBe(true);
    expect(mocks.uploadImage).toHaveBeenCalledWith('general', file);
    expect(host.querySelector('.community-composer__image img')).not.toBeNull();

    const textPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPaste, 'clipboardData', {
      configurable: true,
      value: { items: [], files: [] },
    });
    textarea?.dispatchEvent(textPaste);
    expect(textPaste.defaultPrevented).toBe(false);
  });

  it('空草稿保持单行紧凑高度，多行内容只在上限内自动增长', async () => {
    const host = await mountWorkspace();
    const textarea = host.querySelector<HTMLTextAreaElement>('.community-composer__input textarea');
    expect(textarea).not.toBeNull();
    if (!textarea) throw new Error('missing community chat composer');
    expect(textarea.rows).toBe(1);
    expect(textarea.style.height).toBe('42px');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 88 });
    textarea.value = '第一行\n第二行\n第三行';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();
    expect(textarea.style.height).toBe('88px');
    expect(textarea.style.overflowY).toBe('hidden');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 180 });
    textarea.value += '\n第四行';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();
    expect(textarea.style.height).toBe('112px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('拖入图片时显示明确投放态，松开后进入同一安全上传链路', async () => {
    const host = await mountWorkspace();
    const surface = host.querySelector<HTMLElement>('.community-composer__surface');
    const file = new File(['dropped-image'], 'dropped.webp', { type: 'image/webp' });
    const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' };
    const dragEnter = new Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(dragEnter, 'dataTransfer', { configurable: true, value: dataTransfer });
    surface?.dispatchEvent(dragEnter);
    await nextTick();

    expect(host.textContent).toContain(zhCN.communityChat.image.dropHint);
    expect(surface?.classList.contains('is-drag-active')).toBe(true);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { configurable: true, value: dataTransfer });
    surface?.dispatchEvent(drop);
    await flushAsync();

    expect(drop.defaultPrevented).toBe(true);
    expect(mocks.uploadImage).toHaveBeenCalledWith('general', file);
    expect(surface?.classList.contains('is-drag-active')).toBe(false);
    expect(host.textContent).not.toContain(zhCN.communityChat.image.dropHint);
  });

  it('屏蔽操作先展示明确确认，确认后按消息公有 ID 屏蔽作者', async () => {
    const host = await mountWorkspace();
    host.querySelector<HTMLButtonElement>('.community-message__more')!.click();
    await flushAsync();

    const blockButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.b-action-menu-panel button'))
      .filter((button) => button.textContent?.includes('屏蔽该成员'))
      .at(-1);
    expect(blockButton, document.body.textContent || '').toBeTruthy();
    blockButton?.click();
    await flushAsync();

    expect(mocks.alert).toHaveBeenCalledTimes(1);
    const alertConfig = mocks.alert.mock.calls[0][0];
    expect(alertConfig.content).toContain('薄荷');
    const confirm = alertConfig.footer.find((item: any) => item.type === 'danger');
    confirm.function();
    await flushAsync();

    expect(mocks.blockAuthor).toHaveBeenCalledWith('message-1');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('已屏蔽 薄荷');
  });
});
