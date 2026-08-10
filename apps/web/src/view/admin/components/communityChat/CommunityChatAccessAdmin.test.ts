import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  review: vi.fn(),
  revoke: vi.fn(),
}));
const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatAdminAccessRequests: apiMocks.list,
  reviewCommunityChatAdminAccessRequest: apiMocks.review,
  revokeCommunityChatAdminMember: apiMocks.revoke,
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
    template:
      '<section v-if="visible" class="modal-stub"><h2>{{ title }}</h2><slot /><div class="modal-footer"><slot name="footer" /></div></section>',
  },
}));

const { default: CommunityChatAccessAdmin } = await import('./CommunityChatAccessAdmin.vue');

const pendingItem = {
  id: 'request-1',
  userId: 'user-1',
  status: 'pending',
  requestMessage: '希望参与首批内测',
  reviewNote: '',
  reviewedBy: null,
  reviewedAt: null,
  createTime: '2026-08-09 12:00:00',
  updateTime: '2026-08-09 12:00:00',
  userAlias: '内测用户',
  userEmail: 'pilot@example.com',
  memberRole: null,
  memberStatus: null,
  memberRulesVersion: null,
  rulesAcceptedAt: null,
  joinedAt: null,
  revokedAt: null,
};

function mockPages() {
  apiMocks.list.mockImplementation((params: { status: string }) =>
    Promise.resolve({
      status: 200,
      data: {
        items: params.status === 'pending' ? [pendingItem] : [],
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
  const app = createApp({ render: () => h(CommunityChatAccessAdmin) });
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

describe('CommunityChatAccessAdmin', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPages();
    apiMocks.review.mockResolvedValue({ status: 200, data: { userId: 'user-1', status: 'approved' } });
    apiMocks.revoke.mockResolvedValue({ status: 200, data: { userId: 'user-1', status: 'revoked' } });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('加载三种状态总数，并能从待审核列表通过申请', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;

    await vi.waitFor(() => expect(mounted.host.textContent).toContain('内测用户'));
    expect(apiMocks.list).toHaveBeenCalledTimes(3);
    expect(mounted.host.textContent).toContain('pilot@example.com');

    mounted.host.querySelector<HTMLButtonElement>('.community-chat-access-admin__action--approve')!.click();
    await nextTick();
    expect(mounted.host.querySelector('.modal-stub')?.textContent).toContain('通过社区内测申请');
    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .primary_btn')!.click();

    await vi.waitFor(() => {
      expect(apiMocks.review).toHaveBeenCalledWith('user-1', { action: 'approve', note: '' });
      expect(messageMocks.success).toHaveBeenCalledWith(zhCN.communityChatAdmin.approvedSuccess);
    });
  });

  it('拒绝申请必须先填写审核原因', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('内测用户'));

    mounted.host.querySelector<HTMLButtonElement>('.community-chat-access-admin__action--reject')!.click();
    await nextTick();
    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .danger_btn')!.click();

    expect(messageMocks.warning).toHaveBeenCalledWith(zhCN.communityChatAdmin.noteRequired);
    expect(apiMocks.review).not.toHaveBeenCalled();

    const textarea = mounted.host.querySelector<HTMLTextAreaElement>('.modal-stub textarea')!;
    textarea.value = '暂不符合内测范围';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    mounted.host.querySelector<HTMLButtonElement>('.modal-stub .danger_btn')!.click();

    await vi.waitFor(() =>
      expect(apiMocks.review).toHaveBeenCalledWith('user-1', {
        action: 'reject',
        note: '暂不符合内测范围',
      }),
    );
  });
});
