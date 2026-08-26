import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/aiUsage/AiUsagePage.vue'), 'utf8');
const settingsSource = readFileSync(resolve(process.cwd(), 'src/view/settings/Settings.vue'), 'utf8');

describe('独立 AI 用量页信息架构', () => {
  it('在一个页面内按余额、最近消耗、计费规则渐进呈现', () => {
    expect(source).toContain("t('settings.ai.pageTitle')");
    expect(source).toContain('class="ai-quota-panel"');
    expect(source).toContain('<AiUsageCenter');
    expect(source).toContain('aiQuotaMetrics');
  });

  it('卡片、按钮和加载态都使用自研 B 组件', () => {
    expect(source).toContain('<BCard');
    expect(source).toContain('<BButton');
    expect(source).toContain('<BLoading');
    expect(source).not.toMatch(/<button\b|<input\b|<select\b/);
  });

  it('永久 AI 额度卡提供积分兑换与权益商店的统一获取入口', () => {
    expect(source).toContain("t('settings.ai.acquireQuota')");
    expect(source).toContain('<EntitlementAcquireModal v-model:visible="acquireVisible" asset="ai" />');
  });

  it('设置页只有单一入口，不再发额度或用量请求', () => {
    expect(settingsSource).toContain('settings-card--ai-entry');
    expect(settingsSource).toContain("router.push('/ai-usage')");
    expect(settingsSource).not.toContain('<AiUsageCenter');
    expect(settingsSource).not.toContain('loadAiQuota');
  });
});
