import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('AI 额度快捷展示契约', () => {
  const summarySource = readSource('src/components/aiSkills/AiQuotaSummary.vue');
  const desktopProfileSource = readSource('src/view/personCenter/PersonCenter.vue');
  const mobileProfileSource = readSource('src/view/personCenter/PersonCenterMobile.vue');
  const settingsSource = readSource('src/view/settings/Settings.vue');
  const usagePageSource = readSource('src/view/aiUsage/AiUsagePage.vue');
  const visualHarnessSource = readSource('src/e2e/AiUsageCenterHarness.vue');

  it('桌面头像弹层和移动个人中心复用同一个额度摘要组件', () => {
    expect(desktopProfileSource).toContain('<AiQuotaSummary');
    expect(desktopProfileSource).toContain(':active="menuVisible"');
    expect(desktopProfileSource).toContain('layout="tile"');
    expect(desktopProfileSource).toContain('entry-source="桌面个人中心"');
    expect(mobileProfileSource).toContain('<AiQuotaSummary');
    expect(mobileProfileSource).toContain('density="comfortable"');
    expect(mobileProfileSource).toContain('layout="tile"');
    expect(mobileProfileSource).toContain('entry-source="移动个人中心"');
    expect(desktopProfileSource).toContain('@open-details="goAiQuotaDetails"');
    expect(mobileProfileSource).toContain('@open-details="goAiQuotaDetails"');
    expect(desktopProfileSource).toContain("router.push('/ai-usage')");
    expect(mobileProfileSource).toContain("router.push('/ai-usage')");
  });

  it('桌面个人中心复用 BPopover 悬停状态机，跳转后不会被残留悬停标记重新打开', () => {
    expect(desktopProfileSource).toContain('trigger="hover"');
    expect(desktopProfileSource).toContain('function dismissProfilePopover()');
    expect(desktopProfileSource).toContain("navigateFromProfile('/growth')");
    expect(desktopProfileSource).not.toContain('isHoveringCard');
    expect(desktopProfileSource).not.toContain('delayClosePopover');
  });

  it('桌面主题和语言保留功能并收紧为同一行', () => {
    expect(desktopProfileSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(desktopProfileSource).toContain("t('personCenter.themeMode')");
    expect(desktopProfileSource).toContain("t('personCenter.language')");
  });

  it('摘要组件使用既有 AI 图标、B 组件与明确状态', () => {
    expect(summarySource).toContain('<BButton');
    expect(summarySource).toContain('<BProgress');
    expect(summarySource).toContain('icon.growth.ai');
    expect(summarySource).toContain("surface?: 'panel' | 'plain'");
    expect(summarySource).toContain("layout?: 'row' | 'tile'");
    expect(summarySource).toContain('.ai-quota-summary.is-plain.b_btn');
    expect(summarySource).toContain('.ai-quota-summary.is-tile.b_btn');
    expect(summarySource).toContain("t('personCenter.aiQuotaUnavailable')");
    expect(summarySource).toContain("'is-unavailable': unavailable");
    expect(summarySource).toContain(':aria-busy="loading"');
    expect(summarySource).toContain("t('personCenter.aiQuotaBreakdown'");
    expect(summarySource).toContain('class="ai-quota-summary__primary-value"');
    expect(summarySource).toContain("t('personCenter.aiQuotaTodayRemaining')");
    expect(summarySource).toContain('class="ai-quota-summary__secondary-value"');
    expect(summarySource).toContain("t('personCenter.aiQuotaPermanentShort')");
    expect(summarySource).not.toContain("layout !== 'tile'");
    expect(summarySource).toContain('min-height: 68px');
    expect(summarySource).toContain('.ai-quota-summary.is-tile :deep(.b-progress__trail)');
    expect(summarySource).not.toContain('text-overflow: ellipsis');
    expect(summarySource).toContain("module: 'AI 用量与计费'");
    expect(summarySource).toContain('`打开页面【${entrySource}】`');
  });

  it('AI 卡以今日剩余为主、永久额度为辅助，进度只读取今日额度比例', () => {
    expect(summarySource).toContain('daily: formatAiQuotaTokens(status.value.dailyRemaining');
    expect(summarySource).toContain('permanent: formatAiQuotaTokens(status.value.bonusTokens');
    expect(summarySource).toContain(':percent="remainingPercent"');
    expect(summarySource).toContain('v-if="status && !status.exempt && !unavailable"');
    expect(summarySource).toMatch(/\.ai-quota-summary__primary-value strong\s*\{[\s\S]*?font-size:\s*13px;/);
    expect(summarySource).toMatch(
      /\.ai-quota-summary__secondary-value strong\s*\{[\s\S]*?color:\s*var\(--desc-color\);/,
    );
  });

  it('运行中的额度预留作为独立状态展示，不把已结算余额改写成零', () => {
    expect(summarySource).toContain('pendingReservedTokens');
    expect(summarySource).toContain('class="ai-quota-summary__pending"');
    expect(summarySource).toContain("t('personCenter.aiQuotaSettling'");
    expect(summarySource).toContain('.ai-quota-summary__pending > span');
    expect(usagePageSource).toContain('availableRemaining');
    expect(usagePageSource).toContain('class="ai-quota-pending"');
    expect(usagePageSource).toContain("t('settings.ai.quotaSettling'");
  });

  it('详细额度只在独立页读取，设置页保留紧凑入口', () => {
    expect(settingsSource).toContain('class="ai-usage-entry"');
    expect(settingsSource).toContain("operation: '打开页面【设置】'");
    expect(settingsSource).toContain("router.push('/ai-usage')");
    expect(settingsSource).not.toContain('useAiQuotaStatus');
    expect(settingsSource).not.toContain('<AiUsageCenter');
    expect(usagePageSource).toContain('useAiQuotaStatus');
    expect(usagePageSource).toContain('formatAiQuotaTokens');
    expect(usagePageSource).toContain('<AiUsageCenter');
    expect(usagePageSource).not.toContain("apiBasePost('/api/chat/aiQuota'");
    expect(visualHarnessSource).toContain("view === 'settings'");
  });
});
