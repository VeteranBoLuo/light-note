import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

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

const { default: NewNotePickerModal } = await import('./NewNotePickerModal.vue');

describe('NewNotePickerModal 自定义模板入口', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('我的模板只负责选用，不再提供分散删除，并提供统一管理入口', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const managed = vi.fn();
    const visible = ref(true);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NewNotePickerModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              builtinTemplates: [],
              myTemplates: [{ id: 'tpl-1', name: '项目复盘', type: 'html' }],
              myTemplatesState: 'success',
              templateIcons: {},
              onManage: managed,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const mineTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes(zhCN.note.tplMineSection),
    );
    mineTab!.click();
    await nextTick();

    expect(host.querySelector('.new-note-picker__remove')).toBeNull();
    const manage = host.querySelector<HTMLButtonElement>('.new-note-picker__manage');
    expect(manage?.textContent).toContain(zhCN.note.templateManager.title);
    manage!.click();
    expect(managed).toHaveBeenCalledOnce();
  });
});
