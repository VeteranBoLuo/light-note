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
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i aria-hidden="true" />' },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'BModalStub',
      props: { visible: Boolean },
      emits: ['ok'],
      setup(props, { emit, slots }) {
        return () =>
          props.visible
            ? h('section', { class: 'modal-stub' }, [
                slots.default?.(),
                h('button', { class: 'modal-ok', onClick: () => emit('ok') }, 'ok'),
              ])
            : null;
      },
    }),
  };
});

import NoteAttachPagesModal from './NoteAttachPagesModal.vue';

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('NoteAttachPagesModal', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    mocks.apiBasePost.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
    mocks.apiBasePost.mockImplementation(async (url: string, body: any) => {
      if (url.endsWith('queryNoteTree')) {
        return {
          status: 200,
          data: {
            maxDepth: 8,
            items: [
              {
                id: 'target',
                parentId: null,
                title: '目标目录',
                childCount: 1,
                hasChildren: true,
                isTop: false,
                sort: 0,
                children: [
                  {
                    id: 'existing',
                    parentId: 'target',
                    title: '已有子页面',
                    childCount: 0,
                    hasChildren: false,
                    isTop: false,
                    sort: 0,
                  },
                ],
              },
              {
                id: 'candidate',
                parentId: null,
                title: '待关联页面',
                childCount: 0,
                hasChildren: false,
                isTop: false,
                sort: 1,
              },
            ],
          },
        };
      }
      expect(url).toBe('/api/note/moveNoteNodes');
      expect(body).toEqual({ ids: ['candidate'], parentId: 'target' });
      return { status: 200, data: { affectedCount: 1 } };
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('排除当前分支并把所选已有页面批量移动到目标页面下', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const attached = vi.fn();
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteAttachPagesModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              targetNote: { id: 'target', title: '目标目录' },
              onAttached: attached,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => app.unmount();
    await flushUi();

    const rows = [...host.querySelectorAll<HTMLButtonElement>('.note-attach-row')];
    expect(rows.find((row) => row.textContent?.includes('目标目录'))?.disabled).toBe(true);
    expect(rows.find((row) => row.textContent?.includes('已有子页面'))?.disabled).toBe(true);
    rows.find((row) => row.textContent?.includes('待关联页面'))!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.modal-ok')!.click();
    await flushUi();

    expect(attached).toHaveBeenCalledWith({ affectedCount: 1 });
    expect(mocks.success).toHaveBeenCalledWith(zhCN.note.attachSuccess.replace('{count}', '1'));
    expect(visible.value).toBe(false);
  });
});
