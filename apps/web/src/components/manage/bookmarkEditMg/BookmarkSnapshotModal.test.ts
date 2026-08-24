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
  default: { success: vi.fn(), info: vi.fn(), warning: vi.fn() },
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
  it('打开缺少存档的弹窗不会自动消费 AI，用户可显式免费保存网页正文', async () => {
    let snapshotReads = 0;
    requestMocks.apiBasePost.mockImplementation(async (path: string) => {
      if (path === '/api/bookmark/snapshot') {
        snapshotReads += 1;
        return snapshotReads === 1
          ? { status: 200, data: null }
          : {
              status: 200,
              data: { title: '示例网页', content: '完整正文', summary: null, update_time: '2026-08-24' },
            };
      }
      if (path === '/api/bookmark/archive') return { status: 200, data: { ok: true } };
      throw new Error(`unexpected path: ${path}`);
    });

    const host = mountModal();

    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1));
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith('/api/bookmark/snapshot', { id: 'bookmark-1' });
    expect(requestMocks.apiBasePost).not.toHaveBeenCalledWith('/api/bookmark/summarize', expect.anything());

    const archiveButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('bookmarkMg.snapshotCreateArchive'),
    );
    archiveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(host.textContent).toContain('完整正文'));
    expect(requestMocks.apiBasePost.mock.calls.map((call) => call[0])).toEqual([
      '/api/bookmark/snapshot',
      '/api/bookmark/archive',
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

  it('AI 摘要必须由用户显式触发，并明确调用计量接口', async () => {
    let snapshotReads = 0;
    requestMocks.apiBasePost.mockImplementation(async (path: string, body: any) => {
      if (path === '/api/bookmark/snapshot') {
        snapshotReads += 1;
        return {
          status: 200,
          data: {
            title: '示例网页',
            content: '完整正文',
            summary: snapshotReads > 1 ? '正文摘要' : null,
            update_time: '2026-08-24',
          },
        };
      }
      if (path === '/api/bookmark/summarize') {
        expect(body).toEqual({ id: 'bookmark-1', force: true });
        return { status: 200, data: { ok: true, summary: '正文摘要' } };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const host = mountModal();
    await vi.waitFor(() => expect(host.textContent).toContain('完整正文'));
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);

    const summaryButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('bookmarkMg.aiSummaryGenerate'),
    );
    summaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(host.textContent).toContain('正文摘要'));
    expect(requestMocks.apiBasePost.mock.calls.map((call) => call[0])).toEqual([
      '/api/bookmark/snapshot',
      '/api/bookmark/summarize',
      '/api/bookmark/snapshot',
    ]);
  });
});
