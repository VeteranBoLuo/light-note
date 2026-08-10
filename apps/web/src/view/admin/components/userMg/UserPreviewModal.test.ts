import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import UserPreviewModal from './UserPreviewModal.vue';

const apiMocks = vi.hoisted(() => ({
  startAdminContext: vi.fn(),
  endAdminContext: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  clearAdminLoginPreview: vi.fn(),
  setAdminLoginPreview: vi.fn(),
}));

vi.mock('@/api/userApi.ts', () => ({
  default: {
    startAdminContext: apiMocks.startAdminContext,
    endAdminContext: apiMocks.endAdminContext,
  },
}));

vi.mock('@/utils/authStorage.ts', () => ({
  ADMIN_LOGIN_PREVIEW_FRAME_NAME: 'light-note-admin-preview',
  clearAdminLoginPreview: storageMocks.clearAdminLoginPreview,
  getAdminLoginPreviewUrl: () => '/home?adminPreview=1',
  setAdminLoginPreview: storageMocks.setAdminLoginPreview,
}));

describe('UserPreviewModal 会话生命周期', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    apiMocks.startAdminContext.mockReset();
    apiMocks.endAdminContext.mockReset().mockResolvedValue({ status: 200 });
    storageMocks.clearAdminLoginPreview.mockReset();
    storageMocks.setAdminLoginPreview.mockReset();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  function mountPreview() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(UserPreviewModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              userInfo: { id: 'user-1', alias: '测试用户', preferences: {} },
              mode: 'readonly',
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    return { visible };
  }

  it('关闭期间迟到的启动响应会立即撤销服务端令牌', async () => {
    let resolveStart: (value: any) => void = () => undefined;
    apiMocks.startAdminContext.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const { visible } = mountPreview();
    await nextTick();

    visible.value = false;
    await nextTick();
    resolveStart({ status: 200, data: { contextToken: 'late-token' } });
    await Promise.resolve();
    await nextTick();

    expect(storageMocks.setAdminLoginPreview).not.toHaveBeenCalled();
    expect(apiMocks.endAdminContext).toHaveBeenCalledWith('late-token');
  });

  it('组件卸载时清理本地材料并尽力撤销当前令牌', async () => {
    apiMocks.startAdminContext.mockResolvedValue({
      status: 200,
      data: {
        contextToken: 'active-token',
        context: {
          mode: 'readonly',
          subjectUserId: 'user-1',
          subjectAlias: '测试用户',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    mountPreview();
    await Promise.resolve();
    await nextTick();
    await nextTick();

    expect(storageMocks.setAdminLoginPreview).toHaveBeenCalledWith('active-token', {});
    cleanup?.();
    cleanup = null;
    await Promise.resolve();

    expect(storageMocks.clearAdminLoginPreview).toHaveBeenCalled();
    expect(apiMocks.endAdminContext).toHaveBeenCalledWith('active-token');
  });
});
