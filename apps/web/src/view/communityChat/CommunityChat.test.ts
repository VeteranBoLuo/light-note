import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  getRooms: vi.fn(),
  user: { id: 'user-1', role: 'user' },
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatRooms: mocks.getRooms,
}));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: vi.fn() }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span class="svg-icon-stub" />' },
}));
vi.mock('./CommunityChatWorkspace.vue', () => ({
  default: {
    name: 'CommunityChatWorkspaceStub',
    props: ['access', 'rooms'],
    template:
      '<section class="community-workspace-stub" :data-authenticated="String(access.authenticated)" :data-can-post="String(access.canPost)">真实消息工作区</section>',
  },
}));

const { default: CommunityChat } = await import('./CommunityChat.vue');

const room = {
  slug: 'general',
  name: '轻笺聊天室',
  description: '聊使用问题、实用技巧、功能想法和日常见闻。',
  type: 'text',
  status: 'active',
  notificationLevel: 'mentions',
  slowModeSeconds: 0,
  sortOrder: 10,
  unreadCount: 0,
  mentionCount: 0,
};

function access(overrides = {}) {
  return {
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
    requestStatus: null,
    memberRole: 'member',
    notificationsEnabled: false,
    ...overrides,
  };
}

let cleanup: (() => void) | undefined;

async function flushAsync() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

async function mountPage({ flush = true } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(CommunityChat);
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
  if (flush) await flushAsync();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.id = 'user-1';
  mocks.user.role = 'user';
  mocks.getRooms.mockResolvedValue({
    data: { access: access(), messagingEnabled: true, items: [room] },
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CommunityChat workspace bootstrap', () => {
  it('首个请求完成前只展示聊天室结构骨架，不闪现访问状态或项目介绍页', async () => {
    let resolveRooms: (value: unknown) => void = () => {};
    mocks.getRooms.mockReturnValue(
      new Promise((resolve) => {
        resolveRooms = resolve;
      }),
    );

    const host = await mountPage({ flush: false });

    expect(host.querySelector('.community-chat-bootstrap')).not.toBeNull();
    expect(host.querySelector('.community-hero')).toBeNull();
    expect(host.textContent).not.toContain('正在核对访问状态');

    resolveRooms({ data: { access: access(), messagingEnabled: true, items: [room] } });
    await flushAsync();
    expect(host.querySelector('.community-workspace-stub')).not.toBeNull();
  });

  it('登录用户无需邀请直接进入真实消息工作区', async () => {
    const host = await mountPage();

    expect(mocks.getRooms).toHaveBeenCalledTimes(1);
    const workspace = host.querySelector<HTMLElement>('.community-workspace-stub');
    expect(workspace).not.toBeNull();
    expect(workspace?.dataset.authenticated).toBe('true');
    expect(workspace?.dataset.canPost).toBe('true');
    expect(host.querySelector('.community-hero')).toBeNull();
  });

  it('游客也进入同一工作区，但服务端权限明确为只读', async () => {
    mocks.user.id = 'visitor-1';
    mocks.user.role = 'visitor';
    mocks.getRooms.mockResolvedValue({
      data: {
        access: access({
          authenticated: false,
          canPost: false,
          status: 'read_only',
          memberRole: null,
        }),
        messagingEnabled: true,
        items: [room],
      },
    });

    const host = await mountPage();
    const workspace = host.querySelector<HTMLElement>('.community-workspace-stub');
    expect(workspace?.dataset.authenticated).toBe('false');
    expect(workspace?.dataset.canPost).toBe('false');
  });

  it('Root 切换紧急只读后，已打开的聊天室在前台目录轮询中收敛发言权', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    mocks.getRooms
      .mockResolvedValueOnce({ data: { access: access(), messagingEnabled: true, items: [room] } })
      .mockResolvedValueOnce({
        data: {
          access: access({ postingEnabled: false, emergencyReadOnly: true, canPost: false }),
          messagingEnabled: true,
          items: [room],
        },
      });

    const host = await mountPage();
    expect(host.querySelector<HTMLElement>('.community-workspace-stub')?.dataset.canPost).toBe('true');

    await vi.advanceTimersByTimeAsync(8_000);
    await flushAsync();

    expect(mocks.getRooms).toHaveBeenCalledTimes(2);
    expect(host.querySelector<HTMLElement>('.community-workspace-stub')?.dataset.canPost).toBe('false');
  });

  it('实时连接正常时不每 8 秒请求目录，只保留 60 秒安全刷新', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    mocks.getRooms.mockResolvedValue({
      data: { access: access({ realtimeEnabled: true }), messagingEnabled: true, items: [room] },
    });

    await mountPage();
    await vi.advanceTimersByTimeAsync(8_000);
    await flushAsync();
    expect(mocks.getRooms).toHaveBeenCalledTimes(1);

    // 兜底调度器每 8 秒检查一次，60 秒阈值会在第一个不小于阈值的 64 秒刻度触发。
    await vi.advanceTimersByTimeAsync(56_000);
    await flushAsync();
    expect(mocks.getRooms).toHaveBeenCalledTimes(2);
  });

  it('接口失败时只在聊天室容器内提供重连，不回退到访问状态页', async () => {
    mocks.getRooms.mockRejectedValue(new Error('backend unavailable'));

    const host = await mountPage();

    expect(host.querySelector('.community-chat-unavailable')).not.toBeNull();
    expect(host.textContent).toContain('聊天室暂时不可用');
    expect(host.textContent).toContain('重新连接');
    expect(host.querySelector('.community-hero')).toBeNull();
  });
});
