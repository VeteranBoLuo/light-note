import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({
  saveAdminUserRemark: vi.fn(),
}));
const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/api/userApi.ts', () => ({
  default: { saveAdminUserRemark: apiMocks.saveAdminUserRemark },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({ default: messageMocks }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible'],
    template: '<section v-if="visible" class="modal-stub"><slot /></section>',
  },
}));

const { default: AdminUserRemarkModal } = await import('./AdminUserRemarkModal.vue');

describe('AdminUserRemarkModal', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    apiMocks.saveAdminUserRemark.mockReset();
    messageMocks.success.mockReset();
    messageMocks.error.mockReset();
    document.body.innerHTML = '';
  });

  it('回显已有备注并把修改结果交给父列表更新', async () => {
    apiMocks.saveAdminUserRemark.mockResolvedValue({
      status: 200,
      data: { targetUserId: 'user-1', adminRemark: '客户 A' },
    });
    const visible = ref(true);
    const saved = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(AdminUserRemarkModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              user: { id: 'user-1', alias: '原昵称', email: 'user@example.com', adminRemark: '旧备注' },
              onSaved: saved,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const input = host.querySelector<HTMLInputElement>('.admin-user-remark__input input');
    expect(input?.value).toBe('旧备注');
    input!.value = '客户 A';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    host.querySelector<HTMLButtonElement>('.admin-user-remark__actions .primary_btn')!.click();

    await vi.waitFor(() => {
      expect(apiMocks.saveAdminUserRemark).toHaveBeenCalledWith('user-1', '客户 A');
      expect(saved).toHaveBeenCalledWith({ targetUserId: 'user-1', adminRemark: '客户 A' });
      expect(visible.value).toBe(false);
    });
    expect(messageMocks.success).toHaveBeenCalledWith(zhCN.adminUserManagement.remarkSaved);
  });
});
