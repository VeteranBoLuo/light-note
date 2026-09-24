import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/components/settings/AccountPasswordDialog.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    template: '<button v-if="visible" @click="$emit(\'update:visible\', false)">关闭</button>',
  },
}));
import PassConfigDlg from './PassConfigDlg.vue';
describe('个人中心密码入口', () => {
  it('共享密码框关闭时同步原入口的可见状态', async () => {
    const visible = ref(true);
    const host = document.createElement('div');
    const app = createApp({
      render: () =>
        h(PassConfigDlg, { visible: visible.value, 'onUpdate:visible': (v: boolean) => (visible.value = v) }),
    });
    app.mount(host);
    host.querySelector('button')!.click();
    await nextTick();
    expect(visible.value).toBe(false);
    app.unmount();
  });
});
