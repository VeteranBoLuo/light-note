import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const apiBasePost = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawerStub',
    props: ['open', 'title'],
    template: '<section v-if="open" class="drawer-stub"><h3>{{ title }}</h3><slot /></section>',
  },
}));
vi.mock('@/components/base/BasicComponents/BDateTimePicker.vue', () => ({
  default: { name: 'BDateTimePickerStub', template: '<div class="datetime-stub" />' },
}));

const { default: Rules } = await import('./Rules.vue');

let cleanup: (() => void) | undefined;

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountRules() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Rules) });
  app.use(createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      zh: { common: { pleaseSelect: '请选择', selectDateTime: '选择日期和时间' } },
      'zh-CN': { common: { pleaseSelect: '请选择', selectDateTime: '选择日期和时间' } },
    },
  }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('安全中心检测质量规则调优', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const items = Array.from({ length: 11 }, (_, index) => ({
      ruleCode: index === 0 ? 'API_ENUMERATION' : index === 10 ? 'PARAMETER_OVERFLOW' : `RULE_${index}`,
      ruleName: `规则 ${index}`,
      description: '测试规则',
      mode: 'observe',
      baseScore: 30 + index,
      effectiveScore: 30 + index,
      rawHits: 0,
      confirmedHits: 0,
      falsePositiveRate: 0,
      primaryRoute: index === 0 ? '/bookmark/resolveUrl' : '',
    }));
    Object.assign(items[10], {
      hasOverride: true,
      policyVersion: 6,
      effectiveScore: 56,
      primaryRoute: '/bookmark/resolveUrl',
      routePattern: '/bookmark/*',
      requestMethod: 'POST',
      fieldPattern: 'url',
      expiresAt: '2026-08-31 23:59:00',
      reason: '仅调整书签解析请求',
    });
    apiBasePost.mockResolvedValue({ status: 200, data: { items } });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('点击第 11 行时打开对应规则，且不会把行号 10 当成模式', async () => {
    const host = mountRules();
    await flushPromises();

    expect(host.textContent).not.toContain('测试规则变更');
    const rows = host.querySelectorAll<HTMLElement>('.table-row');
    expect(rows).toHaveLength(11);
    rows[10].click();
    await nextTick();

    expect(host.querySelector('.drawer-stub h3')?.textContent).toContain('规则调优 · PARAMETER_OVERFLOW');
    const selects = host.querySelectorAll<HTMLElement>('.security-rule-drawer .security-setting .select-trigger');
    const modeTrigger = selects[0];
    expect(modeTrigger?.textContent).toContain('观察');
    expect(modeTrigger?.textContent).not.toContain('10');
    expect(selects[1]?.textContent).toContain('POST');
    const inputs = host.querySelectorAll<HTMLInputElement>('.security-rule-form input');
    expect(inputs[0]?.value).toBe('56');
    expect(inputs[1]?.value).toBe('/bookmark/*');
    expect(inputs[2]?.value).toBe('url');
    expect(inputs[3]?.value).toBe('');
    expect(host.querySelector('.security-rule-current')?.textContent).toContain('已发布策略 v6');
    expect(host.querySelector('.security-rule-current')?.textContent).toContain('当前策略依据：仅调整书签解析请求');
    expect(host.querySelector('.security-rule-hit-route')?.textContent).toContain('近 7 天主要命中接口');
    expect(host.querySelector('.security-rule-hit-route')?.textContent).toContain('/bookmark/resolveUrl');
    expect(host.textContent).toContain('策略接口范围');
    expect(host.textContent).toContain('分数调整暂不参与本次预估');
  });

  it('系统默认规则显式回填基础分和全局作用域，切换规则时不残留上一条配置', async () => {
    const host = mountRules();
    await flushPromises();

    const rows = host.querySelectorAll<HTMLElement>('.table-row');
    rows[10].click();
    await nextTick();
    rows[0].click();
    await nextTick();

    expect(host.querySelector('.drawer-stub h3')?.textContent).toContain('规则调优 · API_ENUMERATION');
    const selects = host.querySelectorAll<HTMLElement>('.security-rule-drawer .security-setting .select-trigger');
    expect(selects[0]?.textContent).toContain('观察');
    expect(selects[1]?.textContent).toContain('全部方法');
    const inputs = host.querySelectorAll<HTMLInputElement>('.security-rule-form input');
    expect(inputs[0]?.value).toBe('30');
    expect(inputs[1]?.value).toBe('*');
    expect(inputs[2]?.value).toBe('*');
    expect(inputs[3]?.value).toBe('');
    expect(host.querySelector('.security-rule-current')?.textContent).toContain('系统默认');
    expect(host.querySelector('.security-rule-current')?.textContent).not.toContain('仅调整书签解析请求');
    expect(host.querySelector('.security-rule-hit-route')?.textContent).toContain('/bookmark/resolveUrl');

    const replayButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('预估历史影响'),
    );
    replayButton?.click();
    await flushPromises();

    expect(apiBasePost).toHaveBeenLastCalledWith('/api/security/v2/rules/API_ENUMERATION/replay', {
      mode: 'observe',
      scoreOverride: 30,
      routePattern: '',
      requestMethod: '',
      fieldPattern: '',
      expiresAt: null,
      reason: '',
      permanent: true,
    });
  });
});
