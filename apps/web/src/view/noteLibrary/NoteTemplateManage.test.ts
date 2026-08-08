import { createApp, defineComponent, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  detail: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/api/noteTemplate', () => ({
  queryNoteTemplates: mocks.query,
  getNoteTemplateDetail: mocks.detail,
  addNoteTemplate: mocks.add,
  updateNoteTemplate: mocks.update,
  duplicateNoteTemplate: mocks.duplicate,
  deleteNoteTemplate: mocks.remove,
}));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: () => undefined }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: mocks.error, warning: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: vi.fn() },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/components/base/ResourcePageShell.vue', () => ({
  default: {
    name: 'ResourcePageShellStub',
    template: '<section><slot name="meta"/><slot name="actions"/><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible'],
    template: '<section v-if="visible" class="modal-stub"><slot /></section>',
  },
}));
vi.mock('@/components/noteLibrary/template/NoteTemplateList.vue', () => ({
  default: { name: 'NoteTemplateListStub', template: '<aside class="list-stub" />' },
}));
vi.mock('@/components/noteLibrary/template/NoteTemplatePreview.vue', () => ({
  default: {
    name: 'NoteTemplatePreviewStub',
    props: ['template'],
    template: '<article class="preview-stub">{{ template?.name }}</article>',
  },
}));
vi.mock('@/components/noteLibrary/template/NoteTemplateEdit.vue', () => ({
  default: {
    name: 'NoteTemplateEditStub',
    emits: ['save', 'cancel', 'dirty-change'],
    mounted() {
      this.$emit('dirty-change', true);
    },
    methods: { resetBaseline() {} },
    template:
      "<button class=\"save-edit-stub\" @click=\"$emit('save', { name: '本地修改', titleTemplate: '', description: '', type: 'html', content: '<p>本地</p>' })\">保存编辑</button>",
  },
}));
vi.mock('@/components/mobile/MobilePageActionsDrawer.vue', () => ({
  default: { name: 'MobilePageActionsDrawerStub', template: '<div />' },
}));
vi.mock('@/components/mobile/MobileStickyActionBar.vue', () => ({
  default: { name: 'MobileStickyActionBarStub', template: '<div><slot /></div>' },
}));

const { default: NoteTemplateManage } = await import('./NoteTemplateManage.vue');

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('NoteTemplateManage 并发编辑', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({
      status: 200,
      data: [{ id: 'tpl-1', name: '周报', type: 'html', revision: 3 }],
    });
    mocks.detail.mockResolvedValue({
      status: 200,
      data: { id: 'tpl-1', name: '周报', type: 'html', content: '<p>云端</p>', revision: 3 },
    });
    mocks.update.mockResolvedValue({
      status: 409,
      data: { code: 'NOTE_TEMPLATE_VERSION_CONFLICT', revision: 4 },
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('版本冲突时不覆盖服务端，给出加载最新或另存副本', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/noteLibrary/templates', component: NoteTemplateManage }],
    });
    await router.push('/noteLibrary/templates');
    await router.isReady();
    const app = createApp(defineComponent({ setup: () => () => h(RouterView) }));
    app.use(router);
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => app.unmount();
    await settle();

    const edit = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes(zhCN.common.edit),
    );
    edit!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.save-edit-stub')!.click();
    await settle();

    expect(mocks.update).toHaveBeenCalledWith(
      'tpl-1',
      3,
      expect.objectContaining({ name: '本地修改', content: '<p>本地</p>' }),
    );
    expect(host.textContent).toContain(zhCN.note.templateManager.conflictDescription);
    expect(host.textContent).toContain(zhCN.note.templateManager.loadLatest);
    expect(host.textContent).toContain(zhCN.note.templateManager.saveCopy);
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
