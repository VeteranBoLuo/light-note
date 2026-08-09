import { describe, expect, it } from 'vitest';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 桌面工作台与移动端「今日」的顶部总览统一使用「全部未完成待办 + 全部待整理 +
 * 未读通知」口径；移动端下方行动明细仍只展示逾期、今天到期和待整理。
 */
describe('待处理文案口径', () => {
  const locales = [
    ['zh-CN', zhCN],
    ['en-US', enUS],
  ] as const;

  it.each(locales)('%s：桌面与移动端总览使用相同文案', (_name, locale) => {
    const panel = locale.workbench.panel as Record<string, string>;

    expect(panel.actionOverview).toBeTruthy();
    expect(panel.actionOverviewHint).toBeTruthy();
    expect(panel.todaySummary).toBeTruthy();
    expect(panel.todaySummaryHint).toBeTruthy();

    expect(panel.actionOverview).toBe(panel.todaySummary);
    expect(panel.actionOverviewHint).toBe(panel.todaySummaryHint);
  });

  it('桌面标题不再宣称「今日」，避免与待办角标口径混淆', () => {
    expect(zhCN.workbench.panel.actionOverview).not.toContain('今日');
    expect(enUS.workbench.panel.actionOverview.toLowerCase()).not.toContain('today');
  });

  it('移动端总览不再宣称只统计今日', () => {
    expect(zhCN.workbench.panel.todaySummary).not.toContain('今日');
    expect(enUS.workbench.panel.todaySummary.toLowerCase()).not.toContain('today');
  });

  it('移动端待整理入口使用短名称', () => {
    expect(zhCN.workbench.mobileToday.inbox).toBe('待整理');
    expect(enUS.workbench.mobileToday.inbox).toBe('To organize');
  });

  /** 总数只含待办与待整理；未读通知在下方分项展示，但不计入行动项总数。 */
  it('桌面总数单位说明统计范围', () => {
    expect(zhCN.workbench.today.actionTotalUnit).toContain('待办');
    expect(zhCN.workbench.today.actionTotalUnit).toContain('待整理');
    expect(zhCN.workbench.today.actionTotalUnit).not.toContain('通知');
    expect(enUS.workbench.today.actionTotalUnit).not.toContain('notification');
  });
});
