import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  getNotificationList: vi.fn(),
  configure: vi.fn(),
  clear: vi.fn(),
  clearChat: vi.fn(),
  sync: vi.fn(),
  postChat: vi.fn(),
  cancelChat: vi.fn(),
  permission: vi.fn(() => () => undefined),
  isApp: vi.fn(() => true),
  hasCapability: vi.fn(() => true),
  user: null as any,
}));

vi.mock('@/api/notificationApi', () => ({
  default: {
    getUnreadCount: mocks.getUnreadCount,
    getNotificationList: mocks.getNotificationList,
  },
}));

vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));

vi.mock('@/utils/androidBridge', () => ({
  cancelAndroidChatNotification: mocks.cancelChat,
  clearAndroidChatNotifications: mocks.clearChat,
  clearAndroidNotifications: mocks.clear,
  configureAndroidNotifications: mocks.configure,
  hasAndroidNativeNotificationCapability: mocks.hasCapability,
  isLightNoteAndroidApp: mocks.isApp,
  onAndroidNotificationPermission: mocks.permission,
  postAndroidChatNotification: mocks.postChat,
  syncAndroidNotifications: mocks.sync,
}));

const { __test__, useAndroidNativeNotifications } = await import('./useAndroidNativeNotifications');

let cleanup: (() => void) | null = null;

function rootUser(id = 'root-1') {
  return reactive({
    id,
    role: 'root',
    adminPreview: false,
    adminContext: null,
    preferences: {
      notificationsAndroid: true,
      notificationsAndroidBadge: true,
      communityChatAndroidNotifications: false,
    },
  });
}

async function mountRuntime() {
  const host = document.createElement('div');
  document.body.append(host);
  let runtime: ReturnType<typeof useAndroidNativeNotifications> | null = null;
  const app = createApp({
    setup() {
      runtime = useAndroidNativeNotifications();
      return runtime;
    },
    template: '<div />',
  });
  app.mount(host);
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return runtime!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUnreadCount.mockReset();
  mocks.getNotificationList.mockReset();
  mocks.isApp.mockReturnValue(true);
  mocks.hasCapability.mockReturnValue(true);
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  mocks.user = rootUser();
  mocks.getUnreadCount.mockResolvedValue({ data: { unreadTotal: 2 } });
  mocks.getNotificationList
    .mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'ordinary-1',
            type: 'system',
            title: '普通通知',
            content: '正文',
            link: '/notifications',
            isRead: 0,
          },
        ],
      },
    })
    .mockResolvedValueOnce({ data: { items: [] } });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('useAndroidNativeNotifications', () => {
  it('通知失效信号始终连接当前站点同源 WebSocket，不携带账号或 sid 查询参数', () => {
    expect(__test__.socketUrl({ href: 'https://boluo66.top/community-chat' } as Location)).toBe(
      'wss://boluo66.top/realtime/notifications',
    );
    expect(__test__.socketUrl({ href: 'http://127.0.0.1:5175/app' } as Location)).toBe(
      'ws://127.0.0.1:5175/realtime/notifications',
    );
  });

  it('Root App 冷启动保留已有桌面角标，首轮只做静默权威校准', async () => {
    await mountRuntime();

    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.configure).toHaveBeenCalledWith(true);
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.objectContaining({ unreadCount: 2, badgeEnabled: true, alert: false }),
    );
  });

  it('实时连接漏事件时，30 秒轮询发现新普通未读仍只补响一次', async () => {
    const runtime = await mountRuntime();
    mocks.getUnreadCount.mockResolvedValue({ data: { unreadTotal: 3 } });
    mocks.getNotificationList
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: 'ordinary-2', type: 'system', title: '新通知', content: '新正文', isRead: 0 },
            { id: 'ordinary-1', type: 'system', title: '普通通知', content: '正文', isRead: 0 },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { items: [] } });

    await runtime.synchronize();

    expect(mocks.sync).toHaveBeenLastCalledWith(expect.objectContaining({ unreadCount: 3, alert: true }));
  });

  it('旧壳没有通知能力标记时不请求权限、不连接也不改动系统角标', async () => {
    mocks.hasCapability.mockReturnValue(false);
    await mountRuntime();

    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.getUnreadCount).not.toHaveBeenCalled();
  });

  it('退出 Root 身份后立即清空通知栏和桌面角标', async () => {
    await mountRuntime();
    vi.clearAllMocks();

    mocks.user.id = '';
    mocks.user.role = 'visitor';
    await nextTick();

    expect(mocks.configure).toHaveBeenCalledWith(false);
    expect(mocks.clear).toHaveBeenCalled();
  });
});
