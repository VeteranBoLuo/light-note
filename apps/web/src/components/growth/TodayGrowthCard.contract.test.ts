import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const todaySource = readFileSync(resolve(process.cwd(), 'src/components/growth/TodayGrowthCard.vue'), 'utf8');
const nextActionSource = readFileSync(resolve(process.cwd(), 'src/components/growth/GrowthNextActionCard.vue'), 'utf8');
const growthPageSource = readFileSync(resolve(process.cwd(), 'src/view/growth/GrowthPage.vue'), 'utf8');
const weeklySource = readFileSync(resolve(process.cwd(), 'src/components/growth/WeeklyChallenge.vue'), 'utf8');
const tasksSource = readFileSync(resolve(process.cwd(), 'src/components/growth/GrowthTasks.vue'), 'utf8');
const zhLocaleSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.ts'), 'utf8');

describe('成长建议与领取状态视觉契约', () => {
  it('下一步建议使用清晰的待整理入箱图标，并显示真实奖励而非固定 0/1', () => {
    expect(todaySource).toContain('<GrowthNextActionCard');
    expect(nextActionSource).toContain('icon.contextMenu.inbox');
    expect(nextActionSource).toContain("t('growth.nextActionExpRewardShort'");
    expect(nextActionSource).toContain("t('growth.nextActionPointsRewardShort'");
    expect(nextActionSource).not.toContain('nextAction.progress.current }}/{{ nextAction.progress.target');
  });

  it('宽屏概览将今日状态压成一行，并把下一步建议交给独立卡片承载', () => {
    expect(todaySource).toContain("'today-growth--compact': compact");
    expect(todaySource).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
    expect(todaySource).toContain('v-if="showNextAction && data?.nextAction"');
    expect(nextActionSource).toContain('<BButton');
    expect(nextActionSource).toContain('@click="$emit(\'view-all\')"');
    expect(todaySource).toMatch(/\.today-growth--compact \.today-growth__header\s*\{\s*display:\s*none;/u);
  });

  it('已领取和已完成状态使用存在的成功图标，不再落入默认地球图标', () => {
    expect(weeklySource).toContain('icon.message.success');
    expect(tasksSource).toContain('icon.message.success');
    expect(`${weeklySource}\n${tasksSource}`).not.toContain('icon.common.check');
  });

  it('成长模块的资源整理入口在移动端明确进入资源中心待整理分区', () => {
    expect(growthPageSource).toContain('resolveGrowthActionRoute(action, bookmark.isMobile)');
    expect(tasksSource).toContain('resolvePendingResourcesRoute(bookmark.isMobile)');
    expect(weeklySource).toContain('resolvePendingResourcesRoute(bookmark.isMobile)');
  });

  it('每日经验明确说明上限口径，并区分一次性成长任务奖励', () => {
    expect(todaySource).toContain("t('growth.todayExpCapHint')");
    expect(zhLocaleSource).toContain("todayExpCap: '每日经验上限'");
    expect(zhLocaleSource).toContain('签到、日常任务和新增内容计入；一次性成长任务奖励另计');
  });
});
