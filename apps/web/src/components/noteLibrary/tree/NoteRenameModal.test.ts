import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible', 'initialFocus'],
    template:
      '<section v-if="visible" class="modal-stub" :data-initial-focus="initialFocus"><slot /></section>',
  },
}));

const { default: NoteRenameModal } = await import('./NoteRenameModal.vue');

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function findButton(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  return button!;
}

describe('NoteRenameModal 标题更新边界', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  function mountModal() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const renamed = vi.fn();
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteRenameModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              note: { id: 'note-1', title: '旧标题' },
              onRenamed: renamed,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    return { host, visible, renamed };
  }

  it('只提交 id 与修剪后的 title，不覆盖正文、目录或其他字段', async () => {
    const { host, visible, renamed } = mountModal();
    await settle();

    const input = host.querySelector<HTMLInputElement>('#note-page-rename-input');
    expect(input?.value).toBe('旧标题');
    input!.value = '  新标题  ';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    findButton(host, zhCN.common.confirm).click();
    await settle();

    expect(mocks.apiBasePost).toHaveBeenCalledWith('/api/note/updateNote', {
      id: 'note-1',
      title: '新标题',
    });
    expect(Object.keys(mocks.apiBasePost.mock.calls[0][1])).toEqual(['id', 'title']);
    expect(renamed).toHaveBeenCalledWith({ id: 'note-1', title: '新标题' });
    expect(mocks.success).toHaveBeenCalledWith(zhCN.note.renameSuccess);
    expect(visible.value).toBe(false);
  });

  it('打开重命名弹框时声明标题输入框为初始焦点', async () => {
    const { host } = mountModal();
    await settle();

    expect(host.querySelector('.modal-stub')?.getAttribute('data-initial-focus')).toBe(
      '#note-page-rename-input',
    );
  });

  it('标题未变化时直接关闭且不产生写请求', async () => {
    const { host, visible, renamed } = mountModal();
    await settle();

    findButton(host, zhCN.common.confirm).click();
    await settle();

    expect(mocks.apiBasePost).not.toHaveBeenCalled();
    expect(renamed).not.toHaveBeenCalled();
    expect(visible.value).toBe(false);
  });
});
