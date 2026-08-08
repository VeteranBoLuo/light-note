import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible'],
    template: '<section v-if="visible"><slot /></section>',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: false }),
}));

const { default: ActionCardModal } = await import('./ActionCardModal.vue');

describe('ActionCardModal 区块标题操作', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('标题操作独立于卡片网格渲染', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const visible = ref(true);
    const manage = vi.fn();
    const app = createApp({
      render: () =>
        h(ActionCardModal, {
          visible: visible.value,
          'onUpdate:visible': (value: boolean) => (visible.value = value),
          title: '新建笔记',
          sections: [
            {
              key: 'mine',
              title: '我的模板',
              headerAction: { label: '模板管理', onClick: manage },
              actions: [{ key: 'template-1', label: '项目复盘' }],
            },
          ],
        }),
    });
    app.mount(host);
    cleanup = () => app.unmount();

    const headerAction = host.querySelector<HTMLButtonElement>('.section-header-action');
    expect(headerAction?.textContent).toContain('模板管理');
    expect(host.querySelectorAll('.cards-grid .action-card')).toHaveLength(1);
    expect(host.querySelector('.cards-grid')?.contains(headerAction!)).toBe(false);
    headerAction!.click();
    expect(manage).toHaveBeenCalledOnce();
  });
});
