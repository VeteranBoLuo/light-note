import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import icon from '@/config/icon';
import workspaceSource from './CommunityChatWorkspace.vue?raw';

const mocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getPinnedMessage: vi.fn(),
  getAuthorProfile: vi.fn(),
  uploadImage: vi.fn(),
  discardImage: vi.fn(),
  deleteMessage: vi.fn(),
  markRead: vi.fn(),
  sendMessage: vi.fn(),
  getRooms: vi.fn(),
  reportMessage: vi.fn(),
  toggleLike: vi.fn(),
  recallMessage: vi.fn(),
  pinMessage: vi.fn(),
  unpinMessage: vi.fn(),
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
    isMobile: false,
  },
  user: {
    id: 'user-1',
    role: 'user',
    userName: '薄荷账号',
    alias: '薄荷',
    headPicture: '',
  },
}));

vi.mock('@/api/communityChatApi', () => ({
  createCommunityChatClientRequestId: () => 'request-fixed-0001',
  getCommunityChatMessages: mocks.getMessages,
  getCommunityChatPinnedMessage: mocks.getPinnedMessage,
  getCommunityChatMessageAuthorProfile: mocks.getAuthorProfile,
  uploadCommunityChatImage: mocks.uploadImage,
  discardCommunityChatImage: mocks.discardImage,
  markCommunityChatRoomRead: mocks.markRead,
  sendCommunityChatMessage: mocks.sendMessage,
  getCommunityChatRooms: mocks.getRooms,
  reportCommunityChatMessage: mocks.reportMessage,
  toggleCommunityChatMessageLike: mocks.toggleLike,
  recallCommunityChatMessage: mocks.recallMessage,
  pinCommunityChatMessage: mocks.pinMessage,
  unpinCommunityChatMessage: mocks.unpinMessage,
  deleteCommunityChatMessage: mocks.deleteMessage,
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
vi.mock('@/composables/useNotification', () => ({
  useNotification: () => ({ refreshUnread: vi.fn(async () => {}) }),
}));
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
  notificationLevel: 'mentions',
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
    recalledAt: null,
    recalledByAdmin: false,
    canViewRecalledContent: false,
    canRecall: false,
    recallExpired: false,
    canDelete: false,
    recallDeadlineAt: null,
    isOwn: false,
    images: [],
    mentions: [],
    likeCount: 0,
    likedByMe: false,
    likePreview: [],
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

async function flushAnimationFrame() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await flushAsync();
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
  mocks.bookmark.isMobile = false;
  mocks.route.query = {};
  mocks.routerReplace.mockResolvedValue(undefined);
  mocks.markRead.mockResolvedValue({ data: { unreadCount: 0 } });
  mocks.getRooms.mockResolvedValue({ data: { messagingEnabled: true, items: rooms } });
  mocks.reportMessage.mockResolvedValue({ status: 200, data: { id: 'report-1', status: 'pending' } });
  mocks.toggleLike.mockResolvedValue({
    status: 200,
    data: { publicId: 'message-1', likedByMe: true, likeCount: 1, likePreview: ['薄荷'] },
  });
  mocks.recallMessage.mockResolvedValue({ status: 200, data: { publicId: 'message-1', status: 'recalled' } });
  mocks.deleteMessage.mockResolvedValue({ status: 200, data: { publicId: 'message-1', status: 'deleted_for_me' } });
  mocks.getPinnedMessage.mockResolvedValue({ status: 200, data: { roomSlug: 'general', message: null } });
  mocks.pinMessage.mockResolvedValue({
    status: 200,
    data: { roomSlug: 'general', message: chatMessage(), alreadyPinned: false },
  });
  mocks.unpinMessage.mockResolvedValue({
    status: 200,
    data: { roomSlug: 'general', publicId: 'message-1', alreadyUnpinned: false },
  });
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

    expect(mocks.getMessages).toHaveBeenCalledWith('general', { limit: 30 });
    expect(host.textContent).toContain('实时补齐的新消息');
    expect(host.textContent).toContain(zhCN.communityChat.realtimeConnected);

    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage({ likedByMe: true, likeCount: 1 }), chatMessage({ publicId: 'message-2' })],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    socket.message(
      'message.updated',
      { roomSlug: 'general', messagePublicId: 'message-1', reason: 'like' },
      'event-0003',
    );
    await flushAsync();

    expect(host.querySelector('[data-message-public-id="message-1"]')).not.toBeNull();
    expect(host.querySelector('[data-message-public-id="message-1"] .community-message__like')?.textContent).toContain(
      '1',
    );
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

    expect(mocks.getMessages).toHaveBeenCalledWith('general', { limit: 30 });
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

  it('新用户没有上传头像时展示稳定的聊天室默认头像', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage({ author: { ...chatMessage().author, avatar: '', frameId: null } })],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    const host = await mountWorkspace();

    expect(host.querySelector('.community-message__avatar-image')?.getAttribute('data-src')).toBe(
      icon.communityChat.defaultAvatar,
    );
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

    expect(mocks.getMessages).toHaveBeenNthCalledWith(1, 'general', { focus: 'message-1', limit: 30 });
    expect(host.querySelector('[data-message-public-id="message-1"]')?.classList.contains('is-focused')).toBe(true);
    expect(mocks.scrollIntoContainer).toHaveBeenCalledTimes(1);
    const latestButton = host.querySelector<HTMLButtonElement>('.community-message-list__new');
    expect(latestButton?.textContent).toContain('回到最新消息');

    latestButton?.click();
    await flushAsync();
    await flushAsync();

    expect(mocks.routerReplace).toHaveBeenCalledWith({ query: { from: 'note' } });
    expect(mocks.getMessages).toHaveBeenNthCalledWith(2, 'general', { limit: 30 });
    expect(host.querySelector('.community-message-list__new')).toBeNull();
  });

  it('来源消息已删除或被屏蔽时自动回退最新消息，不把整页变成错误态', async () => {
    mocks.route.query = { message: 'message-missing' };
    mocks.getMessages.mockRejectedValueOnce(new Error('not visible'));

    const host = await mountWorkspace();

    expect(mocks.getMessages).toHaveBeenNthCalledWith(1, 'general', { focus: 'message-missing', limit: 30 });
    expect(mocks.getMessages).toHaveBeenNthCalledWith(2, 'general', { limit: 30 });
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

  it('首屏只取最新 30 条，上滑接近顶部时用游标自动加载更早消息', async () => {
    mocks.getMessages
      .mockResolvedValueOnce({
        data: {
          roomSlug: 'general',
          items: [chatMessage({ publicId: 'message-2', content: '最新消息' })],
          hasMore: true,
          nextBefore: 'message-2',
          focusPublicId: null,
          hasNewer: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          roomSlug: 'general',
          items: [chatMessage({ publicId: 'message-1', content: '更早消息' })],
          hasMore: false,
          nextBefore: null,
          focusPublicId: null,
          hasNewer: false,
        },
      });
    const host = await mountWorkspace();
    const messageList = host.querySelector<HTMLElement>('.community-message-list');
    expect(messageList).not.toBeNull();
    if (!messageList) return;
    Object.defineProperty(messageList, 'scrollTop', { configurable: true, writable: true, value: 320 });

    messageList.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame();
    messageList.scrollTop = 120;

    messageList.dispatchEvent(new Event('scroll'));
    await vi.waitFor(() => expect(mocks.getMessages).toHaveBeenCalledTimes(2));
    await flushAsync();

    expect(mocks.getMessages).toHaveBeenNthCalledWith(1, 'general', { limit: 30 });
    expect(mocks.getMessages).toHaveBeenNthCalledWith(2, 'general', { before: 'message-2', limit: 30 });
    expect(host.textContent).toContain('更早消息');
    expect(host.textContent).toContain('最新消息');
  });

  it('上滑加载更早消息后，图片预览数量同步包含已加载历史图片', async () => {
    const latestImage = {
      publicId: 'image-latest',
      url: '/api/community-chat/images/image-latest',
      contentType: 'image/png' as const,
      fileSize: 12,
      width: 640,
      height: 480,
    };
    const olderImage = {
      publicId: 'image-older',
      url: '/api/community-chat/images/image-older',
      contentType: 'image/webp' as const,
      fileSize: 16,
      width: 720,
      height: 1280,
    };
    mocks.getMessages
      .mockResolvedValueOnce({
        data: {
          roomSlug: 'general',
          items: [chatMessage({ publicId: 'message-latest', images: [latestImage] })],
          hasMore: true,
          nextBefore: 'message-latest',
          focusPublicId: null,
          hasNewer: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          roomSlug: 'general',
          items: [chatMessage({ publicId: 'message-older', images: [olderImage] })],
          hasMore: false,
          nextBefore: null,
          focusPublicId: null,
          hasNewer: false,
        },
      });

    const host = await mountWorkspace();
    const messageList = host.querySelector<HTMLElement>('.community-message-list');
    expect(messageList).not.toBeNull();
    if (!messageList) return;
    Object.defineProperty(messageList, 'scrollTop', { configurable: true, writable: true, value: 320 });
    messageList.dispatchEvent(new Event('scroll'));
    await flushAnimationFrame();
    messageList.scrollTop = 120;
    messageList.dispatchEvent(new Event('scroll'));
    await vi.waitFor(() => expect(mocks.getMessages).toHaveBeenCalledTimes(2));
    await flushAsync();

    const imageButtons = host.querySelectorAll<HTMLButtonElement>('.community-message__image');
    expect(imageButtons).toHaveLength(2);
    imageButtons[1]?.click();
    await flushAsync();

    expect(document.body.querySelector<HTMLImageElement>('.chat-image-viewer__image')?.src).toContain(
      '/api/community-chat/images/image-latest',
    );
    expect(document.body.textContent).toContain('2 / 2');
  });

  it('首屏按图片元数据预留尺寸，并在图片异步撑高时保持贴底直到用户主动滚动', async () => {
    const pendingMessages = deferred<any>();
    mocks.getMessages.mockReturnValueOnce(pendingMessages.promise);
    const host = await mountWorkspace();
    const messageList = host.querySelector<HTMLElement>('.community-message-list');
    expect(messageList).not.toBeNull();
    if (!messageList) return;
    let scrollHeight = 600;
    Object.defineProperties(messageList, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });

    pendingMessages.resolve({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage({
            images: [
              {
                publicId: 'image-delayed',
                url: '/api/community-chat/images/image-delayed',
                contentType: 'image/png',
                fileSize: 12,
                width: 640,
                height: 480,
              },
            ],
          }),
        ],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    await flushAsync();

    const imageButton = host.querySelector<HTMLButtonElement>('.community-message__image');
    const image = imageButton?.querySelector<HTMLImageElement>('img');
    expect(imageButton?.style.aspectRatio).toBe('640 / 480');
    expect(image?.getAttribute('width')).toBe('640');
    expect(image?.getAttribute('height')).toBe('480');
    expect(messageList.scrollTop).toBe(600);

    scrollHeight = 900;
    image?.dispatchEvent(new Event('load'));
    await flushAnimationFrame();
    expect(messageList.scrollTop).toBe(900);

    messageList.dispatchEvent(new WheelEvent('wheel'));
    scrollHeight = 1200;
    image?.dispatchEvent(new Event('load'));
    await flushAnimationFrame();
    expect(messageList.scrollTop).toBe(900);
  });

  it('回复发送复用稳定 clientRequestId，并把引用消息公有 ID 交给后端', async () => {
    mocks.sendMessage.mockResolvedValue({
      data: { message: chatMessage({ publicId: 'message-2', content: '收到', isOwn: true }), idempotent: false },
    });
    const host = await mountWorkspace();
    const replyButton = host.querySelector<HTMLButtonElement>(
      `.community-message__actions button[aria-label="${zhCN.communityChat.replyAction}"]`,
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
    expect(document.activeElement).toBe(textarea);
  });

  it('点击弱化引用条会在当前消息窗口定位并短暂高亮原消息', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage({ publicId: 'message-source', content: '原消息内容' }),
          chatMessage({
            publicId: 'message-reply',
            content: '回复内容',
            reply: {
              publicId: 'message-source',
              content: '原消息内容',
              status: 'active',
              authorName: '薄荷',
              hasImages: false,
            },
          }),
        ],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    const host = await mountWorkspace();

    const replyReference = host.querySelector<HTMLButtonElement>('.community-message__reply');
    expect(replyReference?.textContent).toContain('回复 薄荷：');
    expect(replyReference?.textContent).toContain('原消息内容');
    replyReference?.click();
    await flushAsync();

    expect(mocks.scrollIntoContainer).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-message-public-id="message-source"]')?.classList.contains('is-focused')).toBe(
      true,
    );
    expect(workspaceSource).toMatch(
      /\.community-message__reply\s*\{[^}]*border-left:\s*2px solid var\(--surface-border-color\)[^}]*background:\s*transparent/u,
    );
    expect(workspaceSource).not.toMatch(/\.community-message__reply\s*\{[^}]*padding:\s*7px 9px/u);
  });

  it('置顶栏对所有成员可见并可定位原消息，管理员可从栏内取消置顶', async () => {
    const pinned = chatMessage({ publicId: 'message-pinned', content: '请先阅读这条置顶消息' });
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [pinned],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    mocks.getPinnedMessage.mockResolvedValueOnce({
      status: 200,
      data: { roomSlug: 'general', message: pinned },
    });
    const host = await mountWorkspace({ access: { ...access, memberRole: 'admin', canManage: true } });

    const banner = host.querySelector<HTMLElement>('.community-pinned-message');
    expect(banner?.textContent).toContain(zhCN.communityChat.pin.banner);
    expect(banner?.textContent).toContain('请先阅读这条置顶消息');
    host.querySelector<HTMLButtonElement>('.community-pinned-message__jump')?.click();
    await flushAsync();
    expect(mocks.scrollIntoContainer).toHaveBeenCalledTimes(1);

    host.querySelector<HTMLButtonElement>('.community-pinned-message__unpin')?.click();
    const alertOptions = mocks.alert.mock.calls.at(-1)?.[0];
    expect(alertOptions?.title).toBe(zhCN.communityChat.pin.unpinTitle);
    alertOptions?.footer?.[1]?.function?.();
    await flushAsync();
    expect(mocks.unpinMessage).toHaveBeenCalledWith('message-pinned');
    expect(host.querySelector('.community-pinned-message')).toBeNull();
  });

  it('提及在输入框上方用 tag 编辑，发送后在气泡内展示昵称且提交稳定消息公有 ID', async () => {
    vi.useFakeTimers();
    mocks.bookmark.isMobile = true;
    const request = deferred<any>();
    mocks.sendMessage.mockReturnValueOnce(request.promise);
    const host = await mountWorkspace();
    const avatar = host.querySelector<HTMLButtonElement>('.community-message__avatar');
    avatar?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 12, clientY: 12 }));
    await vi.advanceTimersByTimeAsync(500);
    await flushAsync();

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(host.querySelector('.community-composer__mentions')?.textContent).toContain('@薄荷');
    expect(textarea?.value).toBe('');

    avatar?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    avatar?.click();
    expect(mocks.getAuthorProfile).not.toHaveBeenCalled();

    if (textarea) {
      textarea.value = '请看一下';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await nextTick();
    host.querySelector<HTMLButtonElement>('.community-composer__send')?.click();
    await flushAsync();

    expect(mocks.sendMessage).toHaveBeenCalledWith('general', {
      clientRequestId: 'request-fixed-0001',
      content: '请看一下',
      mentionMessagePublicIds: ['message-1'],
    });
    const optimisticBubble = host.querySelector('.community-message.is-sending');
    expect(optimisticBubble?.textContent).toContain('@薄荷');
    expect(optimisticBubble?.textContent).toContain('请看一下');

    request.resolve({
      data: {
        message: chatMessage({
          publicId: 'message-mention-sent',
          content: '请看一下',
          mentions: ['薄荷'],
          isOwn: true,
        }),
      },
    });
    await flushAsync();
    const sentBubble = host.querySelector('[data-message-public-id="message-mention-sent"]');
    expect(sentBubble?.textContent).toContain('@薄荷');
    expect(sentBubble?.textContent).toContain('请看一下');
  });

  it('发送请求未返回时先显示本地气泡，加载圈替换发送箭头并在响应后对账', async () => {
    const request = deferred<any>();
    mocks.sendMessage.mockReturnValueOnce(request.promise);
    const host = await mountWorkspace();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea) {
      textarea.value = '网络慢时也立即出现';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await nextTick();
    host.querySelector<HTMLButtonElement>('.community-composer__send')?.click();
    await flushAsync();

    const optimistic = host.querySelector('.community-message.is-sending');
    expect(optimistic?.textContent).toContain('网络慢时也立即出现');
    expect(host.querySelector('.community-composer__send .btn-spinner')).not.toBeNull();
    expect(host.querySelector('.community-composer__send .svg-icon-stub')).toBeNull();

    request.resolve({
      data: {
        message: chatMessage({
          publicId: 'message-sent',
          content: '网络慢时也立即出现',
          isOwn: true,
          canRecall: true,
        }),
      },
    });
    await flushAsync();

    expect(host.querySelector('.community-message.is-sending')).toBeNull();
    expect(host.querySelector('[data-message-public-id="message-sent"]')?.textContent).toContain('网络慢时也立即出现');
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

  it('PC 消息轻操作条直达点赞与回复，@、举报与屏蔽收进更多菜单且没有保存笔记', async () => {
    const host = await mountWorkspace();
    const actionArea = host.querySelector('.community-message__actions');
    expect(actionArea?.parentElement?.classList.contains('community-message__payload')).toBe(true);
    expect(actionArea?.querySelector(`[aria-label="${zhCN.communityChat.replyAction}"]`)).not.toBeNull();
    expect(actionArea?.querySelector('[aria-label^="点赞"]')).not.toBeNull();
    expect(actionArea?.querySelector('[title]')).toBeNull();
    expect(actionArea?.textContent).not.toContain('@');
    expect(document.body.textContent).not.toContain('保存为笔记');
    const tooltipText = Array.from(document.body.querySelectorAll('.b-tooltip-popup'))
      .map((item) => item.textContent)
      .join('|');
    expect(tooltipText).toContain(zhCN.communityChat.replyAction);
    expect(tooltipText).toContain(zhCN.communityChat.moreActions);

    host.querySelector<HTMLButtonElement>('.community-message__more')!.click();
    await flushAsync();
    const menuText = document.body.querySelector('.b-action-menu-panel')?.textContent || '';
    expect(menuText).toContain('提及该成员');
    expect(menuText).toContain('举报消息');
    expect(menuText).toContain('屏蔽该成员');
    expect(menuText).not.toContain('保存为笔记');
  });

  it('点赞按钮更新服务端关系后立即刷新当前计数和选中态', async () => {
    const host = await mountWorkspace();
    const likeButton = host.querySelector<HTMLButtonElement>('.community-message__like');
    likeButton?.click();
    await flushAsync();

    expect(mocks.toggleLike).toHaveBeenCalledWith('message-1');
    expect(host.querySelector('.community-message__like')?.textContent).toContain('1');
    expect(host.querySelector('.community-message__like')?.classList.contains('is-selected')).toBe(true);
    expect(host.querySelector('.community-message__reactions')?.textContent).toContain('薄荷');
  });

  it('普通用户在两分钟内可撤回自己的消息，并在确认后只提交消息公有 ID', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage({
            isOwn: true,
            canRecall: true,
            recallDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
          }),
        ],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: new Date().toISOString(),
      },
    });
    const host = await mountWorkspace();
    expect(
      host.querySelector(`.community-message__actions button[aria-label="${zhCN.communityChat.replyAction}"]`),
    ).not.toBeNull();
    host
      .querySelector<HTMLButtonElement>(
        `.community-message__actions button[aria-label="${zhCN.communityChat.recall.action}"]`,
      )
      ?.click();

    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: zhCN.communityChat.recall.confirmTitle }),
    );
    mocks.alert.mock.calls[0][0].footer[1].function();
    await flushAsync();

    expect(mocks.recallMessage).toHaveBeenCalledWith('message-1');
    expect(mocks.messageSuccess).toHaveBeenCalledWith(zhCN.communityChat.recall.success);
  });

  it('超过两分钟仍显示撤回入口，点击后解释时间限制且不请求服务端', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage({
            isOwn: true,
            canRecall: true,
            recallExpired: true,
            recallDeadlineAt: new Date(Date.now() - 60_000).toISOString(),
          }),
        ],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    const host = await mountWorkspace();
    const recallButton = host.querySelector<HTMLButtonElement>(
      `.community-message__actions button[aria-label="${zhCN.communityChat.recall.action}"]`,
    );

    expect(recallButton).not.toBeNull();
    recallButton?.click();

    expect(mocks.messageWarning).toHaveBeenCalledWith(zhCN.communityChat.recall.expiredHint);
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.recallMessage).not.toHaveBeenCalled();
  });

  it('删除对普通成员也可用，确认文案说明只从自己的聊天记录移除', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage({ canDelete: true })],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: new Date().toISOString(),
      },
    });
    const host = await mountWorkspace();
    const actions = host.querySelector('.community-message__actions');
    expect(actions?.querySelector(`[aria-label="${zhCN.communityChat.replyAction}"]`)).not.toBeNull();
    actions?.querySelector<HTMLButtonElement>(`[aria-label="${zhCN.communityChat.delete.action}"]`)?.click();

    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: zhCN.communityChat.delete.confirmTitle,
        content: zhCN.communityChat.delete.confirmDescription,
      }),
    );
    mocks.alert.mock.calls[0][0].footer[1].function();
    await flushAsync();

    expect(mocks.deleteMessage).toHaveBeenCalledWith('message-1');
    expect(host.querySelector('[data-message-public-id="message-1"]')).toBeNull();
    expect(mocks.messageSuccess).toHaveBeenCalledWith(zhCN.communityChat.delete.success);
  });

  it('撤回消息对普通用户仅显示占位，管理员仍能看到保留原文', async () => {
    const recalled = chatMessage({
      status: 'recalled',
      content: '',
      recalledAt: '2026-08-10T10:00:00.000Z',
      canViewRecalledContent: false,
    });
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [recalled],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: new Date().toISOString(),
      },
    });
    const memberHost = await mountWorkspace();
    expect(memberHost.textContent).toContain(zhCN.communityChat.recall.placeholder);
    expect(memberHost.querySelector('.community-message__recalled .svg-icon-stub')).toBeNull();
    cleanup?.();
    cleanup = undefined;

    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [{ ...recalled, content: '管理员可见的原文', canViewRecalledContent: true }],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: new Date().toISOString(),
      },
    });
    const adminHost = await mountWorkspace({ access: { ...access, memberRole: 'admin', canManage: true } });
    expect(adminHost.textContent).toContain(zhCN.communityChat.recall.adminVisible);
    expect(adminHost.textContent).toContain('管理员可见的原文');
    expect(adminHost.textContent).not.toContain('原内容仅管理员可见');
  });

  it('移动端点击消息正文打开紧凑操作面板，提供点赞、回复和治理入口', async () => {
    mocks.bookmark.isMobile = true;
    const host = await mountWorkspace();
    host.querySelector<HTMLElement>('.community-message__content')?.click();
    await flushAsync();

    expect(document.body.textContent).toContain(zhCN.communityChat.like.action);
    expect(document.body.textContent).toContain(zhCN.communityChat.replyAction);
    expect(document.body.textContent).toContain(zhCN.communityChat.report.action);
    expect(host.querySelector('.community-message__mobile-actions')).toBeNull();
  });

  it('移动端只允许点击消息气泡打开操作面板，消息行空白与用户信息不触发', async () => {
    mocks.bookmark.isMobile = true;
    const host = await mountWorkspace();

    host.querySelector<HTMLElement>('.community-message__meta')?.click();
    await flushAsync();
    expect(document.body.querySelector('.mobile-page-actions')).toBeNull();

    host.querySelector<HTMLElement>('.community-message')?.click();
    await flushAsync();
    expect(document.body.querySelector('.mobile-page-actions')).toBeNull();

    host.querySelector<HTMLElement>('.community-message__content')?.click();
    await flushAsync();
    expect(document.body.querySelector('.mobile-page-actions')).not.toBeNull();
  });

  it('消息流用无脚本滚动条和被动帧节流监听，并在共享移动基线隐藏滚动条', () => {
    expect(workspaceSource).toMatch(
      /\.community-message-list\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/u,
    );
    expect(workspaceSource).toContain('@scroll.passive="handleMessageListScroll"');
    expect(workspaceSource).toContain('@wheel.passive="handleMessageListUserScrollIntent"');
    expect(workspaceSource).toContain('@touchmove.passive="handleMessageListUserScrollIntent"');
    expect(workspaceSource).toContain('pauseAvatarMotionForScroll();');
    expect(workspaceSource).not.toMatch(/ref="messageListEl"\s+v-auto-scrollbar/u);
    expect(workspaceSource).toContain('messageScrollFrame = window.requestAnimationFrame(processMessageListScroll)');
    expect(workspaceSource).toContain('current && isEqual(current, item) ? current : item');
    expect(workspaceSource).toContain('pause-when-offscreen');
    expect(workspaceSource).toContain("element.classList.add('is-actively-scrolling')");
    expect(workspaceSource).toContain('animation-play-state: paused !important;');
    expect(workspaceSource).toContain(':deep(.avatar-frame--celestial .avatar-frame__ring),');
    expect(workspaceSource).not.toContain(':deep(.avatar-frame--celestial .avatar-frame__ring::before),');
    expect(workspaceSource).not.toContain('content-visibility: auto;');
    expect(workspaceSource).not.toContain('contain: layout style;');
    expect(workspaceSource).toMatch(/\.community-message__avatar\s*\{[\s\S]*?overflow:\s*visible\s*!important;/u);
    expect(workspaceSource).toContain('-webkit-overflow-scrolling: touch;');
    expect(workspaceSource).toContain(':global(html.light-note-mobile-rendering .community-message-list)');
    expect(workspaceSource).toContain(
      ':global(html.light-note-mobile-rendering .community-message-list::-webkit-scrollbar)',
    );
  });

  it('移动端抽屉先关闭后仍保留目标消息并执行所选操作', async () => {
    vi.useFakeTimers();
    mocks.bookmark.isMobile = true;
    const host = await mountWorkspace();
    host.querySelector<HTMLElement>('.community-message__content')?.click();
    await flushAsync();

    const replyAction = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === zhCN.communityChat.replyAction,
    );
    expect(replyAction).not.toBeNull();
    replyAction?.click();
    await vi.advanceTimersByTimeAsync(500);
    await flushAsync();

    expect(host.querySelector('.community-composer__reply')?.textContent).toContain('薄荷');
  });

  it('移动端管理员操作面板同时提供点赞、引用、撤回和删除', async () => {
    mocks.bookmark.isMobile = true;
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [chatMessage({ isOwn: true, canRecall: true, canDelete: true })],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
        realtimeEnabled: false,
        pollingAfterMs: 8000,
        serverTime: new Date().toISOString(),
      },
    });
    const host = await mountWorkspace({ access: { ...access, memberRole: 'admin', canManage: true } });
    host.querySelector<HTMLElement>('.community-message__content')?.click();
    await flushAsync();

    const drawerText = document.body.textContent || '';
    expect(drawerText).toContain(zhCN.communityChat.like.action);
    expect(drawerText).toContain(zhCN.communityChat.replyAction);
    expect(drawerText).toContain(zhCN.communityChat.recall.action);
    expect(drawerText).toContain(zhCN.communityChat.delete.action);
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

  it('移动端点击聊天图片先打开消息操作抽屉，再由查看大图进入统一查看器', async () => {
    vi.useFakeTimers();
    mocks.bookmark.isMobile = true;
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage({
            images: [
              {
                publicId: 'image-mobile-viewer-1',
                url: '/api/community-chat/images/image-mobile-viewer-1',
                contentType: 'image/png',
                fileSize: 12,
                width: 640,
                height: 480,
              },
            ],
          }),
        ],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    const host = await mountWorkspace();

    host.querySelector<HTMLButtonElement>('.community-message__image')?.click();
    await flushAsync();

    expect(document.body.querySelector('.chat-image-viewer-modal')).toBeNull();
    expect(document.body.querySelector('.mobile-page-actions')).not.toBeNull();
    expect(document.body.textContent).toContain(zhCN.communityChat.image.preview);
    expect(document.body.textContent).toContain(zhCN.communityChat.replyAction);

    const previewAction = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === zhCN.communityChat.image.preview,
    );
    expect(previewAction).not.toBeNull();
    previewAction?.click();
    await vi.advanceTimersByTimeAsync(500);
    await flushAsync();

    expect(document.body.querySelector('.chat-image-viewer-modal')).not.toBeNull();
    expect(document.body.querySelector<HTMLImageElement>('.chat-image-viewer__image')?.src).toContain(
      '/api/community-chat/images/image-mobile-viewer-1',
    );
  });

  it('PC 端点击聊天图片直接进入统一查看器，并启用缩放、旋转和下载能力', async () => {
    mocks.getMessages.mockResolvedValueOnce({
      data: {
        roomSlug: 'general',
        items: [
          chatMessage({
            images: [
              {
                publicId: 'image-viewer-1',
                url: '/api/community-chat/images/image-viewer-1',
                contentType: 'image/png',
                fileSize: 12,
                width: 640,
                height: 480,
              },
              {
                publicId: 'image-viewer-2',
                url: '/api/community-chat/images/image-viewer-2',
                contentType: 'image/webp',
                fileSize: 16,
                width: 720,
                height: 1280,
              },
            ],
          }),
        ],
        hasMore: false,
        nextBefore: null,
        focusPublicId: null,
        hasNewer: false,
      },
    });
    const host = await mountWorkspace();

    host.querySelector<HTMLButtonElement>('.community-message__image')?.click();
    await flushAsync();

    expect(document.body.querySelector('.chat-image-viewer-modal')).not.toBeNull();
    expect(document.body.querySelector<HTMLImageElement>('.chat-image-viewer__image')?.src).toContain(
      '/api/community-chat/images/image-viewer-1',
    );
    expect(document.body.textContent).not.toContain('使用方向键切换图片');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.body.querySelector<HTMLImageElement>('.chat-image-viewer__image')?.src).toContain(
      '/api/community-chat/images/image-viewer-2',
    );
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
