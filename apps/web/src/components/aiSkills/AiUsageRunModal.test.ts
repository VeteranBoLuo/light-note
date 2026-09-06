import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, reactive, h } from 'vue';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/http/request', () => ({ apiBasePost: request }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh-CN' }, t: (key: string) => key }) }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { props: ['visible'], template: '<div v-if="visible"><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div class="loading" />' } }));
vi.mock('@/components/base/BasicComponents/BPagination.vue', () => ({
  default: { emits: ['page-change'], template: '<button class="next" @click="$emit(\'page-change\',2)">next</button>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('./AiUsageDetailModal.vue', () => ({
  default: { props: ['visible', 'execution'], template: '<div v-if="visible" class="details">{{execution.id}}</div>' },
}));
import Modal from './AiUsageRunModal.vue';
let cleanup = () => {};
function mount() {
  const props = reactive({ visible: true, run: { organizeRunId: 'run-1', chargedTokens: 300 }, days: 7 });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Modal, props) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, props };
}
function payload(id = 'call-1', runId = 'run-1') {
  return {
    status: 200,
    data: {
      query: { organizeRunId: runId },
      summary: { chargedTokens: 300 },
      pagination: { total: 21 },
      items: [{ id, status: 'success', createdAt: 0, chargedTokens: 300, providerCallCount: 2 }],
    },
  };
}
afterEach(() => {
  cleanup();
  request.mockReset();
});
describe('整次整理用量弹框', () => {
  it('按任务与日期读取，分页保留范围，并可查看原始调用详情', async () => {
    request.mockResolvedValue(payload());
    const { host } = mount();
    await vi.waitFor(() => expect(host.querySelector('.run-call')).not.toBeNull());
    expect(request.mock.calls[0][1]).toEqual({ organizeRunId: 'run-1', days: 7, page: 1, pageSize: 20 });
    host.querySelector<HTMLButtonElement>('.run-call')!.click();
    await vi.waitFor(() => expect(host.querySelector('.details')?.textContent).toBe('call-1'));
    host.querySelector<HTMLButtonElement>('.next')!.click();
    await vi.waitFor(() => expect(request.mock.calls.at(-1)[1].page).toBe(2));
  });
  it('失败显示重试，重试成功显示明细', async () => {
    request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(payload());
    const { host } = mount();
    await vi.waitFor(() => expect(host.querySelector('[role=alert]')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[role=alert] button')!.click();
    await vi.waitFor(() => expect(host.querySelector('.run-call')).not.toBeNull());
  });
  it('新任务打开后不接收旧任务迟到的响应', async () => {
    let resolve: (value: any) => void = () => {};
    request
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockResolvedValue(payload('new-call', 'run-2'));
    const { host, props } = mount();
    props.run = { organizeRunId: 'run-2', chargedTokens: 300 };
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    resolve(payload('old-call'));
    await vi.waitFor(() => expect(host.querySelector('.run-call')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('.run-call')!.click();
    await vi.waitFor(() => expect(host.querySelector('.details')?.textContent).toBe('new-call'));
  });
});
