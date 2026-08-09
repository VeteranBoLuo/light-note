import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  bookmark: { isMobile: true },
  user: {
    password: 'configured',
    email: 'user@example.com',
  },
}));

vi.mock('@/store', () => ({
  bookmarkStore: () => mocks.bookmark,
  useUserStore: () => mocks.user,
}));

vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawerStub',
    props: ['open', 'title', 'placement', 'height'],
    template:
      '<section v-if="open" class="drawer-stub" :data-title="title" :data-placement="placement" :data-height="height"><slot /></section>',
  },
}));

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible', 'title', 'width'],
    template: '<section v-if="visible" class="modal-stub" :data-title="title" :data-width="width"><slot /></section>',
  },
}));

vi.mock('@/components/base/BasicComponents/BForm/BForm.vue', () => ({
  default: {
    name: 'BFormStub',
    template: '<div class="form-stub" />',
  },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

vi.mock('@/http/request.ts', () => ({
  apiBasePost: vi.fn(),
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const { default: PassConfigDlg } = await import('./PassConfigDlg.vue');

let cleanup: (() => void) | undefined;

async function mountPasswordDialog() {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const app = createApp({
    render: () =>
      h(PassConfigDlg, {
        visible: visible.value,
        'onUpdate:visible': (value: boolean) => (visible.value = value),
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('修改密码响应式容器', () => {
  beforeEach(() => {
    mocks.bookmark.isMobile = true;
    mocks.user.password = 'configured';
    mocks.user.email = 'user@example.com';
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('移动端使用底部抽屉，并提供单一全宽主操作', async () => {
    const host = await mountPasswordDialog();
    const drawer = host.querySelector<HTMLElement>('.drawer-stub');

    expect(drawer).not.toBeNull();
    expect(drawer?.dataset.placement).toBe('bottom');
    expect(drawer?.dataset.height).toBe('min(86vh, 720px)');
    expect(drawer?.querySelector('.password-shell--mobile')).not.toBeNull();
    expect(drawer?.querySelector('.password-mobile-intro')?.textContent).toContain('新密码需为 6～64 位');
    expect(drawer?.querySelectorAll('.password-actions button')).toHaveLength(1);
    expect(host.querySelector('.modal-stub')).toBeNull();
  });

  it('桌面端保留居中弹窗及确定、取消双操作', async () => {
    mocks.bookmark.isMobile = false;
    const host = await mountPasswordDialog();
    const modal = host.querySelector<HTMLElement>('.modal-stub');

    expect(modal).not.toBeNull();
    expect(modal?.dataset.width).toBe('640px');
    expect(modal?.querySelector('.password-shell--mobile')).toBeNull();
    expect(modal?.querySelectorAll('.password-actions button')).toHaveLength(2);
    expect(host.querySelector('.drawer-stub')).toBeNull();
  });
});
