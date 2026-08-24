import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';

const requestMocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));

vi.mock('@/http/request', () => requestMocks);
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'zh-CN' },
    t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`,
  }),
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible', 'title'],
    emits: ['update:visible'],
    template: '<section v-if="visible" class="modal-stub"><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: { props: ['loading', 'title'], template: '<div v-if="loading">{{ title }}</div>' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['loading'], template: '<button><slot /></button>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span class="icon-stub" />' } }));

const { default: AiUsageDetailModal } = await import('./AiUsageDetailModal.vue');
let cleanup: (() => void) | undefined;

function execution() {
  return {
    id: '7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d',
    module: 'file',
    labelKey: 'fileSummarize',
    createdAt: Date.now(),
    status: 'success',
    providerCallCount: 3,
    providerTokens: 4035,
    chargedTokens: 2373,
    platformCoveredTokens: 1662,
    durationMs: 22936,
  };
}

function mountDetail() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AiUsageDetailModal, { execution: execution(), visible: true });
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

describe('AiUsageDetailModal', () => {
  it('按顺序解释视觉、生成和平台修复，并展示代码门禁触发原因', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        execution: execution(),
        calls: [
          {
            sequenceNo: 1,
            stageType: 'image_recognition',
            provider: 'deepseek',
            model: 'deepseek-v4-flash-vision-exp',
            status: 'success',
            usageStatus: 'reported',
            billingScope: 'user',
            promptTokens: 1199,
            completionTokens: 211,
            totalTokens: 1410,
            estimatedTokens: 3000,
            durationMs: 6313,
            createdAt: Date.now(),
            triggerReason: null,
            errorCategory: null,
          },
          {
            sequenceNo: 3,
            stageType: 'output_repair',
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            status: 'success',
            usageStatus: 'reported',
            billingScope: 'platform',
            promptTokens: 1007,
            completionTokens: 655,
            totalTokens: 1662,
            estimatedTokens: 2400,
            durationMs: 3414,
            createdAt: Date.now(),
            triggerReason: 'source_required',
            errorCategory: null,
          },
        ],
      },
    });
    const host = mountDetail();

    await vi.waitFor(() => expect(host.textContent).toContain('deepseek-v4-flash-vision-exp'));
    expect(requestMocks.apiBasePost).toHaveBeenCalledWith(
      '/api/chat/aiUsageDetail',
      { executionId: execution().id },
      { silent: true },
    );
    expect(host.textContent).toContain('settings.ai.usage.detail.stages.image_recognition');
    expect(host.textContent).toContain('settings.ai.usage.detail.stages.output_repair');
    expect(host.textContent).toContain('settings.ai.usage.detail.billing.platform');
    expect(host.textContent).toContain('settings.ai.usage.detail.repairReasons.source_required');
    expect(host.textContent).toContain('1,662');
    expect(host.textContent).toContain('settings.ai.usage.detail.privacy');
  });

  it('详情请求失败时显示稳定错误与重试入口', async () => {
    requestMocks.apiBasePost.mockRejectedValue({ code: 'AI_USAGE_STORE_UNAVAILABLE' });
    const host = mountDetail();
    await vi.waitFor(() => expect(host.textContent).toContain('settings.ai.usage.detail.errorTitle'));
    expect(host.textContent).toContain('settings.ai.usage.retry');
  });

  it('明确展示历史修复原因缺失、Provider 用量缺失和脱敏失败类型', async () => {
    requestMocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        execution: execution(),
        calls: [
          {
            sequenceNo: 1,
            stageType: 'image_recognition',
            provider: 'deepseek',
            model: 'deepseek-v4-flash-vision-exp',
            status: 'failed',
            usageStatus: 'missing',
            billingScope: 'user',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedTokens: 3000,
            durationMs: 6313,
            createdAt: Date.now(),
            triggerReason: null,
            errorCategory: 'timeout',
          },
          {
            sequenceNo: 2,
            stageType: 'output_repair',
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            status: 'success',
            usageStatus: 'reported',
            billingScope: 'platform',
            promptTokens: 311,
            completionTokens: 470,
            totalTokens: 781,
            estimatedTokens: 2200,
            durationMs: 4179,
            createdAt: Date.now(),
            triggerReason: 'historical_unknown',
            errorCategory: null,
          },
        ],
      },
    });
    const host = mountDetail();

    await vi.waitFor(() => expect(host.textContent).toContain('settings.ai.usage.detail.usageMissing'));
    expect(host.textContent).toContain('"n":"3,000"');
    expect(host.textContent).toContain('settings.ai.usage.detail.errors.timeout');
    expect(host.textContent).toContain('settings.ai.usage.detail.repairReasons.historical_unknown');
  });
});
