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
vi.mock('@/api/noteTreeTelemetry', () => ({ recordNoteTreeProductEvent: vi.fn() }));
vi.mock('@/utils/noteShareExposure', () => ({ requestNoteShareExposureConfirmation: () => false }));
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
                slots.footer?.() || h('button', { class: 'modal-ok', onClick: () => emit('ok') }, 'ok'),
              ])
            : null;
      },
    }),
  };
});

import NoteMoveModal from './NoteMoveModal.vue';

async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('NoteMoveModal', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    mocks.apiBasePost.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  async function mountModal() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const moved = vi.fn();
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(NoteMoveModal, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
              note: { id: 'moving', parentId: 'source-parent', title: '待移动页面' },
              onMoved: moved,
            });
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => app.unmount();
    await flushUi();
    return { host, visible, moved };
  }

  it('可把单篇页面放到目标页面前面，并发送同级父目录与 nextId 锚点', async () => {
    mocks.apiBasePost.mockImplementation(async (url: string, body: any) => {
      if (url === '/api/note/queryNoteTree') {
        return {
          status: 200,
          data: {
            maxDepth: 8,
            items: [
              {
                id: 'source-parent',
                parentId: null,
                title: '原目录',
                childCount: 1,
                hasChildren: true,
                isTop: false,
                sort: 0,
                children: [
                  {
                    id: 'moving',
                    parentId: 'source-parent',
                    title: '待移动页面',
                    childCount: 0,
                    hasChildren: false,
                    isTop: false,
                    sort: 0,
                  },
                ],
              },
              {
                id: 'target',
                parentId: null,
                title: '目标页面',
                childCount: 0,
                hasChildren: false,
                isTop: false,
                sort: 1,
              },
            ],
          },
        };
      }
      expect(url).toBe('/api/note/moveNoteNode');
      expect(body).toEqual({
        id: 'moving',
        parentId: null,
        previousId: null,
        nextId: 'target',
      });
      return { status: 200, data: { id: 'moving', parentId: null } };
    });

    const { host, visible, moved } = await mountModal();
    [...host.querySelectorAll<HTMLButtonElement>('.note-move-row')]
      .find((button) => button.textContent?.includes('目标页面'))!
      .click();
    await nextTick();
    [...host.querySelectorAll<HTMLButtonElement>('.note-move-placement button')]
      .find((button) => button.textContent?.includes('放在前面'))!
      .click();
    await nextTick();
    expect(host.querySelector('.note-move-outcome')?.textContent).toContain('与它同级');
    host.querySelector<HTMLButtonElement>('.note-move-desktop-footer .primary_btn')!.click();
    await flushUi();

    expect(moved).toHaveBeenCalledWith({ id: 'moving', parentId: null });
    expect(mocks.success).toHaveBeenCalledWith('已插到“目标页面”前面');
    expect(visible.value).toBe(false);
  });

  it('根目录和批量移动保持仅移入语义', async () => {
    mocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { maxDepth: 8, items: [] } });
    const { host } = await mountModal();

    expect(host.querySelector('.note-move-placement')).toBeNull();
    expect(host.querySelector('.note-move-outcome')?.textContent).toContain('根目录');
  });
});
