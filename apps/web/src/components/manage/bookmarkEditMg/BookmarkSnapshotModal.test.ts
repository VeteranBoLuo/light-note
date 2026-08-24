import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';

const requestMocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));

vi.mock('@/http/request.ts', () => requestMocks);
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'user-1', role: 'user' }),
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: { visible: Boolean },
    template: '<div v-if="visible" class="modal-stub"><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: { disabled: Boolean, loading: Boolean },
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BSpace.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

const { default: BookmarkSnapshotModal } = await import('./BookmarkSnapshotModal.vue');

let cleanup: (() => void) | undefined;

function mountModal(bookmarkId = 'bookmark-1') {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      const visible = ref(true);
      return () =>
        h(BookmarkSnapshotModal, {
          visible: visible.value,
          bookmarkId,
          'onUpdate:visible': (value: boolean) => (visible.value = value),
        });
    },
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  requestMocks.apiBasePost.mockReset();
});

describe('BookmarkSnapshotModal 网页存档生命周期', () => {
  it('缺少完整存档时只调用合并接口，并回读同一版正文和摘要', async () => {
    let snapshotReads = 0;
    requestMocks.apiBasePost.mockImplementation(async (path: string) => {
      if (path === '/api/bookmark/snapshot') {
        snapshotReads += 1;
        return snapshotReads === 1
          ? { status: 200, data: null }
          : {
              status: 200,
              data: { title: '示例网页', content: '完整正文', summary: '正文摘要', update_time: '2026-08-24' },
            };
      }
      if (path === '/api/bookmark/archive-summary') return { status: 200, data: { ok: true } };
      throw new Error(`unexpected path: ${path}`);
    });

    const host = mountModal();

    await vi.waitFor(() =>
      expect(requestMocks.apiBasePost).toHaveBeenCalledWith('/api/bookmark/archive-summary', {
        id: 'bookmark-1',
      }),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('正文摘要'));
    expect(requestMocks.apiBasePost.mock.calls.map((call) => call[0])).toEqual([
      '/api/bookmark/snapshot',
      '/api/bookmark/archive-summary',
      '/api/bookmark/snapshot',
    ]);
  });

  it('已有同版正文和摘要时只读取，不重复消耗 AI 额度', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { title: '示例网页', content: '完整正文', summary: '正文摘要', update_time: '2026-08-24' },
    });

    const host = mountModal();

    await vi.waitFor(() => expect(host.textContent).toContain('正文摘要'));
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith('/api/bookmark/snapshot', { id: 'bookmark-1' });
  });
});
