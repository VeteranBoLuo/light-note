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
  it('桌面与获授权的移动入口共用身份与只读边界', () => {
    expect(desktop).toContain(':eligible="Boolean(user.id && user.role !== \'visitor\')"');
    expect(desktop).toContain(':read-only="growthReadOnly"');
    expect(desktop).toContain('v-if="bookmark.isDesktop"');
    const mobile = read('view/workbenches/MobileTodayView.vue');
    expect(mobile).toContain('DailyBriefCard');
    expect(mobile).toContain(':eligible="Boolean(user.id && user.role !== \'visitor\')"');
    expect(mobile).toContain(':read-only="growthReadOnly"');
  });
  it('管理员上下文展示只读默认态，不暴露更新、生成和设置动作', () => {
    expect(card).toContain('passive: () => readOnly.value');
    expect(card).toContain("t('workbench.dailyBrief.previewMode')");
    expect(card).toContain('v-if="!readOnly && !guestSample" class="daily-brief-card__actions"');
    expect(card).toContain("readOnly ? 'workbench.dailyBrief.previewEmptyTitle'");
  });
  it('显示实际数据截至时间、自动更新状态与失效洞察，不将旧文数字替换成新数', () => {
    expect(card).toContain('state.value?.dataAsOf || state.value?.generatedAt');
    expect(card).toContain('state.value?.staleFactIds');
    expect(card).toContain('daily-brief-insight__changed');
    expect(card).toContain('previousRecommendation');
    expect(card).toContain('timeZone: state.value?.timezone');
    expect(card).not.toContain('replaceNarrative');
  });
  it('通栏简报自然增高、保留完整AI叙事及加载失败面板', () => {
    expect(card).toContain('height: auto;');
    expect(card).not.toContain('overflow-y: auto;');
    expect(card).toContain('displayBrief.value?.insights || []');
    expect(card).toContain("(loading || state?.status === 'generating') && !readyBrief");
    expect(card).toContain('daily-brief-card__refresh-error');
    expect(card).toContain('daily-brief-card__state-surface');
    expect(card).toContain('manualTitle');
    expect(card).not.toMatch(/<input|<select|<button|<svg/);
  });
});
