// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
const card = read('components/workbenches/DailyBriefCard.vue');
const desktop = read('view/workbenches/DesktopWorkbenchView.vue');

describe('今日简报展示契约', () => {
  it('复用统一生命周期，不在组件内另建生成与计费决策', () => {
    expect(card).toContain('useDailyBrief({');
    expect(card).toContain('defineExpose({ refresh })');
    expect(card).not.toContain('setTimeout');
  });
  it('现有桌面入口保持不变，不擅自给移动今日页增加自动计费入口', () => {
    expect(desktop).toContain(':eligible="Boolean(user.id && user.role !== \'visitor\' && !growthReadOnly)"');
    expect(desktop).toContain('v-if="bookmark.isDesktop"');
    expect(read('view/workbenches/MobileTodayView.vue')).not.toContain('DailyBriefCard');
  });
  it('显示实际数据截至时间、自动更新状态与失效洞察，不将旧文数字替换成新数', () => {
    expect(card).toContain('state.value?.dataAsOf || state.value?.generatedAt');
    expect(card).toContain('state.value?.staleFactIds');
    expect(card).toContain('daily-brief-insight__changed');
    expect(card).toContain('previousRecommendation');
    expect(card).toContain('timeZone: state.value?.timezone');
    expect(card).not.toContain('replaceNarrative');
  });
  it('保留原高度、AI叙事、加载和失败面板，并新增手动模式空态', () => {
    expect(card).toContain('height: 100%;');
    expect(card).toContain('readyBrief.value?.insights || []');
    expect(card).toContain("(loading || state?.status === 'generating') && !readyBrief");
    expect(card).toContain('daily-brief-card__refresh-error');
    expect(card).toContain('daily-brief-card__state-surface');
    expect(card).toContain('manualTitle');
    expect(card).not.toMatch(/<input|<select|<button|<svg/);
  });
});
