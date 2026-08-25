import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';

const requestMocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));
const operationMocks = vi.hoisted(() => ({ recordOperation: vi.fn() }));

vi.mock('@/http/request', () => requestMocks);
vi.mock('@/api/commonApi', () => operationMocks);
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'zh-CN' },
    t: (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`,
  }),
}));
vi.mock('@/composables/useAiQuotaStatus', () => ({
  formatAiQuotaTokens: (value: unknown) => String(Number(value || 0)),
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: {
    props: ['loading', 'title', 'inline'],
    template: '<div v-if="loading" class="loading-stub">{{ title }}</div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: { loading: Boolean, disabled: Boolean },
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: { props: ['value', 'options'], template: '<div class="select-stub" />' },
}));
vi.mock('@/components/base/BasicComponents/BPagination.vue', () => ({
  default: { template: '<div class="pagination-stub" />' },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: {
    props: ['activeTab', 'options'],
    emits: ['update:activeTab', 'change'],
    template:
      '<div><button v-for="item in options" :key="item.key" @click="$emit(\'update:activeTab\', item.key); $emit(\'change\', item.key)">{{ item.label }}</button></div>',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="icon-stub" />' },
}));
vi.mock('@/components/aiSkills/AiUsageDetailModal.vue', () => ({
  default: {
    props: ['visible', 'execution'],
    emits: ['update:visible'],
    template: '<div v-if="visible" class="detail-stub">{{ execution && execution.id }}</div>',
  },
}));

const { default: AiUsageCenter } = await import('./AiUsageCenter.vue');

let cleanup: (() => void) | undefined;

function mountCenter() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AiUsageCenter);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

function payload() {
  return {
    query: { days: 7, page: 1, pageSize: 20, module: 'all' },
    summary: {
      chargedTokens: 900,
      providerTokens: 1200,
      platformCoveredTokens: 300,
      todayChargedTokens: 900,
      modelActions: 1,
      zeroChargeModelActions: 0,
    },
    daily: [{ date: '2026-08-24', chargedTokens: 900, providerTokens: 1200, actions: 1 }],
    modules: [{ module: 'note', chargedTokens: 900, providerTokens: 1200, actions: 1 }],
    items: [
      {
        id: 'execution-1',
        actionId: 'note.transform_text',
        module: 'note',
        labelKey: 'noteTransformText',
        unit: 'request',
        createdAt: Date.now(),
        status: 'partial',
        modelCalled: true,
        providerCallCount: 2,
        providerTokens: 1200,
        chargedTokens: 900,
        platformCoveredTokens: 300,
        usageComplete: true,
        quotaSettlementStatus: 'reconciled',
        durationMs: 800,
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    catalog: {
      ruleVersion: 2,
      chargingRule: 'provider_actual_tokens',
      repairBilling: 'platform',
      failedExecutionBilling: 'platform',
      missingUsageBilling: 'request_estimate_capped',
      tokenActions: [{ id: 'note.transform_text', module: 'note', labelKey: 'noteTransformText', unit: 'request' }],
      freeActions: [
        {
          id: 'core_editing',
          module: 'general',
          labelKey: 'coreEditing',
          descriptionKey: 'coreEditingDescription',
        },
      ],
    },
  };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  requestMocks.apiBasePost.mockReset();
  operationMocks.recordOperation.mockReset();
});

describe('AiUsageCenter', () => {
  it('刷新中只显示 BButton 的加载反馈，不叠加第二个刷新图标', () => {
    requestMocks.apiBasePost.mockImplementation(() => new Promise(() => {}));
    const host = mountCenter();

    expect(host.querySelector('.usage-refresh .icon-stub')).toBeNull();
  });

  it('展示真实扣费、平台承担与隐私收口字段，并可切换到服务端计费目录', async () => {
    requestMocks.apiBasePost.mockResolvedValue({ status: 200, data: payload() });
    const host = mountCenter();

    await vi.waitFor(() => expect(host.textContent).toContain('settings.ai.usage.actions.noteTransformText'));
    expect(host.textContent).toContain('900');
    expect(host.textContent).toContain('settings.ai.usage.recordPlatformCovered');
    expect(host.textContent).toContain('settings.ai.usage.status.partial');
    expect(host.textContent).toContain('settings.ai.usage.privacyHint');
    expect(host.textContent).not.toContain('用户正文');
    const record = host.querySelector<HTMLButtonElement>('.usage-record');
    expect(record?.getAttribute('aria-label')).toContain('settings.ai.usage.openDetail');
    expect(operationMocks.recordOperation).not.toHaveBeenCalled();
    record?.click();
    await vi.waitFor(() => expect(host.textContent).toContain('execution-1'));
    expect(operationMocks.recordOperation).toHaveBeenCalledWith({
      module: 'AI 用量与计费',
      operation: '查看调用详情【笔记】',
    });

    const rulesTab = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('settings.ai.usage.rulesTab'),
    );
    rulesTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(host.textContent).toContain('settings.ai.usage.ruleTitle'));
    expect(operationMocks.recordOperation).toHaveBeenCalledWith({
      module: 'AI 用量与计费',
      operation: '查看计费规则',
    });
    expect(host.textContent).toContain('settings.ai.usage.freeActions.coreEditing.title');
  });

  it('账本不可用时显示稳定错误和重试入口', async () => {
    requestMocks.apiBasePost.mockRejectedValue({ code: 'AI_USAGE_STORE_UNAVAILABLE' });
    const host = mountCenter();
    await vi.waitFor(() => expect(host.textContent).toContain('settings.ai.usage.errorTitle'));
    expect(host.textContent).toContain('settings.ai.usage.retry');
  });

  it('首次加载时不提前展示零消耗或空记录', async () => {
    requestMocks.apiBasePost.mockReturnValue(new Promise(() => {}));
    const host = mountCenter();

    await vi.waitFor(() => expect(host.textContent).toContain('settings.ai.usage.loadingTitle'));
    expect(host.textContent).not.toContain('settings.ai.usage.emptyTitle');
    expect(host.textContent).not.toContain('settings.ai.usage.periodConsumption');
  });
});
