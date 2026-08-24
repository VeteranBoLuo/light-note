import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('AI 额度快捷展示契约', () => {
  const summarySource = readSource('src/components/aiSkills/AiQuotaSummary.vue');
  const desktopProfileSource = readSource('src/view/personCenter/PersonCenter.vue');
  const mobileProfileSource = readSource('src/view/personCenter/PersonCenterMobile.vue');
  const settingsSource = readSource('src/view/settings/Settings.vue');

  it('桌面头像弹层和移动个人中心复用同一个额度摘要组件', () => {
    expect(desktopProfileSource).toContain('<AiQuotaSummary');
    expect(desktopProfileSource).toContain(':active="menuVisible"');
    expect(mobileProfileSource).toContain('<AiQuotaSummary');
    expect(mobileProfileSource).toContain('density="comfortable"');
    expect(desktopProfileSource).toContain('@open-details="goAiQuotaDetails"');
    expect(mobileProfileSource).toContain('@open-details="goAiQuotaDetails"');
    expect(desktopProfileSource).toContain("query: { section: 'ai' }");
    expect(mobileProfileSource).toContain("query: { section: 'ai' }");
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
    expect(summarySource).toContain("t('personCenter.aiQuotaUnavailable')");
    expect(summarySource).toContain("t('personCenter.aiQuotaBreakdown'");
  });

  it('设置页复用统一额度状态，不再独立调用接口和格式化 tokens', () => {
    expect(settingsSource).toContain('useAiQuotaStatus');
    expect(settingsSource).toContain('formatAiQuotaTokens');
    expect(settingsSource).not.toContain("apiBasePost('/api/chat/aiQuota'");
    expect(settingsSource).not.toContain('function fmtTokens');
    expect(settingsSource).toContain('aiQuotaMetrics');
  });
});
