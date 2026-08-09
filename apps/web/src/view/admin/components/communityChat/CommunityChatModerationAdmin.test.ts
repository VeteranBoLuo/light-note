import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  review: vi.fn(),
  getRuntimePolicy: vi.fn(),
  updateRuntimePolicy: vi.fn(),
}));
const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatAdminReports: apiMocks.list,
  reviewCommunityChatAdminReport: apiMocks.review,
  getCommunityChatAdminRuntimePolicy: apiMocks.getRuntimePolicy,
  updateCommunityChatAdminRuntimePolicy: apiMocks.updateRuntimePolicy,
}));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: messageMocks }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    name: 'AdminDataPageStub',
    template: '<main><slot name="metrics" /><slot name="toolbar" /><slot /></main>',
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible', 'title'],
    template: '<section v-if="visible" class="modal-stub"><h2>{{ title }}</h2><slot /></section>',
  },
}));

const { default: CommunityChatModerationAdmin } = await import('./CommunityChatModerationAdmin.vue');

const pendingReport = {
  id: 'report-1',
  reasonCode: 'harassment',
  detail: '连续针对其他成员进行人身攻击',
  evidenceSnapshot: {
    messagePublicId: 'message-1',
    roomSlug: 'newcomers',
    roomNameZh: '新手问答',
    roomNameEn: 'Newcomer Q&A',
    authorName: '违规成员',
    authorRole: 'member',
    content: '这是一条需要审核的公开消息',
    messageCreatedAt: '2026-08-09T10:00:00.000Z',
    capturedAt: '2026-08-09T10:01:00.000Z',
  },
  status: 'pending',
  reviewNote: '',
  reviewedAt: null,
  createTime: '2026-08-09T10:01:00.000Z',
  messagePublicId: 'message-1',
  messageStatus: 'active',
  roomSlug: 'newcomers',
  reporterName: '举报用户',
  authorName: '违规成员',
  resolutionAction: null,
  actionExpiresAt: null,
};

function mockPages() {
  apiMocks.list.mockImplementation((params: { status: string }) =>
    Promise.resolve({
      status: 200,
      data: {
        items: params.status === 'pending' ? [pendingReport] : [],
        total: params.status === 'pending' ? 1 : 0,
        page: 1,
        pageSize: 20,
        status: params.status,
      },
    }),
  );
}

function mountPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(CommunityChatModerationAdmin) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  app.mount(host);
  return {
    host,
    unmount() {
      app.unmount();
      host.remove();
    },
  };
}

describe('CommunityChatModerationAdmin', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPages();
    apiMocks.review.mockResolvedValue({
      status: 200,
      data: { id: 'report-1', status: 'actioned', action: 'hide_message', messageStatus: 'hidden' },
    });
    apiMocks.getRuntimePolicy.mockResolvedValue({
      status: 200,
      data: {
        messagingEnabled: true,
        postingEnabled: true,
        databasePostingEnabled: true,
        emergencyReadOnly: false,
        environmentReadOnly: false,
        updatedAt: '2026-08-09T10:00:00.000Z',
      },
    });
    apiMocks.updateRuntimePolicy.mockResolvedValue({
      status: 200,
      data: {
        messagingEnabled: true,
        postingEnabled: false,
        databasePostingEnabled: false,
        emergencyReadOnly: true,
        environmentReadOnly: false,
        updatedAt: '2026-08-09T11:00:00.000Z',
        changed: true,
      },
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('加载三种举报状态总数，并只展示必要证据快照', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;

    await vi.waitFor(() => expect(mounted.host.textContent).toContain('这是一条需要审核的公开消息'));
    expect(apiMocks.list).toHaveBeenCalledTimes(3);
    expect(mounted.host.textContent).toContain('新手问答');
    expect(mounted.host.textContent).toContain('举报用户');
    expect(mounted.host.textContent).not.toContain('账号 ID');
  });

  it('处置必须填写原因，默认动作只隐藏消息并写入审核说明', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('违规成员'));

    const reviewButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === zhCN.communityChatModerationAdmin.review,
    );
    reviewButton?.click();
    await nextTick();
    expect(mounted.host.querySelector('.modal-stub')?.textContent).toContain('审核消息举报');

    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .danger_btn')!.click();
    expect(messageMocks.warning).toHaveBeenCalledWith(zhCN.communityChatModerationAdmin.noteRequired);
    expect(apiMocks.review).not.toHaveBeenCalled();

    const textarea = mounted.host.querySelector<HTMLTextAreaElement>('.modal-stub textarea')!;
    textarea.value = '消息包含明确的人身攻击，先隐藏并留档';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .danger_btn')!.click();

    await vi.waitFor(() =>
      expect(apiMocks.review).toHaveBeenCalledWith('report-1', {
        action: 'hide_message',
        note: '消息包含明确的人身攻击，先隐藏并留档',
        durationMinutes: null,
      }),
    );
  });

  it('Root 切换紧急只读时必须填写原因，更新后立即反映真实运行状态', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;

    await vi.waitFor(() => expect(mounted.host.textContent).toContain('正常发言'));
    expect(apiMocks.getRuntimePolicy).toHaveBeenCalledTimes(1);

    const toggleButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === zhCN.communityChatModerationAdmin.enableReadOnly,
    );
    expect(toggleButton?.disabled).toBe(false);
    toggleButton?.click();
    await nextTick();

    expect(mounted.host.querySelector('.modal-stub')?.textContent).toContain('将聊天室切换为紧急只读');
    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .danger_btn')!.click();
    expect(messageMocks.warning).toHaveBeenCalledWith(zhCN.communityChatModerationAdmin.runtimeReasonRequired);
    expect(apiMocks.updateRuntimePolicy).not.toHaveBeenCalled();

    const textarea = mounted.host.querySelector<HTMLTextAreaElement>('#community-chat-runtime-reason')!;
    textarea.value = '发现异常刷屏，先暂停发言完成核查';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .danger_btn')!.click();

    await vi.waitFor(() =>
      expect(apiMocks.updateRuntimePolicy).toHaveBeenCalledWith({
        postingEnabled: false,
        reason: '发现异常刷屏，先暂停发言完成核查',
      }),
    );
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('紧急只读'));
  });

  it('环境级只读生效时不允许后台伪恢复发言', async () => {
    apiMocks.getRuntimePolicy.mockResolvedValueOnce({
      status: 200,
      data: {
        messagingEnabled: true,
        postingEnabled: false,
        databasePostingEnabled: true,
        emergencyReadOnly: true,
        environmentReadOnly: true,
        updatedAt: '2026-08-09T10:00:00.000Z',
      },
    });
    const mounted = mountPage();
    cleanup = mounted.unmount;

    await vi.waitFor(() => expect(mounted.host.textContent).toContain('环境级只读'));
    const toggleButton = Array.from(mounted.host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === zhCN.communityChatModerationAdmin.runtimeEnvironmentReadOnly,
    );
    expect(toggleButton?.disabled).toBe(true);
    toggleButton?.click();
    expect(apiMocks.updateRuntimePolicy).not.toHaveBeenCalled();
  });
});
