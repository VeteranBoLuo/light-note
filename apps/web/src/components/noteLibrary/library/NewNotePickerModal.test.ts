import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import { BUILTIN_NOTE_TEMPLATES } from '@/config/noteTemplates';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<section v-if="visible"><slot /></section>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div class="loading" />' } }));
vi.mock('@/components/noteLibrary/template/NoteTemplateBodyPreview.vue', () => ({
  default: { props: ['content', 'type'], template: '<article class="rendered-preview" v-html="content" />' },
}));
vi.mock('@/api/noteTemplate', () => ({ getNoteTemplateDetail: vi.fn() }));
const { getNoteTemplateDetail } = await import('@/api/noteTemplate');
const { default: NewNotePickerModal } = await import('./NewNotePickerModal.vue');
const tick = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const detail = (id: string) => ({
  status: 200,
  data: { id, name: id, type: 'html' as const, content: `<p>${id} 正文</p>`, revision: 1 },
});

describe('NewNotePickerModal', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });
  function mount(
    myTemplates = [
      { id: 'a', name: '模板 A', type: 'html' },
      { id: 'b', name: '模板 B', type: 'html' },
    ],
  ) {
    const host = document.createElement('div');
    document.body.append(host);
    const visible = ref(true),
      onSelectBuiltin = vi.fn(),
      onSelectMine = vi.fn(),
      onSelectBlank = vi.fn(),
      onManage = vi.fn();
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(NewNotePickerModal, {
            visible: visible.value,
            'onUpdate:visible': (value) => (visible.value = value),
            builtinTemplates: BUILTIN_NOTE_TEMPLATES,
            myTemplates,
            myTemplatesState: 'success',
            onSelectBuiltin,
            onSelectMine,
            onSelectBlank,
            onManage,
          }),
      }),
    );
    app.provide(MOBILE_LAYOUT_CONTEXT, ref(false));
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    const click = async (selector: string, index = 0) => {
      host.querySelectorAll<HTMLElement>(selector)[index]!.click();
      await tick();
    };
    return { host, visible, click, onSelectBuiltin, onSelectMine, onSelectBlank, onManage };
  }
  it('previews before use and never emits filled example content when creating a note', async () => {
    const m = mount();
    await tick();
    await m.click('.new-note-picker__item', 1);
    expect(m.onSelectBuiltin).not.toHaveBeenCalled();
    expect(m.host.querySelector('.rendered-preview')?.innerHTML).toContain('用一两句话');
    await m.click('.new-note-picker__preview-toolbar button');
    expect(m.host.querySelector('.rendered-preview')?.innerHTML).toContain('项目说明完成初稿');
    await m.click('.new-note-picker__footer button');
    expect(m.onSelectBuiltin).toHaveBeenCalledExactlyOnceWith({ key: 'weekly', type: 'html' });
    m.visible.value = false;
    await tick();
    m.visible.value = true;
    await tick();
    expect(m.host.querySelector('.rendered-preview')?.innerHTML).toContain('事项一：填写具体任务');
  });
  it('keeps the three blank shortcuts and management entry independent of the selected template', async () => {
    const m = mount();
    await tick();
    for (let i = 0; i < 3; i++) await m.click('.new-note-picker__blank button', i);
    expect(m.onSelectBlank.mock.calls.map((call) => call[0])).toEqual(['html', 'markdown', 'drawing']);
    await m.click('.new-note-picker__manage');
    expect(m.onManage).toHaveBeenCalledOnce();
    expect(getNoteTemplateDetail).not.toHaveBeenCalled();
  });
  it('loads only the selected personal template, ignores stale responses and disables use until ready', async () => {
    const pending: Record<string, (value: ReturnType<typeof detail>) => void> = {};
    vi.mocked(getNoteTemplateDetail).mockImplementation((id) => new Promise((resolve) => (pending[id] = resolve)));
    const m = mount();
    await tick();
    await m.click('[role=tab]', 1);
    expect(getNoteTemplateDetail).toHaveBeenCalledExactlyOnceWith('a');
    expect(m.host.querySelector('.new-note-picker__footer')).toBeNull();
    await m.click('.new-note-picker__mine-list button', 1);
    pending.a(detail('a'));
    await tick();
    expect(m.host.querySelector('.rendered-preview')).toBeNull();
    pending.b(detail('b'));
    await tick();
    expect(m.host.querySelector('.rendered-preview')?.textContent).toBe('b 正文');
    await m.click('.new-note-picker__footer button');
    expect(m.onSelectMine).toHaveBeenCalledExactlyOnceWith({ id: 'b', name: '模板 B', type: 'html' });
  });
  it('retries a failed detail and ignores requests after the dialog closes', async () => {
    vi.mocked(getNoteTemplateDetail).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(detail('a'));
    const m = mount();
    await tick();
    await m.click('[role=tab]', 1);
    expect(m.host.querySelector('[role=alert]')).not.toBeNull();
    expect(m.host.querySelector('.new-note-picker__footer')).toBeNull();
    await m.click('[role=alert] button');
    expect(m.host.querySelector('.rendered-preview')?.textContent).toBe('a 正文');
    let resolve!: (v: ReturnType<typeof detail>) => void;
    vi.mocked(getNoteTemplateDetail).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    await m.click('.new-note-picker__mine-list button', 1);
    m.visible.value = false;
    await tick();
    resolve(detail('b'));
    await tick();
    m.visible.value = true;
    await tick();
    expect(m.host.textContent).not.toContain('b 正文');
    expect(m.host.querySelector('.rendered-preview')?.innerHTML).toContain('事项一：填写具体任务');
  });
  it('does not offer a use action when the personal collection is empty', async () => {
    const m = mount([]);
    await tick();
    await m.click('[role=tab]', 1);
    expect(m.host.querySelector('.new-note-picker__footer')).toBeNull();
    expect(m.host.textContent).toContain(zhCN.note.tplEmptyMine);
    expect(getNoteTemplateDetail).not.toHaveBeenCalled();
  });
});
