import { describe, expect, it } from 'vitest';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';

/**
 * 桌面工作台与移动端「今日」共用过同一组文案，但两者统计范围不同：
 * 工作台是「全部未完成待办 + 全部待整理」，移动端今日只看逾期、今天到期和待整理。
 * 沿用「今日待处理」会让用户以为工作台的数字该等于顶栏待办角标（逾期 + 今天）。
 *
 * 这组断言锁住「两端文案分离」这个决策，避免以后为了去重把 key 又合回一处。
 */
describe('待处理文案口径', () => {
  const locales = [
    ['zh-CN', zhCN],
    ['en-US', enUS],
  ] as const;

  it.each(locales)('%s：桌面总览与移动今日使用各自的文案', (_name, locale) => {
    const panel = locale.workbench.panel as Record<string, string>;

    expect(panel.actionOverview).toBeTruthy();
    expect(panel.actionOverviewHint).toBeTruthy();
    expect(panel.todaySummary).toBeTruthy();
    expect(panel.todaySummaryHint).toBeTruthy();

    expect(panel.actionOverview).not.toBe(panel.todaySummary);
    expect(panel.actionOverviewHint).not.toBe(panel.todaySummaryHint);
  });

  it('桌面标题不再宣称「今日」，避免与待办角标口径混淆', () => {
    expect(zhCN.workbench.panel.actionOverview).not.toContain('今日');
    expect(enUS.workbench.panel.actionOverview.toLowerCase()).not.toContain('today');
  });

  it('移动端今日保留「今日」语义，它展示的确实是今天相关的事项', () => {
    expect(zhCN.workbench.panel.todaySummary).toContain('今日');
    expect(enUS.workbench.panel.todaySummary.toLowerCase()).toContain('today');
  });

  /** 总数只含待办与待整理；未读通知在下方分项展示，但不计入行动项总数。 */
  it('桌面总数单位说明统计范围', () => {
    expect(zhCN.workbench.today.actionTotalUnit).toContain('待办');
    expect(zhCN.workbench.today.actionTotalUnit).toContain('待整理');
    expect(zhCN.workbench.today.actionTotalUnit).not.toContain('通知');
    expect(enUS.workbench.today.actionTotalUnit).not.toContain('notification');
  });
});
