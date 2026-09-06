import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import AiOrganizeModal from './AiOrganizeModal.vue';

const requestMocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));

vi.mock('@/http/request.ts', () => requestMocks);
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/store', () => ({
  useUserStore: () => ({ adminContext: null }),
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: { visible: Boolean },
    template: '<div v-if="visible" class="modal-stub"><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BCheckbox.vue', () => ({
  default: { template: '<label><slot /></label>' },
}));
vi.mock('@/components/tag/ResourceTagChip.vue', () => ({
  default: { template: '<span />' },
}));

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  requestMocks.apiBasePost.mockReset();
});

function mountInitiallyVisible(visible = ref(true), ids = ref(['note-1', 'note-2'])) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(AiOrganizeModal, {
          visible: visible.value,
          'onUpdate:visible': (value: boolean) => (visible.value = value),
          initType: 'note',
          selectedIds: ids.value,
        });
    },
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.use(createPinia());
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AiOrganizeModal initialization', () => {
  it('打开后固定材料，关闭再打开后的旧报价不能覆盖新操作层', async () => {
    let resolveOld!: (value: unknown) => void;
    requestMocks.apiBasePost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    requestMocks.apiBasePost.mockResolvedValueOnce({
      status: 200,
      data: {
        candidateTotal: 0,
        batchCap: 0,
        batchIds: [],
        canRun: false,
        requestIds: ['new-note'],
        requestedTotal: 1,
      },
    });
    const visible = ref(true);
    const ids = ref(['note-1', 'note-2']);
    const host = mountInitiallyVisible(visible, ids);
    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1));
    ids.value = ['new-note'];
    await nextTick();
    expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1);
    expect(requestMocks.apiBasePost.mock.calls[0][1].ids).toEqual(['note-1', 'note-2']);
    visible.value = false;
    await nextTick();
    visible.value = true;
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.aiOrganizeSelectedNone'));
    resolveOld({ status: 200, data: { candidateTotal: 2, batchCap: 2, batchIds: ['note-1', 'note-2'], canRun: true } });
    await nextTick();
    await nextTick();
    expect(host.textContent).toContain('bookmarkMg.aiOrganizeSelectedNone');
    expect(requestMocks.apiBasePost.mock.calls[1][1].ids).toEqual(['new-note']);
  });
  it('loads the selected scope when deferred rendering mounts it already visible', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        candidateTotal: 2,
        batchCap: 2,
        batchIds: ['note-1', 'note-2'],
        canRun: true,
        requestIds: ['note-1', 'note-2'],
        requestedTotal: 2,
      },
    });

    mountInitiallyVisible();

    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1));
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith(
      '/api/bookmark/ai/organize/quote',
      {
        scope: 'selected',
        ids: ['note-1', 'note-2'],
        resourceType: 'note',
      },
      { silent: true },
    );
  });

  it('shows an explicit retry action instead of a blank body when loading the scope fails', async () => {
    requestMocks.apiBasePost.mockResolvedValueOnce({ status: 500, data: null }).mockResolvedValueOnce({
      status: 200,
      data: {
        candidateTotal: 0,
        batchCap: 0,
        batchIds: [],
        canRun: false,
        requestIds: ['note-1', 'note-2'],
        requestedTotal: 2,
      },
    });

    const host = mountInitiallyVisible();
    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(1));
    await nextTick();

    expect(host.textContent).toContain('bookmarkMg.aiOrganizeQuoteFailed');
    expect(host.textContent).toContain('bookmarkMg.aiOrganizeRetry');

    host.querySelector('button')?.click();
    await vi.waitFor(() => expect(requestMocks.apiBasePost).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.textContent).toContain('bookmarkMg.aiOrganizeSelectedNone'));
  });
});
